"""Road Music ACE-Step 1.5 worker.

Same protocol as worker.py (the YuE2 worker), so the app's queue, progress and
cancel work unchanged: one JSON command per line on stdin, JSON events on stdout.

Commands
  {"cmd": "generate", "jobId": str, "outDir": path, "style": str, "lyrics": str,
   "instrumental": bool, "seed": int, "targetSeconds": float|null, "bpm": int|null}
  {"cmd": "cancel", "jobId": str}   {"cmd": "ping"}   {"cmd": "quit"}

Runs in its own environment (engines/ace-step/venv) with the checkpoints under
engines/ace-step/src/checkpoints. The settings are the ones measured on an RTX 3050
8GB: 2B turbo DiT + 0.6B planner LM on the PyTorch backend, CPU offload on.
"""
from __future__ import annotations

import json
import math
import os
import queue
import random
import re
import shutil
import sys
import threading
import time
from pathlib import Path

SRC = Path(os.environ["ROADMUSIC_ACE_SRC"])
sys.path.insert(0, str(SRC))
os.environ.setdefault("HF_HUB_OFFLINE", "1")  # everything was fetched at install time

_lock = threading.Lock()

# stdout is the app's message channel. ACE-Step and its libraries print freely, so
# the events get a handle of their own and everything else goes to stderr (the log).
sys.stdout.reconfigure(encoding="utf-8")
_events = sys.stdout
sys.stdout = sys.stderr


def emit(**payload):
    with _lock:
        _events.write(json.dumps(payload, ensure_ascii=False) + "\n")
        _events.flush()


import torch  # noqa: E402

import acestep.model_downloader as downloads  # noqa: E402

# The installer fetches only what this worker loads. ACE-Step's own check also
# insists on the 1.7B planner (3.5GB) and would download it on first use.
downloads.MAIN_MODEL_COMPONENTS[:] = [
    name for name in downloads.MAIN_MODEL_COMPONENTS if name != "acestep-5Hz-lm-1.7B"]

from acestep.handler import AceStepHandler  # noqa: E402
from acestep.inference import GenerationConfig, GenerationParams, generate_music  # noqa: E402
from acestep.llm_inference import LLMHandler  # noqa: E402

DIT_MODEL = "acestep-v15-turbo"
LM_MODEL = "acestep-5Hz-lm-0.6B"
# Apple Silicon has no CUDA: Metal instead, and unified memory makes CPU offload pointless.
CUDA = sys.platform != "darwin"  # elsewhere a missing CUDA must still fail loudly
DEVICE = "cuda" if CUDA else "mps"
ENGINE = "ACE-Step 1.5 (turbo · 0.6B)"


def target_seconds(job: dict) -> float | None:
    """Accept only the finite duration values the app protocol promises."""
    target = job.get("targetSeconds")
    if target is None:
        return None
    if (isinstance(target, bool) or not isinstance(target, (int, float)) or
            not math.isfinite(target) or not 1 <= target <= 600):
        raise RuntimeError("길이는 1초에서 10분 사이의 숫자로 입력해주세요")
    return float(target)


def crop_wav(source: Path, destination: Path, seconds: float) -> None:
    """Trim a minimum-length ACE render, softening the final edge."""
    import numpy as np
    import soundfile as sf

    samples, sample_rate = sf.read(source, always_2d=False)
    samples = samples[:max(1, round(seconds * sample_rate))]
    fade_samples = min(len(samples), max(2, round(sample_rate * 0.01)))
    fade = np.linspace(1.0, 0.0, fade_samples)
    if getattr(samples, "ndim", 1) == 1:
        samples[-fade_samples:] *= fade
    else:
        samples[-fade_samples:, :] *= fade[:, None]
    sf.write(destination, samples, sample_rate)


def wav_seconds(path: Path) -> float:
    import soundfile as sf

    info = sf.info(path)
    return round(info.frames / info.samplerate, 1)


def vocal_language(lyrics: str) -> str:
    """The sung language from the script the lyrics are written in."""
    if re.search(r"[가-힣]", lyrics):
        return "ko"
    if re.search(r"[぀-ヿ]", lyrics):
        return "ja"
    if re.search(r"[一-鿿]", lyrics):
        return "zh"
    if re.search(r"[A-Za-z]", lyrics):
        return "en"
    return "unknown"


class Worker:
    def __init__(self):
        self.dit = None
        self.lm = None
        self.cancel = threading.Event()
        self.cancelled_jobs = set()
        self.current_job = None
        self.jobs = queue.Queue()

    def ensure_models(self, job_id):
        if self.dit is not None:
            return
        emit(type="stage", jobId=job_id, stage="load", status="start")
        dit = AceStepHandler()
        # 6GB cards (laptop RTX 3060 and the like): park the DiT in RAM between steps
        # too. Slower, but it fits.
        low_vram = (os.environ.get("ROADMUSIC_LOW_VRAM") == "1" or
                    (CUDA and torch.cuda.get_device_properties(0).total_memory < 7.5 * 1024 ** 3))
        status, ok = dit.initialize_service(
            project_root=str(SRC), config_path=DIT_MODEL, device=DEVICE,
            offload_to_cpu=CUDA, offload_dit_to_cpu=low_vram, quantization=None)
        if not ok:
            raise RuntimeError(f"ACE-Step 모델을 불러오지 못했습니다: {status}")
        lm = LLMHandler()
        status, ok = lm.initialize(
            checkpoint_dir=str(SRC / "checkpoints"), lm_model_path=LM_MODEL,
            backend="pt" if CUDA else "mlx", device=DEVICE, offload_to_cpu=CUDA)
        if not ok:
            raise RuntimeError(f"ACE-Step 구성 모델을 불러오지 못했습니다: {status}")
        self.dit, self.lm = dit, lm
        emit(type="stage", jobId=job_id, stage="load", status="done")

    def generate(self, job):
        target = target_seconds(job)
        sound_effect = bool(job.get("soundEffect"))
        cover = job.get("cover") or None
        if sound_effect:
            if cover:
                raise RuntimeError("효과음은 커버와 함께 만들 수 없습니다")
            if job.get("mode") == "plan":
                raise RuntimeError("효과음은 악보만 만들기와 함께 쓸 수 없습니다")
            if target is None or target > 30:
                raise RuntimeError("효과음 길이는 1초에서 30초 사이로 입력해주세요")
        out = Path(job["outDir"])
        out.mkdir(parents=True, exist_ok=True)
        job_id = job["jobId"]
        seed = job.get("seed")
        if seed is None:
            seed = random.randrange(2**31)
        started = time.perf_counter()
        self.ensure_models(job_id)
        if self.cancel.is_set():
            raise InterruptedError()

        instrumental = sound_effect or bool(job.get("instrumental"))
        lyrics = "[Instrumental]" if instrumental else (job.get("lyrics") or "").strip()
        # A cover made from a song's sound (no score needed): ACE-Step reads the
        # source's melody, rhythm, chords and arrangement and remakes it in the new
        # style and words. The length is the source's; the planner does not run.
        if cover and not Path(cover.get("audio") or "").is_file():
            raise RuntimeError("커버할 원곡 파일을 찾지 못했습니다")
        caption = (job.get("style") or "").strip()
        if sound_effect:
            suffix = "sound effect, no music, no vocals"
            caption = f"{caption[:512 - len(suffix) - 2]}, {suffix}".strip(", ")
        params = GenerationParams(
            task_type="cover" if cover else "text2music", thinking=not (cover or sound_effect),
            caption=caption[:512], lyrics=lyrics[:4096],
            instrumental=instrumental, vocal_language=vocal_language(lyrics),
            duration=-1.0 if cover else (max(target, 10.0) if target else -1.0),
            bpm=int(job["bpm"]) if job.get("bpm") else None,
            src_audio=cover["audio"] if cover else None,
            audio_cover_strength=float(min(max(float(cover.get("strength", 0.8)), 0.1), 1.0)) if cover else 1.0,
            inference_steps=8, shift=3.0, seed=int(seed))
        config = GenerationConfig(batch_size=1, audio_format="wav",
                                  use_random_seed=False, seeds=[int(seed)])

        # ACE-Step reports 0…0.5 while its planner writes the song, then the
        # diffusion, then decoding from 0.8. The same callback carries the cancel.
        phase = {"now": None}

        def start(stage):
            if phase["now"] != stage:
                phase["now"] = stage
                emit(type="stage", jobId=job_id, stage=stage, status="start")

        def progress(value, desc=None, **_kw):
            if self.cancel.is_set():
                raise InterruptedError()
            value = float(value or 0)
            if value < 0.5:
                start("plan")
                emit(type="progress", jobId=job_id, stage="plan", step=int(value * 200), steps=100)
            elif value < 0.8:
                start("synth")
                emit(type="progress", jobId=job_id, stage="synth",
                     step=int((value - 0.5) / 0.3 * 100), steps=100)
            else:
                start("decode")

        start("plan")
        scratch = out / "_ace"
        scratch.mkdir(exist_ok=True)
        result = generate_music(self.dit, self.lm, params=params, config=config,
                                save_dir=str(scratch), progress=progress)
        if self.cancel.is_set():
            raise InterruptedError()
        if not result.success or not result.audios:
            raise RuntimeError(result.error or result.status_message or "곡을 만들지 못했습니다")
        start("decode")
        audio = result.audios[0]
        wav = out / "audio.wav"
        if target is not None and target < 10:
            crop_wav(Path(audio["path"]), wav, target)
        else:
            shutil.move(audio["path"], wav)
        shutil.rmtree(scratch, ignore_errors=True)
        seconds = wav_seconds(wav)

        # Where each lyric line is sung, read from the model's own attention: exact
        # enough for subtitles, so the app's SRT uses it instead of an estimate.
        lrc = None
        if not instrumental:
            try:
                extra = result.extra_outputs or {}
                timing = self.dit.get_lyric_timestamp(
                    pred_latent=extra["pred_latents"][0:1],
                    encoder_hidden_states=extra["encoder_hidden_states"][0:1],
                    encoder_attention_mask=extra["encoder_attention_mask"][0:1],
                    context_latents=extra["context_latents"][0:1],
                    lyric_token_ids=extra["lyric_token_idss"][0:1],
                    total_duration_seconds=float(seconds),
                    vocal_language=params.vocal_language, inference_steps=8, seed=42)
                if timing.get("success") and timing.get("lrc_text"):
                    lrc = out / "lyrics.lrc"
                    lrc.write_text(timing["lrc_text"], encoding="utf-8")
            except Exception as exc:  # noqa: BLE001 — subtitles are a bonus, not the song
                emit(type="notice", message=f"가사 시간 정보를 만들지 못했습니다: {exc}")

        meta = {"id": job.get("id", "song"), "style": job.get("style"), "lyrics": job.get("lyrics"),
                "seed": int(seed), "engine": ENGINE, "engineId": "ace",
                "seconds": seconds, "soundEffect": sound_effect, "lrc": bool(lrc),
                "wallSeconds": round(time.perf_counter() - started, 1),
                "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S")}
        (out / "result.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1),
                                         encoding="utf-8")
        emit(type="done", jobId=job_id, audio=str(wav), meta=meta)

    def run(self):
        threading.Thread(target=self.read_stdin, daemon=True).start()
        emit(type="ready", cuda=torch.cuda.is_available(),
             gpu=torch.cuda.get_device_name(0) if torch.cuda.is_available() else None)
        while True:
            job = self.jobs.get()
            if job is None:
                return
            job_id = job.get("jobId")
            self.cancel.clear()
            self.current_job = job_id
            if job_id in self.cancelled_jobs:
                self.cancelled_jobs.discard(job_id)
                self.current_job = None
                emit(type="error", jobId=job_id, cancelled=True, message="생성이 취소되었습니다.")
                continue
            try:
                self.generate(job)
            except InterruptedError:
                shutil.rmtree(Path(job["outDir"]) / "_ace", ignore_errors=True)
                emit(type="error", jobId=job_id, cancelled=True, message="생성이 취소되었습니다.")
            except Exception as exc:  # noqa: BLE001
                import traceback
                if self.cancel.is_set():
                    emit(type="error", jobId=job_id, cancelled=True, message="생성이 취소되었습니다.")
                else:
                    emit(type="error", jobId=job_id, message=f"{type(exc).__name__}: {exc}",
                         detail=traceback.format_exc())
            finally:
                self.current_job = None
                torch.cuda.empty_cache() if CUDA else torch.mps.empty_cache()

    def read_stdin(self):
        for line in sys.stdin:
            line = line.lstrip("﻿").strip()
            if not line:
                continue
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                continue
            cmd = message.get("cmd")
            if cmd == "generate":
                self.jobs.put(message)
            elif cmd == "cancel":
                job_id = message.get("jobId")
                if job_id is None or job_id == self.current_job:
                    self.cancel.set()
                else:
                    self.cancelled_jobs.add(job_id)
            elif cmd == "ping":
                emit(type="pong")
            elif cmd == "quit":
                self.jobs.put(None)
                return
        self.cancel.set()
        self.jobs.put(None)


if __name__ == "__main__":
    Worker().run()

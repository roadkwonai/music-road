"""Apple Silicon YuE2 worker backed by the pinned public MLX CLI.

The worker accepts Road Music JSONL commands on stdin and emits JSONL events on
stdout.  Every song runs in its own Python subprocess: MLX allocations and the
runtime's memory-pressure guard are therefore released between songs.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import queue
import random
import re
import hashlib
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import signal


MODEL_REVISION = "1a96eca688d6ae5d7f0feb88573fec89920fcd19"
VAE_REVISION = "95535e72a97bc0f09b8ada125d26b4009428c0e8"
_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,179}\Z")
_ADVANCED = {
    "temperature": (0.0, 5.0, float, "temperature"),
    "topP": (0.000001, 1.0, float, "top_p"),
    "topK": (1, 500, int, "top_k"),
    "repetitionPenalty": (0.000001, 2.0, float, "repetition_penalty"),
    "maxTokens": (1, 9000, int, "max_tokens"),
    "minTokens": (0, 9000, int, "min_tokens"),
    "abcTemperature": (0.0, 5.0, float, "temperature"),
    "abcMaxTokens": (1, 4096, int, "max_tokens"),
    "cfgScale": (0.0, 20.0, float, "cfg_scale"),
    "odeSteps": (1, 64, int, "ode_steps"),
}
_lock = threading.Lock()


def emit(**payload):
    with _lock:
        print(json.dumps(payload, ensure_ascii=False), flush=True)


def write_json(path: Path, value):
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    temporary.replace(path)


def copy_if_file(source: Path, destination: Path):
    if source.is_file():
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)


def runtime_paths():
    root_value = os.environ.get("ROADMUSIC_YUE_MLX_ROOT", "").strip()
    if not root_value:
        raise RuntimeError("YuE2 MLX 실행 위치를 찾지 못했습니다. 엔진을 다시 설치해 주세요.")
    root = Path(root_value).expanduser()
    paths = root / "paths.json"
    saved = {}
    if paths.is_file():
        try:
            saved = json.loads(paths.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            raise RuntimeError("YuE2 MLX 설치 정보가 손상되었습니다. 엔진을 다시 설치해 주세요.") from error
    models = Path(os.environ.get("ROADMUSIC_YUE_MLX_MODELS") or saved.get("model") or root / "models")
    vae = Path(os.environ.get("ROADMUSIC_YUE_MLX_VAE") or saved.get("vae") or root / "vae")
    if not (models / "conversion.json").is_file() or not (vae / "config.json").is_file():
        raise RuntimeError("YuE2 MLX 모델 파일을 찾지 못했습니다. AI 엔진에서 다시 설치해 주세요.")
    return root, models, vae, saved


def request_for(job):
    style, lyrics = job.get("style"), job.get("lyrics")
    if not isinstance(style, str) or not isinstance(lyrics, str):
        raise RuntimeError("스타일과 가사를 확인하지 못했습니다.")
    song_id = job.get("id", "song")
    if not isinstance(song_id, str) or not _ID.fullmatch(song_id):
        raise RuntimeError("곡 ID 형식이 올바르지 않습니다.")
    seed = job.get("seed")
    seed = random.randrange(2**31) if seed is None else seed
    if type(seed) is not int or not 0 <= seed < 2**63:
        raise RuntimeError("시드는 0 이상 2^63 미만의 정수여야 합니다.")
    cot = job.get("cot", "full")
    if cot not in {"full", "melody", "off"}:
        raise RuntimeError("악보 모드는 full, melody, off 중 하나여야 합니다.")
    abc = job.get("abc")
    if abc is not None and (not isinstance(abc, str) or not abc.strip() or cot == "off"):
        raise RuntimeError("제공한 ABC 악보에는 full 또는 melody 모드가 필요합니다.")
    request = {"id": song_id, "style": style, "lyrics": lyrics, "cot": cot, "seed": seed}
    if abc is not None:
        request["abc"] = abc
    advanced = job.get("advanced") or {}
    if not isinstance(advanced, dict):
        raise RuntimeError("고급 설정 형식이 올바르지 않습니다.")
    semantic, planner, config = {}, {}, {}
    for name, value in advanced.items():
        if name not in _ADVANCED or value is None:
            continue
        low, high, cast, target = _ADVANCED[name]
        if type(value) is bool:
            raise RuntimeError(f"고급 설정 {name} 값이 올바르지 않습니다.")
        try:
            value = cast(value)
        except (TypeError, ValueError) as error:
            raise RuntimeError(f"고급 설정 {name} 값이 올바르지 않습니다.") from error
        if not low <= value <= high:
            raise RuntimeError(f"고급 설정 {name}은 {low}~{high} 범위여야 합니다.")
        if name.startswith("abc"):
            planner[target] = value
        elif name == "odeSteps":
            config[target] = value
        elif name == "cfgScale":
            request[target] = value
        else:
            semantic[target] = value
    if semantic.get("min_tokens", 0) > semantic.get("max_tokens", 9000):
        raise RuntimeError("minTokens는 maxTokens보다 클 수 없습니다.")
    if semantic:
        request["semantic_sampling"] = semantic
    if planner:
        request["abc_sampling"] = planner
    if config:
        request["generation_config"] = config
    return request, advanced


def complete_result(directory: Path):
    try:
        result = json.loads((directory / "result.json").read_text(encoding="utf-8"))
        return result if result.get("status") == "complete" and (directory / "audio.flac").is_file() else None
    except (OSError, json.JSONDecodeError):
        return None


def next_attempt(out: Path):
    base = out / "yue-mlx"
    if not base.exists() or complete_result(base):
        return base
    for index in range(2, 1000):
        candidate = out / f"yue-mlx-attempt-{index}"
        if not candidate.exists() or complete_result(candidate):
            return candidate
    raise RuntimeError("새 YuE2 MLX 시도 폴더를 만들 수 없습니다.")


def fresh_attempt(out: Path):
    for index in range(2, 1000):
        candidate = out / f"yue-mlx-attempt-{index}"
        if not candidate.exists():
            return candidate
    raise RuntimeError("새 YuE2 MLX 시도 폴더를 만들 수 없습니다.")


def saved_request(out: Path):
    try:
        value = json.loads((out / "meta.json").read_text(encoding="utf-8"))
        return value.get("request")
    except (OSError, json.JSONDecodeError):
        return None


def valid_saved_score(out: Path):
    plan = out / "plan"
    manifest_path = plan / "plan_manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    required = {"plan.json", "abc_tokens.npy", "prefix.npy", "score.abc"}
    if not isinstance(manifest, dict) or not required <= set(manifest):
        return False
    for name in required:
        path, digest = plan / name, manifest.get(name)
        if not path.is_file() or path.is_symlink() or not isinstance(digest, str):
            return False
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            return False
    return True


def mirror_artifacts(attempt: Path, out: Path):
    # The app owns meta.json in out.  Keep upstream's complete/partial artifacts in
    # their attempt folder and expose copied score/stage files for existing song tools.
    for name in ("score.abc", "plan.json", "abc_tokens.npy", "prefix.npy", "plan_manifest.json"):
        copy_if_file(attempt / name, out / "plan" / name)
    copy_if_file(attempt / "score.abc", out / "score.abc")
    for name in ("semantic.npy", "latent.npy"):
        copy_if_file(attempt / name, out / name)
    copy_if_file(attempt / "audio.flac", out / "audio.flac")


def normalize_audio(out: Path):
    """Keep Road Music's existing WAV contract while retaining the MLX FLAC artifact."""
    source, target = out / "audio.flac", out / "audio.wav"
    import soundfile as sf
    audio, rate = sf.read(source, always_2d=True)
    sf.write(target, audio, rate, subtype="PCM_24")
    return target


class Worker:
    def __init__(self):
        self.cancel = threading.Event()
        self.cancelled_jobs = set()
        self.current_job = None
        self.current_process = None
        self.jobs = queue.Queue()

    def cancelled(self):
        return self.cancel.is_set()

    def command_env(self, root):
        env = dict(os.environ)
        locations = [root / "src" / "src", root / "src" / "vendor" / "yue" / "src"]
        existing = env.get("PYTHONPATH", "")
        additions = [str(p) for p in locations if p.is_dir()]
        if additions:
            env["PYTHONPATH"] = os.pathsep.join([*additions, existing] if existing else additions)
        env.update(PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
        return env

    def generate(self, job):
        out = Path(job["outDir"])
        out.mkdir(parents=True, exist_ok=True)
        root, models, vae, paths = runtime_paths()
        request, advanced = request_for(job)
        attempt = next_attempt(out)
        result = complete_result(attempt)
        if result is not None and saved_request(out) != request:
            # The public resume command verifies artifacts too, but never point a
            # different request at a completed recording in the first place.
            attempt, result = fresh_attempt(out), None
        if result is None and attempt.exists() and any(attempt.iterdir()):
            # Preserve every completed stage, but the public CLI deliberately refuses
            # to continue an incomplete output. Start a new isolated attempt instead.
            attempt = next_attempt(out)
        saved_score = out / "score.abc"
        if result is None and "abc" not in request and request["cot"] != "off" and valid_saved_score(out):
            # Partial upstream results cannot continue semantic tokens, but a finished
            # score is safe to retain as the planner input for the fresh attempt.
            request["abc"] = saved_score.read_text(encoding="utf-8")
        request_path = None
        try:
            with tempfile.NamedTemporaryFile("w", suffix=".roadmusic-yue.json", prefix=".",
                                             dir=out, encoding="utf-8", delete=False) as stream:
                json.dump(request, stream, ensure_ascii=False)
                request_path = Path(stream.name)
            command = [sys.executable, "-m", "lyra.cli", "plan" if job.get("mode") == "plan" else "generate",
                       str(request_path), "--model", str(models), "--vae", str(vae), "--precision", "8bit",
                       "--offline", "--require-ac", "--memory-budget-gib", "16", "--output", str(attempt)]
            if job.get("instrumental"):
                command.append("--instrumental")
            if result is not None:
                command.append("--resume")
            emit(type="stage", jobId=job["jobId"], stage="plan", status="start")
            self.current_process = subprocess.Popen(command, stdout=subprocess.DEVNULL,
                                                    stderr=subprocess.PIPE, text=True, bufsize=1,
                                                    env=self.command_env(root))
            tail = []
            reported_stages = {"plan"}
            for line in self.current_process.stderr:
                if line.strip():
                    sys.stderr.write(line)
                    sys.stderr.flush()
                    tail.append(line.strip())
                    tail = tail[-12:]
                if self.cancelled():
                    self.stop_process()
                    break
                for marker, stage in (("Generating song", "semantic"), ("Synthesizing audio", "synth"), ("Decoding audio", "decode")):
                    if marker in line and stage not in reported_stages:
                        reported_stages.add(stage)
                        emit(type="stage", jobId=job["jobId"], stage=stage, status="start")
            code = self.current_process.wait()
            mirror_artifacts(attempt, out)
            if self.cancelled():
                raise InterruptedError()
            if code:
                detail = "\n".join(tail[-5:])
                raise RuntimeError(f"YuE2 MLX 생성이 실패했습니다 (종료 코드 {code}). 완료된 단계는 보존했습니다."
                                   + (f"\n{detail}" if detail else ""))
            result = complete_result(attempt)
            if job.get("mode") == "plan":
                if not (out / "score.abc").is_file():
                    raise RuntimeError("YuE2 MLX가 악보 파일을 만들지 못했습니다.")
                meta = {"engine": "YuE2 MLX", "engineId": "yue-mlx", "source": paths.get("source"),
                        "id": request["id"], "style": request["style"], "lyrics": request["lyrics"],
                        "cot": request["cot"], "seed": request["seed"], "request": request,
                        "scoreOnly": True, "advanced": advanced,
                        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S")}
                write_json(out / "meta.json", meta)
                emit(type="done", jobId=job["jobId"], audio=None, scoreOnly=True, abc=(out / "score.abc").read_text(encoding="utf-8"), meta=meta)
                return
            if result is None or not (out / "audio.flac").is_file():
                raise RuntimeError("YuE2 MLX가 완성 음원을 확인하지 못했습니다.")
            audio = normalize_audio(out)
            meta = {"engine": "YuE2 MLX", "engineId": "yue-mlx", "source": paths.get("source"),
                    "model": str(models), "vae": str(vae), "id": request["id"], "style": request["style"],
                    "lyrics": request["lyrics"], "cot": request["cot"], "seed": request["seed"],
                    "cfgScale": request.get("cfg_scale", 1.01 if request["cot"] == "off" else 1.0),
                    "generation": request.get("generation_config", {"ode_steps": 32}), "request": request,
                    "advanced": advanced,
                    "requestedTargetSeconds": job.get("targetSeconds"), "seconds": result.get("audio_seconds"),
                    "truncated": result.get("truncated"), "timing": result.get("timing", {}), "attempt": str(attempt),
                    "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S")}
            write_json(out / "meta.json", meta)
            emit(type="done", jobId=job["jobId"], audio=str(audio), meta=meta)
        finally:
            if request_path is not None:
                request_path.unlink(missing_ok=True)
            self.current_process = None

    def stop_process(self, *, force=False):
        process = self.current_process
        if process is None:
            return
        try:
            process.terminate()
            try:
                process.wait(timeout=1 if force else 5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            except TypeError:  # small test doubles may not take timeout
                pass
        except OSError:
            pass

    def run(self):
        threading.Thread(target=self.read_stdin, daemon=True).start()
        emit(type="ready", engine="yue-mlx", metal=True)
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
                emit(type="error", jobId=job_id, cancelled=True, message="생성이 취소되었습니다. 완료된 단계는 보존했습니다.")
            except Exception as error:  # noqa: BLE001
                emit(type="error", jobId=job_id, message=f"{type(error).__name__}: {error}")
            finally:
                self.current_job = None
                self.current_process = None

    def read_stdin(self):
        for line in sys.stdin:
            try:
                message = json.loads(line.lstrip("\ufeff").strip())
            except json.JSONDecodeError:
                continue
            if message.get("cmd") == "generate":
                self.jobs.put(message)
            elif message.get("cmd") == "cancel":
                job_id = message.get("jobId")
                if job_id is None or job_id == self.current_job:
                    self.cancel.set()
                    self.stop_process()
                else:
                    self.cancelled_jobs.add(job_id)
            elif message.get("cmd") == "ping":
                emit(type="pong")
            elif message.get("cmd") == "quit":
                self.cancel.set()
                self.stop_process()
                self.jobs.put(None)
                return
        self.cancel.set()
        self.stop_process()
        self.jobs.put(None)

    def stop_signal(self, signum, _frame):
        self.cancel.set()
        self.stop_process(force=True)
        raise SystemExit(128 + signum)


if __name__ == "__main__":
    worker = Worker()
    signal.signal(signal.SIGTERM, worker.stop_signal)
    signal.signal(signal.SIGINT, worker.stop_signal)
    worker.run()

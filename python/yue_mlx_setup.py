"""Prepare the pinned Apple Silicon YuE2 MLX model set for Road Music.

Usage: ``python yue_mlx_setup.py <engine-root>``.  The caller must be the
engine's pinned MLX virtual environment.  stdout is JSONL for the setup UI.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time


MODEL_REPO = "m-a-p/YuE2-3B"
MODEL_REVISION = "1a96eca688d6ae5d7f0feb88573fec89920fcd19"
VAE_REPO = "m-a-p/YuE2-Vae"
VAE_REVISION = "95535e72a97bc0f09b8ada125d26b4009428c0e8"
RUNTIME_COMMIT = "c5b5a8190f78c74aa671a4caa19dae8b8e04b3d8"


def emit(**payload):
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def run(command, *, env):
    process = subprocess.Popen(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    tail = []

    def forward_stderr():
        for line in process.stderr:
            if line.strip():
                tail.append(line.strip())
                del tail[:-8]
                emit(type="log", message=line.strip()[:500])

    watcher = __import__("threading").Thread(target=forward_stderr, daemon=True)
    watcher.start()
    stdout = process.stdout.read()
    code = process.wait()
    watcher.join(timeout=2)
    if code:
        detail = "\n".join(tail)
        raise RuntimeError(f"YuE2 MLX 준비 명령이 실패했습니다 ({code})." + (f"\n{detail}" if detail else ""))
    return stdout


def runtime_env(root: Path):
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
    locations = [root / "src" / "src", root / "src" / "vendor" / "yue" / "src"]
    extra = [str(path) for path in locations if path.is_dir()]
    if extra:
        env["PYTHONPATH"] = os.pathsep.join([*extra, env["PYTHONPATH"]] if env.get("PYTHONPATH") else extra)
    return env


def conversion_valid(models: Path, env):
    if not models.is_dir():
        return False
    probe = "from pathlib import Path; from lyra.conversion import verify_conversion; verify_conversion(Path(__import__('sys').argv[1]))"
    return subprocess.run([sys.executable, "-c", probe, str(models)], env=env,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def vae_valid(vae: Path, env):
    if not vae.is_dir():
        return False
    probe = "from pathlib import Path; from yue2.storage import model_identity; model_identity(Path(__import__('sys').argv[1]))"
    return subprocess.run([sys.executable, "-c", probe, str(vae)], env=env,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def backup_invalid_models(models: Path):
    if not models.exists():
        return
    stamp = time.strftime("%Y%m%d%H%M%S")
    backup = models.with_name(f"{models.name}.invalid-{stamp}")
    for index in range(2, 1000):
        candidate = backup if index == 2 else models.with_name(f"{models.name}.invalid-{stamp}-{index}")
        if not candidate.exists():
            models.replace(candidate)
            return
    raise RuntimeError("손상된 YuE2 MLX 모델을 보관할 위치를 만들 수 없습니다.")


def link_tree(source: Path, target: Path):
    staging = target.with_name(f".{target.name}.staging-{os.getpid()}")
    if staging.exists():
        shutil.rmtree(staging)
    for file in source.rglob("*"):
        relative = file.relative_to(source)
        destination = staging / relative
        if file.is_dir():
            destination.mkdir(parents=True, exist_ok=True)
        elif file.is_file():
            destination.parent.mkdir(parents=True, exist_ok=True)
            try:
                os.link(file, destination)
            except OSError:
                shutil.copy2(file, destination)
    if target.exists():
        shutil.rmtree(target)
    staging.replace(target)


def write_paths(root: Path, models: Path, vae: Path, doctor):
    value = {
        "schema": 1,
        "model": str(models.resolve()), "vae": str(vae.resolve()), "precision": "8bit",
        "source": {"modelRepo": MODEL_REPO, "modelRevision": MODEL_REVISION,
                   "vaeRepo": VAE_REPO, "vaeRevision": VAE_REVISION,
                   "runtimeCommit": RUNTIME_COMMIT},
        "doctor": doctor, "installedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    temporary = root / f".paths.{os.getpid()}.tmp"
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    temporary.replace(root / "paths.json")


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) != 1:
        raise ValueError("사용법: yue_mlx_setup.py <engine-root>")
    root = Path(args[0]).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    models, vae, cache = root / "models", root / "vae", root / "hf-cache"
    env = runtime_env(root)
    model_ok, vae_ok = conversion_valid(models, env), vae_valid(vae, env)
    if models.exists() and not model_ok:
        backup_invalid_models(models)
    if not (model_ok and vae_ok):
        emit(type="step", step="models", status="run")
        emit(type="log", message="고정된 YuE2 원본 모델을 확인하고 MLX 8bit 형식으로 준비합니다.")
        stdout = run([sys.executable, "-m", "lyra.cli", "prepare", "--cache-dir", str(cache),
                      "--output", str(models), "--precision", "8bit"], env=env)
        try:
            source_vae = Path(json.loads(stdout)["vae"])
        except (KeyError, TypeError, json.JSONDecodeError) as error:
            raise RuntimeError("YuE2 MLX 준비 결과에서 VAE 경로를 읽지 못했습니다.") from error
        if not (source_vae / "config.json").is_file() or not (source_vae / "model.safetensors").is_file():
            raise RuntimeError("YuE2 MLX VAE 파일을 확인하지 못했습니다.")
        if not vae_ok:
            link_tree(source_vae, vae)
        emit(type="step", step="models", status="done")
    else:
        emit(type="step", step="models", status="done", detail="기존 검증 대상 재사용")
    emit(type="step", step="verify", status="run")
    doctor_text = run([sys.executable, "-m", "lyra.cli", "doctor", "--model", str(models),
                       "--vae", str(vae), "--verify-hashes"], env=env)
    try:
        doctor = json.loads(doctor_text)
    except json.JSONDecodeError as error:
        raise RuntimeError("YuE2 MLX 검증 결과를 읽지 못했습니다.") from error
    if doctor.get("status") != "pass":
        raise RuntimeError("YuE2 MLX 모델 검증에 실패했습니다.")
    write_paths(root, models, vae, doctor)
    emit(type="step", step="verify", status="done")
    emit(type="done", model=str(models), vae=str(vae))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # noqa: BLE001
        emit(type="error", message=f"{type(error).__name__}: {error}")
        raise SystemExit(1)

"""Fetch the ACE-Step 1.5 checkpoints the app uses, with progress for the setup screen.

Usage: python ace_setup_models.py <checkpoints dir>
Prints JSON lines: {"type":"total","bytes":N}, {"type":"progress","bytes":N},
{"type":"error","message":...}, {"type":"done"}.

Only what the worker loads is fetched (turbo DiT, VAE, text encoder, 0.6B planner),
about 7.6GB instead of the full 11GB repository. Downloads resume after a dropped
connection, and every file is checked against the size the hub publishes.
"""
import json
import os
import sys
import threading
import time

from huggingface_hub import HfApi, snapshot_download

TARGET = sys.argv[1]
SOURCES = [
    ("ACE-Step/Ace-Step1.5", TARGET,
     ["acestep-v15-turbo/*", "vae/*", "Qwen3-Embedding-0.6B/*", "config.json", "configuration.json"]),
    ("ACE-Step/acestep-5Hz-lm-0.6B", os.path.join(TARGET, "acestep-5Hz-lm-0.6B"), None),
]


def emit(**payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def wanted_files():
    """(path on disk, size, is_weight) for every file to fetch, from the hub's listing."""
    api = HfApi()
    files = []
    for repo, base, patterns in SOURCES:
        for item in api.list_repo_tree(repo, recursive=True):
            size = getattr(item, "size", None)
            if size is None:
                continue  # a folder
            if patterns and not any(
                    item.path == p or (p.endswith("/*") and item.path.startswith(p[:-1])) for p in patterns):
                continue
            files.append((os.path.join(base, item.path), size, bool(getattr(item, "lfs", None))))
    return files


def on_disk(root):
    total = 0
    for folder, _dirs, names in os.walk(root):
        for name in names:
            try:
                total += os.path.getsize(os.path.join(folder, name))
            except OSError:
                pass
    return total


def main():
    os.makedirs(TARGET, exist_ok=True)
    files = wanted_files()
    emit(type="total", bytes=sum(size for _, size, _weight in files))

    stop = threading.Event()

    def report():
        while not stop.wait(1.0):
            emit(type="progress", bytes=on_disk(TARGET))

    threading.Thread(target=report, daemon=True).start()
    try:
        for repo, base, patterns in SOURCES:
            for attempt in range(1, 9):
                try:
                    snapshot_download(repo_id=repo, local_dir=base, allow_patterns=patterns, max_workers=4)
                    break
                except Exception as exc:  # noqa: BLE001 — a dropped connection: resume
                    if attempt == 8:
                        raise
                    emit(type="log", message=f"다시 시도합니다 ({attempt}): {exc}"[:300])
                    time.sleep(5)
    finally:
        stop.set()

    # The weights must match to the byte; small text files may differ in line endings.
    wrong = [path for path, size, weight in files
             if not os.path.exists(path) or (weight and os.path.getsize(path) != size)]
    if wrong:
        emit(type="error", message="받은 모델 파일이 온전하지 않습니다: " + ", ".join(
            os.path.relpath(path, TARGET) for path in wrong[:3]))
        sys.exit(1)
    emit(type="progress", bytes=on_disk(TARGET))
    emit(type="done")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        emit(type="error", message=f"{type(exc).__name__}: {exc}")
        sys.exit(1)

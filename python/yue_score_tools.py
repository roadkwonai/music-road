#!/usr/bin/env python3
"""Safe Road Music adapter for YuE2 score inspection, comparison and covers.

This script imports the bundled official ABC helper, with a pinned runtime fallback.
It is not another ABC parser and it never installs SheetSage2 or downloads a
model.  Invoke it as ``yue_score_tools.py ACTION --request REQUEST.json``.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time


class ToolError(RuntimeError):
    """A request that cannot safely use the selected local runtime."""


_child = None
_cancelled = threading.Event()


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def fail(message: str) -> None:
    raise ToolError(message)


def absolute_path(value, label: str, *, exists=True) -> Path:
    if not isinstance(value, str) or not value:
        fail(f"{label} 경로가 필요합니다.")
    path = Path(value).expanduser()
    if not path.is_absolute():
        fail(f"{label} 경로는 절대 경로여야 합니다.")
    if exists and not path.exists():
        fail(f"{label} 경로를 찾지 못했습니다.")
    if path.is_symlink():
        fail(f"{label} 심볼릭 링크는 사용할 수 없습니다.")
    return path


def regular_file(value, label: str) -> Path:
    path = absolute_path(value, label)
    if not path.is_file():
        fail(f"{label}은 일반 파일이어야 합니다.")
    return path


def read_request(path_value: str) -> dict:
    path = regular_file(path_value, "요청")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ToolError("요청 JSON을 읽지 못했습니다.") from error
    if not isinstance(value, dict):
        fail("요청 JSON은 객체여야 합니다.")
    return value


def runtime_root() -> Path:
    root_value = os.environ.get("ROADMUSIC_YUE_MLX_ROOT", "").strip()
    if not root_value:
        fail("YuE2 MLX 실행 위치를 찾지 못했습니다. 엔진을 설치해 주세요.")
    root = absolute_path(root_value, "YuE2 MLX 실행 위치")
    if not root.is_dir():
        fail("YuE2 MLX 실행 위치가 디렉터리가 아닙니다.")
    return root


def runtime_info(root: Path) -> dict:
    paths_file = root / "paths.json"
    paths = None
    if paths_file.is_file() and not paths_file.is_symlink():
        try:
            paths = json.loads(paths_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            paths = {"invalid": True}
    helper = root / "src" / "src" / "lyra" / "music_tools" / "abc_tools.py"
    model = Path(paths["model"]) if isinstance(paths, dict) and isinstance(paths.get("model"), str) else None
    vae = Path(paths["vae"]) if isinstance(paths, dict) and isinstance(paths.get("vae"), str) else None
    model_ready = bool(model and model.is_dir() and (model / "conversion.json").is_file())
    vae_ready = bool(vae and vae.is_dir() and (vae / "config.json").is_file())
    return {
        "root": str(root),
        "installed": model_ready and vae_ready,
        "model": {"path": str(model) if model else None, "ready": model_ready},
        "vae": {"path": str(vae) if vae else None, "ready": vae_ready},
        "paths": paths if isinstance(paths, dict) and not paths.get("invalid") else None,
        "abcHelper": str(helper),
        "abcHelperAvailable": helper.is_file() and not helper.is_symlink(),
    }


def abc_module(root: Path | None = None):
    vendor = Path(__file__).resolve().parents[1] / "docs" / "vendor" / "yue2" / "official" / "skills" / "yue2-music" / "scripts" / "abc_tools.py"
    if vendor.is_file() and not vendor.is_symlink():
        helper, source = vendor, "bundled official YuE2 abc_tools.py"
    elif Path(__file__).with_name("abc_tools.py").is_file():
        helper, source = Path(__file__).with_name("abc_tools.py"), "bundled official ABC runtime helper; see LICENSE-abc_tools.txt"
    elif root is not None:
        helper, source = root / "src" / "src" / "lyra" / "music_tools" / "abc_tools.py", "installed pinned YuE2 MLX lyra.music_tools.abc_tools"
    else:
        fail("YuE2 공식 ABC 도구를 찾지 못했습니다.")
    if not helper.is_file() or helper.is_symlink():
        fail("고정된 YuE2 MLX ABC 도구를 찾지 못했습니다. 엔진을 다시 설치해 주세요.")
    try:
        spec = importlib.util.spec_from_file_location("_road_music_yue_abc_tools", helper)
        if spec is None or spec.loader is None:
            fail("YuE2 공식 ABC 도구를 불러올 수 없습니다.")
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
    except ToolError:
        raise
    except Exception as error:  # The pinned helper must still leave a JSON result on import failure.
        raise ToolError("YuE2 MLX ABC 도구를 불러오지 못했습니다. 엔진을 다시 설치해 주세요.") from error
    module_path = Path(getattr(module, "__file__", "")).resolve()
    if module_path != helper.resolve():
        fail("YuE2 MLX ABC 도구 경로가 고정된 설치 위치와 다릅니다.")
    if not all(callable(getattr(module, name, None)) for name in ("parse_abc", "compare", "report", "strip_chords")):
        fail("YuE2 공식 ABC 도구의 필수 공개 API가 맞지 않습니다.")
    module.__roadmusic_source = source
    return module


def score_input(request: dict, label: str) -> str:
    text, file_name = request.get("text"), request.get("file")
    if (text is None) == (file_name is None):
        fail(f"{label}에는 text 또는 file 중 하나만 지정해야 합니다.")
    if text is not None:
        if not isinstance(text, str) or not text.strip():
            fail(f"{label}.text는 비어 있지 않은 문자열이어야 합니다.")
        return text
    return regular_file(file_name, f"{label}.file").read_text(encoding="utf-8")


def json_safe(value):
    if isinstance(value, tuple):
        return [json_safe(item) for item in value]
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    return str(value) if type(value).__name__ == "Fraction" else value


def section_grid(score) -> list[dict]:
    """Add comment labels to the official parser's already validated bar grid."""
    lines = score.text.splitlines()
    groups, pending, vocal_bar = [], [], 0
    index = 0
    while index < len(lines):
        line = lines[index]
        if line.startswith("% "):
            pending.append(line[2:].strip())
        elif line == "V: Vocal" and index + 1 < len(lines):
            music = lines[index + 1]
            if music.endswith("|"):
                measures = 0
                for token in music[:-1].split("|"):
                    token = token.strip()
                    if token.startswith("Z") and token[1:] in {"", "2", "3", "4"}:
                        measures += int(token[1:] or "1")
                    elif token:
                        measures += 1
                groups.append({"labels": pending, "barStart": vocal_bar + 1, "barCount": measures})
                pending = []
                vocal_bar += measures
        index += 1
    return groups


def inspect(request: dict) -> dict:
    abc = abc_module()
    score = abc.parse_abc(score_input(request, "악보"))
    report = abc.report(score)
    report["voices"] = json_safe(report["voices"])
    report["sectionGrid"] = section_grid(score)
    report["source"] = abc.__roadmusic_source
    return report


def boolean_option(options: dict, name: str, default: bool) -> bool:
    value = options.get(name, default)
    if type(value) is not bool:
        fail(f"invariants.{name}은 true 또는 false여야 합니다.")
    return value


def compare(request: dict) -> dict:
    abc = abc_module()
    source_value, candidate_value = request.get("source"), request.get("candidate")
    if not isinstance(source_value, dict) or not isinstance(candidate_value, dict):
        fail("compare에는 source와 candidate 악보 객체가 필요합니다.")
    options = request.get("invariants", {})
    if not isinstance(options, dict):
        fail("invariants는 객체여야 합니다.")
    fixed_melody = boolean_option(options, "melody", True)
    fixed_harmony = boolean_option(options, "harmony", False)
    fixed_form = boolean_option(options, "form", True)
    allow_tempo = boolean_option(options, "allowTempoChange", False)
    before, after = abc.parse_abc(score_input(source_value, "source")), abc.parse_abc(score_input(candidate_value, "candidate"))
    differences = []
    if fixed_melody:
        result = abc.compare(before, after, allow_tempo_change=allow_tempo)
        differences.extend(result["differences"])
    elif not allow_tempo and before.bpm != after.bpm:
        differences.append("quarter-note tempo differs")
    if fixed_harmony:
        for name in ("Vocal", "Ins"):
            if before.voices[name].chords != after.voices[name].chords:
                differences.append(f"{name}: chord events differ")
    if fixed_form and section_grid(before) != section_grid(after):
        differences.append("section comment/bar grid differs")
    return {
        "match": not differences,
        "differences": differences,
        "invariants": {"melody": fixed_melody, "harmony": fixed_harmony,
                       "form": fixed_form, "allowTempoChange": allow_tempo},
        "source": abc.__roadmusic_source,
        "scope": "symbolic score invariants only; no claim about generated audio, source ownership or perceptual quality",
    }


def strip_chords(request: dict) -> dict:
    abc = abc_module()
    voice = request.get("voice", "both")
    if voice not in ("both", "Vocal", "Ins"):
        fail("voice는 Vocal 또는 Ins여야 합니다.")
    output = abc.strip_chords(score_input(request, "악보"), keep_voice=voice)
    checked = abc.parse_abc(output)
    return {"abc": output, "voice": voice, "measures": len(checked.voices["Vocal"].bars),
            "source": abc.__roadmusic_source,
            "scope": "새 ABC 문자열만 반환하며 입력 파일을 수정하지 않습니다."}


def no_symlink_tree(path: Path, label: str) -> None:
    if path.is_symlink():
        fail(f"{label}에 심볼릭 링크를 사용할 수 없습니다.")
    for entry in path.rglob("*"):
        if entry.is_symlink():
            fail(f"{label} 내부의 심볼릭 링크는 사용할 수 없습니다.")


def python_version(python: Path) -> str:
    completed = subprocess.run([str(python), "--version"], capture_output=True, text=True, timeout=10, check=False)
    version = (completed.stdout or completed.stderr).strip()
    if completed.returncode or not version.startswith("Python 3."):
        fail("전사용 Python 버전을 확인하지 못했습니다.")
    pieces = version.split()[1].split(".")
    if len(pieces) < 2 or pieces[:2] not in (["3", "10"], ["3", "11"]):
        fail("SheetSage2 전사는 Python 3.10 또는 3.11 환경이 필요합니다.")
    return version


def stop_child(*_args) -> None:
    _cancelled.set()
    process = _child
    if process is not None and process.poll() is None:
        process.terminate()


def transcribe(request: dict) -> dict:
    task = request.get("task")
    if task not in (None, "full", "melody-full", "melody-vocal"):
        fail("task는 full, melody-full, melody-vocal 중 하나여야 합니다.")
    audio = regular_file(request.get("audio"), "원본 오디오")
    output = absolute_path(request.get("output"), "출력", exists=False)
    if output.exists():
        fail("출력은 아직 존재하지 않는 새 디렉터리여야 합니다.")
    if not output.parent.is_dir() or output.parent.is_symlink():
        fail("출력 상위 디렉터리를 안전하게 확인하지 못했습니다.")
    python = Path(str(request.get("python", ""))).expanduser().resolve(strict=True)
    if not python.is_file():
        fail("SheetSage2 Python 실행 파일이 필요합니다.")
    model = absolute_path(request.get("modelDir"), "SheetSage2 모델")
    if not model.is_dir():
        fail("SheetSage2 모델 경로가 디렉터리가 아닙니다.")
    infer = model / "infer.py"
    if not infer.is_file() or infer.is_symlink():
        fail("선택한 SheetSage2 모델 디렉터리의 infer.py를 찾지 못했습니다.")
    version = python_version(python)
    melody_only = request.get("melodyOnly", task != "full")
    if type(melody_only) is not bool:
        fail("melodyOnly는 true 또는 false여야 합니다.")
    if task == "full" and melody_only:
        fail("task=full은 melodyOnly=false여야 합니다.")
    if task == "melody-full" and not melody_only:
        fail("task=melody-full은 melodyOnly=true여야 합니다.")
    if task == "melody-vocal" and not melody_only:
        fail("task=melody-vocal은 두 보이스 melody-only 전사 뒤 보컬 선율을 선택하므로 melodyOnly=true여야 합니다.")
    timeout_seconds = request.get("timeoutSeconds", 3600)
    if type(timeout_seconds) is not int or not 30 <= timeout_seconds <= 7200:
        fail("timeoutSeconds는 30~7200초 정수여야 합니다.")
    command = [str(python), str(infer), str(audio), "--output", str(output)]
    if melody_only:
        command.append("--melody-only")
    env = dict(os.environ, HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
    log("설치된 로컬 SheetSage2 모델로 전사를 시작합니다.")
    global _child
    tail = []
    _child = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                              text=True, bufsize=1, env=env)
    process = _child
    def forward() -> None:
        for line in process.stderr:
            message = line.strip()
            if message:
                tail.append(message)
                del tail[:-20]
                log(f"SheetSage2: {message[:500]}")
    watcher = threading.Thread(target=forward, daemon=True)
    watcher.start()
    deadline = time.monotonic() + timeout_seconds
    try:
        while process.poll() is None:
            if _cancelled.is_set():
                raise InterruptedError("전사가 취소되었습니다.")
            if time.monotonic() >= deadline:
                raise TimeoutError("SheetSage2 전사가 제한 시간을 초과했습니다.")
            time.sleep(0.1)
    except BaseException:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        raise
    finally:
        process.wait()
        watcher.join(timeout=2)
        _child = None
    if _cancelled.is_set():
        raise InterruptedError("전사가 취소되었습니다.")
    if process.returncode:
        detail = "\n".join(tail[-5:])
        fail(f"SheetSage2 전사가 실패했습니다 ({process.returncode})." + (f"\n{detail}" if detail else ""))
    if not output.is_dir() or output.is_symlink():
        fail("SheetSage2 전사 출력 디렉터리를 확인하지 못했습니다.")
    no_symlink_tree(output, "SheetSage2 전사 출력")
    score_path = output / "score.abc"
    if not score_path.is_file() or score_path.is_symlink():
        fail("SheetSage2 전사 결과에서 score.abc를 찾지 못했습니다.")
    abc = abc_module()
    score = abc.parse_abc(score_path.read_text(encoding="utf-8"))
    selected_score, transformed_score = score_path, None
    if task == "melody-vocal":
        transformed_score = output / "score-vocal.abc"
        if transformed_score.exists():
            fail("보컬 선택 악보 출력 경로가 이미 존재합니다.")
        transformed_score.write_text(abc.strip_chords(score_path.read_text(encoding="utf-8"), keep_voice="Vocal"), encoding="utf-8")
        vocal_score = abc.parse_abc(transformed_score.read_text(encoding="utf-8"))
        invariant = abc.compare(score, vocal_score, names=("Vocal",))
        if not invariant.get("match") or score.voices["Vocal"].bars != vocal_score.voices["Vocal"].bars:
            fail("보컬 선택 후처리가 보컬 선율 또는 시간 격자를 바꿨습니다.")
        selected_score = transformed_score
    files = [str(path) for path in sorted(output.rglob("*")) if path.is_file()]
    warnings = [line for line in tail if "warning" in line.lower() or "warn" in line.lower()]
    if transformed_score is not None:
        warnings.append("score-vocal.abc는 원본 score.abc를 보존한 공식 Vocal 선택 후처리본입니다.")
    return {
        "output": str(output), "score": str(selected_score), "originalScore": str(score_path),
        "transformedScore": str(transformed_score) if transformed_score else None, "files": files,
        "warnings": warnings, "melodyOnly": melody_only, "pythonVersion": version,
        "scoreInspection": {"bpm": score.bpm, "measures": len(score.voices["Vocal"].bars)},
        "source": "local SheetSage2 infer.py audio interface in offline mode",
        "scope": "transcription is a reviewable estimate, not proof of the original composition, rights or a correct cover score; it is not lyric ASR",
    }


def capabilities(_request: dict) -> dict:
    try:
        score_tools = {"available": True, "source": abc_module().__roadmusic_source}
    except ToolError as error:
        score_tools = {"available": False, "reason": str(error)}
    try:
        root = runtime_root()
        info = runtime_info(root)
    except ToolError as error:
        info = {"available": False, "reason": str(error)}
    sheet = {"available": False, "reason": "별도 로컬 modelDir와 Python 3.10/3.11 환경이 필요합니다."}
    if _request.get("python") is not None or _request.get("modelDir") is not None:
        python_value, model_value = _request.get("python"), _request.get("modelDir")
        try:
            python = Path(str(python_value or "")).expanduser().resolve(strict=True)
            if not python.is_file():
                fail("SheetSage2 Python 실행 파일이 필요합니다.")
            model = absolute_path(model_value, "SheetSage2 모델")
            infer = model / "infer.py"
            version = python_version(python)
            ready = model.is_dir() and infer.is_file() and not infer.is_symlink()
            sheet = {"available": ready, "pythonVersion": version, "modelDir": str(model),
                     "infer": str(infer), "reason": None if ready else "선택한 modelDir의 infer.py를 찾지 못했습니다."}
        except ToolError as error:
            sheet = {"available": False, "reason": str(error)}
    return {"scoreTools": score_tools, "yueMlx": info, "sheetSage2": sheet, "downloads": False}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("capabilities", "inspect", "compare", "strip-chords", "transcribe"))
    parser.add_argument("--request", required=True)
    args = parser.parse_args(argv)
    previous_term = signal.signal(signal.SIGTERM, stop_child)
    previous_int = signal.signal(signal.SIGINT, stop_child)
    try:
        request = read_request(args.request)
        action = {"capabilities": capabilities, "inspect": inspect, "compare": compare,
                  "strip-chords": strip_chords, "transcribe": transcribe}[args.action]
        result = action(request)
        print(json.dumps({"ok": True, "result": result}, ensure_ascii=False, default=json_safe), flush=True)
        return 0
    except Exception as error:  # Keep the one-line stdout contract for invalid local runtimes too.
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False), flush=True)
        return 1
    finally:
        signal.signal(signal.SIGTERM, previous_term)
        signal.signal(signal.SIGINT, previous_int)


if __name__ == "__main__":
    raise SystemExit(main())

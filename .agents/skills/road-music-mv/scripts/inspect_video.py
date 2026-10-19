#!/usr/bin/env python3
"""Extract an auditable, frame-accurate local-video reference package."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
from typing import Any

SOURCE_FORMATS = "mov,matroska,avi,mpegts,ogg,flv,mpeg"


class ToolError(Exception):
    pass


class JsonArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise ToolError(message)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(command, text=True, capture_output=True, check=False)
    if completed.returncode:
        detail = (completed.stderr or completed.stdout).strip().splitlines()
        blocked = next((line for line in detail if "not on whitelist" in line), None)
        raise ToolError(blocked or (detail[-1] if detail else "ffmpeg/ffprobe 실행에 실패했습니다."))
    return completed


def number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def parse_fps(value: str | None) -> float | None:
    if not value or value == "0/0":
        return None
    try:
        numerator, denominator = value.split("/", 1)
        result = float(numerator) / float(denominator)
        return result if math.isfinite(result) and result > 0 else None
    except (ValueError, ZeroDivisionError):
        return None


def local_regular_video(value: str) -> Path:
    # URL schemes and playlist/network protocols are intentionally never delegated to ffmpeg.
    if "://" in value or value.lower().startswith(("concat:", "data:", "file:")):
        raise ToolError("로컬 일반 파일만 분석할 수 있습니다.")
    raw_path = Path(value).expanduser()
    if raw_path.is_symlink():
        raise ToolError("심볼릭 링크가 아닌 로컬 일반 영상 파일만 분석할 수 있습니다.")
    path = raw_path.resolve()
    if not path.is_file():
        raise ToolError("입력은 존재하는 로컬 일반 영상 파일이어야 합니다.")
    return path


def probe(path: Path, max_frames: int) -> tuple[dict[str, Any], list[float | None], str]:
    result = run([
        "ffprobe", "-v", "error", "-protocol_whitelist", "file", "-format_whitelist", SOURCE_FORMATS,
        "-select_streams", "v:0", "-show_entries",
        "stream=codec_name,width,height,avg_frame_rate,r_frame_rate,duration:format=format_name", "-of", "json", str(path),
    ])
    try:
        data = json.loads(result.stdout)
        stream = data["streams"][0]
        format_name = data["format"]["format_name"]
    except (json.JSONDecodeError, KeyError, IndexError, TypeError) as error:
        raise ToolError("비디오 스트림의 프레임 메타데이터를 읽지 못했습니다.") from error
    frame_limit = max_frames + 1
    process = subprocess.Popen([
        "ffprobe", "-v", "error", "-protocol_whitelist", "file", "-format_whitelist", SOURCE_FORMATS,
        "-select_streams", "v:0",
        "-read_intervals", f"%+#{frame_limit}", "-show_frames",
        "-show_entries", "frame=best_effort_timestamp_time,pkt_pts_time,pkt_dts_time",
        "-of", "compact=p=0:nk=0", str(path),
    ], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert process.stdout is not None
    timestamps: list[float | None] = []
    for line in process.stdout:
        fields = dict(part.split("=", 1) for part in line.strip().split("|") if "=" in part)
        pts = number(fields.get("best_effort_timestamp_time"))
        if pts is None:
            pts = number(fields.get("pkt_pts_time"))
        if pts is None:
            pts = number(fields.get("pkt_dts_time"))
        timestamps.append(pts)
    _, stderr = process.communicate()
    if process.returncode:
        lines = stderr.strip().splitlines()
        blocked = next((line for line in lines if "not on whitelist" in line), None)
        raise ToolError(blocked or (lines[-1] if lines else "ffprobe 실행에 실패했습니다."))
    if not timestamps:
        raise ToolError("디코드 가능한 비디오 프레임이 없습니다.")
    return stream, timestamps, format_name


def scene_candidates(path: Path, timestamps: list[float | None]) -> dict[int, float]:
    """Return score hints only; scene detection never asserts an editorial cut."""
    result = run([
        "ffmpeg", "-hide_banner", "-nostdin", "-protocol_whitelist", "file", "-format_whitelist", SOURCE_FORMATS,
        "-i", str(path), "-an",
        "-vf", "select=gt(scene\\,0.35),metadata=print", "-f", "null", "-",
    ])
    candidates: dict[int, float] = {}
    current_pts: float | None = None
    for raw in result.stderr.splitlines():
        line = raw.strip()
        if "pts_time:" in line:
            current_pts = number(line.split("pts_time:", 1)[1].split()[0])
        if "lavfi.scene_score=" not in line or current_pts is None:
            continue
        score = number(line.rsplit("=", 1)[1])
        if score is None:
            continue
        matches = [(abs(pts - current_pts), index) for index, pts in enumerate(timestamps) if pts is not None]
        if matches:
            _, index = min(matches)
            candidates[index] = score
    return candidates


def folder_bytes(path: Path) -> int:
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


def safe_manifest(path: Path, manifest: dict[str, Any]) -> None:
    (path / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def cleanup_generated(output: Path) -> None:
    """The output root is newly created by this run; preserve only its incomplete manifest."""
    for name in ("frame-index.jsonl", "sheet-index.json", "index.html"):
        path = output / name
        if path.is_file() or path.is_symlink():
            path.unlink()
    for name in ("frames", "sheets"):
        directory = output / name
        if not directory.exists():
            continue
        for item in sorted(directory.rglob("*"), key=lambda value: len(value.parts), reverse=True):
            if item.is_file() or item.is_symlink():
                item.unlink()
            elif item.is_dir():
                item.rmdir()
        directory.rmdir()


def build_sheets(output: Path, frame_count: int) -> list[dict[str, Any]]:
    sheets = output / "sheets"
    sheets.mkdir()
    index: list[dict[str, Any]] = []
    for first in range(0, frame_count, 48):
        count = min(48, frame_count - first)
        sheet_name = f"sheet-{first // 48:04d}.jpg"
        run([
            "ffmpeg", "-v", "error", "-nostdin", "-protocol_whitelist", "file", "-format_whitelist", "image2", "-start_number", str(first),
            "-i", str(output / "frames" / "frame-%08d.jpg"), "-frames:v", str(count),
            "-vf", "tile=8x6:padding=4:margin=4", "-frames:v", "1", "-n",
            str(sheets / sheet_name),
        ])
        sheet_path = sheets / sheet_name
        index.append({"first_frame": first, "last_frame": first + count - 1, "sheet": f"sheets/{sheet_name}", "sha256": sha256_file(sheet_path)})
    (output / "sheet-index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return index


def build_html(output: Path, rows: list[dict[str, Any]]) -> None:
    data = json.dumps(rows, ensure_ascii=False).replace("</", "<\\/")
    page = """<!doctype html><meta charset=\"utf-8\"><title>Frame reference</title>
<style>body{font-family:system-ui;margin:16px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}.frame{border:1px solid #ddd;padding:6px}.frame img{width:100%;height:auto}</style>
<h1>프레임 레퍼런스</h1><p>축소 썸네일은 미세 VFX를 확정하는 근거가 아닙니다.</p><div id=frames class=grid></div>
<script>const frames=""" + data + """;document.querySelector('#frames').innerHTML=frames.map(f=>`<figure class=frame><img loading=\"lazy\" src=\"${f.thumbnail}\" alt=\"frame ${f.frame_index}\"><figcaption>#${f.frame_index} · ${f.pts_seconds ?? 'unknown'}s${f.cut_candidate ? ' · scene candidate '+f.cut_candidate.score : ''}</figcaption></figure>`).join('');</script>"""
    (output / "index.html").write_text(page, encoding="utf-8")


def inspect(args: argparse.Namespace) -> dict[str, Any]:
    source = local_regular_video(args.input)
    output = Path(args.output)
    if not output.is_absolute():
        raise ToolError("--output은 새 절대 경로여야 합니다.")
    output = output.resolve()
    if output.exists():
        raise ToolError("--output은 아직 존재하지 않는 새 폴더여야 합니다.")
    if args.width < 16 or args.max_frames < 1 or not math.isfinite(args.max_megabytes) or args.max_megabytes <= 0:
        raise ToolError("width, max-frames, max-megabytes는 양수 범위여야 합니다.")

    source_hash = sha256_file(source)
    output.mkdir(parents=True)
    manifest: dict[str, Any] = {
        "format_version": 2,
        "source": {"path": str(source), "sha256": source_hash},
        "decoded_frames": 0, "extracted_frames": 0, "extraction_complete": False,
        "semantic_review_complete": False, "fps": None,
    }
    try:
        stream, timestamps, format_name = probe(source, args.max_frames)
        manifest.update({
            "decoded_frames": len(timestamps),
            "fps": parse_fps(stream.get("avg_frame_rate")) or parse_fps(stream.get("r_frame_rate")),
            "width": stream.get("width"), "height": stream.get("height"),
            "format_name": format_name,
        })
        if len(timestamps) > args.max_frames:
            raise ToolError(f"디코드 프레임 수({len(timestamps)})가 --max-frames 제한을 초과했습니다.")
        source_width, source_height = stream.get("width"), stream.get("height")
        if not isinstance(source_width, int) or not isinstance(source_height, int):
            raise ToolError("비디오 해상도를 확인하지 못했습니다.")
        scaled_height = max(2, int(round((source_height * args.width / source_width) / 2)) * 2)
        estimated_bytes = len(timestamps) * args.width * scaled_height * 3
        if estimated_bytes > args.max_megabytes * 1024 * 1024:
            raise ToolError("예상 프레임 데이터가 --max-megabytes 제한을 초과했습니다.")

        frames = output / "frames"
        frames.mkdir()
        run([
            "ffmpeg", "-v", "error", "-nostdin", "-protocol_whitelist", "file", "-format_whitelist", SOURCE_FORMATS,
            "-i", str(source), "-map", "0:v:0",
            "-vf", f"scale={args.width}:-2", "-fps_mode", "passthrough", "-start_number", "0", "-n",
            str(frames / "frame-%08d.jpg"),
        ])
        images = sorted(frames.glob("frame-*.jpg"))
        manifest["extracted_frames"] = len(images)
        if len(images) != len(timestamps):
            raise ToolError(f"ffprobe 프레임 수({len(timestamps)})와 JPEG 수({len(images)})가 일치하지 않습니다.")
        if folder_bytes(frames) > args.max_megabytes * 1024 * 1024:
            raise ToolError("추출한 JPEG가 --max-megabytes 제한을 초과했습니다.")
        if sha256_file(source) != source_hash:
            raise ToolError("분석 중 원본 파일이 변경되었습니다.")

        candidates = scene_candidates(source, timestamps)
        rows: list[dict[str, Any]] = []
        for index, pts in enumerate(timestamps):
            thumbnail = f"frames/frame-{index:08d}.jpg"
            row: dict[str, Any] = {"frame_index": index, "pts_seconds": pts, "thumbnail": thumbnail, "thumbnail_sha256": sha256_file(output / thumbnail)}
            if index in candidates:
                row["cut_candidate"] = {"score": candidates[index], "method": "ffmpeg_scene", "confirmed": False}
            rows.append(row)
        with (output / "frame-index.jsonl").open("w", encoding="utf-8") as index_file:
            for row in rows:
                index_file.write(json.dumps(row, ensure_ascii=False) + "\n")
        build_sheets(output, len(rows))
        build_html(output, rows)
        manifest["integrity"] = {
            "frame_index_sha256": sha256_file(output / "frame-index.jsonl"),
            "sheet_index_sha256": sha256_file(output / "sheet-index.json"),
            "index_html_sha256": sha256_file(output / "index.html"),
        }
        if folder_bytes(output) > args.max_megabytes * 1024 * 1024:
            raise ToolError("추출 패키지가 --max-megabytes 제한을 초과했습니다.")
        if sha256_file(source) != source_hash:
            raise ToolError("분석 중 원본 파일이 변경되었습니다.")
        manifest["extraction_complete"] = True
        safe_manifest(output, manifest)
        return {"ok": True, "manifest": str(output / "manifest.json"), "decoded_frames": len(timestamps)}
    except (ToolError, OSError, ValueError) as error:
        cleanup_generated(output)
        manifest["extracted_frames"] = 0
        manifest.pop("integrity", None)
        manifest["error"] = str(error)
        safe_manifest(output, manifest)
        raise


def main() -> int:
    parser = JsonArgumentParser(description=__doc__)
    parser.add_argument("input")
    parser.add_argument("--output", required=True)
    parser.add_argument("--width", type=int, default=320)
    parser.add_argument("--max-frames", type=int, default=20000)
    parser.add_argument("--max-megabytes", type=float, default=4096, help="생성 패키지의 실패 정리 경계(MiB); 쓰기 중 hard quota는 아님")
    try:
        args = parser.parse_args()
        print(json.dumps(inspect(args), ensure_ascii=False))
        return 0
    except (ToolError, OSError, ValueError) as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

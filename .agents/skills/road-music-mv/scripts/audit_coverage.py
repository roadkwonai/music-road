#!/usr/bin/env python3
"""Validate a frame-review JSON against an extracted reference package."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
from typing import Any


class AuditError(Exception):
    pass


class JsonArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise AuditError(message)


def integer(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise AuditError(f"{field}은 정수여야 합니다.")
    return value


def nonempty(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise AuditError(f"{field}은 비어 있지 않은 문자열이어야 합니다.")
    return value


def digest(value: Any, field: str) -> str:
    result = nonempty(value, field)
    if len(result) != 64 or any(character not in "0123456789abcdef" for character in result):
        raise AuditError(f"{field}은 SHA-256 16진수여야 합니다.")
    return result


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise AuditError(f"JSON을 읽지 못했습니다: {path}") from error
    if not isinstance(data, dict):
        raise AuditError(f"JSON 최상위는 객체여야 합니다: {path}")
    return data


def ranges(value: Any, key: str, frame_count: int, required_fields: tuple[str, ...]) -> tuple[list[tuple[int, int]], int]:
    if not isinstance(value, list):
        raise AuditError(f"{key}은 배열이어야 합니다.")
    parsed: list[tuple[int, int]] = []
    for item in value:
        if not isinstance(item, dict):
            raise AuditError(f"{key} 항목은 객체여야 합니다.")
        first = integer(item.get("first_frame"), f"{key}.first_frame")
        last = integer(item.get("last_frame"), f"{key}.last_frame")
        if first < 0 or last < first or last >= frame_count:
            raise AuditError(f"{key} 범위가 추출 프레임 범위를 벗어났습니다.")
        for field in required_fields:
            nonempty(item.get(field), f"{key}.{field}")
        parsed.append((first, last))
    parsed.sort()
    for previous, current in zip(parsed, parsed[1:]):
        if current[0] <= previous[1]:
            raise AuditError(f"{key} 범위가 겹칩니다.")
    return parsed, sum(last - first + 1 for first, last in parsed)


def missing_ranges(covered: list[tuple[int, int]], frame_count: int) -> list[dict[str, int]]:
    missing: list[dict[str, int]] = []
    cursor = 0
    for first, last in covered:
        if cursor < first:
            missing.append({"first_frame": cursor, "last_frame": first - 1})
        cursor = last + 1
    if cursor < frame_count:
        missing.append({"first_frame": cursor, "last_frame": frame_count - 1})
    return missing


def inside(root: Path, value: Any, field: str) -> Path:
    relative = Path(nonempty(value, field))
    target = (root / relative).resolve()
    if target == root or root not in target.parents or not target.is_file():
        raise AuditError(f"{field} 경로가 유효하지 않습니다.")
    return target


def verify_hash(path: Path, expected: Any, field: str) -> None:
    if sha256_file(path) != digest(expected, field):
        raise AuditError(f"{field} 해시가 일치하지 않습니다.")


def validate_sheets(root: Path, frame_count: int, integrity: dict[str, Any]) -> None:
    sheet_index = root / "sheet-index.json"
    if not sheet_index.is_file():
        raise AuditError("sheet-index.json이 없습니다.")
    verify_hash(sheet_index, integrity.get("sheet_index_sha256"), "integrity.sheet_index_sha256")
    try:
        sheets = json.loads(sheet_index.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise AuditError("sheet-index.json을 읽지 못했습니다.") from error
    if not isinstance(sheets, list) or len(sheets) != math.ceil(frame_count / 48):
        raise AuditError("sheet-index.json의 시트 수가 프레임 수와 일치하지 않습니다.")
    seen: set[Path] = set()
    for position, sheet in enumerate(sheets):
        if not isinstance(sheet, dict):
            raise AuditError("sheet-index.json 항목은 객체여야 합니다.")
        first = integer(sheet.get("first_frame"), "sheet.first_frame")
        last = integer(sheet.get("last_frame"), "sheet.last_frame")
        expected_first = position * 48
        expected_last = min(expected_first + 47, frame_count - 1)
        if first != expected_first or last != expected_last:
            raise AuditError("sheet-index.json의 프레임 범위가 연속적이지 않습니다.")
        path = inside(root, sheet.get("sheet"), "sheet.sheet")
        if path in seen:
            raise AuditError("sheet-index.json에 중복 시트 경로가 있습니다.")
        seen.add(path)
        verify_hash(path, sheet.get("sha256"), "sheet.sha256")


def validate_manifest(manifest_path: Path, manifest: dict[str, Any]) -> tuple[int, list[int]]:
    if manifest.get("format_version") != 2:
        raise AuditError("지원하지 않는 manifest 형식입니다. format_version=2가 필요합니다.")
    integrity = manifest.get("integrity")
    if not isinstance(integrity, dict):
        raise AuditError("legacy manifest에는 integrity 필드가 없어 검수할 수 없습니다.")
    if manifest.get("extraction_complete") is not True:
        raise AuditError("추출이 완료된 manifest만 검수할 수 있습니다.")
    frame_count = integer(manifest.get("decoded_frames"), "manifest.decoded_frames")
    extracted = integer(manifest.get("extracted_frames"), "manifest.extracted_frames")
    if frame_count < 1 or extracted != frame_count:
        raise AuditError("manifest의 decoded/extracted 프레임 수가 일관되지 않습니다.")
    source = manifest.get("source")
    if not isinstance(source, dict):
        raise AuditError("manifest.source가 없습니다.")
    source_path = Path(nonempty(source.get("path"), "manifest.source.path"))
    source_hash = nonempty(source.get("sha256"), "manifest.source.sha256")
    if not source_path.is_file() or sha256_file(source_path) != source_hash:
        raise AuditError("원본 영상이 manifest 해시와 일치하지 않습니다.")
    index_path = manifest_path.parent / "frame-index.jsonl"
    try:
        lines = index_path.read_text(encoding="utf-8").splitlines()
    except OSError as error:
        raise AuditError("frame-index.jsonl을 읽지 못했습니다.") from error
    if len(lines) != frame_count:
        raise AuditError("frame-index.jsonl 프레임 수가 manifest와 다릅니다.")
    root = manifest_path.parent.resolve()
    frame_index = root / "frame-index.jsonl"
    if not frame_index.is_file():
        raise AuditError("frame-index.jsonl을 읽지 못했습니다.")
    verify_hash(frame_index, integrity.get("frame_index_sha256"), "integrity.frame_index_sha256")
    index_html = root / "index.html"
    if not index_html.is_file():
        raise AuditError("index.html이 없습니다.")
    verify_hash(index_html, integrity.get("index_html_sha256"), "integrity.index_html_sha256")
    validate_sheets(root, frame_count, integrity)
    missing_timestamps: list[int] = []
    seen_thumbnails: set[Path] = set()
    previous_pts: float | None = None
    for expected, line in enumerate(lines):
        try:
            row = json.loads(line)
        except json.JSONDecodeError as error:
            raise AuditError("frame-index.jsonl에 잘못된 JSON이 있습니다.") from error
        if not isinstance(row, dict):
            raise AuditError("frame-index.jsonl 항목은 객체여야 합니다.")
        if integer(row.get("frame_index"), "frame_index") != expected:
            raise AuditError("frame-index.jsonl의 프레임 번호가 연속적이지 않습니다.")
        pts = row.get("pts_seconds")
        if pts is None:
            missing_timestamps.append(expected)
        elif isinstance(pts, bool) or not isinstance(pts, (int, float)) or not math.isfinite(float(pts)):
            raise AuditError("frame-index.jsonl의 pts_seconds는 유한한 숫자 또는 null이어야 합니다.")
        else:
            numeric_pts = float(pts)
            if previous_pts is not None and numeric_pts <= previous_pts:
                raise AuditError("frame-index.jsonl의 PTS는 프레임 순서대로 증가해야 합니다.")
            previous_pts = numeric_pts
        target = inside(root, row.get("thumbnail"), "thumbnail")
        if target in seen_thumbnails:
            raise AuditError("frame-index.jsonl의 썸네일이 여러 프레임에 중복 바인딩되었습니다.")
        seen_thumbnails.add(target)
        verify_hash(target, row.get("thumbnail_sha256"), "thumbnail_sha256")
    return frame_count, missing_timestamps


def audit(manifest_path: Path, review_path: Path) -> dict[str, Any]:
    manifest = load_json(manifest_path)
    review = load_json(review_path)
    frame_count, missing_timestamps = validate_manifest(manifest_path, manifest)
    source_hash = manifest["source"]["sha256"]
    if review.get("source_sha256") != source_hash:
        raise AuditError("review.source_sha256가 manifest 원본과 일치하지 않습니다.")
    reviewed, reviewed_frames = ranges(review.get("reviewed_ranges"), "reviewed_ranges", frame_count, ("evidence", "note"))
    shots, shot_frames = ranges(review.get("shots"), "shots", frame_count, ("size", "angle", "movement", "lighting", "effects", "transition_in", "evidence", "confidence"))
    for shot in review["shots"]:
        if shot["confidence"] not in {"observed", "inferred", "unknown"}:
            raise AuditError("shots.confidence는 observed, inferred, unknown 중 하나여야 합니다.")
    if not isinstance(review.get("playback_reviewed"), bool):
        raise AuditError("playback_reviewed는 불리언이어야 합니다.")
    review_missing = missing_ranges(reviewed, frame_count)
    shot_missing = missing_ranges(shots, frame_count)
    complete = not review_missing and not shot_missing and not missing_timestamps and review["playback_reviewed"]
    return {
        "ok": True,
        "coverage": {
            "frame_count": frame_count,
            "reviewed_frames": reviewed_frames,
            "shot_frames": shot_frames,
            "reviewed_missing_ranges": review_missing,
            "shot_missing_ranges": shot_missing,
            "timestamp_missing_frames": missing_timestamps,
            "playback_reviewed": review["playback_reviewed"],
        },
        "complete": complete,
    }


def main() -> int:
    parser = JsonArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--review", required=True)
    parser.add_argument("--require-complete", action="store_true")
    try:
        args = parser.parse_args()
        result = audit(Path(args.manifest).resolve(), Path(args.review).resolve())
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result["complete"] or not args.require_complete else 3
    except (AuditError, OSError, ValueError) as error:
        print(json.dumps({"ok": False, "error": str(error), "complete": False}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

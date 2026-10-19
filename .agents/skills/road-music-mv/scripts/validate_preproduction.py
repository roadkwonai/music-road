#!/usr/bin/env python3
"""Validate an offline image-first pre-production package for an LTX music video.

This checks declared structure, local image bytes and recorded review decisions.  It
cannot establish that an image actually depicts the claimed person, place or pose;
the required review evidence remains a human accountability record.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from typing import Any

from mv_storyboard import StoryboardValidationError


IMAGE_FORMATS = "png_pipe,jpeg_pipe,webp"
IMAGE_CODECS = {"png", "mjpeg", "webp"}
IMAGE_CONTAINERS = {"png_pipe", "jpeg_pipe", "webp"}
KINDS = {"identity-master", "character-sheet", "wardrobe", "background", "prop", "shot-start", "shot-end", "storyboard-sheet"}
METHODS = {"image_gen", "openai-images-api", "reuse", "compose"}
TOOLS = {"image_gen", "openai-images-api", "provided", "local-composite"}
IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
OPENAI_IMAGE_MODEL = re.compile(r"^gpt-image-[A-Za-z0-9][A-Za-z0-9._-]*$")


class ValidationError(Exception):
    pass


class JsonArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise ValidationError(message)


def object_value(value: Any, field: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValidationError(f"{field}은 객체여야 합니다.")
    return value


def array_value(value: Any, field: str) -> list[Any]:
    if not isinstance(value, list):
        raise ValidationError(f"{field}은 배열이어야 합니다.")
    return value


def string(value: Any, field: str, *, allow_empty: bool = False) -> str:
    if not isinstance(value, str) or (not allow_empty and not value.strip()):
        raise ValidationError(f"{field}은 비어 있지 않은 문자열이어야 합니다.")
    return value


def boolean(value: Any, field: str) -> bool:
    if not isinstance(value, bool):
        raise ValidationError(f"{field}은 불리언이어야 합니다.")
    return value


def integer(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValidationError(f"{field}은 정수여야 합니다.")
    return value


def sha256(value: Any, field: str) -> str:
    result = string(value, field)
    if len(result) != 64 or any(character not in "0123456789abcdef" for character in result):
        raise ValidationError(f"{field}은 소문자 SHA-256 16진수여야 합니다.")
    return result


def identifier(value: Any, field: str) -> str:
    result = string(value, field)
    if not IDENTIFIER.fullmatch(result):
        raise ValidationError(f"{field}은 안전한 ID여야 합니다.")
    return result


def openai_image_model(value: Any, field: str) -> str:
    result = string(value, field)
    if not OPENAI_IMAGE_MODEL.fullmatch(result):
        raise ValidationError(f"{field}은 gpt-image-* 모델 ID여야 합니다.")
    return result


def exact_keys(value: dict[str, Any], allowed: set[str], field: str, required: set[str] | None = None) -> None:
    required = allowed if required is None else required
    missing = sorted(required - value.keys())
    unknown = sorted(value.keys() - allowed)
    if missing or unknown:
        detail = []
        if missing:
            detail.append("누락: " + ", ".join(missing))
        if unknown:
            detail.append("알 수 없음: " + ", ".join(unknown))
        raise ValidationError(f"{field} 필드가 올바르지 않습니다 ({'; '.join(detail)}).")


def required_keys(value: dict[str, Any], required: set[str], field: str) -> None:
    """Check image-gate inputs without claiming authority over other plan metadata."""
    missing = sorted(required - value.keys())
    if missing:
        raise ValidationError(f"{field} 필수 필드가 없습니다: {', '.join(missing)}")


def unique_ids(items: list[Any], field: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for index, raw in enumerate(items):
        item = object_value(raw, f"{field}[{index}]")
        item_id = identifier(item.get("id"), f"{field}[{index}].id")
        if item_id in result:
            raise ValidationError(f"{field}에 중복 ID가 있습니다: {item_id}")
        result[item_id] = item
    return result


def id_list(value: Any, field: str, known: set[str] | None = None) -> list[str]:
    values = array_value(value, field)
    parsed = [identifier(item, f"{field}[{index}]") for index, item in enumerate(values)]
    if len(parsed) != len(set(parsed)):
        raise ValidationError(f"{field}에 중복 ID가 있습니다.")
    if known is not None:
        absent = sorted(set(parsed) - known)
        if absent:
            raise ValidationError(f"{field}가 존재하지 않는 ID를 가리킵니다: {', '.join(absent)}")
    return parsed


def load_json(path: Path, field: str) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValidationError(f"{field} JSON을 읽지 못했습니다: {path}") from error
    return object_value(data, field)


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_root(value: str) -> Path:
    raw = Path(value)
    if not raw.is_absolute() or raw.is_symlink() or not raw.is_dir():
        raise ValidationError("--root는 심볼릭 링크가 아닌 존재하는 절대 디렉터리여야 합니다.")
    return raw.resolve()


def safe_image(root: Path, relative: Any) -> Path:
    name = string(relative, "manifest.assets.path")
    path = Path(name)
    if path.is_absolute() or ".." in path.parts:
        raise ValidationError("manifest.assets.path는 root 내부 상대 경로여야 합니다.")
    current = root
    for part in path.parts:
        if part in {"", "."}:
            continue
        current = current / part
        if current.is_symlink():
            raise ValidationError("manifest.assets.path에 심볼릭 링크를 사용할 수 없습니다.")
    resolved = current.resolve()
    if root not in resolved.parents or not resolved.is_file():
        raise ValidationError("manifest.assets.path는 root 내부의 일반 파일이어야 합니다.")
    return resolved


def safe_file(root: Path, relative: Any, field: str) -> Path:
    name = string(relative, field)
    path = Path(name)
    if path.is_absolute() or ".." in path.parts:
        raise ValidationError(f"{field}은 root 내부 상대 경로여야 합니다.")
    current = root
    for part in path.parts:
        if part not in {"", "."}:
            current /= part
            if current.is_symlink():
                raise ValidationError(f"{field}에 심볼릭 링크를 사용할 수 없습니다.")
    resolved = current.resolve()
    if root not in resolved.parents or not resolved.is_file():
        raise ValidationError(f"{field}은 root 내부의 일반 파일이어야 합니다.")
    return resolved


def normalized_pcm(path: Path, sample_rate: int, channels: int) -> bytes:
    try:
        completed = subprocess.run([
            "ffmpeg", "-v", "error", "-i", os.fspath(path), "-map", "0:a:0", "-vn", "-sn", "-dn",
            "-ar", str(sample_rate), "-ac", str(channels), "-c:a", "pcm_s32le", "-f", "s32le", "-",
        ], capture_output=True, check=False)
    except OSError as error:
        raise ValidationError("ffmpeg를 실행할 수 없습니다.") from error
    if completed.returncode:
        raise ValidationError("오디오 PCM 추출에 실패했습니다.")
    return completed.stdout


def probe_audio(path: Path) -> dict[str, Any]:
    try:
        completed = subprocess.run([
            "ffprobe", "-v", "error", "-show_entries", "stream=codec_type,sample_rate,channels:format=duration",
            "-of", "json", os.fspath(path),
        ], text=True, capture_output=True, check=False)
    except OSError as error:
        raise ValidationError("ffprobe를 실행할 수 없습니다.") from error
    if completed.returncode:
        raise ValidationError("ffprobe 오디오 검증에 실패했습니다.")
    try:
        parsed = json.loads(completed.stdout)
        streams = parsed["streams"]
        audio = [stream for stream in streams if stream.get("codec_type") == "audio"]
        if len(audio) != 1:
            raise ValueError("audio stream count")
        stream = audio[0]
        sample_rate = int(stream["sample_rate"])
        channels = int(stream["channels"])
        duration = float(parsed["format"]["duration"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise ValidationError("ffprobe 오디오 메타데이터를 읽지 못했습니다.") from error
    if len(audio) != 1 or sample_rate < 1 or channels < 1 or duration <= 0:
        raise ValidationError("단일 유효 오디오 스트림이 필요합니다.")
    pcm = normalized_pcm(path, sample_rate, channels)
    frame_size = channels * 4
    if not pcm or len(pcm) % frame_size:
        raise ValidationError("정규화한 PCM 오디오가 유효하지 않습니다.")
    return {"duration": duration, "sample_rate": sample_rate, "channels": channels, "sample_count": len(pcm) // frame_size, "pcm_sha256": hashlib.sha256(pcm).hexdigest()}


def probe_animatic(path: Path, *, width: int, height: int, fps: float, total_frames: int, duration: float, source_audio: dict[str, Any]) -> None:
    try:
        completed = subprocess.run([
            "ffprobe", "-v", "error", "-count_frames",
            "-show_entries", "stream=codec_type,width,height,avg_frame_rate,nb_read_frames,sample_rate,channels:format=duration",
            "-of", "json", os.fspath(path),
        ], text=True, capture_output=True, check=False)
    except OSError as error:
        raise ValidationError("ffprobe를 실행할 수 없습니다.") from error
    if completed.returncode:
        raise ValidationError("ffprobe 애니매틱 검증에 실패했습니다.")
    try:
        parsed = json.loads(completed.stdout)
        streams = parsed["streams"]
        videos = [stream for stream in streams if stream.get("codec_type") == "video"]
        audios = [stream for stream in streams if stream.get("codec_type") == "audio"]
        video = videos[0]
        numerator, denominator = video["avg_frame_rate"].split("/", 1)
        actual_fps = float(numerator) / float(denominator)
        actual_frames = int(video["nb_read_frames"])
        actual_duration = float(parsed["format"]["duration"])
        sample_rate = int(audios[0]["sample_rate"])
        channels = int(audios[0]["channels"])
    except (KeyError, IndexError, TypeError, ValueError, ZeroDivisionError, json.JSONDecodeError) as error:
        raise ValidationError("ffprobe 애니매틱 메타데이터를 읽지 못했습니다.") from error
    if len(videos) != 1 or len(audios) != 1:
        raise ValidationError("애니매틱에는 단일 video/audio 스트림이 필요합니다.")
    if video.get("width") != width or video.get("height") != height or abs(actual_fps - fps) > 1e-6 or actual_frames != total_frames or abs(actual_duration - duration) > 1 / fps + 1e-6:
        raise ValidationError("애니매틱 납품 메타데이터가 production_design과 일치하지 않습니다.")
    if sample_rate != source_audio["sample_rate"] or channels != source_audio["channels"]:
        raise ValidationError("애니매틱 오디오 sample_rate/channels가 원본과 일치하지 않습니다.")
    pcm = normalized_pcm(path, sample_rate, channels)
    sample_count = len(pcm) // (channels * 4)
    if len(pcm) % (channels * 4) or sample_count != source_audio["sample_count"] or hashlib.sha256(pcm).hexdigest() != source_audio["pcm_sha256"]:
        raise ValidationError("애니매틱 오디오 PCM이 원본과 일치하지 않습니다.")


def probe_image(path: Path) -> tuple[int, int]:
    try:
        completed = subprocess.run([
            "ffprobe", "-v", "error", "-protocol_whitelist", "file", "-format_whitelist", IMAGE_FORMATS,
            "-count_frames", "-show_entries", "stream=codec_name,width,height,nb_read_frames:format=format_name",
            "-of", "json", os.fspath(path),
        ], text=True, capture_output=True, check=False)
    except OSError as error:
        raise ValidationError("ffprobe를 실행할 수 없습니다.") from error
    if completed.returncode:
        detail = (completed.stderr or completed.stdout).strip().splitlines()
        raise ValidationError(detail[-1] if detail else "ffprobe 이미지 검증에 실패했습니다.")
    try:
        parsed = json.loads(completed.stdout)
        streams = parsed["streams"]
        stream = streams[0]
        format_name = parsed["format"]["format_name"]
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
        raise ValidationError("ffprobe 이미지 메타데이터를 읽지 못했습니다.") from error
    if len(streams) != 1 or stream.get("codec_name") not in IMAGE_CODECS or format_name not in IMAGE_CONTAINERS:
        raise ValidationError("PNG, JPEG 또는 WebP 단일 이미지 파일만 사용할 수 있습니다.")
    if str(stream.get("nb_read_frames")) != "1":
        raise ValidationError("단일 프레임 이미지 파일만 사용할 수 있습니다.")
    width = integer(stream.get("width"), "ffprobe.width")
    height = integer(stream.get("height"), "ffprobe.height")
    if width < 1 or height < 1:
        raise ValidationError("이미지 크기는 양수여야 합니다.")
    return width, height


def closure(start: set[str], assets: dict[str, dict[str, Any]]) -> set[str]:
    result: set[str] = set()
    visiting: set[str] = set()

    def visit(asset_id: str) -> None:
        if asset_id in visiting:
            raise ValidationError(f"assets.references에 순환 참조가 있습니다: {asset_id}")
        if asset_id in result:
            return
        visiting.add(asset_id)
        for reference in assets[asset_id]["references"]:
            visit(reference)
        visiting.remove(asset_id)
        result.add(asset_id)

    for asset_id in start:
        visit(asset_id)
    return result


def validate_plan(plan: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], dict[str, str], dict[str, list[str]], dict[str, str]]:
    required_keys(plan, {"schema_version", "profile", "characters", "locations", "assets"}, "plan")
    if integer(plan.get("schema_version"), "plan.schema_version") != 1:
        raise ValidationError("plan.schema_version=1이 필요합니다.")
    profile = object_value(plan.get("profile"), "plan.profile")
    required_keys(profile, {"music_genre", "visual_format", "visual_look"}, "plan.profile")
    for key in ("music_genre", "visual_format", "visual_look"):
        string(profile.get(key), f"plan.profile.{key}")

    characters = unique_ids(array_value(plan.get("characters"), "plan.characters"), "plan.characters")
    locations = unique_ids(array_value(plan.get("locations"), "plan.locations"), "plan.locations")
    for character_id, character in characters.items():
        required_keys(character, {"id", "identity_asset_id"}, f"plan.characters[{character_id}]")
        identifier(character.get("identity_asset_id"), f"plan.characters[{character_id}].identity_asset_id")
    for location_id, location in locations.items():
        required_keys(location, {"id", "background_asset_id"}, f"plan.locations[{location_id}]")
        identifier(location.get("background_asset_id"), f"plan.locations[{location_id}].background_asset_id")

    raw_assets = array_value(plan.get("assets"), "plan.assets")
    assets = unique_ids(raw_assets, "plan.assets")
    character_ids = set(characters)
    location_ids = set(locations)
    for asset_id, asset in assets.items():
        kind = string(asset.get("kind"), f"plan.assets[{asset_id}].kind")
        if kind not in KINDS:
            raise ValidationError(f"plan.assets[{asset_id}].kind가 지원되지 않습니다.")
        boolean(asset.get("required"), f"plan.assets[{asset_id}].required")
        method = string(asset.get("method"), f"plan.assets[{asset_id}].method")
        if method not in METHODS:
            raise ValidationError(f"plan.assets[{asset_id}].method가 지원되지 않습니다.")
        exact_keys(asset, {"id", "kind", "required", "method", "character_ids", "location_id", "references", "prompt", "invariants"} | ({"model"} if method == "openai-images-api" else set()), f"plan.assets[{asset_id}]")
        if method == "openai-images-api":
            asset["model"] = openai_image_model(asset.get("model"), f"plan.assets[{asset_id}].model")
        if (kind == "storyboard-sheet") != (method == "compose"):
            raise ValidationError("storyboard-sheet만 method=compose를 사용할 수 있습니다.")
        asset["character_ids"] = id_list(asset.get("character_ids"), f"plan.assets[{asset_id}].character_ids", character_ids)
        location_id = asset.get("location_id")
        if location_id is not None:
            asset["location_id"] = identifier(location_id, f"plan.assets[{asset_id}].location_id")
            if asset["location_id"] not in location_ids:
                raise ValidationError(f"plan.assets[{asset_id}].location_id가 존재하지 않습니다.")
        asset["references"] = id_list(asset.get("references"), f"plan.assets[{asset_id}].references")
        prompt = string(asset.get("prompt"), f"plan.assets[{asset_id}].prompt", allow_empty=True)
        if asset["method"] in {"image_gen", "openai-images-api"} and not prompt.strip():
            raise ValidationError(f"plan.assets[{asset_id}] {asset['method']}에는 prompt가 필요합니다.")
        invariants = array_value(asset.get("invariants"), f"plan.assets[{asset_id}].invariants")
        for index, invariant in enumerate(invariants):
            string(invariant, f"plan.assets[{asset_id}].invariants[{index}]")
        if asset["method"] in {"image_gen", "openai-images-api"} and asset["kind"] != "prop" and not invariants:
            raise ValidationError(f"plan.assets[{asset_id}] {asset['method']} 캐릭터·장소·샷에는 invariants가 필요합니다.")
    for asset_id, asset in assets.items():
        absent = sorted(set(asset["references"]) - set(assets))
        if absent:
            raise ValidationError(f"plan.assets[{asset_id}].references가 존재하지 않는 asset을 가리킵니다: {', '.join(absent)}")
    closure(set(assets), assets)
    key_kinds = {"identity-master", "character-sheet", "wardrobe", "background", "prop"}
    future_kinds = {"shot-start", "shot-end", "storyboard-sheet"}
    for asset_id, asset in assets.items():
        if asset["kind"] in key_kinds:
            future = next((reference for reference in closure({asset_id}, assets) if assets[reference]["kind"] in future_kinds), None)
            if future is not None:
                raise ValidationError(f"key asset {asset_id}의 references closure가 미래 asset {future}을 가리킵니다.")

    for asset_id, asset in assets.items():
        if asset["kind"] != "character-sheet":
            continue
        if len(asset["character_ids"]) != 1 or asset["location_id"] is not None:
            raise ValidationError(f"character-sheet {asset_id}는 단일 character의 장소 없는 참조 시트여야 합니다.")
        character_id = asset["character_ids"][0]
        master_id = characters[character_id]["identity_asset_id"]
        references = asset["references"]
        if len(references) != 1:
            raise ValidationError(f"character-sheet {asset_id}는 본인의 identity-master 또는 wardrobe 하나만 직접 참조해야 합니다.")
        source = assets[references[0]]
        identities = {reference for reference in closure(set(references), assets) if assets[reference]["kind"] == "identity-master"}
        if source["kind"] not in {"identity-master", "wardrobe"} or source["character_ids"] != [character_id] or identities != {master_id}:
            raise ValidationError(f"character-sheet {asset_id}는 {character_id} identity-master만 계보에 둔 본인의 master 또는 wardrobe를 참조해야 합니다.")

    masters: dict[str, str] = {}
    sheets: dict[str, list[str]] = {}
    for character_id, character in characters.items():
        master_id = character["identity_asset_id"]
        master = assets.get(master_id)
        if master is None or master["kind"] != "identity-master" or master["required"] is not True or master["character_ids"] != [character_id] or master["location_id"] is not None:
            raise ValidationError(f"character {character_id}에는 자신의 required identity-master가 필요합니다.")
        masters[character_id] = master_id
        linked = [asset_id for asset_id, asset in assets.items() if asset["kind"] == "character-sheet" and asset["required"] is True and asset["character_ids"] == [character_id] and master_id in closure({asset_id}, assets)]
        if not linked:
            raise ValidationError(f"character {character_id}에는 identity-master를 참조하는 required character-sheet가 필요합니다.")
        sheets[character_id] = linked

    backgrounds: dict[str, str] = {}
    for location_id, location in locations.items():
        background_id = location["background_asset_id"]
        background = assets.get(background_id)
        if background is None or background["kind"] != "background" or background["required"] is not True or background["location_id"] != location_id or background["character_ids"]:
            raise ValidationError(f"location {location_id}에는 자신의 required background가 필요합니다.")
        backgrounds[location_id] = background_id
    return assets, masters, sheets, backgrounds


def validate_shots(shots: dict[str, Any], assets: dict[str, dict[str, Any]], masters: dict[str, str], sheets: dict[str, list[str]], backgrounds: dict[str, str]) -> set[str]:
    required_keys(shots, {"shots"}, "shots")
    entries = unique_ids(array_value(shots.get("shots"), "shots.shots"), "shots.shots")
    character_ids = set(masters)
    location_ids = set(backgrounds)
    required: set[str] = {asset_id for asset_id, asset in assets.items() if asset["required"]}
    for shot_id, shot in entries.items():
        required_keys(shot, {"id", "character_ids", "location_id", "start_image_asset_id"}, f"shots.shots[{shot_id}]")
        cast = id_list(shot.get("character_ids"), f"shots.shots[{shot_id}].character_ids", character_ids)
        location_id = shot.get("location_id")
        if location_id is not None:
            location_id = identifier(location_id, f"shots.shots[{shot_id}].location_id")
            if location_id not in location_ids:
                raise ValidationError(f"shots.shots[{shot_id}].location_id가 존재하지 않습니다.")
        start_id = identifier(shot.get("start_image_asset_id"), f"shots.shots[{shot_id}].start_image_asset_id")
        start = assets.get(start_id)
        if start is None or start["kind"] != "shot-start":
            raise ValidationError(f"shot {shot_id}의 start_image_asset_id는 shot-start여야 합니다.")
        end_id = shot.get("end_image_asset_id")
        if end_id is not None:
            end_id = identifier(end_id, f"shots.shots[{shot_id}].end_image_asset_id")
            end = assets.get(end_id)
            if end is None or end["kind"] != "shot-end":
                raise ValidationError(f"shot {shot_id}의 end_image_asset_id는 shot-end여야 합니다.")
        for label, asset_id in (("start", start_id), ("end", end_id)):
            if asset_id is None:
                continue
            keyframe = assets[asset_id]
            if set(keyframe["character_ids"]) != set(cast) or keyframe["location_id"] != location_id:
                raise ValidationError(f"shot {shot_id}의 {label} keyframe cast/location이 shot과 일치하지 않습니다.")
            references = closure({asset_id}, assets) - {asset_id}
            for character_id in cast:
                if masters[character_id] not in references:
                    raise ValidationError(f"shot {shot_id} keyframe은 {character_id} identity-master를 참조해야 합니다.")
                required.update(sheets[character_id])
            if location_id is not None and backgrounds[location_id] not in references:
                raise ValidationError(f"shot {shot_id} keyframe은 {location_id} background를 참조해야 합니다.")
            required.add(asset_id)
    return closure(required, assets)


def validate_manifest(root: Path, manifest: dict[str, Any], assets: dict[str, dict[str, Any]], required: set[str]) -> tuple[dict[str, dict[str, Any]], list[str]]:
    exact_keys(manifest, {"schema_version", "assets"}, "manifest")
    if integer(manifest.get("schema_version"), "manifest.schema_version") != 1:
        raise ValidationError("manifest.schema_version=1이 필요합니다.")
    items = unique_ids(array_value(manifest.get("assets"), "manifest.assets"), "manifest.assets")
    unknown = sorted(set(items) - set(assets))
    if unknown:
        raise ValidationError(f"manifest가 plan에 없는 asset을 포함합니다: {', '.join(unknown)}")
    files: dict[str, dict[str, Any]] = {}
    paths: dict[Path, str] = {}
    identity_hashes: dict[str, str] = {}
    for asset_id, item in items.items():
        method = assets[asset_id]["method"]
        exact_keys(item, {"id", "path", "sha256", "width", "height", "tool"} | ({"model"} if method == "openai-images-api" else set()), f"manifest.assets[{asset_id}]")
        tool = string(item.get("tool"), f"manifest.assets[{asset_id}].tool")
        if tool not in TOOLS:
            raise ValidationError(f"manifest.assets[{asset_id}].tool이 지원되지 않습니다.")
        if method == "image_gen" and tool != "image_gen":
            raise ValidationError(f"manifest.assets[{asset_id}] image_gen asset은 tool=image_gen이어야 합니다.")
        if method == "openai-images-api":
            if tool != "openai-images-api":
                raise ValidationError(f"manifest.assets[{asset_id}] openai-images-api asset은 tool=openai-images-api여야 합니다.")
            if openai_image_model(item.get("model"), f"manifest.assets[{asset_id}].model") != assets[asset_id]["model"]:
                raise ValidationError(f"manifest.assets[{asset_id}] model이 plan과 일치하지 않습니다.")
        if method == "compose" and tool != "local-composite":
            raise ValidationError(f"manifest.assets[{asset_id}] compose asset은 tool=local-composite이어야 합니다.")
        if method != "compose" and tool == "local-composite":
            raise ValidationError(f"manifest.assets[{asset_id}] local-composite는 compose asset에만 사용할 수 있습니다.")
        path = safe_image(root, item.get("path"))
        if path in paths:
            raise ValidationError(f"서로 다른 asset ID가 같은 이미지 파일을 공유합니다: {paths[path]}, {asset_id}")
        paths[path] = asset_id
        expected = sha256(item.get("sha256"), f"manifest.assets[{asset_id}].sha256")
        if hash_file(path) != expected:
            raise ValidationError(f"manifest.assets[{asset_id}] 파일 해시가 일치하지 않습니다.")
        if assets[asset_id]["kind"] == "identity-master":
            existing = identity_hashes.get(expected)
            if existing is not None:
                raise ValidationError(f"서로 다른 character identity-master가 같은 이미지 해시를 공유합니다: {existing}, {asset_id}")
            identity_hashes[expected] = asset_id
        width = integer(item.get("width"), f"manifest.assets[{asset_id}].width")
        height = integer(item.get("height"), f"manifest.assets[{asset_id}].height")
        if width < 1 or height < 1 or probe_image(path) != (width, height):
            raise ValidationError(f"manifest.assets[{asset_id}] 이미지 크기 또는 형식이 일치하지 않습니다.")
        files[asset_id] = {"sha256": expected}
    return files, [f"asset:{asset_id}" for asset_id in sorted(required - set(files))]


def validate_review(review: dict[str, Any], files: dict[str, dict[str, Any]], required: set[str], *, allow_storyboard: bool = False, allow_keys: bool = False) -> list[str]:
    allowed = {"schema_version", "assets"} | ({"storyboard"} if allow_storyboard else set()) | ({"keys"} if allow_keys else set())
    exact_keys(review, allowed, "review", {"schema_version", "assets"})
    if integer(review.get("schema_version"), "review.schema_version") != 1:
        raise ValidationError("review.schema_version=1이 필요합니다.")
    items = unique_ids(array_value(review.get("assets"), "review.assets"), "review.assets")
    unknown = sorted(set(items) - set(files))
    if unknown:
        raise ValidationError(f"review가 manifest에 없는 asset을 포함합니다: {', '.join(unknown)}")
    missing: list[str] = []
    for asset_id in sorted(required):
        if asset_id not in files:
            continue
        item = items.get(asset_id)
        if item is None:
            missing.append(f"review:{asset_id}")
            continue
        exact_keys(item, {"id", "sha256", "verdict", "evidence"}, f"review.assets[{asset_id}]")
        if sha256(item.get("sha256"), f"review.assets[{asset_id}].sha256") != files[asset_id]["sha256"]:
            raise ValidationError(f"review.assets[{asset_id}] 해시가 manifest와 일치하지 않습니다.")
        verdict = string(item.get("verdict"), f"review.assets[{asset_id}].verdict")
        if verdict not in {"pass", "fail"}:
            raise ValidationError(f"review.assets[{asset_id}].verdict는 pass 또는 fail이어야 합니다.")
        string(item.get("evidence"), f"review.assets[{asset_id}].evidence")
        if verdict != "pass":
            missing.append(f"review-pass:{asset_id}")
    return missing


def validate_source_audio(design: dict[str, Any]) -> tuple[bool, dict[str, Any] | None]:
    source = design["source_audio"]
    path = Path(source["path"])
    if not path.is_absolute():
        raise ValidationError("production_design.source_audio.path는 절대 경로여야 합니다.")
    if path.is_symlink() or (path.exists() and not path.is_file()):
        raise ValidationError("production_design.source_audio.path는 심볼릭 링크가 아닌 일반 파일이어야 합니다.")
    if not path.exists():
        return False, None
    if hash_file(path) != source["sha256"]:
        raise ValidationError("production_design.source_audio 파일 해시가 일치하지 않습니다.")
    audio = probe_audio(path)
    fps = float(design["delivery"]["fps"])
    if abs(audio["duration"] - float(source["duration_seconds"])) > 1 / fps + 1e-6:
        raise ValidationError("production_design.source_audio 실제 길이가 선언과 일치하지 않습니다.")
    return True, audio


def validate(root: Path, plan: dict[str, Any], shots: dict[str, Any], manifest: dict[str, Any] | None, review: dict[str, Any] | None, bible: dict[str, Any] | None = None, production_design: dict[str, Any] | None = None, storyboard: dict[str, Any] | None = None, stage: str | None = None, animatic_review: dict[str, Any] | None = None) -> dict[str, Any]:
    if (production_design is None) != (storyboard is None):
        raise ValidationError("production_design과 storyboard는 함께 필요합니다.")
    if production_design is None and (stage is not None or animatic_review is not None):
        raise ValidationError("stage와 animatic_review는 production_design/storyboard와 함께만 사용할 수 있습니다.")
    assets, masters, sheets, backgrounds = validate_plan(plan)
    if bible is not None:
        from validate_mv_context import validate_bindings
        validate_bindings(bible, plan, shots)
    required = validate_shots(shots, assets, masters, sheets, backgrounds)
    new_mode = production_design is not None
    needs_bible = new_mode and len(masters) >= 2 and bible is None
    domain: dict[str, Any] | None = None
    digests: dict[str, str] | None = None
    required_storyboard: set[str] = set()
    audio_ready = True
    source_audio: dict[str, Any] | None = None
    if new_mode:
        from mv_storyboard import canonical_digest, validate_design, validate_storyboard
        stage = stage or "storyboard"
        if stage not in {"keys", "storyboard", "animatic"}:
            raise ValidationError("stage는 keys, storyboard 또는 animatic이어야 합니다.")
        if animatic_review is not None and stage != "animatic":
            raise ValidationError("animatic_review는 stage=animatic에서만 사용할 수 있습니다.")
        domain = validate_design(production_design, assets, shots, closure)
        if stage != "keys":
            required_storyboard = validate_storyboard(storyboard, domain, assets)
        audio_ready, source_audio = validate_source_audio(production_design)
        digests = {
            "production_design": canonical_digest(production_design),
            "image_plan": canonical_digest(plan),
            "shot_plan": canonical_digest(shots),
            "storyboard": canonical_digest(storyboard),
        }
        if stage == "keys":
            key_kinds = {"identity-master", "character-sheet", "wardrobe", "background", "prop"}
            required = closure({asset_id for asset_id in required if assets[asset_id]["kind"] in key_kinds} | domain["used_prop_asset_ids"], assets)
        else:
            required = closure(required | domain["used_prop_asset_ids"] | required_storyboard, assets)
    missing: list[str] = []
    if not shots["shots"]:
        missing.append("shots")
    if needs_bible:
        missing.append("bible")
    if new_mode and not audio_ready:
        missing.append("source-audio")
    files: dict[str, dict[str, Any]] = {}
    if manifest is None:
        missing.append("manifest")
        missing.extend(f"asset:{asset_id}" for asset_id in sorted(required))
    else:
        files, absent = validate_manifest(root, manifest, assets, required)
        missing.extend(absent)
    if review is None:
        missing.append("review")
        missing.extend(f"review:{asset_id}" for asset_id in sorted(required & set(files)))
    else:
        missing.extend(validate_review(review, files, required, allow_storyboard=new_mode, allow_keys=new_mode))
    images_ready = not any(item == "manifest" or item.startswith("asset:") or item == "review" or item.startswith("review:") or item.startswith("review-pass:") for item in missing)
    animatic_ready = False
    if new_mode and stage == "keys":
        from mv_storyboard import validate_keys_review
        if review is None or "keys" not in review:
            missing.append("keys-review")
        elif not validate_keys_review(review["keys"], digests):
            missing.append("keys-review-pass")
    if new_mode and stage in {"storyboard", "animatic"}:
        from mv_storyboard import validate_storyboard_review
        if review is None or "storyboard" not in review:
            missing.append("storyboard-review")
        elif not validate_storyboard_review(review["storyboard"], set(panel["id"] for panel in storyboard["panels"]), digests):
            missing.append("storyboard-review-pass")
    if new_mode and stage == "animatic":
        if animatic_review is None:
            missing.append("animatic-review")
        elif not audio_ready:
            pass
        else:
            from mv_storyboard import validate_animatic_review
            animatic = validate_animatic_review(animatic_review, digests, production_design["source_audio"]["sha256"])
            media = safe_file(root, animatic["path"], "animatic_review.path")
            if hash_file(media) != animatic["sha256"]:
                raise ValidationError("animatic_review 파일 해시가 일치하지 않습니다.")
            probe_animatic(media, width=domain["width"], height=domain["height"], fps=domain["fps"], total_frames=domain["total_frames"], duration=domain["duration_seconds"], source_audio=source_audio)
            if animatic["passed"]:
                animatic_ready = True
            else:
                missing.append("animatic-review-pass")
    result = {"ok": True, "ready": not missing, "missing": sorted(set(missing)), "errors": []}
    if new_mode:
        result.update({"stage": stage, "input_sha256": digests, "images_ready": images_ready, "animatic_ready": animatic_ready})
    return result


def main() -> int:
    parser = JsonArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    parser.add_argument("--plan", required=True)
    parser.add_argument("--shots", required=True)
    parser.add_argument("--manifest")
    parser.add_argument("--review")
    parser.add_argument("--bible")
    parser.add_argument("--production-design")
    parser.add_argument("--storyboard")
    parser.add_argument("--stage", choices=("keys", "storyboard", "animatic"))
    parser.add_argument("--animatic-review")
    parser.add_argument("--require-ready", action="store_true")
    try:
        args = parser.parse_args()
        root = validate_root(args.root)
        result = validate(
            root,
            load_json(Path(args.plan), "plan"),
            load_json(Path(args.shots), "shots"),
            load_json(Path(args.manifest), "manifest") if args.manifest else None,
            load_json(Path(args.review), "review") if args.review else None,
            load_json(Path(args.bible), "bible") if args.bible else None,
            load_json(Path(args.production_design), "production_design") if args.production_design else None,
            load_json(Path(args.storyboard), "storyboard") if args.storyboard else None,
            args.stage,
            load_json(Path(args.animatic_review), "animatic_review") if args.animatic_review else None,
        )
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result["ready"] or not args.require_ready else 3
    except (ValidationError, StoryboardValidationError, OSError, ValueError) as error:
        print(json.dumps({"ok": False, "ready": False, "missing": [], "errors": [str(error)]}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

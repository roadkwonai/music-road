"""Domain checks for the optional production-design, storyboard, and animatic gates."""

from __future__ import annotations

import hashlib
import json
import math
from typing import Any, Callable


class StoryboardValidationError(Exception):
    pass


DECISIONS = {
    "cast", "age_range", "concept", "wardrobe", "hair_makeup", "locations_sets", "props",
    "performance_choreography", "camera_lenses", "lighting_color", "film_look", "vfx",
    "transitions", "visual_sfx", "sound_policy", "typography_graphics",
}
CAMERA_FIELDS = {"size", "angle", "movement", "composition", "focus", "lens_intent"}


def fail(message: str) -> None:
    raise StoryboardValidationError(message)


def obj(value: Any, field: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        fail(f"{field}은 객체여야 합니다.")
    return value


def array(value: Any, field: str) -> list[Any]:
    if not isinstance(value, list):
        fail(f"{field}은 배열이어야 합니다.")
    return value


def text(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        fail(f"{field}은 비어 있지 않은 문자열이어야 합니다.")
    return value


def ident(value: Any, field: str) -> str:
    value = text(value, field)
    if not value.isascii() or not value.replace("_", "").replace("-", "").isalnum():
        fail(f"{field}은 안전한 ID여야 합니다.")
    return value


def integer(value: Any, field: str, *, minimum: int | None = None) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        fail(f"{field}은 정수여야 합니다.")
    if minimum is not None and value < minimum:
        fail(f"{field}은 {minimum} 이상이어야 합니다.")
    return value


def finite(value: Any, field: str, *, positive: bool = False) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        fail(f"{field}은 유한한 숫자여야 합니다.")
    value = float(value)
    if positive and value <= 0:
        fail(f"{field}은 양수여야 합니다.")
    return value


def fields(value: dict[str, Any], required: set[str], field: str) -> None:
    missing = sorted(required - value.keys())
    if missing:
        fail(f"{field} 필수 필드가 없습니다: {', '.join(missing)}")


def unique(items: list[Any], field: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for index, raw in enumerate(items):
        item = obj(raw, f"{field}[{index}]")
        item_id = ident(item.get("id"), f"{field}[{index}].id")
        if item_id in result:
            fail(f"{field}에 중복 ID가 있습니다: {item_id}")
        result[item_id] = item
    return result


def id_list(value: Any, field: str, known: set[str] | None = None) -> list[str]:
    values = [ident(item, f"{field}[{index}]") for index, item in enumerate(array(value, field))]
    if len(values) != len(set(values)):
        fail(f"{field}에 중복 ID가 있습니다.")
    if known is not None and not set(values) <= known:
        fail(f"{field}가 존재하지 않는 ID를 가리킵니다.")
    return values


def canonical_digest(value: Any) -> str:
    try:
        raw = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")
    except (TypeError, ValueError) as error:
        fail("입력 JSON에는 NaN 또는 Infinity를 사용할 수 없습니다.")
    return hashlib.sha256(raw).hexdigest()


def sha(value: Any, field: str) -> str:
    value = text(value, field)
    if len(value) != 64 or any(character not in "0123456789abcdef" for character in value):
        fail(f"{field}은 소문자 SHA-256 16진수여야 합니다.")
    return value


def validate_design(value: dict[str, Any], assets: dict[str, dict[str, Any]], shots: dict[str, Any], closure: Callable[[set[str], dict[str, dict[str, Any]]], set[str]]) -> dict[str, Any]:
    fields(value, {"schema_version", "source_audio", "delivery", "story", "decisions", "music_sections", "story_beats", "directing_methods", "props"}, "production_design")
    if integer(value["schema_version"], "production_design.schema_version") != 1:
        fail("production_design.schema_version=1이 필요합니다.")
    source = obj(value["source_audio"], "production_design.source_audio")
    fields(source, {"path", "sha256", "duration_seconds"}, "production_design.source_audio")
    text(source["path"], "production_design.source_audio.path")
    sha(source["sha256"], "production_design.source_audio.sha256")
    duration = finite(source["duration_seconds"], "production_design.source_audio.duration_seconds", positive=True)
    delivery = obj(value["delivery"], "production_design.delivery")
    fields(delivery, {"width", "height", "fps", "total_frames"}, "production_design.delivery")
    width = integer(delivery["width"], "production_design.delivery.width", minimum=1)
    height = integer(delivery["height"], "production_design.delivery.height", minimum=1)
    fps = finite(delivery["fps"], "production_design.delivery.fps", positive=True)
    total_frames = integer(delivery["total_frames"], "production_design.delivery.total_frames", minimum=1)
    if abs(duration - total_frames / fps) > 1 / fps + 1e-9:
        fail("production_design source_audio 길이가 delivery.total_frames와 맞지 않습니다.")
    story = obj(value["story"], "production_design.story")
    fields(story, {"mode", "theme", "logline", "arc"}, "production_design.story")
    if text(story["mode"], "production_design.story.mode") not in {"narrative", "performance", "hybrid", "abstract"}:
        fail("production_design.story.mode가 지원되지 않습니다.")
    for name in ("theme", "logline", "arc"):
        text(story[name], f"production_design.story.{name}")
    decisions = obj(value["decisions"], "production_design.decisions")
    fields(decisions, DECISIONS, "production_design.decisions")
    for name in DECISIONS:
        decision = obj(decisions[name], f"production_design.decisions.{name}")
        fields(decision, {"choice", "music_reason"}, f"production_design.decisions.{name}")
        text(decision["choice"], f"production_design.decisions.{name}.choice")
        text(decision["music_reason"], f"production_design.decisions.{name}.music_reason")
    sections = unique(array(value["music_sections"], "production_design.music_sections"), "production_design.music_sections")
    cursor = 0
    for section_id, section in sections.items():
        fields(section, {"id", "start_frame", "end_frame_exclusive", "musical_event", "visual_goal"}, f"music_sections[{section_id}]")
        start = integer(section["start_frame"], f"music_sections[{section_id}].start_frame", minimum=0)
        end = integer(section["end_frame_exclusive"], f"music_sections[{section_id}].end_frame_exclusive", minimum=1)
        if start != cursor or end <= start:
            fail("music_sections는 gap/overlap 없이 순서대로 전체 길이를 덮어야 합니다.")
        cursor = end
        text(section["musical_event"], f"music_sections[{section_id}].musical_event")
        text(section["visual_goal"], f"music_sections[{section_id}].visual_goal")
    if cursor != total_frames:
        fail("music_sections는 delivery.total_frames까지 덮어야 합니다.")
    beats = unique(array(value["story_beats"], "production_design.story_beats"), "production_design.story_beats")
    for beat_id, beat in beats.items():
        fields(beat, {"id", "section_ids", "goal", "action", "change"}, f"story_beats[{beat_id}]")
        if not id_list(beat["section_ids"], f"story_beats[{beat_id}].section_ids", set(sections)):
            fail(f"story_beats[{beat_id}].section_ids는 비어 있을 수 없습니다.")
        for name in ("goal", "action", "change"):
            text(beat[name], f"story_beats[{beat_id}].{name}")
    shot_items = unique(array(shots.get("shots"), "shots.shots"), "shots.shots")
    used_beats: set[str] = set()
    used_prop_asset_ids: set[str] = set()
    cursor = 0
    prop_defs = unique(array(value["props"], "production_design.props"), "production_design.props")
    character_ids = {character_id for asset in assets.values() for character_id in asset["character_ids"]}
    location_ids = {asset["location_id"] for asset in assets.values() if asset["location_id"] is not None}
    for prop_id, prop in prop_defs.items():
        fields(prop, {"id", "asset_id", "character_ids", "location_ids", "continuity_rules"}, f"props[{prop_id}]")
        asset_id = ident(prop["asset_id"], f"props[{prop_id}].asset_id")
        if asset_id not in assets or assets[asset_id]["kind"] != "prop":
            fail(f"props[{prop_id}].asset_id는 kind=prop asset이어야 합니다.")
        id_list(prop["character_ids"], f"props[{prop_id}].character_ids", character_ids)
        id_list(prop["location_ids"], f"props[{prop_id}].location_ids", location_ids)
        text(prop["continuity_rules"], f"props[{prop_id}].continuity_rules")
    ordered_shots = list(shot_items.items())
    for shot_index, (shot_id, shot) in enumerate(ordered_shots):
        fields(shot, {"id", "character_ids", "location_id", "start_image_asset_id", "start_frame", "end_frame_exclusive", "delivery_fps", "music_section_ids", "story_beat_id", "emotional_purpose", "action_start", "action_end", "camera", "lighting", "film_look", "props", "effects", "transition_out"}, f"shots.shots[{shot_id}]")
        start = integer(shot["start_frame"], f"shots.shots[{shot_id}].start_frame", minimum=0)
        end = integer(shot["end_frame_exclusive"], f"shots.shots[{shot_id}].end_frame_exclusive", minimum=1)
        if start != cursor or end <= start:
            fail("shots는 gap/overlap 없이 순서대로 전체 길이를 덮어야 합니다.")
        cursor = end
        if finite(shot["delivery_fps"], f"shots.shots[{shot_id}].delivery_fps", positive=True) != fps:
            fail("shots.delivery_fps는 delivery.fps와 일치해야 합니다.")
        section_ids = id_list(shot["music_section_ids"], f"shots.shots[{shot_id}].music_section_ids", set(sections))
        if not section_ids:
            fail(f"shot {shot_id}에는 music_section_ids가 필요합니다.")
        overlaps = [section_id for section_id, section in sections.items() if start < section["end_frame_exclusive"] and end > section["start_frame"]]
        if section_ids != overlaps:
            fail(f"shot {shot_id} music_section_ids가 실제 프레임 범위와 일치하지 않습니다.")
        beat_id = ident(shot["story_beat_id"], f"shots.shots[{shot_id}].story_beat_id")
        if beat_id not in beats:
            fail(f"shot {shot_id} story_beat_id가 존재하지 않습니다.")
        if not set(section_ids) <= set(beats[beat_id]["section_ids"]):
            fail(f"shot {shot_id}의 music_section_ids는 story_beat의 section_ids에 속해야 합니다.")
        used_beats.add(beat_id)
        for name in ("emotional_purpose", "action_start", "action_end", "lighting", "film_look"):
            text(shot[name], f"shots.shots[{shot_id}].{name}")
        camera = obj(shot["camera"], f"shots.shots[{shot_id}].camera")
        fields(camera, CAMERA_FIELDS, f"shots.shots[{shot_id}].camera")
        for name in CAMERA_FIELDS:
            text(camera[name], f"shots.shots[{shot_id}].camera.{name}")
        cast = set(shot["character_ids"])
        location = shot["location_id"]
        keyframes = [shot["start_image_asset_id"]] + ([shot["end_image_asset_id"]] if shot.get("end_image_asset_id") else [])
        for use in array(shot["props"], f"shots.shots[{shot_id}].props"):
            use = obj(use, f"shots.shots[{shot_id}].props[]")
            fields(use, {"id", "state", "holder_character_id", "screen_position"}, f"shots.shots[{shot_id}].props[]")
            prop_id = ident(use["id"], f"shots.shots[{shot_id}].props[].id")
            if prop_id not in prop_defs:
                fail(f"shot {shot_id}가 정의되지 않은 prop을 사용합니다.")
            prop = prop_defs[prop_id]
            used_prop_asset_ids.add(prop["asset_id"])
            holder = use["holder_character_id"]
            if holder is not None and (not isinstance(holder, str) or holder not in cast or (prop["character_ids"] and holder not in prop["character_ids"])):
                fail(f"shot {shot_id} prop holder_character_id가 허용되지 않습니다.")
            if prop["location_ids"] and location not in prop["location_ids"]:
                fail(f"shot {shot_id} prop location이 허용되지 않습니다.")
            if not set(prop["character_ids"]) <= cast:
                fail(f"shot {shot_id} prop character가 shot에 없습니다.")
            for asset_id in keyframes:
                if prop["asset_id"] not in closure({asset_id}, assets):
                    fail(f"shot {shot_id} keyframe은 prop {prop_id}을 참조해야 합니다.")
            text(use["state"], f"shots.shots[{shot_id}].props[].state")
            text(use["screen_position"], f"shots.shots[{shot_id}].props[].screen_position")
        for effect in array(shot["effects"], f"shots.shots[{shot_id}].effects"):
            effect = obj(effect, f"shots.shots[{shot_id}].effects[]")
            fields(effect, {"category", "choice", "purpose", "execution"}, f"shots.shots[{shot_id}].effects[]")
            if text(effect["category"], f"shots.shots[{shot_id}].effects[].category") not in {"vfx", "visual-sfx"}:
                fail("effects.category는 vfx 또는 visual-sfx여야 합니다.")
            for name in ("choice", "purpose", "execution"):
                text(effect[name], f"shots.shots[{shot_id}].effects[].{name}")
        transition = obj(shot["transition_out"], f"shots.shots[{shot_id}].transition_out")
        fields(transition, {"type", "purpose", "execution", "handle_frames"}, f"shots.shots[{shot_id}].transition_out")
        kind = text(transition["type"], f"shots.shots[{shot_id}].transition_out.type")
        handles = integer(transition["handle_frames"], f"shots.shots[{shot_id}].transition_out.handle_frames", minimum=0)
        if kind in {"cut", "end"} and handles != 0:
            fail("cut/end transition의 handle_frames는 0이어야 합니다.")
        text(transition["purpose"], f"shots.shots[{shot_id}].transition_out.purpose")
        text(transition["execution"], f"shots.shots[{shot_id}].transition_out.execution")
        if kind == "match-cut":
            fields(transition, {"type", "purpose", "execution", "handle_frames", "target_shot_id", "from_location_id", "to_location_id", "visual_match"}, f"shots.shots[{shot_id}].transition_out")
            if shot_index + 1 >= len(ordered_shots):
                fail(f"마지막 shot {shot_id}에는 match-cut을 사용할 수 없습니다.")
            next_id, next_shot = ordered_shots[shot_index + 1]
            if ident(transition["target_shot_id"], f"shots.shots[{shot_id}].transition_out.target_shot_id") != next_id:
                fail(f"shot {shot_id} match-cut target_shot_id는 다음 shot이어야 합니다.")
            if ident(transition["from_location_id"], f"shots.shots[{shot_id}].transition_out.from_location_id") != location:
                fail(f"shot {shot_id} match-cut from_location_id가 현재 location과 일치하지 않습니다.")
            if ident(transition["to_location_id"], f"shots.shots[{shot_id}].transition_out.to_location_id") != next_shot["location_id"]:
                fail(f"shot {shot_id} match-cut to_location_id가 다음 location과 일치하지 않습니다.")
            text(transition["visual_match"], f"shots.shots[{shot_id}].transition_out.visual_match")
    if cursor != total_frames:
        fail("shots는 delivery.total_frames까지 덮어야 합니다.")
    if set(beats) != used_beats:
        fail("모든 story_beat는 적어도 한 shot에서 사용되어야 합니다.")
    for index, method in enumerate(array(value["directing_methods"], "production_design.directing_methods")):
        method = obj(method, f"directing_methods[{index}]")
        fields(method, {"source", "principle", "application", "shot_ids"}, f"directing_methods[{index}]")
        for name in ("source", "principle", "application"):
            text(method[name], f"directing_methods[{index}].{name}")
        id_list(method["shot_ids"], f"directing_methods[{index}].shot_ids", set(shot_items))
    return {"duration_seconds": duration, "fps": fps, "width": width, "height": height, "total_frames": total_frames, "shots": shot_items, "props": prop_defs, "used_prop_asset_ids": used_prop_asset_ids}


def validate_storyboard(value: dict[str, Any], context: dict[str, Any], assets: dict[str, dict[str, Any]]) -> set[str]:
    fields(value, {"schema_version", "panels", "pages"}, "storyboard")
    if integer(value["schema_version"], "storyboard.schema_version") != 1:
        fail("storyboard.schema_version=1이 필요합니다.")
    panels = unique(array(value["panels"], "storyboard.panels"), "storyboard.panels")
    seen_first: set[str] = set()
    previous_frame = -1
    for panel_id, panel in panels.items():
        fields(panel, {"id", "shot_id", "image_asset_id", "at_frame", "caption"}, f"storyboard.panels[{panel_id}]")
        shot_id = ident(panel["shot_id"], f"storyboard.panels[{panel_id}].shot_id")
        if shot_id not in context["shots"]:
            fail(f"panel {panel_id}가 존재하지 않는 shot을 가리킵니다.")
        shot = context["shots"][shot_id]
        asset_id = ident(panel["image_asset_id"], f"storyboard.panels[{panel_id}].image_asset_id")
        allowed = {shot["start_image_asset_id"]} | ({shot["end_image_asset_id"]} if shot.get("end_image_asset_id") else set())
        if asset_id not in allowed:
            fail(f"panel {panel_id}은 shot의 start/end image를 사용해야 합니다.")
        frame = integer(panel["at_frame"], f"storyboard.panels[{panel_id}].at_frame", minimum=0)
        if not shot["start_frame"] <= frame < shot["end_frame_exclusive"]:
            fail(f"panel {panel_id} at_frame이 shot 범위 밖입니다.")
        if frame <= previous_frame:
            fail("storyboard.panels at_frame은 전역에서 엄격히 증가해야 합니다.")
        previous_frame = frame
        if shot_id not in seen_first:
            if frame != shot["start_frame"] or asset_id != shot["start_image_asset_id"]:
                fail(f"shot {shot_id}의 첫 storyboard panel은 shot-start여야 합니다.")
            seen_first.add(shot_id)
        text(panel["caption"], f"storyboard.panels[{panel_id}].caption")
    if set(context["shots"]) != seen_first:
        fail("모든 shot에는 storyboard 첫 panel이 필요합니다.")
    pages = unique(array(value["pages"], "storyboard.pages"), "storyboard.pages")
    page_panels: list[str] = []
    required: set[str] = set()
    for page_id, page in pages.items():
        fields(page, {"id", "asset_id", "panel_ids"}, f"storyboard.pages[{page_id}]")
        asset_id = ident(page["asset_id"], f"storyboard.pages[{page_id}].asset_id")
        asset = assets.get(asset_id)
        if asset is None or asset["kind"] != "storyboard-sheet" or asset["method"] != "compose" or asset["character_ids"] or asset["location_id"] is not None:
            fail(f"storyboard page {page_id}는 compose storyboard-sheet asset이어야 합니다.")
        panel_ids = id_list(page["panel_ids"], f"storyboard.pages[{page_id}].panel_ids", set(panels))
        if not panel_ids:
            fail(f"storyboard page {page_id}에는 panel_ids가 필요합니다.")
        expected_refs = list(dict.fromkeys(panels[panel_id]["image_asset_id"] for panel_id in panel_ids))
        if asset["references"] != expected_refs:
            fail(f"storyboard page {page_id} asset references가 panel image 순서와 일치하지 않습니다.")
        page_panels.extend(panel_ids)
        required.add(asset_id)
    if page_panels != list(panels) or len(page_panels) != len(set(page_panels)):
        fail("storyboard pages는 모든 panel을 한 번씩 같은 순서로 포함해야 합니다.")
    return required


def validate_keys_review(value: Any, digests: dict[str, str]) -> bool:
    if value is None:
        return False
    review = obj(value, "review.keys")
    fields(review, {"verdict", "reviewer_id", "producer_id", "evidence", "input_sha256"}, "review.keys")
    if text(review["verdict"], "review.keys.verdict") not in {"pass", "fail"}:
        fail("review.keys.verdict는 pass 또는 fail이어야 합니다.")
    reviewer = text(review["reviewer_id"], "review.keys.reviewer_id")
    if reviewer == text(review["producer_id"], "review.keys.producer_id"):
        fail("review.keys reviewer_id와 producer_id는 달라야 합니다.")
    text(review["evidence"], "review.keys.evidence")
    values = obj(review["input_sha256"], "review.keys.input_sha256")
    if set(values) != set(digests):
        fail("review.keys.input_sha256 키가 올바르지 않습니다.")
    if any(sha(values[key], f"review.keys.input_sha256.{key}") != digest for key, digest in digests.items()):
        fail("review.keys.input_sha256가 현재 입력과 일치하지 않습니다.")
    return review["verdict"] == "pass"


def validate_storyboard_review(value: Any, panel_ids: set[str], digests: dict[str, str]) -> bool:
    if value is None:
        return False
    review = obj(value, "review.storyboard")
    fields(review, {"verdict", "reviewer_id", "producer_id", "evidence", "panel_ids", "input_sha256"}, "review.storyboard")
    if text(review["verdict"], "review.storyboard.verdict") not in {"pass", "fail"}:
        fail("review.storyboard.verdict는 pass 또는 fail이어야 합니다.")
    reviewer = text(review["reviewer_id"], "review.storyboard.reviewer_id")
    if reviewer == text(review["producer_id"], "review.storyboard.producer_id"):
        fail("review.storyboard reviewer_id와 producer_id는 달라야 합니다.")
    text(review["evidence"], "review.storyboard.evidence")
    if set(id_list(review["panel_ids"], "review.storyboard.panel_ids", panel_ids)) != panel_ids:
        fail("review.storyboard.panel_ids가 전체 panel과 일치하지 않습니다.")
    values = obj(review["input_sha256"], "review.storyboard.input_sha256")
    if set(values) != set(digests):
        fail("review.storyboard.input_sha256 키가 올바르지 않습니다.")
    if any(sha(values[key], f"review.storyboard.input_sha256.{key}") != digest for key, digest in digests.items()):
        fail("review.storyboard.input_sha256가 현재 입력과 일치하지 않습니다.")
    return review["verdict"] == "pass"


def validate_animatic_review(value: dict[str, Any], digests: dict[str, str], source_sha256: str) -> dict[str, Any]:
    fields(value, {"path", "sha256", "source_audio_sha256", "input_sha256", "verdict", "reviewer_id", "producer_id", "evidence"}, "animatic_review")
    path = text(value["path"], "animatic_review.path")
    digest = sha(value["sha256"], "animatic_review.sha256")
    if sha(value["source_audio_sha256"], "animatic_review.source_audio_sha256") != source_sha256:
        fail("animatic_review.source_audio_sha256가 production_design과 일치하지 않습니다.")
    values = obj(value["input_sha256"], "animatic_review.input_sha256")
    if set(values) != set(digests) or any(sha(values[key], f"animatic_review.input_sha256.{key}") != expected for key, expected in digests.items()):
        fail("animatic_review.input_sha256가 현재 입력과 일치하지 않습니다.")
    if text(value["verdict"], "animatic_review.verdict") not in {"pass", "fail"}:
        fail("animatic_review.verdict는 pass 또는 fail이어야 합니다.")
    if text(value["reviewer_id"], "animatic_review.reviewer_id") == text(value["producer_id"], "animatic_review.producer_id"):
        fail("animatic_review reviewer_id와 producer_id는 달라야 합니다.")
    text(value["evidence"], "animatic_review.evidence")
    return {"path": path, "sha256": digest, "passed": value["verdict"] == "pass"}

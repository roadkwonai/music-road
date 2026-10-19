#!/usr/bin/env python3
"""Validate an MV group/world bible and bind it to image and shot plans."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys
from typing import Any


IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
SETTING_TYPES = {"studio", "on-location", "virtual-set", "mixed"}
INTERIOR_EXTERIOR = {"interior", "exterior", "mixed"}
EXISTENCES = {"real", "fictional", "real-inspired"}


class ValidationError(ValueError):
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


def identifier(value: Any, field: str) -> str:
    result = string(value, field)
    if not IDENTIFIER.fullmatch(result):
        raise ValidationError(f"{field}은 안전한 ID여야 합니다.")
    return result


def required_keys(value: dict[str, Any], keys: set[str], field: str) -> None:
    missing = sorted(keys - value.keys())
    if missing:
        raise ValidationError(f"{field} 필수 필드가 없습니다: {', '.join(missing)}")


def unique_objects(value: Any, field: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for index, raw in enumerate(array_value(value, field)):
        item = object_value(raw, f"{field}[{index}]")
        item_id = identifier(item.get("id"), f"{field}[{index}].id")
        if item_id in result:
            raise ValidationError(f"{field}에 중복 ID가 있습니다: {item_id}")
        result[item_id] = item
    return result


def id_list(value: Any, field: str, known: set[str] | None = None, *, nonempty: bool = False) -> list[str]:
    result = [identifier(item, f"{field}[{index}]") for index, item in enumerate(array_value(value, field))]
    if nonempty and not result:
        raise ValidationError(f"{field}은 비어 있지 않아야 합니다.")
    if len(result) != len(set(result)):
        raise ValidationError(f"{field}에 중복 ID가 있습니다.")
    if known is not None:
        unknown = sorted(set(result) - known)
        if unknown:
            raise ValidationError(f"{field}가 존재하지 않는 ID를 가리킵니다: {', '.join(unknown)}")
    return result


def nonempty_strings(value: Any, field: str) -> list[str]:
    result = [string(item, f"{field}[{index}]") for index, item in enumerate(array_value(value, field))]
    if not result:
        raise ValidationError(f"{field}은 비어 있지 않아야 합니다.")
    return result


def nullable_year(value: Any, field: str) -> int | None:
    if value is None:
        return None
    return integer(value, field)


def validate_bible(data: dict[str, Any]) -> dict[str, Any]:
    """Validate the stable group/world context used by an MV pre-production run."""
    data = object_value(data, "bible")
    required_keys(data, {"schema_version", "group", "world", "locations", "wardrobes"}, "bible")
    if integer(data.get("schema_version"), "bible.schema_version") != 1:
        raise ValidationError("bible.schema_version=1이 필요합니다.")

    group = object_value(data.get("group"), "bible.group")
    required_keys(group, {
        "id", "name", "fictional", "member_count", "age_reference_year", "adult_cast",
        "music_identity", "vocal_targets", "wardrobe_style", "mood", "members",
    }, "bible.group")
    identifier(group.get("id"), "bible.group.id")
    for field in ("name", "music_identity", "vocal_targets", "wardrobe_style", "mood"):
        string(group.get(field), f"bible.group.{field}")
    boolean(group.get("fictional"), "bible.group.fictional")
    member_count = integer(group.get("member_count"), "bible.group.member_count")
    if member_count < 1:
        raise ValidationError("bible.group.member_count는 1 이상이어야 합니다.")
    age_reference_year = integer(group.get("age_reference_year"), "bible.group.age_reference_year")
    adult_cast = boolean(group.get("adult_cast"), "bible.group.adult_cast")

    members = unique_objects(group.get("members"), "bible.group.members")
    if len(members) != member_count:
        raise ValidationError("bible.group.member_count와 고유 members 수가 일치하지 않습니다.")
    identity_asset_ids: set[str] = set()
    for member_id, member in members.items():
        required_keys(member, {
            "id", "name", "age_years", "adult", "role", "voice_intent", "hairstyle",
            "identity_invariants", "wardrobe_ids", "identity_asset_id",
        }, f"bible.group.members[{member_id}]")
        for field in ("name", "role", "voice_intent", "hairstyle"):
            string(member.get(field), f"bible.group.members[{member_id}].{field}")
        age = integer(member.get("age_years"), f"bible.group.members[{member_id}].age_years")
        if not 0 <= age <= 120:
            raise ValidationError(f"bible.group.members[{member_id}].age_years는 0~120이어야 합니다.")
        if boolean(member.get("adult"), f"bible.group.members[{member_id}].adult") != (age >= 18):
            raise ValidationError(f"bible.group.members[{member_id}].adult는 age_years와 일치해야 합니다.")
        nonempty_strings(member.get("identity_invariants"), f"bible.group.members[{member_id}].identity_invariants")
        member["wardrobe_ids"] = id_list(member.get("wardrobe_ids"), f"bible.group.members[{member_id}].wardrobe_ids", nonempty=True)
        identity_asset_id = identifier(member.get("identity_asset_id"), f"bible.group.members[{member_id}].identity_asset_id")
        if identity_asset_id in identity_asset_ids:
            raise ValidationError(f"bible.group.members identity_asset_id가 중복됩니다: {identity_asset_id}")
        identity_asset_ids.add(identity_asset_id)
    if adult_cast and any(not member["adult"] for member in members.values()):
        raise ValidationError("bible.group.adult_cast=true이면 모든 members가 성인이어야 합니다.")

    world = object_value(data.get("world"), "bible.world")
    required_keys(world, {"id", "year", "era", "season", "mood", "rules"}, "bible.world")
    identifier(world.get("id"), "bible.world.id")
    world_year = nullable_year(world.get("year"), "bible.world.year")
    if world_year is not None and age_reference_year != world_year:
        raise ValidationError("bible.world.year가 정해진 경우 group.age_reference_year와 일치해야 합니다.")
    for field in ("era", "season", "mood"):
        string(world.get(field), f"bible.world.{field}")
    nonempty_strings(world.get("rules"), "bible.world.rules")

    locations = unique_objects(data.get("locations"), "bible.locations")
    background_asset_ids: set[str] = set()
    for location_id, location in locations.items():
        required_keys(location, {
            "id", "name", "setting_type", "environment", "interior_exterior", "existence", "realism",
            "year", "season", "time_of_day", "weather", "actual_place_name", "reference_sources",
            "geography", "layout_invariants", "background_asset_id",
        }, f"bible.locations[{location_id}]")
        string(location.get("name"), f"bible.locations[{location_id}].name")
        for field, allowed in (("setting_type", SETTING_TYPES), ("interior_exterior", INTERIOR_EXTERIOR), ("existence", EXISTENCES)):
            value = string(location.get(field), f"bible.locations[{location_id}].{field}")
            if value not in allowed:
                raise ValidationError(f"bible.locations[{location_id}].{field} 값이 지원되지 않습니다.")
        for field in ("environment", "realism", "season", "time_of_day", "weather", "geography"):
            string(location.get(field), f"bible.locations[{location_id}].{field}")
        location_year = nullable_year(location.get("year"), f"bible.locations[{location_id}].year")
        if world_year is not None and location_year is not None and location_year != world_year:
            raise ValidationError(f"bible.locations[{location_id}].year는 bible.world.year와 일치해야 합니다.")
        actual = location.get("actual_place_name")
        if actual is not None:
            string(actual, f"bible.locations[{location_id}].actual_place_name")
        sources = nonempty_strings(location.get("reference_sources"), f"bible.locations[{location_id}].reference_sources") if location["existence"] in {"real", "real-inspired"} else array_value(location.get("reference_sources"), f"bible.locations[{location_id}].reference_sources")
        if location["existence"] in {"real", "real-inspired"} and actual is None:
            raise ValidationError(f"bible.locations[{location_id}] 실존/실존영감 장소에는 actual_place_name이 필요합니다.")
        for index, source in enumerate(sources):
            string(source, f"bible.locations[{location_id}].reference_sources[{index}]")
        nonempty_strings(location.get("layout_invariants"), f"bible.locations[{location_id}].layout_invariants")
        background_asset_id = identifier(location.get("background_asset_id"), f"bible.locations[{location_id}].background_asset_id")
        if background_asset_id in background_asset_ids:
            raise ValidationError(f"bible.locations background_asset_id가 중복됩니다: {background_asset_id}")
        background_asset_ids.add(background_asset_id)
    shared_anchor_ids = identity_asset_ids & background_asset_ids
    if shared_anchor_ids:
        raise ValidationError(f"bible identity/background asset ID가 충돌합니다: {', '.join(sorted(shared_anchor_ids))}")

    wardrobes = unique_objects(data.get("wardrobes"), "bible.wardrobes")
    for wardrobe_id, wardrobe in wardrobes.items():
        if wardrobe_id in identity_asset_ids or wardrobe_id in background_asset_ids:
            raise ValidationError(f"bible wardrobe asset ID가 identity/background asset과 충돌합니다: {wardrobe_id}")
        required_keys(wardrobe, {"id", "character_id", "palette", "description", "era", "location_ids"}, f"bible.wardrobes[{wardrobe_id}]")
        owner = identifier(wardrobe.get("character_id"), f"bible.wardrobes[{wardrobe_id}].character_id")
        if owner not in members:
            raise ValidationError(f"bible.wardrobes[{wardrobe_id}].character_id가 존재하지 않습니다.")
        nonempty_strings(wardrobe.get("palette"), f"bible.wardrobes[{wardrobe_id}].palette")
        string(wardrobe.get("description"), f"bible.wardrobes[{wardrobe_id}].description")
        string(wardrobe.get("era"), f"bible.wardrobes[{wardrobe_id}].era")
        wardrobe["location_ids"] = id_list(wardrobe.get("location_ids"), f"bible.wardrobes[{wardrobe_id}].location_ids", set(locations), nonempty=True)

    for member_id, member in members.items():
        for wardrobe_id in member["wardrobe_ids"]:
            wardrobe = wardrobes.get(wardrobe_id)
            if wardrobe is None:
                raise ValidationError(f"bible.group.members[{member_id}].wardrobe_ids가 존재하지 않는 의상을 가리킵니다: {wardrobe_id}")
            if wardrobe["character_id"] != member_id:
                raise ValidationError(f"bible.group.members[{member_id}].wardrobe_ids는 본인 의상만 가리켜야 합니다: {wardrobe_id}")
    for wardrobe_id, wardrobe in wardrobes.items():
        if wardrobe_id not in members[wardrobe["character_id"]]["wardrobe_ids"]:
            raise ValidationError(f"bible.wardrobes[{wardrobe_id}]는 소유 member의 wardrobe_ids에 있어야 합니다.")
    return {"characters": members, "locations": locations, "wardrobes": wardrobes, "group": group, "world": world}


def reference_closure(asset_id: str, assets: dict[str, dict[str, Any]]) -> set[str]:
    result: set[str] = set()
    visiting: set[str] = set()

    def visit(current: str) -> None:
        if current in visiting:
            raise ValidationError(f"assets.references에 순환 참조가 있습니다: {current}")
        if current in result:
            return
        visiting.add(current)
        for reference in assets[current].get("references", []):
            if reference not in assets:
                raise ValidationError(f"assets.references가 존재하지 않는 asset을 가리킵니다: {reference}")
            visit(reference)
        visiting.remove(current)
        result.add(current)

    visit(asset_id)
    return result


def validate_bindings(bible: dict[str, Any], image_plan: dict[str, Any], shots: dict[str, Any]) -> None:
    """Check that plan assets and shot choices preserve the selected bible."""
    context = validate_bible(bible)
    plan = object_value(image_plan, "plan")
    plan_characters = unique_objects(plan.get("characters"), "plan.characters")
    if set(plan_characters) != set(context["characters"]):
        raise ValidationError("plan.characters는 bible의 전체 members와 정확히 일치해야 합니다.")
    for member_id, character in plan_characters.items():
        if identifier(character.get("identity_asset_id"), f"plan.characters[{member_id}].identity_asset_id") != context["characters"][member_id]["identity_asset_id"]:
            raise ValidationError(f"plan.characters[{member_id}].identity_asset_id가 bible과 일치하지 않습니다.")

    plan_locations = unique_objects(plan.get("locations"), "plan.locations")
    for location_id, location in plan_locations.items():
        if location_id not in context["locations"]:
            raise ValidationError(f"plan.locations에 bible에 없는 장소가 있습니다: {location_id}")
        if identifier(location.get("background_asset_id"), f"plan.locations[{location_id}].background_asset_id") != context["locations"][location_id]["background_asset_id"]:
            raise ValidationError(f"plan.locations[{location_id}].background_asset_id가 bible과 일치하지 않습니다.")

    assets = unique_objects(plan.get("assets"), "plan.assets")
    for asset_id, asset in assets.items():
        asset["references"] = id_list(asset.get("references"), f"plan.assets[{asset_id}].references")
    wardrobe_assets = {asset_id: asset for asset_id, asset in assets.items() if asset.get("kind") == "wardrobe"}
    unknown_wardrobes = sorted(set(wardrobe_assets) - set(context["wardrobes"]))
    if unknown_wardrobes:
        raise ValidationError(f"plan wardrobe asset이 bible에 없습니다: {', '.join(unknown_wardrobes)}")
    for wardrobe_id, asset in wardrobe_assets.items():
        owner = context["wardrobes"][wardrobe_id]["character_id"]
        characters = id_list(asset.get("character_ids"), f"plan.assets[{wardrobe_id}].character_ids")
        if characters != [owner]:
            raise ValidationError(f"plan wardrobe {wardrobe_id}는 bible 소유자 {owner}만 가리켜야 합니다.")

    shot_entries = unique_objects(object_value(shots, "shots").get("shots"), "shots.shots")
    for shot_id, shot in shot_entries.items():
        cast = id_list(shot.get("character_ids"), f"shots.shots[{shot_id}].character_ids", set(context["characters"]))
        location_id = shot.get("location_id")
        if location_id is not None:
            location_id = identifier(location_id, f"shots.shots[{shot_id}].location_id")
            if location_id not in plan_locations:
                raise ValidationError(f"shots.shots[{shot_id}].location_id가 image plan 장소에 없습니다.")
        mappings = object_value(shot.get("wardrobe_by_character"), f"shots.shots[{shot_id}].wardrobe_by_character")
        if set(mappings) != set(cast):
            raise ValidationError(f"shots.shots[{shot_id}].wardrobe_by_character는 shot cast 전체를 매핑해야 합니다.")
        for character_id, wardrobe_id in mappings.items():
            if character_id not in context["characters"]:
                raise ValidationError(f"shots.shots[{shot_id}].wardrobe_by_character에 없는 member가 있습니다: {character_id}")
            wardrobe_id = identifier(wardrobe_id, f"shots.shots[{shot_id}].wardrobe_by_character[{character_id}]")
            wardrobe = context["wardrobes"].get(wardrobe_id)
            if wardrobe is None or wardrobe["character_id"] != character_id:
                raise ValidationError(f"shots.shots[{shot_id}]는 {character_id}의 본인 의상만 사용할 수 있습니다.")
            if wardrobe_id not in wardrobe_assets:
                raise ValidationError(f"shots.shots[{shot_id}] 의상 {wardrobe_id}의 image plan asset이 없습니다.")
            if location_id not in wardrobe["location_ids"]:
                raise ValidationError(f"shots.shots[{shot_id}] 의상 {wardrobe_id}는 장소 {location_id}에서 사용할 수 없습니다.")
        for field in ("start_image_asset_id", "end_image_asset_id"):
            asset_id = shot.get(field)
            if asset_id is None:
                continue
            asset_id = identifier(asset_id, f"shots.shots[{shot_id}].{field}")
            if asset_id not in assets:
                raise ValidationError(f"shots.shots[{shot_id}].{field}가 image plan asset에 없습니다.")
            references = reference_closure(asset_id, assets)
            for wardrobe_id in mappings.values():
                if wardrobe_id not in references:
                    raise ValidationError(f"shots.shots[{shot_id}] keyframe은 의상 asset {wardrobe_id}를 참조해야 합니다.")


def load_json(path: Path, field: str) -> dict[str, Any]:
    try:
        return object_value(json.loads(path.read_text(encoding="utf-8")), field)
    except (OSError, json.JSONDecodeError) as error:
        raise ValidationError(f"{field} JSON을 읽지 못했습니다: {path}") from error


def main() -> int:
    parser = JsonArgumentParser(description=__doc__)
    parser.add_argument("--bible", required=True)
    parser.add_argument("--image-plan")
    parser.add_argument("--shots")
    try:
        args = parser.parse_args()
        if bool(args.image_plan) != bool(args.shots):
            raise ValidationError("--image-plan과 --shots는 함께 제공해야 합니다.")
        bible = load_json(Path(args.bible), "bible")
        validate_bible(bible)
        if args.image_plan:
            validate_bindings(bible, load_json(Path(args.image_plan), "plan"), load_json(Path(args.shots), "shots"))
        print(json.dumps({"ok": True, "errors": []}, ensure_ascii=False))
        return 0
    except (ValidationError, OSError, ValueError) as error:
        print(json.dumps({"ok": False, "errors": [str(error)]}, ensure_ascii=False))
        return 2
if __name__ == "__main__":
    raise SystemExit(main())

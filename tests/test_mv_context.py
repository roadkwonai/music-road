import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DIR = ROOT / ".agents/skills/road-music-mv/scripts"
CONTEXT = SCRIPT_DIR / "validate_mv_context.py"
PREPRODUCTION = SCRIPT_DIR / "validate_preproduction.py"
sys.path.insert(0, str(SCRIPT_DIR))
from validate_mv_context import ValidationError, validate_bible, validate_bindings  # noqa: E402


def member(member_id, age, wardrobe_id):
    return {
        "id": member_id, "name": member_id, "age_years": age, "adult": age >= 18,
        "role": "performer", "voice_intent": "creative intent", "hairstyle": "short dark hair",
        "identity_invariants": ["same face and hair"], "wardrobe_ids": [wardrobe_id],
        "identity_asset_id": f"{member_id}-master",
    }


def wardrobe(wardrobe_id, member_id, location_id="stage"):
    return {
        "id": wardrobe_id, "character_id": member_id, "palette": ["black"],
        "description": "simple stage costume", "era": "near future", "location_ids": [location_id],
    }


def bible():
    return {
        "schema_version": 1,
        "group": {
            "id": "duo", "name": "Duo", "fictional": True, "member_count": 2,
            "age_reference_year": 2032, "adult_cast": True, "music_identity": "K-pop",
            "vocal_targets": "creative direction", "wardrobe_style": "tailored", "mood": "bright",
            "members": [member("a", 21, "a-look"), member("b", 22, "b-look")],
        },
        "world": {
            "id": "world", "year": 2032, "era": "near future", "season": "spring",
            "mood": "bright", "rules": ["keep continuity"],
        },
        "locations": [
            {
                "id": "stage", "name": "Stage", "setting_type": "studio", "environment": "interior",
                "interior_exterior": "interior", "existence": "fictional", "realism": "photorealistic",
                "year": 2032, "season": "spring", "time_of_day": "night", "weather": "controlled",
                "actual_place_name": None, "reference_sources": [], "geography": "fictional city",
                "layout_invariants": ["center stage"], "background_asset_id": "stage-bg",
            },
            {
                "id": "unused-garden", "name": "Garden", "setting_type": "virtual-set", "environment": "space",
                "interior_exterior": "interior", "existence": "fictional", "realism": "fantastical",
                "year": None, "season": "timeless", "time_of_day": "twilight", "weather": "sealed",
                "actual_place_name": None, "reference_sources": [], "geography": "orbital garden",
                "layout_invariants": ["circular pool"], "background_asset_id": "garden-bg",
            },
        ],
        "wardrobes": [wardrobe("a-look", "a"), wardrobe("b-look", "b")],
        "status": "example metadata is allowed",
    }


def asset(asset_id, kind, characters, location, references):
    return {
        "id": asset_id, "kind": kind, "required": True, "method": "image_gen",
        "character_ids": characters, "location_id": location, "references": references,
        "prompt": "continuity image", "invariants": ["continuity"],
    }


def image_plan_and_shots():
    assets = [
        asset("a-master", "identity-master", ["a"], None, []),
        asset("a-sheet", "character-sheet", ["a"], None, ["a-master"]),
        asset("b-master", "identity-master", ["b"], None, []),
        asset("b-sheet", "character-sheet", ["b"], None, ["b-master"]),
        asset("a-look", "wardrobe", ["a"], None, ["a-master"]),
        asset("b-look", "wardrobe", ["b"], None, ["b-master"]),
        asset("stage-bg", "background", [], "stage", []),
        asset("opening", "shot-start", ["a", "b"], "stage", ["a-master", "b-master", "a-look", "b-look", "stage-bg"]),
    ]
    plan = {
        "schema_version": 1,
        "profile": {"music_genre": "k-pop", "visual_format": "idol", "visual_look": "cinematic"},
        "characters": [{"id": "a", "identity_asset_id": "a-master"}, {"id": "b", "identity_asset_id": "b-master"}],
        "locations": [{"id": "stage", "background_asset_id": "stage-bg"}], "assets": assets,
    }
    shots = {"shots": [{
        "id": "opening", "character_ids": ["a", "b"], "location_id": "stage",
        "start_image_asset_id": "opening", "end_image_asset_id": None,
        "wardrobe_by_character": {"a": "a-look", "b": "b-look"},
    }]}
    return plan, shots


class MusicVideoContextTests(unittest.TestCase):
    def write_json(self, directory, name, value):
        path = directory / name
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def cli(self, script, *arguments):
        return subprocess.run([sys.executable, str(script), *map(str, arguments)], text=True, capture_output=True, check=False)

    def test_valid_bible_and_bindings_allow_unused_bible_location(self):
        context = validate_bible(bible())
        self.assertEqual(set(context["characters"]), {"a", "b"})
        plan, shots = image_plan_and_shots()
        self.assertIsNone(validate_bindings(bible(), plan, shots))
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            result = self.cli(PREPRODUCTION, "--root", directory, "--plan", self.write_json(directory, "plan.json", plan), "--shots", self.write_json(directory, "shots.json", shots), "--bible", self.write_json(directory, "bible.json", bible()))
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertTrue(json.loads(result.stdout)["ok"])

    def test_unused_bible_wardrobe_does_not_block_partial_plan(self):
        value = bible()
        value["wardrobes"].append(wardrobe("b-unused", "b"))
        value["group"]["members"][1]["wardrobe_ids"].append("b-unused")
        plan, shots = image_plan_and_shots()
        self.assertIsNone(validate_bindings(value, plan, shots))
        shots["shots"][0]["wardrobe_by_character"]["b"] = "b-unused"
        with self.assertRaises(ValidationError):
            validate_bindings(value, plan, shots)

    def test_rejects_member_count_age_adult_and_duplicate_member(self):
        for mutate in (
            lambda value: value["group"].update(member_count=3),
            lambda value: value["group"]["members"][0].update(age_years=17),
            lambda value: value["group"]["members"].append(copy.deepcopy(value["group"]["members"][0])),
        ):
            with self.subTest(mutate=mutate):
                value = bible()
                mutate(value)
                with self.assertRaises(ValidationError):
                    validate_bible(value)

    def test_rejects_unlisted_owned_wardrobe_and_duplicate_bible_anchors(self):
        value = bible()
        value["wardrobes"].append(wardrobe("a-secret", "a"))
        with self.assertRaises(ValidationError):
            validate_bible(value)

    def test_rejects_cross_kind_bible_asset_id_collisions(self):
        value = bible()
        value["group"]["members"][1]["identity_asset_id"] = "stage-bg"
        with self.assertRaises(ValidationError):
            validate_bible(value)
        value = bible()
        value["group"]["members"][1]["identity_asset_id"] = "b-look"
        with self.assertRaises(ValidationError):
            validate_bible(value)
        value = bible()
        value["locations"][1]["background_asset_id"] = "a-look"
        with self.assertRaises(ValidationError):
            validate_bible(value)
        value = bible()
        value["group"]["members"][1]["identity_asset_id"] = "a-master"
        with self.assertRaises(ValidationError):
            validate_bible(value)
        value = bible()
        value["locations"][1]["background_asset_id"] = "stage-bg"
        with self.assertRaises(ValidationError):
            validate_bible(value)

    def test_fixed_world_year_requires_matching_age_and_location_years(self):
        value = bible()
        value["group"]["age_reference_year"] = 2031
        with self.assertRaises(ValidationError):
            validate_bible(value)
        value = bible()
        value["locations"][0]["year"] = 2031
        with self.assertRaises(ValidationError):
            validate_bible(value)
        value = bible()
        value["world"]["year"] = None
        value["world"]["rules"].append("locations may use their own documented years")
        value["locations"][0]["year"] = 2031
        self.assertEqual(validate_bible(value)["world"]["year"], None)

    def test_rejects_real_place_without_name_or_source_but_allows_fictional(self):
        value = bible()
        place = value["locations"][0]
        place["existence"] = "real"
        with self.assertRaises(ValidationError):
            validate_bible(value)
        value = bible()
        value["locations"][0]["reference_sources"] = "not-a-list"
        with self.assertRaises(ValidationError):
            validate_bible(value)
        self.assertEqual(validate_bible(bible())["locations"]["stage"]["existence"], "fictional")

    def test_rejects_foreign_wardrobe_unknown_place_and_missing_keyframe_wardrobe_reference(self):
        plan, shots = image_plan_and_shots()
        shots["shots"][0]["wardrobe_by_character"]["a"] = "b-look"
        with self.assertRaises(ValidationError):
            validate_bindings(bible(), plan, shots)
        plan, shots = image_plan_and_shots()
        plan["locations"][0]["id"] = "unknown-place"
        with self.assertRaises(ValidationError):
            validate_bindings(bible(), plan, shots)
        plan, shots = image_plan_and_shots()
        plan["assets"][-1]["references"].remove("b-look")
        with self.assertRaises(ValidationError):
            validate_bindings(bible(), plan, shots)

    def test_cli_errors_are_single_json_line(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            bible_path = self.write_json(directory, "bible.json", bible())
            result = self.cli(CONTEXT, "--bible", bible_path, "--image-plan", directory / "plan.json")
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stderr, "")
        self.assertFalse(json.loads(result.stdout)["ok"])

    def test_cli_rejects_invalid_asset_references_as_json_not_traceback(self):
        plan, shots = image_plan_and_shots()
        plan["assets"][-1]["references"] = [[]]
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            result = self.cli(
                CONTEXT,
                "--bible", self.write_json(directory, "bible.json", bible()),
                "--image-plan", self.write_json(directory, "plan.json", plan),
                "--shots", self.write_json(directory, "shots.json", shots),
            )
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stderr, "")
        response = json.loads(result.stdout)
        self.assertFalse(response["ok"])
        self.assertEqual(len(response["errors"]), 1)


if __name__ == "__main__":
    unittest.main()

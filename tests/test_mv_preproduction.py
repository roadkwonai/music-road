import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
VALIDATE = ROOT / ".agents/skills/road-music-mv/scripts/validate_preproduction.py"
IMAGE_EXAMPLE = ROOT / ".agents/skills/road-music-mv/assets/image-plan.example.json"
SHOT_EXAMPLE = ROOT / ".agents/skills/road-music-mv/assets/shot-plan.example.json"


def call(*arguments, env=None):
    return subprocess.run([sys.executable, str(VALIDATE), *map(str, arguments)], text=True, capture_output=True, check=False, env=env)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class PreproductionGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.colors = ["red", "green", "blue", "yellow", "cyan", "magenta", "black", "white"]

    def tearDown(self):
        self.temp.cleanup()

    def write_json(self, name, value):
        path = self.root / name
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def image(self, asset_id, color=None):
        directory = self.root / "assets"
        directory.mkdir(exist_ok=True)
        path = directory / f"{asset_id}.png"
        made = subprocess.run([
            "ffmpeg", "-v", "error", "-f", "lavfi", "-i", f"color=c={color or self.colors[len(list(directory.glob('*.png'))) % len(self.colors)]}:s=16x12",
            "-frames:v", "1", "-y", str(path),
        ], text=True, capture_output=True, check=False)
        self.assertEqual(made.returncode, 0, made.stderr)
        return path

    def asset(self, asset_id, kind, required, characters, location, references, method="image_gen", model=None):
        asset = {
            "id": asset_id, "kind": kind, "required": required, "method": method,
            "character_ids": characters, "location_id": location, "references": references,
            "prompt": "consistent cinematic reference" if method in {"image_gen", "openai-images-api"} else "",
            "invariants": ["locked identity"] if characters else ["locked environment"],
        }
        if model is not None:
            asset["model"] = model
        return asset

    def package(self, *, characters=True, genre="ballad", second_character=False):
        assets = []
        chars = []
        if characters:
            chars.append({"id": "artist", "identity_asset_id": "artist-master"})
            assets += [
                self.asset("artist-master", "identity-master", True, ["artist"], None, []),
                self.asset("artist-sheet", "character-sheet", True, ["artist"], None, ["artist-master"]),
            ]
            if second_character:
                chars.append({"id": "guest", "identity_asset_id": "guest-master"})
                assets += [
                    self.asset("guest-master", "identity-master", True, ["guest"], None, []),
                    self.asset("guest-sheet", "character-sheet", True, ["guest"], None, ["guest-master"]),
                ]
        assets.append(self.asset("studio-bg", "background", True, [], "studio", []))
        refs = (["artist-master"] if characters else []) + ["studio-bg"]
        cast = ["artist"] + (["guest"] if second_character else []) if characters else []
        assets.append(self.asset("opening", "shot-start", False, cast, "studio", refs))
        return {
            "schema_version": 1,
            "profile": {"music_genre": genre, "visual_format": "idol" if characters else "performance-landscape", "visual_look": "cinematic"},
            "characters": chars,
            "locations": [{"id": "studio", "background_asset_id": "studio-bg"}],
            "assets": assets,
        }, {"shots": [{"id": "opening-shot", "character_ids": cast, "location_id": "studio", "start_image_asset_id": "opening"}]}

    def manifest_and_review(self, plan, *, omit=(), review=True):
        entries = []
        reviewed = []
        for asset in plan["assets"]:
            if asset["id"] in omit:
                continue
            path = self.image(asset["id"])
            value = {"id": asset["id"], "path": str(path.relative_to(self.root)), "sha256": digest(path), "width": 16, "height": 12, "tool": "openai-images-api" if asset["method"] == "openai-images-api" else "image_gen"}
            if asset["method"] == "openai-images-api":
                value["model"] = asset["model"]
            entries.append(value)
            reviewed.append({"id": asset["id"], "sha256": value["sha256"], "verdict": "pass", "evidence": "프레임에서 인물과 배경을 확인함"})
        return {"schema_version": 1, "assets": entries}, {"schema_version": 1, "assets": reviewed if review else []}

    def validate_package(self, plan, shots, manifest=None, review=None, *extra, env=None):
        plan_path = self.write_json("plan.json", plan)
        shots_path = self.write_json("shots.json", shots)
        arguments = ["--root", self.root, "--plan", plan_path, "--shots", shots_path]
        if manifest is not None:
            arguments += ["--manifest", self.write_json("manifest.json", manifest)]
        if review is not None:
            arguments += ["--review", self.write_json("review.json", review)]
        return call(*arguments, *extra, env=env)

    def response(self, result):
        self.assertEqual(result.stderr, "")
        return json.loads(result.stdout)

    def test_ready_package_requires_verified_images_and_reviews(self):
        plan, shots = self.package()
        manifest, review = self.manifest_and_review(plan)
        result = self.validate_package(plan, shots, manifest, review, "--require-ready")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.response(result), {"ok": True, "ready": True, "missing": [], "errors": []})

    def test_openai_images_api_asset_is_ready(self):
        plan, shots = self.package()
        asset = plan["assets"][0]
        asset.update({"method": "openai-images-api", "model": "gpt-image-2.5-flare"})
        manifest, review = self.manifest_and_review(plan)
        ready = self.validate_package(plan, shots, manifest, review, "--require-ready")
        self.assertEqual(ready.returncode, 0, ready.stderr)
        self.assertTrue(self.response(ready)["ready"])

    def test_openai_images_api_asset_rejects_wrong_tool(self):
        plan, shots = self.package()
        asset = plan["assets"][0]
        asset.update({"method": "openai-images-api", "model": "gpt-image-2.5-flare"})
        manifest, review = self.manifest_and_review(plan)
        manifest["assets"][0]["tool"] = "image_gen"
        wrong_tool = self.validate_package(plan, shots, manifest, review)
        self.assertEqual(wrong_tool.returncode, 2)
        self.assertIn("openai-images-api", self.response(wrong_tool)["errors"][0])

    def test_openai_images_api_asset_requires_plan_model(self):
        plan, shots = self.package()
        plan["assets"][0]["method"] = "openai-images-api"
        missing_model = self.validate_package(plan, shots)
        self.assertEqual(missing_model.returncode, 2)
        self.assertIn("model", self.response(missing_model)["errors"][0])

    def test_openai_images_api_manifest_model_must_match_plan(self):
        plan, shots = self.package()
        asset = plan["assets"][0]
        asset.update({"method": "openai-images-api", "model": "gpt-image-2.5-flare"})
        manifest, review = self.manifest_and_review(plan)
        manifest["assets"][0]["model"] = "gpt-image-2.5-sunburst"
        result = self.validate_package(plan, shots, manifest, review)
        self.assertEqual(result.returncode, 2)
        self.assertIn("model", self.response(result)["errors"][0])

    def test_plan_only_is_valid_but_not_ready(self):
        plan, shots = self.package()
        result = self.validate_package(plan, shots, None, None, "--require-ready")
        self.assertEqual(result.returncode, 3)
        response = self.response(result)
        self.assertTrue(response["ok"])
        self.assertFalse(response["ready"])
        self.assertIn("manifest", response["missing"])

    def test_empty_shot_draft_cannot_be_ready(self):
        plan, _ = self.package(characters=False)
        shots = {"shots": []}
        manifest = {"schema_version": 1, "assets": []}
        review = {"schema_version": 1, "assets": []}
        result = self.validate_package(plan, shots, manifest, review, "--require-ready")
        self.assertEqual(result.returncode, 3)
        response = self.response(result)
        self.assertTrue(response["ok"])
        self.assertIn("shots", response["missing"])

    def test_missing_required_asset_and_unreviewed_asset_are_not_schema_errors(self):
        plan, shots = self.package()
        manifest, review = self.manifest_and_review(plan, omit=("artist-master",), review=False)
        result = self.validate_package(plan, shots, manifest, review)
        self.assertEqual(result.returncode, 0, result.stderr)
        response = self.response(result)
        self.assertIn("asset:artist-master", response["missing"])
        self.assertIn("review:artist-sheet", response["missing"])

    def test_unused_optional_asset_does_not_block_readiness(self):
        plan, shots = self.package()
        plan["assets"].append(self.asset("unused-prop", "prop", False, [], None, []))
        manifest, review = self.manifest_and_review({**plan, "assets": plan["assets"][:-1]})
        result = self.validate_package(plan, shots, manifest, review, "--require-ready")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(self.response(result)["ready"])

    def test_rejects_keyframe_without_identity_reference_chain(self):
        plan, shots = self.package()
        plan["assets"][-1]["references"] = ["studio-bg"]
        result = self.validate_package(plan, shots)
        self.assertEqual(result.returncode, 2)
        self.assertIn("identity-master", self.response(result)["errors"][0])

    def test_rejects_character_sheet_as_i2v_start(self):
        plan, shots = self.package()
        shots["shots"][0]["start_image_asset_id"] = "artist-sheet"
        result = self.validate_package(plan, shots)
        self.assertEqual(result.returncode, 2)
        self.assertIn("shot-start", self.response(result)["errors"][0])

    def test_character_sheet_accepts_own_wardrobe_with_identity_lineage(self):
        plan, shots = self.package()
        plan["assets"].append(self.asset("artist-look", "wardrobe", True, ["artist"], None, ["artist-master"]))
        plan["assets"][1]["references"] = ["artist-look"]
        result = self.validate_package(plan, shots)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertTrue(self.response(result)["ok"])
        self.assertFalse(self.response(result)["ready"])

    def test_character_sheet_rejects_wardrobe_without_own_identity_lineage(self):
        plan, shots = self.package()
        plan["assets"].append(self.asset("artist-look", "wardrobe", True, ["artist"], None, []))
        plan["assets"][1]["references"] = ["artist-look"]
        result = self.validate_package(plan, shots)
        self.assertEqual(result.returncode, 2)

    def test_character_sheet_rejects_foreign_wardrobe_or_mixed_identity_lineage(self):
        for owner, references in [("guest", ["artist-master"]), ("artist", ["artist-master", "guest-master"])]:
            with self.subTest(owner=owner, references=references):
                plan, shots = self.package(second_character=True)
                plan["assets"][-1]["references"].append("guest-master")
                plan["assets"].append(self.asset("look", "wardrobe", True, [owner], None, references))
                plan["assets"][1]["references"] = ["look"]
                result = self.validate_package(plan, shots)
                self.assertEqual(result.returncode, 2)

    def test_character_sheet_rejects_multiple_direct_sources(self):
        plan, shots = self.package()
        plan["assets"].append(self.asset("artist-look", "wardrobe", True, ["artist"], None, ["artist-master"]))
        plan["assets"][1]["references"] = ["artist-master", "artist-look"]
        result = self.validate_package(plan, shots)
        self.assertEqual(result.returncode, 2)

    def test_characterless_landscape_is_allowed(self):
        plan, shots = self.package(characters=False)
        manifest, review = self.manifest_and_review(plan)
        result = self.validate_package(plan, shots, manifest, review, "--require-ready")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(self.response(result)["ready"])

    def test_custom_genre_is_not_whitelisted(self):
        plan, shots = self.package(genre="neo-folk-ritual")
        plan["profile"].update({"subgenres": ["field-recording"], "performance_source": "practical-live", "lip_sync_target": "not requested"})
        shots["shots"][0].update({"start_frame": 0, "end_frame_exclusive": 96, "delivery_fps": 24, "camera": {"angle": "eye"}, "ltx_generation": {"mode": "i2v"}})
        manifest, review = self.manifest_and_review(plan)
        result = self.validate_package(plan, shots, manifest, review)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(self.response(result)["ready"])

    def test_accepts_bundled_image_and_shot_examples_with_existing_metadata(self):
        plan = json.loads(IMAGE_EXAMPLE.read_text(encoding="utf-8"))
        shots = json.loads(SHOT_EXAMPLE.read_text(encoding="utf-8"))
        result = self.validate_package(plan, shots)
        self.assertEqual(result.returncode, 0, result.stderr)
        response = self.response(result)
        self.assertTrue(response["ok"])
        self.assertFalse(response["ready"])

    def test_rejects_multi_cast_character_sheet_and_noncanonical_anchor_fields(self):
        plan, shots = self.package(second_character=True)
        plan["assets"][1]["character_ids"] = ["artist", "guest"]
        result = self.validate_package(plan, shots)
        self.assertEqual(result.returncode, 2)
        self.assertIn("character-sheet", self.response(result)["errors"][0])
        plan, shots = self.package()
        plan["assets"][0]["location_id"] = "studio"
        result = self.validate_package(plan, shots)
        self.assertEqual(result.returncode, 2)
        self.assertIn("identity-master", self.response(result)["errors"][0])
        plan, shots = self.package()
        plan["assets"][2]["character_ids"] = ["artist"]
        result = self.validate_package(plan, shots)
        self.assertEqual(result.returncode, 2)
        self.assertIn("background", self.response(result)["errors"][0])
        plan, shots = self.package()
        plan["assets"][-1]["invariants"] = []
        result = self.validate_package(plan, shots)
        self.assertEqual(result.returncode, 2)
        self.assertIn("invariants", self.response(result)["errors"][0])

    def test_multi_cast_keyframe_must_reference_every_identity_master(self):
        plan, shots = self.package(second_character=True)
        result = self.validate_package(plan, shots)
        self.assertEqual(result.returncode, 2)
        self.assertIn("guest identity-master", self.response(result)["errors"][0])
        plan["assets"][-1]["references"].insert(1, "guest-master")
        manifest, review = self.manifest_and_review(plan)
        artist = next(item for item in manifest["assets"] if item["id"] == "artist-master")
        guest = next(item for item in manifest["assets"] if item["id"] == "guest-master")
        copied = self.root / "assets/guest-copy.png"
        copied.write_bytes((self.root / artist["path"]).read_bytes())
        guest["path"] = str(copied.relative_to(self.root))
        guest["sha256"] = artist["sha256"]
        next(item for item in review["assets"] if item["id"] == "guest-master")["sha256"] = artist["sha256"]
        duplicated = self.validate_package(plan, shots, manifest, review)
        self.assertEqual(duplicated.returncode, 2)
        self.assertIn("identity-master", self.response(duplicated)["errors"][0])

    def test_rejects_shared_character_sheet_even_when_keyframe_references_it(self):
        plan, shots = self.package(second_character=True)
        plan["assets"].append(self.asset("shared-sheet", "character-sheet", False, ["artist", "guest"], None, ["artist-master", "guest-master"]))
        plan["assets"][-2]["references"].extend(["guest-master", "shared-sheet"])
        manifest, review = self.manifest_and_review(plan)
        result = self.validate_package(plan, shots, manifest, review, "--require-ready")
        self.assertEqual(result.returncode, 2)
        self.assertIn("character-sheet", self.response(result)["errors"][0])

    def test_rejects_foreign_identity_master_on_character_sheet(self):
        plan, shots = self.package(second_character=True)
        plan["assets"][1]["references"].append("guest-master")
        plan["assets"][-1]["references"].append("guest-master")
        manifest, review = self.manifest_and_review(plan)
        result = self.validate_package(plan, shots, manifest, review, "--require-ready")
        self.assertEqual(result.returncode, 2)
        self.assertIn("하나만 직접 참조", self.response(result)["errors"][0])

    def test_rejects_tampering_path_escape_and_symlink(self):
        plan, shots = self.package()
        manifest, review = self.manifest_and_review(plan)
        path = self.root / manifest["assets"][0]["path"]
        path.write_bytes(path.read_bytes() + b"tampered")
        tampered = self.validate_package(plan, shots, manifest, review)
        self.assertEqual(tampered.returncode, 2)
        self.assertIn("해시", self.response(tampered)["errors"][0])
        manifest, review = self.manifest_and_review(plan)
        manifest["assets"][0]["path"] = "../outside.png"
        escaped = self.validate_package(plan, shots, manifest, review)
        self.assertEqual(escaped.returncode, 2)
        self.assertIn("root 내부", self.response(escaped)["errors"][0])
        manifest, review = self.manifest_and_review(plan)
        source = self.root / manifest["assets"][0]["path"]
        link = self.root / "assets/link.png"
        link.symlink_to(source)
        manifest["assets"][0]["path"] = "assets/link.png"
        linked = self.validate_package(plan, shots, manifest, review)
        self.assertEqual(linked.returncode, 2)
        self.assertIn("심볼릭", self.response(linked)["errors"][0])

    def test_rejects_cycles_invalid_arguments_and_missing_ffprobe(self):
        plan, shots = self.package()
        plan["assets"][0]["references"] = ["artist-sheet"]
        cyclic = self.validate_package(plan, shots)
        self.assertEqual(cyclic.returncode, 2)
        self.assertIn("순환", self.response(cyclic)["errors"][0])
        invalid = call("--root", self.root)
        self.assertEqual(invalid.returncode, 2)
        self.assertTrue(self.response(invalid)["errors"])
        plan, shots = self.package()
        manifest, review = self.manifest_and_review(plan)
        no_probe = self.validate_package(plan, shots, manifest, review, env={"PATH": ""})
        self.assertEqual(no_probe.returncode, 2)
        self.assertIn("ffprobe", self.response(no_probe)["errors"][0])

    def test_enum_and_schema_type_errors_are_json_errors(self):
        for field, bad_value in (("kind", []), ("method", {})):
            with self.subTest(field=field):
                plan, shots = self.package()
                plan["assets"][0][field] = bad_value
                result = self.validate_package(plan, shots)
                self.assertEqual(result.returncode, 2)
                self.assertFalse(self.response(result)["ok"])
        plan, shots = self.package()
        manifest, review = self.manifest_and_review(plan)
        manifest["assets"][0]["tool"] = []
        result = self.validate_package(plan, shots, manifest, review)
        self.assertEqual(result.returncode, 2)
        self.assertFalse(self.response(result)["ok"])
        manifest, review = self.manifest_and_review(plan)
        review["assets"][0]["verdict"] = {}
        result = self.validate_package(plan, shots, manifest, review)
        self.assertEqual(result.returncode, 2)
        self.assertFalse(self.response(result)["ok"])
        for target, bad_value in (("plan", True), ("plan", 1.0), ("manifest", True), ("review", 1.0)):
            with self.subTest(target=target, value=bad_value):
                plan, shots = self.package()
                manifest, review = self.manifest_and_review(plan)
                if target == "plan":
                    plan["schema_version"] = bad_value
                elif target == "manifest":
                    manifest["schema_version"] = bad_value
                else:
                    review["schema_version"] = bad_value
                result = self.validate_package(plan, shots, manifest, review)
                self.assertEqual(result.returncode, 2)
                self.assertFalse(self.response(result)["ok"])


if __name__ == "__main__":
    unittest.main()

import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
VALIDATE = ROOT / ".agents/skills/road-music-mv/scripts/validate_preproduction.py"
HARNESS_SPEC = ROOT / ".agents/skills/road-music-mv/references/harness-spec.json"
PLAN_TEMPLATE = ROOT / ".agents/skills/road-music-mv/assets/plan-template.json"


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")).hexdigest()


class StoryboardGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def write_json(self, name, value):
        path = self.root / name
        path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
        return path

    def image(self, asset_id):
        path = self.root / "assets" / f"{asset_id}.png"
        path.parent.mkdir(exist_ok=True)
        result = subprocess.run([
            "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=16x12",
            "-frames:v", "1", "-y", str(path),
        ], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        return path

    def audio(self):
        path = self.root / "source.wav"
        result = subprocess.run([
            "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
            "-t", "1", "-y", str(path),
        ], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        return path

    def package(self):
        audio = self.audio()
        assets = [
            self.asset("artist-master", "identity-master", ["artist"], None, []),
            self.asset("artist-sheet", "character-sheet", ["artist"], None, ["artist-master"]),
            self.asset("artist-look", "wardrobe", ["artist"], None, ["artist-master"]),
            self.asset("studio-bg", "background", [], "studio", []),
            self.asset("phone", "prop", ["artist"], "studio", ["artist-master", "studio-bg"]),
            self.asset("opening", "shot-start", ["artist"], "studio", ["artist-master", "artist-look", "studio-bg", "phone"]),
            self.asset("sheet-1", "storyboard-sheet", [], None, ["opening"], method="compose"),
        ]
        plan = {
            "schema_version": 1,
            "profile": {"music_genre": "pop", "visual_format": "performance", "visual_look": "clean"},
            "characters": [{"id": "artist", "identity_asset_id": "artist-master"}],
            "locations": [{"id": "studio", "background_asset_id": "studio-bg"}],
            "assets": assets,
        }
        shots = {"shots": [{
            "id": "opening-shot", "character_ids": ["artist"], "location_id": "studio",
            "start_image_asset_id": "opening", "end_image_asset_id": None,
            "start_frame": 0, "end_frame_exclusive": 24, "delivery_fps": 24,
            "music_section_ids": ["intro"], "story_beat_id": "arrival", "emotional_purpose": "기대",
            "action_start": "입장", "action_end": "휴대폰을 든다",
            "camera": {"size": "medium", "angle": "eye", "movement": "push", "composition": "center", "focus": "artist", "lens_intent": "intimate"},
            "lighting": "left key", "film_look": "clean digital", "props": [{"id": "phone", "state": "closed", "holder_character_id": "artist", "screen_position": "right hand"}],
            "effects": [], "transition_out": {"type": "end", "purpose": "finish", "execution": "edit", "handle_frames": 0},
        }]}
        design = {
            "schema_version": 1,
            "source_audio": {"path": str(audio), "sha256": sha256(audio), "duration_seconds": 1.0},
            "delivery": {"width": 16, "height": 12, "fps": 24, "total_frames": 24},
            "story": {"mode": "performance", "theme": "arrival", "logline": "무대에 도착해 노래한다", "arc": "입장해서 행동하고 끝난다"},
            "decisions": {name: {"choice": "선택", "music_reason": "인트로에 맞춘다"} for name in (
                "cast", "age_range", "concept", "wardrobe", "hair_makeup", "locations_sets", "props", "performance_choreography", "camera_lenses", "lighting_color", "film_look", "vfx", "transitions", "visual_sfx", "sound_policy", "typography_graphics"
            )},
            "music_sections": [{"id": "intro", "start_frame": 0, "end_frame_exclusive": 24, "musical_event": "intro", "visual_goal": "arrival"}],
            "story_beats": [{"id": "arrival", "section_ids": ["intro"], "goal": "무대 진입", "action": "입장", "change": "정지에서 행동"}],
            "directing_methods": [{"source": "local observation", "principle": "center framing", "application": "opening", "shot_ids": ["opening-shot"]}],
            "props": [{"id": "phone", "asset_id": "phone", "character_ids": ["artist"], "location_ids": ["studio"], "continuity_rules": "검은색 유지"}],
        }
        storyboard = {
            "schema_version": 1,
            "panels": [{"id": "panel-1", "shot_id": "opening-shot", "image_asset_id": "opening", "at_frame": 0, "caption": "입장, 미디엄 푸시, 인트로"}],
            "pages": [{"id": "page-1", "asset_id": "sheet-1", "panel_ids": ["panel-1"]}],
        }
        manifest = {"schema_version": 1, "assets": []}
        review = {"schema_version": 1, "assets": []}
        for asset in assets:
            path = self.image(asset["id"])
            manifest["assets"].append({"id": asset["id"], "path": str(path.relative_to(self.root)), "sha256": sha256(path), "width": 16, "height": 12, "tool": "local-composite" if asset["method"] == "compose" else "image_gen"})
            review["assets"].append({"id": asset["id"], "sha256": sha256(path), "verdict": "pass", "evidence": "확인"})
        return plan, shots, design, storyboard, manifest, review

    @staticmethod
    def asset(asset_id, kind, characters, location, references, method="image_gen"):
        return {"id": asset_id, "kind": kind, "required": True, "method": method, "character_ids": characters, "location_id": location, "references": references, "prompt": "reference" if method == "image_gen" else "", "invariants": ["fixed"]}

    def validate_package(self, plan, shots, design, storyboard, manifest=None, review=None, *extra):
        arguments = ["--root", self.root, "--plan", self.write_json("plan.json", plan), "--shots", self.write_json("shots.json", shots), "--production-design", self.write_json("design.json", design), "--storyboard", self.write_json("storyboard.json", storyboard)]
        if manifest is not None:
            arguments += ["--manifest", self.write_json("manifest.json", manifest)]
        if review is not None:
            arguments += ["--review", self.write_json("review.json", review)]
        return subprocess.run([sys.executable, str(VALIDATE), *map(str, arguments), *extra], capture_output=True, text=True, check=False)

    def response(self, result):
        self.assertEqual(result.stderr, "")
        return json.loads(result.stdout)

    @staticmethod
    def input_digests(plan, shots, design, storyboard):
        return {"production_design": canonical(design), "image_plan": canonical(plan), "shot_plan": canonical(shots), "storyboard": canonical(storyboard)}

    def test_storyboard_ready_requires_bound_review_and_returns_digests(self):
        plan, shots, design, storyboard, manifest, review = self.package()
        result = self.validate_package(plan, shots, design, storyboard, manifest, review, "--require-ready")
        self.assertEqual(result.returncode, 3, result.stdout)
        digests = self.response(result)["input_sha256"]
        review["storyboard"] = {"verdict": "pass", "reviewer_id": "reviewer", "producer_id": "producer", "evidence": "panels checked", "panel_ids": ["panel-1"], "input_sha256": digests}
        result = self.validate_package(plan, shots, design, storyboard, manifest, review, "--require-ready")
        self.assertEqual(result.returncode, 0, result.stdout)
        response = self.response(result)
        self.assertTrue(response["ready"])
        self.assertEqual(set(response["input_sha256"]), {"production_design", "image_plan", "shot_plan", "storyboard"})

    def test_missing_storyboard_review_is_not_ready_and_stale_digest_is_invalid(self):
        plan, shots, design, storyboard, manifest, review = self.package()
        result = self.validate_package(plan, shots, design, storyboard, manifest, review, "--require-ready")
        self.assertEqual(result.returncode, 3)
        self.assertIn("storyboard-review", self.response(result)["missing"])
        review["storyboard"] = {"verdict": "pass", "reviewer_id": "reviewer", "producer_id": "producer", "evidence": "checked", "panel_ids": ["panel-1"], "input_sha256": {"production_design": "0" * 64, "image_plan": "0" * 64, "shot_plan": "0" * 64, "storyboard": "0" * 64}}
        result = self.validate_package(plan, shots, design, storyboard, manifest, review)
        self.assertEqual(result.returncode, 2)
        self.assertIn("input_sha256", self.response(result)["errors"][0])

    def test_rejects_missing_prop_and_timeline_and_sheet_as_i2v(self):
        plan, shots, design, storyboard, manifest, review = self.package()
        design["props"] = []
        result = self.validate_package(plan, shots, design, storyboard)
        self.assertEqual(result.returncode, 2)
        plan, shots, design, storyboard, _, _ = self.package()
        plan["assets"].append(self.asset("closing", "shot-start", ["artist"], "studio", ["artist-master", "artist-look", "studio-bg", "phone"]))
        overlap = copy.deepcopy(shots["shots"][0])
        overlap.update({"id": "closing-shot", "start_image_asset_id": "closing", "start_frame": 12, "end_frame_exclusive": 24})
        shots["shots"].append(overlap)
        result = self.validate_package(plan, shots, design, storyboard)
        self.assertEqual(result.returncode, 2)
        plan, shots, design, storyboard, _, _ = self.package()
        design["music_sections"] = [
            {"id": "first", "start_frame": 0, "end_frame_exclusive": 12, "musical_event": "intro", "visual_goal": "arrival"},
            {"id": "second", "start_frame": 12, "end_frame_exclusive": 24, "musical_event": "verse", "visual_goal": "arrival"},
        ]
        design["story_beats"][0]["section_ids"] = ["first"]
        shots["shots"][0]["music_section_ids"] = ["first", "second"]
        result = self.validate_package(plan, shots, design, storyboard)
        self.assertEqual(result.returncode, 2)
        plan, shots, design, storyboard, _, _ = self.package()
        shots["shots"][0]["start_frame"] = 1
        result = self.validate_package(plan, shots, design, storyboard)
        self.assertEqual(result.returncode, 2)

    def test_match_cut_binds_to_the_actual_next_shot_and_locations(self):
        def package_with_next_shot():
            plan, shots, design, storyboard, _, _ = self.package()
            plan["assets"].append(self.asset("closing", "shot-start", ["artist"], "studio", ["artist-master", "artist-look", "studio-bg", "phone"]))
            first = shots["shots"][0]
            first["end_frame_exclusive"] = 12
            second = copy.deepcopy(first)
            second.update({"id": "closing-shot", "start_image_asset_id": "closing", "start_frame": 12, "end_frame_exclusive": 24, "transition_out": {"type": "end", "purpose": "finish", "execution": "edit", "handle_frames": 0}})
            shots["shots"].append(second)
            plan["assets"][-2]["references"] = ["opening", "closing"]
            storyboard["panels"].append({"id": "panel-2", "shot_id": "closing-shot", "image_asset_id": "closing", "at_frame": 12, "caption": "next"})
            storyboard["pages"][0]["panel_ids"].append("panel-2")
            return plan, shots, design, storyboard

        plan, shots, design, storyboard = package_with_next_shot()
        shots["shots"][0]["transition_out"] = {"type": "match-cut", "purpose": "prism bridge", "execution": "edit", "handle_frames": 0, "target_shot_id": "closing-shot", "from_location_id": "studio", "to_location_id": "studio", "visual_match": "the same prism bevel fills frame center"}
        self.assertEqual(self.validate_package(plan, shots, design, storyboard).returncode, 0)

        for field, value in (("target_shot_id", "opening-shot"), ("from_location_id", "other"), ("to_location_id", "other"), ("visual_match", " ")):
            with self.subTest(field=field):
                plan, shots, design, storyboard = package_with_next_shot()
                transition = {"type": "match-cut", "purpose": "bridge", "execution": "edit", "handle_frames": 0, "target_shot_id": "closing-shot", "from_location_id": "studio", "to_location_id": "studio", "visual_match": "prism"}
                transition[field] = value
                shots["shots"][0]["transition_out"] = transition
                self.assertEqual(self.validate_package(plan, shots, design, storyboard).returncode, 2)

        plan, shots, design, storyboard = package_with_next_shot()
        shots["shots"][0]["transition_out"] = {"type": "match-cut", "purpose": "bridge", "execution": "edit", "handle_frames": 0, "from_location_id": "studio", "to_location_id": "studio", "visual_match": "prism"}
        self.assertEqual(self.validate_package(plan, shots, design, storyboard).returncode, 2)

        plan, shots, design, storyboard = package_with_next_shot()
        shots["shots"][0]["transition_out"] = {"type": "cut", "purpose": "plain cut", "execution": "edit", "handle_frames": 0}
        self.assertEqual(self.validate_package(plan, shots, design, storyboard).returncode, 0)
        shots["shots"][1]["transition_out"] = {"type": "match-cut", "purpose": "invalid final", "execution": "edit", "handle_frames": 0, "target_shot_id": "none", "from_location_id": "studio", "to_location_id": "studio", "visual_match": "prism"}
        self.assertEqual(self.validate_package(plan, shots, design, storyboard).returncode, 2)

    def test_keys_stage_does_not_require_future_panels_but_used_optional_prop_is_required(self):
        plan, shots, design, storyboard, manifest, review = self.package()
        plan["assets"][4]["required"] = False
        manifest["assets"] = [entry for entry in manifest["assets"] if entry["id"] != "phone"]
        review["assets"] = [entry for entry in review["assets"] if entry["id"] != "phone"]
        result = self.validate_package(plan, shots, design, {"draft": True}, manifest, review, "--stage", "keys")
        self.assertEqual(result.returncode, 0)
        self.assertIn("asset:phone", self.response(result)["missing"])
        self.assertNotIn("storyboard-review", self.response(result)["missing"])

    def test_keys_stage_accepts_only_key_assets_with_bound_keys_review(self):
        plan, shots, design, storyboard, manifest, review = self.package()
        key_kinds = {"identity-master", "character-sheet", "wardrobe", "background", "prop"}
        key_ids = {asset["id"] for asset in plan["assets"] if asset["kind"] in key_kinds}
        manifest["assets"] = [entry for entry in manifest["assets"] if entry["id"] in key_ids]
        review["assets"] = [entry for entry in review["assets"] if entry["id"] in key_ids]
        review["keys"] = {"verdict": "pass", "reviewer_id": "/root/reviewer", "producer_id": "/root/producer", "evidence": "key assets checked", "input_sha256": self.input_digests(plan, shots, design, storyboard)}
        result = self.validate_package(plan, shots, design, storyboard, manifest, review, "--stage", "keys", "--require-ready")
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertTrue(self.response(result)["ready"])
        review["keys"]["input_sha256"]["image_plan"] = "0" * 64
        result = self.validate_package(plan, shots, design, storyboard, manifest, review, "--stage", "keys")
        self.assertEqual(result.returncode, 2)

    def test_rejects_key_asset_with_acyclic_future_keyframe_reference(self):
        plan, shots, design, storyboard, manifest, review = self.package()
        wardrobe = next(asset for asset in plan["assets"] if asset["id"] == "artist-look")
        opening = next(asset for asset in plan["assets"] if asset["id"] == "opening")
        wardrobe["references"] = ["opening"]
        opening["references"].remove("artist-look")
        review["keys"] = {"verdict": "pass", "reviewer_id": "reviewer", "producer_id": "producer", "evidence": "all files checked", "input_sha256": self.input_digests(plan, shots, design, storyboard)}
        result = self.validate_package(plan, shots, design, storyboard, manifest, review, "--stage", "keys", "--require-ready")
        self.assertEqual(result.returncode, 2)
        self.assertIn("key asset", self.response(result)["errors"][0])

    def test_rejects_animatic_audio_that_differs_from_source_pcm(self):
        plan, shots, design, storyboard, manifest, review = self.package()
        digests = self.input_digests(plan, shots, design, storyboard)
        review["storyboard"] = {"verdict": "pass", "reviewer_id": "reviewer", "producer_id": "producer", "evidence": "checked", "panel_ids": ["panel-1"], "input_sha256": digests}
        media = self.root / "preproduction" / "animatic.mov"
        media.parent.mkdir()
        made = subprocess.run([
            "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=16x12:r=24:d=1",
            "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=1",
            "-shortest", "-c:v", "png", "-c:a", "pcm_s32le", "-y", str(media),
        ], capture_output=True, text=True, check=False)
        self.assertEqual(made.returncode, 0, made.stderr)
        animatic = {"path": "preproduction/animatic.mov", "sha256": sha256(media), "source_audio_sha256": design["source_audio"]["sha256"], "input_sha256": digests, "verdict": "pass", "reviewer_id": "reviewer", "producer_id": "producer", "evidence": "played"}
        result = self.validate_package(plan, shots, design, storyboard, manifest, review, "--stage", "animatic", "--animatic-review", self.write_json("animatic.json", animatic))
        self.assertEqual(result.returncode, 2)
        self.assertIn("PCM", self.response(result)["errors"][0])

    def test_rejects_animatic_with_truncated_source_pcm(self):
        plan, shots, design, storyboard, manifest, review = self.package()
        digests = self.input_digests(plan, shots, design, storyboard)
        review["storyboard"] = {"verdict": "pass", "reviewer_id": "reviewer", "producer_id": "producer", "evidence": "checked", "panel_ids": ["panel-1"], "input_sha256": digests}
        media = self.root / "preproduction" / "animatic.mov"
        media.parent.mkdir()
        made = subprocess.run([
            "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=16x12:r=24:d=1",
            "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=0.5",
            "-map", "0:v:0", "-map", "1:a:0", "-c:v", "png", "-c:a", "pcm_s32le", "-y", str(media),
        ], capture_output=True, text=True, check=False)
        self.assertEqual(made.returncode, 0, made.stderr)
        animatic = {"path": "preproduction/animatic.mov", "sha256": sha256(media), "source_audio_sha256": design["source_audio"]["sha256"], "input_sha256": digests, "verdict": "pass", "reviewer_id": "reviewer", "producer_id": "producer", "evidence": "played"}
        result = self.validate_package(plan, shots, design, storyboard, manifest, review, "--stage", "animatic", "--animatic-review", self.write_json("animatic.json", animatic))
        self.assertEqual(result.returncode, 2)
        self.assertIn("PCM", self.response(result)["errors"][0])

    def test_rejects_panels_out_of_global_time_order(self):
        plan, shots, design, storyboard, manifest, review = self.package()
        storyboard["panels"].extend([
            {"id": "panel-2", "shot_id": "opening-shot", "image_asset_id": "opening", "at_frame": 18, "caption": "late"},
            {"id": "panel-3", "shot_id": "opening-shot", "image_asset_id": "opening", "at_frame": 6, "caption": "early after late"},
        ])
        storyboard["pages"][0]["panel_ids"] = ["panel-1", "panel-2", "panel-3"]
        result = self.validate_package(plan, shots, design, storyboard, manifest, review)
        self.assertEqual(result.returncode, 2)
        self.assertIn("엄격히 증가", self.response(result)["errors"][0])
        plan, shots, design, storyboard, _, _ = self.package()
        shots["shots"][0]["start_image_asset_id"] = "sheet-1"
        result = self.validate_package(plan, shots, design, storyboard)
        self.assertEqual(result.returncode, 2)

    def test_pipeline_tasks_depend_on_every_logical_input_producer(self):
        spec = json.loads(HARNESS_SPEC.read_text(encoding="utf-8"))
        producers = {}
        for task in spec["tasks"]:
            for output in task["outputs"]:
                producers.setdefault(output, set()).add(task["id"])
        for task in spec["tasks"]:
            needed = set().union(*(producers.get(value, set()) for value in task["inputs"]))
            self.assertTrue(needed <= set(task["depends_on"]), task["id"])
        template = json.loads(PLAN_TEMPLATE.read_text(encoding="utf-8"))
        template_tasks = {task["id"]: task for task in template["tasks"]}
        for task in spec["tasks"]:
            self.assertTrue(set(task["depends_on"]) <= set(template_tasks[task["id"]]["dependencies"]), task["id"])

    def test_rejects_non_finite_delivery_and_tampered_source_audio(self):
        plan, shots, design, storyboard, _, _ = self.package()
        design["delivery"]["fps"] = float("inf")
        result = self.validate_package(plan, shots, design, storyboard)
        self.assertEqual(result.returncode, 2)

    def test_multi_character_production_design_requires_bible(self):
        plan, shots, design, storyboard, _, _ = self.package()
        plan["characters"].append({"id": "guest", "identity_asset_id": "guest-master"})
        plan["assets"].extend([
            self.asset("guest-master", "identity-master", ["guest"], None, []),
            self.asset("guest-sheet", "character-sheet", ["guest"], None, ["guest-master"]),
        ])
        opening = next(asset for asset in plan["assets"] if asset["id"] == "opening")
        opening["character_ids"].append("guest")
        opening["references"].append("guest-master")
        shots["shots"][0]["character_ids"].append("guest")
        result = self.validate_package(plan, shots, design, storyboard, None, None, "--require-ready")
        self.assertEqual(result.returncode, 3)
        self.assertIn("bible", self.response(result)["missing"])

    def test_animatic_review_rejects_symlink_media(self):
        plan, shots, design, storyboard, manifest, review = self.package()
        initial = self.validate_package(plan, shots, design, storyboard, manifest, review)
        digests = self.response(initial)["input_sha256"]
        review["storyboard"] = {"verdict": "pass", "reviewer_id": "reviewer", "producer_id": "producer", "evidence": "checked", "panel_ids": ["panel-1"], "input_sha256": digests}
        target = self.root / "outside.mp4"
        target.write_bytes(b"not an animatic")
        media = self.root / "media" / "animatic.mp4"
        media.parent.mkdir()
        media.symlink_to(target)
        animatic = {"path": "media/animatic.mp4", "sha256": sha256(target), "source_audio_sha256": design["source_audio"]["sha256"], "input_sha256": digests, "verdict": "pass", "reviewer_id": "reviewer", "producer_id": "producer", "evidence": "played"}
        result = self.validate_package(plan, shots, design, storyboard, manifest, review, "--stage", "animatic", "--animatic-review", self.write_json("animatic.json", animatic))
        self.assertEqual(result.returncode, 2)
        self.assertIn("심볼릭", self.response(result)["errors"][0])

    def test_animatic_ready_requires_verified_local_media(self):
        plan, shots, design, storyboard, manifest, review = self.package()
        initial = self.validate_package(plan, shots, design, storyboard, manifest, review)
        digests = self.response(initial)["input_sha256"]
        review["storyboard"] = {"verdict": "pass", "reviewer_id": "reviewer", "producer_id": "producer", "evidence": "checked", "panel_ids": ["panel-1"], "input_sha256": digests}
        media = self.root / "preproduction" / "animatic.mov"
        media.parent.mkdir()
        made = subprocess.run([
            "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=16x12:r=24:d=1",
            "-i", design["source_audio"]["path"], "-shortest", "-c:v", "png", "-c:a", "pcm_s32le", "-y", str(media),
        ], capture_output=True, text=True, check=False)
        self.assertEqual(made.returncode, 0, made.stderr)
        animatic = {"path": "preproduction/animatic.mov", "sha256": sha256(media), "source_audio_sha256": design["source_audio"]["sha256"], "input_sha256": digests, "verdict": "pass", "reviewer_id": "reviewer", "producer_id": "producer", "evidence": "played"}
        result = self.validate_package(plan, shots, design, storyboard, manifest, review, "--stage", "animatic", "--animatic-review", self.write_json("animatic.json", animatic), "--require-ready")
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertTrue(self.response(result)["animatic_ready"])
        plan, shots, design, storyboard, _, _ = self.package()
        Path(design["source_audio"]["path"]).write_bytes(b"changed")
        result = self.validate_package(plan, shots, design, storyboard)
        self.assertEqual(result.returncode, 2)


if __name__ == "__main__":
    unittest.main()

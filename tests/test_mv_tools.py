import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
INSPECT = ROOT / ".agents/skills/road-music-mv/scripts/inspect_video.py"
AUDIT = ROOT / ".agents/skills/road-music-mv/scripts/audit_coverage.py"


def call(*arguments):
    return subprocess.run([sys.executable, str(arguments[0]), *map(str, arguments[1:])], text=True, capture_output=True, check=False)


class MusicVideoToolTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.video = self.root / "fixture.mp4"
        made = subprocess.run([
            "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=64x48:r=2:d=1",
            "-f", "lavfi", "-i", "color=c=white:s=64x48:r=2:d=1",
            "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0", "-pix_fmt", "yuv420p", "-y", str(self.video),
        ], text=True, capture_output=True, check=False)
        self.assertEqual(made.returncode, 0, made.stderr)

    def tearDown(self):
        self.temp.cleanup()

    def inspect(self, name="package", *extra):
        output = self.root / name
        result = call(INSPECT, self.video, "--output", output, *extra)
        return output, result

    def load(self, path):
        return json.loads(path.read_text(encoding="utf-8"))

    def valid_review(self, manifest, **changes):
        last = manifest["decoded_frames"] - 1
        review = {
            "source_sha256": manifest["source"]["sha256"],
            "reviewed_ranges": [{"first_frame": 0, "last_frame": last, "evidence": "all frames inspected", "note": "continuity reviewed"}],
            "shots": [{"first_frame": 0, "last_frame": last, "size": "wide", "angle": "eye", "movement": "static", "lighting": "flat", "effects": "none", "transition_in": "cut", "evidence": "visible frame evidence", "confidence": "observed"}],
            "playback_reviewed": True,
        }
        review.update(changes)
        return review

    def write_review(self, value, name="review.json"):
        path = self.root / name
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def test_extracts_indexed_pts_and_contact_sheet(self):
        output, result = self.inspect()
        self.assertEqual(result.returncode, 0, result.stderr)
        response = json.loads(result.stdout)
        self.assertTrue(response["ok"])
        manifest = self.load(output / "manifest.json")
        self.assertTrue(manifest["extraction_complete"])
        self.assertEqual(manifest["format_version"], 2)
        self.assertIn("mov", manifest["format_name"])
        self.assertEqual(len(manifest["integrity"]["frame_index_sha256"]), 64)
        self.assertEqual(manifest["decoded_frames"], 4)
        self.assertEqual(manifest["extracted_frames"], 4)
        rows = [json.loads(line) for line in (output / "frame-index.jsonl").read_text().splitlines()]
        self.assertEqual([row["frame_index"] for row in rows], [0, 1, 2, 3])
        self.assertEqual([row["pts_seconds"] for row in rows], [0.0, 0.5, 1.0, 1.5])
        self.assertTrue(all((output / row["thumbnail"]).is_file() for row in rows))
        self.assertTrue(all(len(row["thumbnail_sha256"]) == 64 for row in rows))
        self.assertTrue((output / "sheets/sheet-0000.jpg").is_file())
        self.assertEqual(self.load(output / "sheet-index.json")[0]["last_frame"], 3)
        self.assertEqual(len(self.load(output / "sheet-index.json")[0]["sha256"]), 64)
        self.assertIn("미세 VFX", (output / "index.html").read_text(encoding="utf-8"))
        self.assertTrue(any("cut_candidate" in row for row in rows))

    def test_never_clobbers_output_and_marks_limits_incomplete(self):
        output, good = self.inspect()
        self.assertEqual(good.returncode, 0, good.stderr)
        repeated = call(INSPECT, self.video, "--output", output)
        self.assertNotEqual(repeated.returncode, 0)
        self.assertIn("새 폴더", json.loads(repeated.stdout)["error"])
        limited, result = self.inspect("limited", "--max-frames", 1)
        self.assertNotEqual(result.returncode, 0)
        manifest = self.load(limited / "manifest.json")
        self.assertFalse(manifest["extraction_complete"])
        self.assertEqual(manifest["decoded_frames"], 2)  # --max-frames + one probe frame only
        self.assertEqual(manifest["extracted_frames"], 0)
        small, small_result = self.inspect("small", "--max-megabytes", "0.0001")
        self.assertNotEqual(small_result.returncode, 0)
        self.assertFalse(self.load(small / "manifest.json")["extraction_complete"])
        self.assertFalse((small / "frames").exists())
        self.assertFalse((small / "sheets").exists())
        cleaned, cleaned_result = self.inspect("clean-limit", "--width", 16, "--max-megabytes", "0.003")
        self.assertNotEqual(cleaned_result.returncode, 0)
        self.assertFalse(self.load(cleaned / "manifest.json")["extraction_complete"])
        self.assertFalse((cleaned / "frames").exists())
        self.assertFalse((cleaned / "sheets").exists())
        nan_output, nan_result = self.inspect("nan-limit", "--max-megabytes", "nan")
        self.assertNotEqual(nan_result.returncode, 0)
        self.assertIn("max-megabytes", json.loads(nan_result.stdout)["error"])
        self.assertFalse(nan_output.exists())

    def test_rejects_network_inputs(self):
        result = call(INSPECT, "https://example.invalid/video.mp4", "--output", self.root / "network")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("로컬", json.loads(result.stdout)["error"])
        self.assertFalse((self.root / "network").exists())
        playlist = self.root / "network.m3u8"
        segment = self.root / "segment.ts"
        segment.write_bytes(b"before")
        segment.write_bytes(b"tampered")
        playlist.write_text("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:1,\nsegment.ts\n#EXT-X-ENDLIST\n", encoding="utf-8")
        output = self.root / "playlist-package"
        playlist_result = call(INSPECT, playlist, "--output", output)
        self.assertNotEqual(playlist_result.returncode, 0)
        self.assertIn("[hls", self.load(output / "manifest.json")["error"])
        self.assertIn("Format not on whitelist", self.load(output / "manifest.json")["error"])
        link = self.root / "video-link.mp4"
        link.symlink_to(self.video)
        link_result = call(INSPECT, link, "--output", self.root / "symlink-package")
        self.assertNotEqual(link_result.returncode, 0)
        self.assertIn("심볼릭", json.loads(link_result.stdout)["error"])

    def test_audit_distinguishes_partial_and_complete_review(self):
        output, result = self.inspect()
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest = self.load(output / "manifest.json")
        partial = self.valid_review(manifest, reviewed_ranges=[{"first_frame": 0, "last_frame": 1, "evidence": "first two", "note": "partial"}], playback_reviewed=False)
        partial_path = self.write_review(partial)
        audit = call(AUDIT, "--manifest", output / "manifest.json", "--review", partial_path)
        self.assertEqual(audit.returncode, 0, audit.stderr)
        partial_result = json.loads(audit.stdout)
        self.assertTrue(partial_result["ok"])
        self.assertFalse(partial_result["complete"])
        self.assertEqual(partial_result["coverage"]["reviewed_missing_ranges"], [{"first_frame": 2, "last_frame": 3}])
        required = call(AUDIT, "--manifest", output / "manifest.json", "--review", partial_path, "--require-complete")
        self.assertEqual(required.returncode, 3)
        full_path = self.write_review(self.valid_review(manifest), "full.json")
        complete = call(AUDIT, "--manifest", output / "manifest.json", "--review", full_path, "--require-complete")
        self.assertEqual(complete.returncode, 0, complete.stderr)
        self.assertTrue(json.loads(complete.stdout)["complete"])

    def test_audit_rejects_hash_integer_and_overlap_errors(self):
        output, result = self.inspect()
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest = self.load(output / "manifest.json")
        bad_hash = self.valid_review(manifest, source_sha256="not-the-source")
        hash_result = call(AUDIT, "--manifest", output / "manifest.json", "--review", self.write_review(bad_hash, "hash.json"))
        self.assertEqual(hash_result.returncode, 2)
        bool_range = self.valid_review(manifest, reviewed_ranges=[{"first_frame": True, "last_frame": 3, "evidence": "x", "note": "x"}])
        integer_result = call(AUDIT, "--manifest", output / "manifest.json", "--review", self.write_review(bool_range, "integer.json"))
        self.assertEqual(integer_result.returncode, 2)
        overlapping = self.valid_review(manifest, reviewed_ranges=[
            {"first_frame": 0, "last_frame": 2, "evidence": "a", "note": "a"},
            {"first_frame": 2, "last_frame": 3, "evidence": "b", "note": "b"},
        ])
        overlap_result = call(AUDIT, "--manifest", output / "manifest.json", "--review", self.write_review(overlapping, "overlap.json"))
        self.assertEqual(overlap_result.returncode, 2)

    def test_audit_rejects_manifest_path_escape_and_source_change(self):
        output, result = self.inspect()
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest = self.load(output / "manifest.json")
        index_path = output / "frame-index.jsonl"
        rows = [json.loads(line) for line in index_path.read_text().splitlines()]
        rows[0]["thumbnail"] = "../fixture.mp4"
        index_path.write_text("\n".join(json.dumps(row) for row in rows) + "\n", encoding="utf-8")
        escaped = call(AUDIT, "--manifest", output / "manifest.json", "--review", self.write_review(self.valid_review(manifest), "escape.json"))
        self.assertEqual(escaped.returncode, 2)
        # Restore index, then prove the audit binds review to the unchanged source bytes.
        output2, result2 = self.inspect("package2")
        self.assertEqual(result2.returncode, 0, result2.stderr)
        manifest2 = self.load(output2 / "manifest.json")
        with self.video.open("ab") as changed:
            changed.write(b"changed")
        changed_result = call(AUDIT, "--manifest", output2 / "manifest.json", "--review", self.write_review(self.valid_review(manifest2), "changed.json"))
        self.assertEqual(changed_result.returncode, 2)

    def test_audit_requires_usable_unique_monotonic_pts_for_completion(self):
        output, result = self.inspect()
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest = self.load(output / "manifest.json")
        review = self.write_review(self.valid_review(manifest), "pts.json")
        index_path = output / "frame-index.jsonl"
        rows = [json.loads(line) for line in index_path.read_text().splitlines()]
        rows[1]["pts_seconds"] = None
        index_path.write_text("\n".join(json.dumps(row) for row in rows) + "\n", encoding="utf-8")
        missing_pts = call(AUDIT, "--manifest", output / "manifest.json", "--review", review, "--require-complete")
        self.assertEqual(missing_pts.returncode, 2)
        self.assertIn("frame_index_sha256", json.loads(missing_pts.stdout)["error"])
        rows[1]["pts_seconds"] = -1.0
        index_path.write_text("\n".join(json.dumps(row) for row in rows) + "\n", encoding="utf-8")
        bad_order = call(AUDIT, "--manifest", output / "manifest.json", "--review", review)
        self.assertEqual(bad_order.returncode, 2)
        rows[1]["pts_seconds"] = 0.5
        rows[1]["thumbnail"] = rows[0]["thumbnail"]
        index_path.write_text("\n".join(json.dumps(row) for row in rows) + "\n", encoding="utf-8")
        duplicate_thumbnail = call(AUDIT, "--manifest", output / "manifest.json", "--review", review)
        self.assertEqual(duplicate_thumbnail.returncode, 2)
        rows[1]["thumbnail"] = "frames/frame-00000001.jpg"
        rows[1]["pts_seconds"] = float("nan")
        index_path.write_text("\n".join(json.dumps(row) for row in rows) + "\n", encoding="utf-8")
        non_finite = call(AUDIT, "--manifest", output / "manifest.json", "--review", review)
        self.assertEqual(non_finite.returncode, 2)
        index_path.write_text("[]\n", encoding="utf-8")
        non_object = call(AUDIT, "--manifest", output / "manifest.json", "--review", review)
        self.assertEqual(non_object.returncode, 2)

    def test_audit_rejects_thumbnail_and_sheet_tampering(self):
        output, result = self.inspect()
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest = self.load(output / "manifest.json")
        review = self.write_review(self.valid_review(manifest), "tamper.json")
        (output / "frames/frame-00000000.jpg").write_text("not a JPEG", encoding="utf-8")
        frame_tamper = call(AUDIT, "--manifest", output / "manifest.json", "--review", review)
        self.assertEqual(frame_tamper.returncode, 2)
        output2, result2 = self.inspect("sheets")
        self.assertEqual(result2.returncode, 0, result2.stderr)
        manifest2 = self.load(output2 / "manifest.json")
        (output2 / "sheets/sheet-0000.jpg").unlink()
        sheet_tamper = call(AUDIT, "--manifest", output2 / "manifest.json", "--review", self.write_review(self.valid_review(manifest2), "sheet.json"))
        self.assertEqual(sheet_tamper.returncode, 2)

    def test_invalid_arguments_return_json(self):
        result = call(INSPECT, self.video)
        self.assertEqual(result.returncode, 2)
        self.assertTrue(json.loads(result.stdout)["error"])
        self.assertEqual(result.stderr, "")

    def test_audit_rejects_legacy_manifest_without_integrity(self):
        output, result = self.inspect()
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest_path = output / "manifest.json"
        manifest = self.load(manifest_path)
        manifest.pop("integrity")
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        legacy = call(AUDIT, "--manifest", manifest_path, "--review", self.write_review(self.valid_review(manifest), "legacy.json"))
        self.assertEqual(legacy.returncode, 2)
        self.assertIn("legacy manifest", json.loads(legacy.stdout)["error"])


if __name__ == "__main__":
    unittest.main()

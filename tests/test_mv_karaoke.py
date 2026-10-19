import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
RENDERER = ROOT / ".agents/skills/road-music-mv/scripts/render_karaoke.py"
PYTHON = "/Users/freelife/.local/share/roadmusic-ltx23/src/.venv/bin/python"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class KaraokeRendererTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.lyrics = self.root / "lyrics.txt"
        self.lyrics.write_text("hello world\n안녕 세상\n", encoding="utf-8")
        self.audio, self.video = self.root / "audio.flac", self.root / "video.mov"
        for args in (("-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1", "-c:a", "flac", str(self.audio)), ("-f", "lavfi", "-i", "color=c=black:s=1920x1080:r=24:d=1", "-c:v", "prores_ks", "-profile:v", "3", str(self.video))):
            made = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", *args], capture_output=True, text=True)
            self.assertEqual(made.returncode, 0, made.stderr)

    def tearDown(self):
        self.temp.cleanup()

    def timings(self):
        return {"schema_version": 1, "source_audio": {"path": str(self.audio), "sha256": sha(self.audio)}, "source_lyrics": {"path": str(self.lyrics), "sha256": sha(self.lyrics)}, "timing_provenance": {"origin": "source-audio-start", "unit": "seconds", "alignment_complete": True, "unresolved_words": []}, "lines": [{"source_line": 1, "text": "hello world", "start": 0.1, "end": 0.45, "words": [{"start_char": 0, "end_char": 5, "text": "hello", "start": 0.1, "end": 0.25}, {"start_char": 6, "end_char": 11, "text": "world", "start": 0.25, "end": 0.45}]}, {"source_line": 2, "text": "안녕 세상", "start": 0.5, "end": 0.9, "words": [{"start_char": 0, "end_char": 2, "text": "안녕", "start": 0.5, "end": 0.7}, {"start_char": 3, "end_char": 5, "text": "세상", "start": 0.7, "end": 0.9}]}]}

    def call(self, data, name="result"):
        timing = self.root / f"{name}.json"
        timing.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        return subprocess.run([PYTHON, str(RENDERER), "--timings", str(timing), "--video", str(self.video), "--output-dir", str(self.root / name)], capture_output=True, text=True)

    def test_rejects_bad_hash_span_and_word_order(self):
        for index, mutate in enumerate((lambda x: x["source_audio"].update(sha256="0" * 64), lambda x: x["lines"][0]["words"][0].update(end_char=4), lambda x: x["lines"][0]["words"][1].update(start=0.2), lambda x: x["lines"][1].update(end=1.2))):
            data = self.timings(); mutate(data)
            result = self.call(data, f"bad-{index}")
            self.assertEqual(result.returncode, 2)
            self.assertFalse(json.loads(result.stdout)["ok"])

    def test_renders_synthetic_geometry_and_refuses_overwrite(self):
        result = self.call(self.timings())
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest = json.loads((self.root / "result/manifest.json").read_text())
        self.assertEqual(manifest["raw_rgba_strip"], {"width": 1920, "height": 140, "bytes": 24 * 1920 * 140 * 4})
        self.assertEqual(manifest["master"]["audio_pcm_s32le"]["sample_count"], 48000)
        self.assertEqual(len(manifest["inputs"]["timings_sha256"]), 64)
        self.assertEqual(len(manifest["master"]["sha256"]), 64)
        self.assertIn("overlay", " ".join(manifest["master"]["ffmpeg_argv"]))
        self.assertTrue((self.root / "result/captioned-master.mov").is_file())
        self.assertTrue((self.root / "result/captioned-browser-proxy-aac.mp4").is_file())
        repeated = self.call(self.timings())
        self.assertEqual(repeated.returncode, 2)

    def test_active_word_reset_preserves_whitespace_and_korean_geometry(self):
        source = f'''import importlib.util
from PIL import ImageDraw, ImageFont
spec=importlib.util.spec_from_file_location("renderer", {str(RENDERER)!r})
renderer=importlib.util.module_from_spec(spec); spec.loader.exec_module(renderer)
font=ImageFont.truetype(renderer.FONT_PATH, 60, index=6)
text="  가  나"
line={{"text":text,"start":0.0,"end":0.6,"words":[{{"start_char":2,"end_char":3,"start":0.0,"end":0.2}},{{"start_char":5,"end_char":6,"start":0.2,"end":0.4}}]}}
gold=(246,196,109,255)
def gold_box(image):
 xs=[]; ys=[]
 for y in range(image.height):
  for x in range(image.width):
   if image.getpixel((x,y)) == gold: xs.append(x); ys.append(y)
 return (min(xs),min(ys),max(xs),max(ys)) if xs else None
first=renderer.overlay_frame([line],0.1,font); second=renderer.overlay_frame([line],0.3,font); blank=renderer.overlay_frame([line],0.5,font)
first_box,second_box=gold_box(first),gold_box(second)
draw=ImageDraw.Draw(first); origin=(renderer.WIDTH-draw.textlength(text,font=font))/2
expected_gap=draw.textlength(text[:5],font=font)-draw.textlength(text[:2],font=font)
assert first_box and second_box and first_box[0] < second_box[0]
assert abs((second_box[0]-first_box[0])-expected_gap) < 8
assert any(first.getpixel((x,92)) == gold for x in range(renderer.WIDTH))
assert any(second.getpixel((x,92)) == gold for x in range(renderer.WIDTH))
assert gold_box(blank) is None
assert origin >= 0 and second_box[2] < renderer.WIDTH and first_box[1] >= 0 and second_box[3] < renderer.STRIP_HEIGHT
print("ok")
'''
        result = subprocess.run([PYTHON, "-c", source], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "ok")


if __name__ == "__main__":
    unittest.main()

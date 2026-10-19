#!/usr/bin/env python3
"""Render validated word-timed karaoke captions over a 1920x1080/24fps master."""
import argparse
import hashlib
import json
import math
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT, FPS, STRIP_HEIGHT = 1920, 1080, 24, 140
FONT_PATH = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
WORD_RE = re.compile(r"\S+")


class ContractError(ValueError):
    pass


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fail(message):
    raise ContractError(message)


def finite(value, field):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        fail(f"{field} must be finite")
    return float(value)


def command_json(*args):
    result = subprocess.run(args, capture_output=True, text=True, check=False)
    if result.returncode:
        fail(result.stderr.strip() or "ffprobe failed")
    return json.loads(result.stdout)


def video_info(path):
    data = command_json("ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=width,height,avg_frame_rate,nb_read_frames", "-of", "json", str(path))
    stream = data.get("streams", [{}])[0]
    frames = stream.get("nb_read_frames")
    if stream.get("width") != WIDTH or stream.get("height") != HEIGHT or stream.get("avg_frame_rate") != "24/1" or not isinstance(frames, str) or not frames.isdigit() or int(frames) <= 0:
        fail("video must be 1920x1080 CFR 24fps with a complete frame count")
    timestamps = command_json("ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", str(path)).get("frames", [])
    pts = [float(frame["best_effort_timestamp_time"]) for frame in timestamps]
    if len(pts) != int(frames) or abs(pts[0]) > 1e-6 or any(abs((right - left) - 1 / FPS) > 1e-6 for left, right in zip(pts, pts[1:])):
        fail("video must start at PTS 0 and remain CFR 24fps")
    return int(frames)


def pcm_info(path):
    data = command_json("ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate,channels", "-of", "json", str(path))
    stream = data.get("streams", [{}])[0]
    try:
        rate, channels = int(stream["sample_rate"]), int(stream["channels"])
    except (KeyError, TypeError, ValueError):
        fail("audio stream is missing sample rate or channels")
    process = subprocess.Popen(["ffmpeg", "-nostdin", "-v", "error", "-i", str(path), "-map", "0:a:0", "-c:a", "pcm_s32le", "-f", "s32le", "pipe:1"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    digest, count = hashlib.sha256(), 0
    while chunk := process.stdout.read(1024 * 1024):
        digest.update(chunk)
        count += len(chunk)
    stderr = process.stderr.read().decode("utf-8", "replace")
    if process.wait() or count % (channels * 4):
        fail(stderr.strip() or "PCM decode failed")
    return {"pcm_s32le_sha256": digest.hexdigest(), "sample_rate": rate, "channels": channels, "sample_count": count // (channels * 4)}


def validate_timings(value, audio_duration):
    for key in ("source_audio", "source_lyrics", "timing_provenance", "lines"):
        if key not in value:
            fail(f"timings.{key} is required")
    audio, lyrics, provenance = value["source_audio"], value["source_lyrics"], value["timing_provenance"]
    for item, name in ((audio, "source_audio"), (lyrics, "source_lyrics")):
        if not isinstance(item, dict) or not Path(item.get("path", "")).is_absolute() or len(item.get("sha256", "")) != 64:
            fail(f"timings.{name} requires absolute path and SHA256")
    if provenance.get("alignment_complete") is not True or provenance.get("unresolved_words") != [] or provenance.get("origin") != "source-audio-start" or provenance.get("unit") != "seconds":
        fail("timing provenance is incomplete")
    lyric_path = Path(lyrics["path"])
    if not lyric_path.is_file() or sha256(lyric_path) != lyrics["sha256"]:
        fail("source lyrics SHA mismatch")
    source = [(index, text) for index, text in enumerate(lyric_path.read_text(encoding="utf-8").splitlines(), 1) if text.strip() and not re.fullmatch(r"\s*\[[^\]]+\]\s*", text)]
    lines = value["lines"]
    if not isinstance(lines, list) or len(lines) != len(source):
        fail("timings must cover every nonblank non-section source line exactly once")
    previous_end = 0.0
    for expected, line in zip(source, lines):
        if line.get("source_line") != expected[0] or line.get("text") != expected[1]:
            fail("timings source lines must preserve exact original order and text")
        start, end = finite(line.get("start"), "line.start"), finite(line.get("end"), "line.end")
        if start < previous_end or end <= start or end > audio_duration:
            fail("line timings must be ordered, nonoverlapping, and positive")
        spans = [(match.start(), match.end(), match.group()) for match in WORD_RE.finditer(expected[1])]
        words = line.get("words")
        if not isinstance(words, list) or len(words) != len(spans):
            fail("words must exactly cover regex non-whitespace spans")
        word_end = start
        for expected_span, word in zip(spans, words):
            if (word.get("start_char"), word.get("end_char"), word.get("text")) != expected_span:
                fail("word span or text differs from original lyric")
            word_start, word_finish = finite(word.get("start"), "word.start"), finite(word.get("end"), "word.end")
            if word_start < word_end or word_finish <= word_start or word_start < start or word_finish > end or word_finish > audio_duration:
                fail("word timings must be ordered inside their source line")
            word_end = word_finish
        previous_end = end
    return lines


def overlay_frame(lines, seconds, font):
    active = next((line for line in lines if line["start"] <= seconds < line["end"]), None)
    image = Image.new("RGBA", (WIDTH, STRIP_HEIGHT), (0, 0, 0, 0))
    if active is None:
        return image
    draw, y = ImageDraw.Draw(image), 24
    text_width = draw.textlength(active["text"], font=font)
    if text_width > WIDTH - 200:
        fail("source lyric line exceeds the safe top strip; do not rewrite it")
    x = (WIDTH - text_width) / 2
    draw.rounded_rectangle((70, 14, WIDTH - 70, 124), radius=28, fill=(24, 24, 24, 190))
    draw.text((x, y), active["text"], font=font, fill="white")
    for word in active["words"]:
        if word["start"] <= seconds < word["end"]:
            left = x + draw.textlength(active["text"][:word["start_char"]], font=font)
            width = draw.textlength(active["text"][word["start_char"]:word["end_char"]], font=font)
            draw.text((left, y), active["text"][word["start_char"]:word["end_char"]], font=font, fill="#F6C46D")
            draw.line((left, 92, left + width, 92), fill="#F6C46D", width=4)
    return image


def render(lines, video, audio, output):
    frame_count = video_info(video)
    output.mkdir(parents=True)
    master, proxy = output / "captioned-master.mov", output / "captioned-browser-proxy-aac.mp4"
    font = ImageFont.truetype(FONT_PATH, 60, index=6)
    command = ["ffmpeg", "-nostdin", "-v", "error", "-n", "-i", str(video), "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", f"{WIDTH}x{STRIP_HEIGHT}", "-framerate", "24", "-i", "pipe:0", "-i", str(audio), "-filter_complex", "[0:v][1:v]overlay=0:0:alpha=straight:eof_action=pass:repeatlast=0:shortest=0[v]", "-map", "[v]", "-map", "2:a:0", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "pcm_s32le", str(master)]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    written = 0
    try:
        for frame in range(frame_count):
            raw = overlay_frame(lines, frame / FPS, font).tobytes()
            process.stdin.write(raw)
            written += len(raw)
        process.stdin.close()
    except BrokenPipeError:
        if process.stdin and not process.stdin.closed:
            process.stdin.close()
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill(); process.wait()
        fail("FFmpeg caption pipe closed early")
    stderr = process.stderr.read().decode("utf-8", "replace")
    if written != frame_count * WIDTH * STRIP_HEIGHT * 4 or process.wait() or not master.is_file():
        fail(stderr.strip() or "FFmpeg master render failed")
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-n", "-i", str(master), "-c:v", "copy", "-c:a", "aac", str(proxy)], check=True, capture_output=True, text=True)
    if video_info(master) != frame_count:
        fail("captioned master frame count differs from clean video")
    if video_info(proxy) != frame_count or pcm_info(proxy)["sample_count"] <= 0:
        fail("browser proxy did not fully decode")
    source_pcm, master_pcm = pcm_info(audio), pcm_info(master)
    if source_pcm != master_pcm:
        fail("captioned master PCM differs from original source audio")
    return master, proxy, source_pcm, command, written


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--timings", required=True, type=Path)
    parser.add_argument("--video", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    try:
        if args.output_dir.exists():
            fail("output directory must not already exist")
        data = json.loads(args.timings.read_text(encoding="utf-8"))
        source_pcm = pcm_info(Path(data["source_audio"]["path"]))
        lines = validate_timings(data, source_pcm["sample_count"] / source_pcm["sample_rate"])
        audio = Path(data["source_audio"]["path"])
        if not audio.is_file() or sha256(audio) != data["source_audio"]["sha256"]:
            fail("source audio SHA mismatch")
        if abs(video_info(args.video) / FPS - source_pcm["sample_count"] / source_pcm["sample_rate"]) > 1 / FPS:
            fail("video and original audio durations differ by more than one frame")
        master, proxy, pcm, argv, raw_bytes = render(lines, args.video, audio, args.output_dir)
        (args.output_dir / "manifest.json").write_text(json.dumps({"schema_version": 1, "source_audio": data["source_audio"], "source_lyrics": data["source_lyrics"], "inputs": {"timings_sha256": sha256(args.timings), "video_path": str(args.video), "video_sha256": sha256(args.video)}, "word_fill_semantics": "whole-word gold highlight and underline only; no intra-word timing claim", "raw_rgba_strip": {"width": WIDTH, "height": STRIP_HEIGHT, "bytes": raw_bytes}, "master": {"path": str(master), "sha256": sha256(master), "audio_pcm_s32le": pcm, "ffmpeg_argv": argv}, "browser_proxy": {"path": str(proxy), "sha256": sha256(proxy), "audio": "AAC lossy proxy; video stream copied from master"}}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"ok": True, "master": str(master), "proxy": str(proxy), "pcm": pcm}))
    except (ContractError, OSError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        raise SystemExit(2)


if __name__ == "__main__":
    main()

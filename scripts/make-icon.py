"""Make the app icons from one square artwork (1024px or larger, full-bleed, no rounded corners).

    uv run --no-project --with pillow python scripts/make-icon.py <artwork.png>

build/icon.png  — 1024 full-bleed square; the app rounds it with CSS (header logo, About).
build/icon.icns — Apple's icon grid: 824px rounded body on a 1024 canvas, transparent margin,
                  soft shadow, so it sits right beside other icons in the Dock and Finder.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

if len(sys.argv) != 2:
    sys.exit(__doc__)

BUILD = Path(__file__).resolve().parent.parent / "build"
CANVAS, BODY, RADIUS, SUPERSAMPLE = 1024, 824, 185, 4

art = Image.open(sys.argv[1]).convert("RGBA")
art.resize((CANVAS, CANVAS), Image.LANCZOS).save(BUILD / "icon.png")

mask = Image.new("L", (BODY * SUPERSAMPLE,) * 2, 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, BODY * SUPERSAMPLE - 1, BODY * SUPERSAMPLE - 1),
                                       RADIUS * SUPERSAMPLE, fill=255)
mask = mask.resize((BODY, BODY), Image.LANCZOS)
body = art.resize((BODY, BODY), Image.LANCZOS)
body.putalpha(mask)

margin = (CANVAS - BODY) // 2
shadow_alpha = Image.new("L", (CANVAS, CANVAS), 0)
shadow_alpha.paste(mask.point(lambda a: int(a * 0.35)), (margin, margin + 10))
icon = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
icon.putalpha(shadow_alpha.filter(ImageFilter.GaussianBlur(12)))
icon.alpha_composite(body, (margin, margin))
assert icon.getpixel((5, 5))[3] == 0 and icon.getpixel((CANVAS // 2, CANVAS // 2))[3] == 255

with tempfile.TemporaryDirectory() as tmp:
    iconset = Path(tmp) / "icon.iconset"
    iconset.mkdir()
    for size in (16, 32, 128, 256, 512):
        icon.resize((size, size), Image.LANCZOS).save(iconset / f"icon_{size}x{size}.png")
        icon.resize((size * 2, size * 2), Image.LANCZOS).save(iconset / f"icon_{size}x{size}@2x.png")
    subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(BUILD / "icon.icns")], check=True)
print("wrote", BUILD / "icon.png", "and", BUILD / "icon.icns")

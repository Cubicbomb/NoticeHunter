#!/usr/bin/env python3
"""Small reticle mark used at the top-left of the slide."""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).with_name("assets") / "mark.png"
S = 512
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
cx = cy = S // 2

cyan = (96, 205, 255, 235)
white = (235, 246, 255, 245)

# Outer ring
r = 142
d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=cyan, width=11)
# Inner ring
r = 48
d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(96, 205, 255, 150), width=7)
# Center dot
r = 14
d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=white)
# Cardinal ticks
for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
    d.line(
        [(cx + dx * 164, cy + dy * 164), (cx + dx * 228, cy + dy * 228)],
        fill=cyan,
        width=12,
    )
# A small document notch in the lower-right, so it reads as a *notice* hunter.
notch = [(268, 268), (370, 268), (402, 300), (402, 402), (268, 402)]
d.line(notch + [notch[0]], fill=white, width=8, joint="curve")
d.line([(370, 268), (370, 300), (402, 300)], fill=white, width=8)
for y in (328, 354):
    d.line([(290, y), (360, y)], fill=(235, 246, 255, 190), width=6)

img.save(OUT, "PNG", optimize=True)
print(f"wrote {OUT}")

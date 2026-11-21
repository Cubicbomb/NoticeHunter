#!/usr/bin/env python3
"""Generate the single-slide background for the NoticeHunter video intro.

Runs with Pillow only. The resulting PNG is a design asset, not content:
all copy and UI cards stay editable in the PPTX.
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).with_name("assets") / "bg.png"
W, H = 2560, 1440


def mix(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(round(c1[i] + (c2[i] - c1[i]) * t)) for i in range(3))


def build_base() -> Image.Image:
    # Almost-black navy field, colder toward the lower right.
    top_left = (6, 11, 21)
    bottom_right = (9, 22, 40)
    img = Image.new("RGB", (W, H), top_left)
    px = img.load()
    for y in range(H):
        ty = y / H
        for x in range(W):
            t = (x / W) * 0.72 + ty * 0.28
            px[x, y] = mix(top_left, bottom_right, t * 0.72)
    return img


def add_grid(img: Image.Image) -> Image.Image:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    step = 42
    major = step * 6
    for x in range(0, W + 1, step):
        alpha = 15 if x % major else 23
        d.line([(x, 0), (x, H)], fill=(110, 158, 218, alpha), width=1)
    for y in range(0, H + 1, step):
        alpha = 15 if y % major else 23
        d.line([(0, y), (W, y)], fill=(110, 158, 218, alpha), width=1)
    out = img.convert("RGBA")
    out.alpha_composite(layer)
    return out.convert("RGB")


def add_glow(img: Image.Image) -> Image.Image:
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    # One restrained blue wash behind the product panel.
    cx, cy, r = int(W * 0.75), int(H * 0.49), int(W * 0.33)
    for i in range(26, 0, -1):
        t = i / 26
        rr = int(r * t)
        alpha = int(7 * (1 - t) ** 1.7)
        gd.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(15, 62, 128, alpha))
    # A barely-there warm counterpoint at the lower left.
    cx, cy, r = int(W * 0.06), int(H * 0.98), int(W * 0.18)
    for i in range(16, 0, -1):
        t = i / 16
        rr = int(r * t)
        alpha = int(2 * (1 - t) ** 2)
        gd.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(170, 100, 30, alpha))
    glow = glow.filter(ImageFilter.GaussianBlur(110))
    return Image.blend(img, glow, 0.30)


def add_reticle(img: Image.Image) -> Image.Image:
    """Faint targeting rings at the right: 'hunter' without a literal icon."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = int(W * 0.815), int(H * 0.50)
    for r, alpha in ((560, 20), (700, 13), (980, 9)):
        rr = int(r * 0.78)
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=(96, 156, 226, alpha), width=1)
    r = int(560 * 0.78)
    tick = 22
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        d.line(
            [(cx + dx * r, cy + dy * r), (cx + dx * (r + tick), cy + dy * (r + tick))],
            fill=(115, 172, 240, 34),
            width=1,
        )
    out = img.convert("RGBA")
    out.alpha_composite(layer)
    return out.convert("RGB")


def add_vignette_and_grain(img: Image.Image) -> Image.Image:
    # Vignette: the eye should go to the title and panel, not the corners.
    mask = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(mask)
    cx, cy = W // 2, H // 2
    max_r = math.hypot(cx, cy)
    for r in range(0, int(max_r), 3):
        a = int(150 * (r / max_r) ** 2.6)
        md.ellipse([cx - r, cy - r, cx + r, cy + r], outline=a, width=3)
    black = Image.new("RGB", (W, H), (2, 5, 10))
    img = Image.composite(black, img, mask.point(lambda v: int(v * 0.48)))

    # Very light grain prevents gradient banding on video projectors.
    grain = Image.effect_noise((W, H), 3).convert("L")
    grain = grain.filter(ImageFilter.GaussianBlur(0.35))
    grain_rgb = Image.merge("RGB", (grain, grain, grain))
    return Image.blend(img, grain_rgb, 0.010)


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img = build_base()
    img = add_grid(img)
    img = add_glow(img)
    img = add_reticle(img)
    img = add_vignette_and_grain(img)
    img.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KiB)")


if __name__ == "__main__":
    main()

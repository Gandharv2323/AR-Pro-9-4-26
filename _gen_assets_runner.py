"""
_gen_assets_runner.py — Standalone asset generator that runs WITHOUT the full Zyro
stack (no config.py / dotenv needed). Run directly:

    python zyro\_gen_assets_runner.py

Produces the full RGBA PNG asset suite into zyro/assets/.
"""
from __future__ import annotations

import math
import os
from pathlib import Path
from PIL import Image, ImageDraw


# ── Output directories (resolved relative to this file) ────────────────────
BASE = Path(__file__).parent / "zyro" / "assets"
G = BASE / "glasses"
S = BASE / "shirts"
A = BASE / "accessories"
for d in (G, S, A):
    d.mkdir(parents=True, exist_ok=True)


def _save(img: Image.Image, path: Path) -> None:
    img.save(path, "PNG")
    kb = path.stat().st_size / 1024
    print(f"  OK  {path.relative_to(BASE.parent.parent)}  [{img.size[0]}×{img.size[1]}]  {img.mode}  {kb:.1f} KB")


# ── GLASSES ─────────────────────────────────────────────────────────────────

def _glasses_01() -> Image.Image:
    """Classic dark-gray rectangle frames."""
    W, H = 600, 200
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    lx, rx = 145, 455
    cy, lw, lh = 100, 95, 52
    fill = (40, 40, 40, 90)
    rim  = (30, 30, 30, 230)
    d.rounded_rectangle([lx-lw, cy-lh, lx+lw, cy+lh], radius=16, fill=fill, outline=rim, width=7)
    d.rounded_rectangle([rx-lw, cy-lh, rx+lw, cy+lh], radius=16, fill=fill, outline=rim, width=7)
    d.line([(lx+lw, cy), (rx-lw, cy)], fill=rim, width=6)
    d.line([(lx-lw, cy-4), (10, cy-28)], fill=rim, width=5)
    d.line([(rx+lw, cy-4), (W-10, cy-28)], fill=rim, width=5)
    return img


def _glasses_02() -> Image.Image:
    """Round cobalt-blue frames."""
    W, H = 600, 220
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    lx, rx, cy, r = 150, 450, 110, 78
    fill = (30, 80, 200, 80)
    rim  = (20, 60, 180, 230)
    d.ellipse([lx-r, cy-r, lx+r, cy+r], fill=fill, outline=rim, width=7)
    d.ellipse([rx-r, cy-r, rx+r, cy+r], fill=fill, outline=rim, width=7)
    d.line([(lx+r, cy), (rx-r, cy)], fill=rim, width=6)
    d.line([(lx-r, cy), (10, cy-18)], fill=rim, width=5)
    d.line([(rx+r, cy), (W-10, cy-18)], fill=rim, width=5)
    return img


def _glasses_03() -> Image.Image:
    """Aviator — teardrop, gold."""
    W, H = 620, 230
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cy = 105
    rim  = (180, 140, 30, 240)
    fill = (120, 180, 120, 70)
    d.ellipse([ 30, cy-60,  230, cy+90], fill=fill, outline=rim, width=6)
    d.ellipse([390, cy-60,  590, cy+90], fill=fill, outline=rim, width=6)
    d.line([(230, cy-10), (390, cy-10)], fill=rim, width=6)
    d.ellipse([295, cy-22, 325, cy+2], fill=rim)
    d.line([( 30, cy-40), (  5, cy-55)], fill=rim, width=5)
    d.line([(590, cy-40), (615, cy-55)], fill=rim, width=5)
    return img


def _glasses_04() -> Image.Image:
    """Thick black wayfarer frames."""
    W, H = 600, 200
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rim  = (10, 10, 10, 255)
    fill = (20, 20, 20, 110)
    def lens(cx: int, cy: int, w: int, h: int) -> None:
        hw_, hh_ = w//2, h//2
        pts = [
            (cx - hw_, cy + hh_),
            (cx + hw_, cy + hh_),
            (cx + hw_ - 10, cy - hh_),
            (cx - hw_ + 10, cy - hh_),
        ]
        d.polygon(pts, fill=fill, outline=rim)
        for i in range(4):
            d.line([pts[i], pts[(i+1)%4]], fill=rim, width=10)
    lens(150, 105, 200, 100)
    lens(450, 105, 200, 100)
    d.line([(250, 105), (350, 105)], fill=rim, width=10)
    d.line([( 50, 105), (  8,  80)], fill=rim, width=9)
    d.line([(550, 105), (592,  80)], fill=rim, width=9)
    return img


def _glasses_05() -> Image.Image:
    """Thin gold wire frames."""
    W, H = 600, 180
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    gold = (218, 165, 32, 230)
    tint = (255, 215,  0,  30)
    d.ellipse([ 50, 50, 230, 140], fill=tint, outline=gold, width=3)
    d.ellipse([370, 50, 550, 140], fill=tint, outline=gold, width=3)
    d.line([(230, 95), (370, 95)], fill=gold, width=3)
    d.line([( 50, 90), (  5, 75)], fill=gold, width=3)
    d.line([(550, 90), (595, 75)], fill=gold, width=3)
    return img


# ── SHIRTS ──────────────────────────────────────────────────────────────────

def _shirt_poly(W: int = 800, H: int = 900, sy: int = 180) -> list:
    """T-shirt silhouette polygon. sy = shoulder_y. Span x=130..670 (~540px)."""
    hw = W // 2
    nw = 80  # half-neckline width
    return [
        # Left side: neckline → sleeve → armpit → hem
        (hw - nw, sy - 70),   # neck-left-top
        (30,      sy - 60),   # left shoulder outer
        (0,       sy + 100),  # left sleeve cuff
        (130,     sy + 120),  # left armpit
        (110,     H  -  40),  # left hem
        # Hem → right side
        (W - 110, H  -  40),  # right hem
        (W - 130, sy + 120),  # right armpit
        (W,       sy + 100),  # right sleeve cuff
        (W - 30,  sy - 60),   # right shoulder outer
        (hw + nw, sy - 70),   # neck-right-top
        # Crew-neck curve (3 extra points)
        (hw + 55, sy - 20),
        (hw,      sy),
        (hw - 55, sy - 20),
    ]


def _shirt_01() -> Image.Image:
    """White T-shirt with chest pocket."""
    W, H = 800, 900
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d   = ImageDraw.Draw(img)
    poly = _shirt_poly(W, H)
    body = (255, 255, 255, 225)
    rim  = ( 51,  51,  51, 235)
    d.polygon(poly, fill=body, outline=rim)
    for i in range(len(poly)):
        d.line([poly[i], poly[(i+1) % len(poly)]], fill=rim, width=3)
    # Chest pocket
    px, py = 180, 265
    d.rectangle([px, py, px+80, py+60], fill=(235, 235, 235, 210), outline=rim, width=2)
    # Pocket lip stitch line
    d.line([(px, py+8), (px+80, py+8)], fill=rim, width=1)
    return img


def _shirt_02() -> Image.Image:
    """Navy polo with collar + placket."""
    W, H = 800, 900
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d   = ImageDraw.Draw(img)
    poly  = _shirt_poly(W, H)
    body  = ( 27,  58, 107, 225)
    rim   = ( 15,  30,  60, 240)
    collar_fill = ( 40,  80, 150, 235)
    d.polygon(poly, fill=body, outline=rim)
    for i in range(len(poly)):
        d.line([poly[i], poly[(i+1) % len(poly)]], fill=rim, width=3)
    hw = W // 2
    # Collar tabs
    d.polygon([
        (hw-60, 110), (hw-10, 180), (hw, 195), (hw+10, 180), (hw+60, 110)
    ], fill=collar_fill, outline=rim)
    # Placket strip
    d.rectangle([hw-12, 195, hw+12, 355], fill=collar_fill, outline=rim, width=2)
    # Three buttons
    for by in [220, 268, 316]:
        d.ellipse([hw-7, by-7, hw+7, by+7], fill=(200, 210, 230, 255))
    return img


def _shirt_03() -> Image.Image:
    """Black hoodie with hood + kangaroo pocket."""
    W, H = 800, 900
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d   = ImageDraw.Draw(img)
    poly = _shirt_poly(W, H)
    body = ( 26,  26,  26, 230)
    rim  = ( 65,  65,  65, 245)
    hw   = W // 2
    sy   = 180
    d.polygon(poly, fill=body, outline=rim)
    for i in range(len(poly)):
        d.line([poly[i], poly[(i+1) % len(poly)]], fill=rim, width=3)
    # Hood
    hood = (35, 35, 35, 235)
    d.polygon([
        (120,    sy -  60),
        (hw - 90, sy - 200),
        (hw,      sy - 245),
        (hw + 90, sy - 200),
        (W - 120, sy -  60),
        (hw +  80, sy -  70),
        (hw,       sy -  20),
        (hw -  80, sy -  70),
    ], fill=hood, outline=rim)
    # Drawstrings
    dc = (85, 85, 85, 210)
    d.line([(hw-20, sy-28), (hw-26, sy+82)], fill=dc, width=3)
    d.line([(hw+20, sy-28), (hw+26, sy+82)], fill=dc, width=3)
    d.ellipse([hw-30, sy+80, hw-18, sy+92], fill=dc)
    d.ellipse([hw+18, sy+80, hw+30, sy+92], fill=dc)
    # Kangaroo pocket
    kx, ky = hw - 125, 580
    d.rectangle([kx, ky, kx+250, ky+125], fill=(42, 42, 42, 215), outline=rim, width=2)
    # Centre seam line
    d.line([(hw, ky), (hw, ky+125)], fill=rim, width=1)
    return img


# ── EARRINGS ────────────────────────────────────────────────────────────────

def _earrings_01() -> Image.Image:
    """Gold hoop pair."""
    W, H = 200, 400
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d   = ImageDraw.Draw(img)
    gold = (255, 215, 0, 235)
    for cx in (40, 160):
        r = 40
        cy = H // 2
        d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(255, 215, 0, 60), outline=gold, width=6)
    return img


def _earrings_02() -> Image.Image:
    """Silver teardrop drops."""
    W, H = 200, 400
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d   = ImageDraw.Draw(img)
    silver = (192, 192, 192, 235)
    for cx in (40, 160):
        cy = H // 2
        d.arc([cx-14, cy-82, cx+14, cy-42], start=0, end=180, fill=silver, width=4)
        d.line([(cx, cy-42), (cx, cy-12)], fill=silver, width=3)
        d.ellipse([cx-20, cy-12, cx+20, cy+52], fill=(192, 192, 192, 190), outline=silver, width=3)
    return img


def _earrings_03() -> Image.Image:
    """Pearl studs."""
    W, H = 200, 400
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d   = ImageDraw.Draw(img)
    pearl = (245, 245, 245, 240)
    shine = (255, 255, 255, 210)
    for cx in (40, 160):
        cy = H // 2
        r  = 22
        d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=pearl)
        d.ellipse([cx-r+5, cy-r+4, cx-r+13, cy-r+12], fill=shine)
    return img


# ── MAIN ─────────────────────────────────────────────────────────────────────

ASSETS = [
    # (generator, output_path, min_kb)
    (_glasses_01, G / "glasses_01.png", 1.0),
    (_glasses_02, G / "glasses_02.png", 1.0),
    (_glasses_03, G / "glasses_03.png", 1.0),
    (_glasses_04, G / "glasses_04.png", 1.0),
    (_glasses_05, G / "glasses_05.png", 1.0),
    (_shirt_01,   S / "shirt_01.png",   5.0),
    (_shirt_02,   S / "shirt_02.png",   5.0),
    (_shirt_03,   S / "shirt_03.png",   5.0),
    (_earrings_01, A / "earrings_01.png", 0.5),
    (_earrings_02, A / "earrings_02.png", 0.5),
    (_earrings_03, A / "earrings_03.png", 0.5),
]


def generate_all() -> None:
    print("=" * 60)
    print("  Zyro AR — Asset Generator")
    print("=" * 60)
    failures: list[str] = []

    for gen_fn, out_path, min_kb in ASSETS:
        try:
            img = gen_fn()
            _save(img, out_path)
            kb = out_path.stat().st_size / 1024
            if img.mode != "RGBA":
                raise ValueError(f"Mode is {img.mode}, expected RGBA")
            if kb < min_kb:
                raise ValueError(f"File size {kb:.1f} KB < minimum {min_kb} KB")
        except Exception as exc:
            print(f"  FAIL  {out_path.name}: {exc}")
            failures.append(str(out_path))

    print()
    if failures:
        print(f"FAILED: {len(failures)} asset(s) failed — see above.")
        raise SystemExit(1)
    else:
        print("All 11 assets generated and verified.")
        print("=" * 60)


if __name__ == "__main__":
    generate_all()

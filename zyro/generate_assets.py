"""
generate_assets.py — Create ALL RGBA PNG assets for Zyro AR.

Run from the zyro/ directory:
    python generate_assets.py

Creates:
  assets/glasses/glasses_01..05.png  — 5 frame designs  (600×180..230 RGBA)
  assets/shirts/shirt_01..03.png     — 3 shirt designs   (800×900 RGBA)
  assets/accessories/earrings_01..03.png — 3 earring designs (200×400 RGBA)

Spec (ZYRO_PRODUCTION_AGENT_PROMPT Task 2):
  - All backgrounds fully transparent (alpha=0 outside silhouette)
  - shirt shoulder-to-shoulder span ~540 px (x=130..670), shoulder at y≈180
  - Every file ≥5 KB for shirts, ≥1 KB for glasses, ≥0.5 KB for accessories
  - Verified with Pillow after creation
"""
from __future__ import annotations

import os
from pathlib import Path
from PIL import Image, ImageDraw


def _save(img: Image.Image, path: str) -> None:
    """Write PNG to disk with directory creation."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG")
    kb = Path(path).stat().st_size / 1024
    cat = Path(path).parent.name
    name = Path(path).name
    print(f"  Created: assets/{cat}/{name}  [{img.size[0]}x{img.size[1]}] {img.mode}  {kb:.1f} KB")


# ---------------------------------------------------------------------------
# Glasses (600×200 RGBA)
# ---------------------------------------------------------------------------

def make_glasses_01(path: str) -> None:
    """Classic rectangle frames, dark gray — high-detail version."""
    W, H = 600, 200
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    lx, rx = 145, 455
    cy, lw, lh = 100, 95, 52
    fill = (40, 40, 40, 90)
    rim = (30, 30, 30, 230)
    d.rounded_rectangle([lx - lw, cy - lh, lx + lw, cy + lh],
                         radius=16, fill=fill, outline=rim, width=7)
    d.rounded_rectangle([rx - lw, cy - lh, rx + lw, cy + lh],
                         radius=16, fill=fill, outline=rim, width=7)
    d.line([(lx + lw, cy), (rx - lw, cy)], fill=rim, width=6)
    d.line([(lx - lw, cy - 4), (10, cy - 28)], fill=rim, width=5)
    d.line([(rx + lw, cy - 4), (W - 10, cy - 28)], fill=rim, width=5)
    # Nose pads
    d.ellipse([lx + lw - 12, cy - 8, lx + lw - 4, cy + 8], fill=rim)
    d.ellipse([rx - lw + 4, cy - 8, rx - lw + 12, cy + 8], fill=rim)
    _save(img, path)


def make_glasses_02(path: str) -> None:
    """Round cobalt-blue frames."""
    W, H = 600, 220
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    lx, rx, cy, r = 150, 450, 110, 78
    fill = (30, 80, 200, 80)
    rim = (20, 60, 180, 230)
    d.ellipse([lx - r, cy - r, lx + r, cy + r], fill=fill, outline=rim, width=7)
    d.ellipse([rx - r, cy - r, rx + r, cy + r], fill=fill, outline=rim, width=7)
    d.line([(lx + r, cy), (rx - r, cy)], fill=rim, width=6)
    d.line([(lx - r, cy), (10, cy - 18)], fill=rim, width=5)
    d.line([(rx + r, cy), (W - 10, cy - 18)], fill=rim, width=5)
    # Bridge detail
    d.ellipse([lx + r - 6, cy - 5, lx + r + 6, cy + 5], fill=rim)
    _save(img, path)


def make_glasses_03(path: str) -> None:
    """Aviator — teardrop, gold."""
    W, H = 620, 230
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cy = 105
    rim = (180, 140, 30, 240)
    fill = (120, 180, 120, 70)
    d.ellipse([30, cy - 60, 230, cy + 90], fill=fill, outline=rim, width=6)
    d.ellipse([390, cy - 60, 590, cy + 90], fill=fill, outline=rim, width=6)
    d.line([(230, cy - 10), (390, cy - 10)], fill=rim, width=6)
    d.ellipse([295, cy - 22, 325, cy + 2], fill=rim)
    d.line([(30, cy - 40), (5, cy - 55)], fill=rim, width=5)
    d.line([(590, cy - 40), (615, cy - 55)], fill=rim, width=5)
    # Second inner oval outline for vintage look
    d.ellipse([40, cy - 50, 220, cy + 80], outline=rim, width=2)
    d.ellipse([400, cy - 50, 580, cy + 80], outline=rim, width=2)
    _save(img, path)


def make_glasses_04(path: str) -> None:
    """Thick black wayfarer frames."""
    W, H = 600, 200
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rim = (10, 10, 10, 255)
    fill = (20, 20, 20, 110)

    def wayfarer_lens(cx: int, cy: int, w: int, h: int) -> None:
        hw_, hh_ = w // 2, h // 2
        pts = [
            (cx - hw_,      cy + hh_),
            (cx + hw_,      cy + hh_),
            (cx + hw_ - 10, cy - hh_),
            (cx - hw_ + 10, cy - hh_),
        ]
        d.polygon(pts, fill=fill, outline=rim)
        for i in range(4):
            d.line([pts[i], pts[(i + 1) % 4]], fill=rim, width=10)

    wayfarer_lens(150, 105, 200, 100)
    wayfarer_lens(450, 105, 200, 100)
    d.line([(250, 105), (350, 105)], fill=rim, width=10)
    d.line([(50, 105), (8, 80)], fill=rim, width=9)
    d.line([(550, 105), (592, 80)], fill=rim, width=9)
    _save(img, path)


def make_glasses_05(path: str) -> None:
    """Thin gold wire frames."""
    W, H = 600, 180
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    gold = (218, 165, 32, 230)
    tint = (255, 215, 0, 30)
    d.ellipse([50, 50, 230, 140], fill=tint, outline=gold, width=3)
    d.ellipse([370, 50, 550, 140], fill=tint, outline=gold, width=3)
    d.line([(230, 95), (370, 95)], fill=gold, width=3)
    d.line([(50, 90), (5, 75)], fill=gold, width=3)
    d.line([(550, 90), (595, 75)], fill=gold, width=3)
    # Nose bridge arc
    d.arc([280, 88, 320, 102], start=0, end=180, fill=gold, width=2)
    _save(img, path)


# ---------------------------------------------------------------------------
# Shirts — 800×900 RGBA, shoulder at y≈180, span x=130..670 (~540 px)
# ---------------------------------------------------------------------------

def _shirt_body_poly(W: int, H: int, shoulder_y: int = 180) -> list:
    """
    Return the T-shirt silhouette polygon vertices.

    Key geometry:
      - Shoulder span: x=130 to x=670  (~540 px)
      - Shoulder_y ≈ 180 from top
      - Crew-neckline centre at (W//2, shoulder_y)
    """
    hw = W // 2
    nw = 80  # half neckline width
    return [
        # Neckline left
        (hw - nw, shoulder_y - 70),
        # Left sleeve outer
        (30, shoulder_y - 60),
        (0, shoulder_y + 100),           # left sleeve cuff
        (130, shoulder_y + 120),         # left armpit
        # Left body
        (110, H - 40),
        # Bottom hem
        (W - 110, H - 40),
        # Right body
        (W - 130, shoulder_y + 120),     # right armpit
        (W, shoulder_y + 100),           # right sleeve cuff
        (W - 30, shoulder_y - 60),
        # Neckline right
        (hw + nw, shoulder_y - 70),
        # Crew-neck curve
        (hw + 55, shoulder_y - 20),
        (hw, shoulder_y),
        (hw - 55, shoulder_y - 20),
    ]


def make_shirt_01(path: str) -> None:
    """White classic T-shirt with chest pocket."""
    W, H = 800, 900
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    body_color = (255, 255, 255, 225)
    outline_color = (51, 51, 51, 235)
    poly = _shirt_body_poly(W, H, shoulder_y=180)
    d.polygon(poly, fill=body_color, outline=outline_color)
    for i in range(len(poly)):
        d.line([poly[i], poly[(i + 1) % len(poly)]], fill=outline_color, width=3)
    # Chest pocket
    px, py = 180, 265
    d.rectangle([px, py, px + 80, py + 60],
                fill=(235, 235, 235, 210), outline=outline_color, width=2)
    d.line([(px, py + 8), (px + 80, py + 8)], fill=outline_color, width=1)
    # Collarbone shadow line
    hw = W // 2
    d.arc([hw - 60, 100, hw + 60, 180], start=0, end=180, fill=(200, 200, 200, 120), width=2)
    _save(img, path)


def make_shirt_02(path: str) -> None:
    """Navy blue polo shirt with collar + placket."""
    W, H = 800, 900
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    body_color = (27, 58, 107, 225)
    outline_color = (15, 30, 60, 240)
    collar_fill = (40, 80, 150, 235)
    poly = _shirt_body_poly(W, H, shoulder_y=180)
    d.polygon(poly, fill=body_color, outline=outline_color)
    for i in range(len(poly)):
        d.line([poly[i], poly[(i + 1) % len(poly)]], fill=outline_color, width=3)
    hw = W // 2
    # Collar tabs
    d.polygon([
        (hw - 60, 110), (hw - 10, 180), (hw, 195), (hw + 10, 180), (hw + 60, 110)
    ], fill=collar_fill, outline=outline_color)
    # Placket strip
    d.rectangle([hw - 12, 195, hw + 12, 355],
                fill=collar_fill, outline=outline_color, width=2)
    # Buttons
    btn = (200, 210, 230, 255)
    for by in [220, 268, 316]:
        d.ellipse([hw - 7, by - 7, hw + 7, by + 7], fill=btn)
    _save(img, path)


def make_shirt_03(path: str) -> None:
    """Black hoodie with hood and kangaroo pocket."""
    W, H = 800, 900
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    body_color = (26, 26, 26, 230)
    outline_color = (65, 65, 65, 245)
    hw = W // 2
    shoulder_y = 180
    poly = _shirt_body_poly(W, H, shoulder_y=shoulder_y)
    d.polygon(poly, fill=body_color, outline=outline_color)
    for i in range(len(poly)):
        d.line([poly[i], poly[(i + 1) % len(poly)]], fill=outline_color, width=3)
    # Hood
    hood_color = (35, 35, 35, 235)
    d.polygon([
        (120,      shoulder_y - 60),
        (hw - 90,  shoulder_y - 200),
        (hw,       shoulder_y - 245),
        (hw + 90,  shoulder_y - 200),
        (W - 120,  shoulder_y - 60),
        (hw + 80,  shoulder_y - 70),
        (hw,       shoulder_y - 20),
        (hw - 80,  shoulder_y - 70),
    ], fill=hood_color, outline=outline_color)
    # Drawstrings
    dc = (85, 85, 85, 210)
    d.line([(hw - 20, shoulder_y - 28), (hw - 26, shoulder_y + 82)], fill=dc, width=3)
    d.line([(hw + 20, shoulder_y - 28), (hw + 26, shoulder_y + 82)], fill=dc, width=3)
    d.ellipse([hw - 30, shoulder_y + 80, hw - 18, shoulder_y + 92], fill=dc)
    d.ellipse([hw + 18, shoulder_y + 80, hw + 30, shoulder_y + 92], fill=dc)
    # Kangaroo pocket
    kx = hw - 125
    ky = 580
    d.rectangle([kx, ky, kx + 250, ky + 125],
                fill=(42, 42, 42, 215), outline=outline_color, width=2)
    d.line([(hw, ky), (hw, ky + 125)], fill=outline_color, width=1)
    _save(img, path)


# ---------------------------------------------------------------------------
# Earrings — 200×400 RGBA
# ---------------------------------------------------------------------------

def make_earrings_01(path: str) -> None:
    """Gold hoops."""
    W, H = 200, 400
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    gold = (255, 215, 0, 235)
    for cx in (40, 160):
        r = 40
        cy = H // 2
        d.ellipse([cx - r, cy - r, cx + r, cy + r],
                  fill=(255, 215, 0, 60), outline=gold, width=6)
        # Inner ring for depth
        d.ellipse([cx - r + 8, cy - r + 8, cx + r - 8, cy + r - 8],
                  outline=(200, 170, 0, 150), width=2)
    _save(img, path)


def make_earrings_02(path: str) -> None:
    """Silver teardrop drop earrings."""
    W, H = 200, 400
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    silver = (192, 192, 192, 235)
    for cx in (40, 160):
        cy = H // 2
        # Hook arc
        d.arc([cx - 14, cy - 82, cx + 14, cy - 42], start=0, end=180,
              fill=silver, width=4)
        # Stem
        d.line([(cx, cy - 42), (cx, cy - 12)], fill=silver, width=3)
        # Teardrop
        d.ellipse([cx - 20, cy - 12, cx + 20, cy + 52],
                  fill=(192, 192, 192, 190), outline=silver, width=3)
        # Shine
        d.ellipse([cx - 10, cy - 6, cx - 2, cy + 2],
                  fill=(230, 230, 230, 180))
    _save(img, path)


def make_earrings_03(path: str) -> None:
    """Pearl studs."""
    W, H = 200, 400
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pearl = (245, 245, 245, 240)
    shine = (255, 255, 255, 210)
    for cx in (40, 160):
        cy = H // 2
        r = 22
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=pearl)
        d.ellipse([cx - r + 5, cy - r + 4, cx - r + 13, cy - r + 12], fill=shine)
        # Subtle shadow ring
        d.ellipse([cx - r, cy - r, cx + r, cy + r],
                  outline=(200, 200, 200, 120), width=1)
    _save(img, path)


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------

def _verify_all(base: str) -> bool:
    """Verify every expected asset: RGBA mode + minimum size."""
    expected = {
        "glasses": [
            ("glasses_01.png", 1.0),
            ("glasses_02.png", 1.0),
            ("glasses_03.png", 1.0),
            ("glasses_04.png", 1.0),
            ("glasses_05.png", 1.0),
        ],
        "shirts": [
            ("shirt_01.png", 5.0),
            ("shirt_02.png", 5.0),
            ("shirt_03.png", 5.0),
        ],
        "accessories": [
            ("earrings_01.png", 0.5),
            ("earrings_02.png", 0.5),
            ("earrings_03.png", 0.5),
        ],
    }
    all_pass = True
    print("\n[Verification]")
    for cat, files in expected.items():
        for fn, min_kb in files:
            p = Path(base) / cat / fn
            if not p.exists():
                print(f"  FAIL  {cat}/{fn} — FILE MISSING")
                all_pass = False
                continue
            img = Image.open(p)
            kb = p.stat().st_size / 1024
            mode_ok = img.mode == "RGBA"
            size_ok = kb >= min_kb
            ok = mode_ok and size_ok
            status = "OK  " if ok else "FAIL"
            print(
                f"  [{status}]  {cat}/{fn}  "
                f"{img.size[0]}x{img.size[1]}  {img.mode}  {kb:.1f} KB"
                + ("" if ok else f"  ← NEEDS FIX (min {min_kb} KB, mode={img.mode})")
            )
            if not ok:
                all_pass = False
    return all_pass


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    base = os.path.dirname(os.path.abspath(__file__))
    g = os.path.join(base, "assets", "glasses")
    a = os.path.join(base, "assets", "accessories")
    s = os.path.join(base, "assets", "shirts")

    print("=" * 55)
    print("  Zyro AR — Asset Generator (Production)")
    print("=" * 55)

    print("\n[Glasses]")
    make_glasses_01(os.path.join(g, "glasses_01.png"))
    make_glasses_02(os.path.join(g, "glasses_02.png"))
    make_glasses_03(os.path.join(g, "glasses_03.png"))
    make_glasses_04(os.path.join(g, "glasses_04.png"))
    make_glasses_05(os.path.join(g, "glasses_05.png"))

    print("\n[Shirts]")
    make_shirt_01(os.path.join(s, "shirt_01.png"))
    make_shirt_02(os.path.join(s, "shirt_02.png"))
    make_shirt_03(os.path.join(s, "shirt_03.png"))

    print("\n[Accessories]")
    make_earrings_01(os.path.join(a, "earrings_01.png"))
    make_earrings_02(os.path.join(a, "earrings_02.png"))
    make_earrings_03(os.path.join(a, "earrings_03.png"))

    print("\n" + "=" * 55)
    ok = _verify_all(os.path.join(base, "assets"))
    if ok:
        print("\nAll 11 assets verified.  Run: python main.py")
    else:
        print("\nSome assets failed verification — check output above.")
    print("=" * 55)

"""
debug_shirt_overlay.py — Standalone visual test for shirt overlay alignment.

Run from zyro/ directory:
    python tests/debug_shirt_overlay.py

Opens shirt_01.png, places synthetic shoulder anchors, applies overlay,
saves result as tests/debug_shirt_output.png.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
from PIL import Image

import config
from src.modules.overlay import apply_overlay

# ---- Load shirt asset ----
shirt_path = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "assets", "shirts", "shirt_01.png"
)
shirt = Image.open(shirt_path).convert("RGBA")
print(f"Shirt asset: {shirt.size} {shirt.mode}")

# ---- Synthetic 1280x720 black frame ----
frame = np.zeros((720, 1280, 3), dtype=np.uint8)

# ---- Fake shoulder anchors (MediaPipe BlazePose landmark 11/12 positions) ----
left_anchor  = (380, 300)   # left shoulder  (px)
right_anchor = (900, 300)   # right shoulder (px)

span = ((right_anchor[0] - left_anchor[0]) ** 2 + (right_anchor[1] - left_anchor[1]) ** 2) ** 0.5
target_w = int(span * config.SHIRT_SCALE_MULTIPLIER)
print(f"Anchor span: {span:.1f} px")
print(f"Target asset width: {target_w} px")
print(f"Y offset ratio: {config.SHIRT_Y_OFFSET_RATIO}")
print(f"Paste center X: {(left_anchor[0] + right_anchor[0]) // 2}")
print(f"Paste center Y: {(left_anchor[1] + right_anchor[1]) // 2 + int(span * config.SHIRT_Y_OFFSET_RATIO)}")

result = apply_overlay(
    frame, shirt,
    left_anchor, right_anchor,
    config.SHIRT_Y_OFFSET_RATIO,
    config.SHIRT_SCALE_MULTIPLIER,
)

# Draw anchor dots for reference
import cv2
cv2.circle(result, left_anchor,  8, (0, 0, 255), -1)
cv2.circle(result, right_anchor, 8, (0, 0, 255), -1)
cv2.line(result, left_anchor, right_anchor, (0, 0, 255), 2)

out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "debug_shirt_output.png")
cv2.imwrite(out_path, result)
print(f"\nResult saved to: {out_path}")
print("Open debug_shirt_output.png to verify shirt alignment.")

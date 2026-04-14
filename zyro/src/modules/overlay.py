"""
overlay.py — Affine-transform and alpha-blend overlay engine.

Contract: apply_overlay() accepts the same signature throughout the codebase.
Never break this interface.
"""
from __future__ import annotations

import math
from typing import Optional, Tuple

import cv2
import numpy as np
from PIL import Image

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
import config


# ---------------------------------------------------------------------------
# Internal resize cache  (keyed by asset id + target_w)
# ---------------------------------------------------------------------------
_resize_cache: dict = {}  # { (id(asset), target_w): PIL.Image }
_last_target_w: dict = {}  # { id(asset): int }


def _get_resized_asset(asset: Image.Image, target_w: int) -> Image.Image:
    """
    Return a resize-cached copy of the asset at the requested width.

    Only re-resizes when target_w changes by more than ASSET_RESIZE_THRESHOLD_PX.

    Args:
        asset:    Source RGBA PIL Image.
        target_w: Desired width in pixels.

    Returns:
        Resized RGBA PIL Image.
    """
    key = id(asset)
    last_w = _last_target_w.get(key, -9999)

    # Skip re-resize if width difference is within threshold
    if abs(target_w - last_w) <= config.ASSET_RESIZE_THRESHOLD_PX and key in _resize_cache:
        return _resize_cache[key]

    asset_w, asset_h = asset.size
    # Preserve aspect ratio
    target_h = max(1, int(asset_h * (target_w / asset_w)))
    resized = asset.resize((target_w, target_h), Image.LANCZOS)
    _resize_cache[key] = resized
    _last_target_w[key] = target_w
    return resized


def apply_overlay(
    frame: np.ndarray,
    asset: Image.Image,
    left_anchor: Tuple[int, int],
    right_anchor: Tuple[int, int],
    y_offset_ratio: float,
    scale_mult: float,
) -> np.ndarray:
    """
    Composite a PNG asset onto a BGR frame, aligned between two anchor points.

    Args:
        frame:          BGR numpy array (rendered at full resolution).
        asset:          RGBA PIL Image to overlay.
        left_anchor:    Left reference point (x, y) in frame pixel coordinates.
        right_anchor:   Right reference point (x, y) in frame pixel coordinates.
        y_offset_ratio: Vertical offset as a fraction of the anchor span.
        scale_mult:     Width of asset relative to anchor span.

    Returns:
        BGR numpy array with the asset composited in.
    """
    x1, y1 = left_anchor
    x2, y2 = right_anchor

    # 1. Anchor midpoint
    center_x = (x1 + x2) / 2.0
    center_y = (y1 + y2) / 2.0

    # 2. Euclidean span between anchors (determines scale)
    span = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    if span < 1.0:
        return frame  # Degenerate case: anchors coincide

    # 3. Rotation angle from horizontal (degrees, positive = clockwise)
    angle = math.degrees(math.atan2(y2 - y1, x2 - x1))

    # 4 & 5. Target dimensions (preserve aspect ratio)
    target_w = max(1, int(span * scale_mult))

    # 6. Resize with caching
    asset_resized = _get_resized_asset(asset, target_w)

    # 7. Rotate (expand=True prevents clipping during tilt)
    asset_rotated = asset_resized.rotate(-angle, expand=True, resample=Image.BICUBIC)

    # 8. Apply vertical offset below anchor midpoint
    center_y += span * y_offset_ratio

    # 9. Top-left paste position
    paste_x = int(center_x - asset_rotated.width / 2)
    paste_y = int(center_y - asset_rotated.height / 2)

    # 10. Convert frame to RGBA PIL for compositing
    frame_pil = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGBA))

    # Clamp to visible area
    paste_x, paste_y, asset_rotated = _clamp_to_frame(
        paste_x, paste_y, asset_rotated, frame.shape[1], frame.shape[0]
    )

    if asset_rotated is None:
        return frame  # Completely off-screen

    # 11. Alpha-blend using asset alpha channel as mask
    frame_pil.paste(asset_rotated, (paste_x, paste_y), mask=asset_rotated)

    # 12. Convert back to BGR numpy array
    result = cv2.cvtColor(np.array(frame_pil), cv2.COLOR_RGBA2BGR)
    return result


def _clamp_to_frame(
    paste_x: int,
    paste_y: int,
    asset: Image.Image,
    frame_w: int,
    frame_h: int,
) -> Tuple[int, int, Optional[Image.Image]]:
    """
    Clamp paste coordinates and crop asset to stay within frame boundaries.

    Args:
        paste_x:  Desired top-left x.
        paste_y:  Desired top-left y.
        asset:    RGBA PIL Image to potentially crop.
        frame_w:  Frame width in pixels.
        frame_h:  Frame height in pixels.

    Returns:
        (clamped_x, clamped_y, cropped_asset) or (0, 0, None) if fully off-screen.
    """
    a_w, a_h = asset.size

    # Compute crop region within asset that falls inside the frame
    src_x1 = max(0, -paste_x)
    src_y1 = max(0, -paste_y)
    src_x2 = a_w - max(0, paste_x + a_w - frame_w)
    src_y2 = a_h - max(0, paste_y + a_h - frame_h)

    if src_x2 <= src_x1 or src_y2 <= src_y1:
        return 0, 0, None  # Completely off-screen

    cropped = asset.crop((src_x1, src_y1, src_x2, src_y2))
    final_x = max(0, paste_x)
    final_y = max(0, paste_y)
    return final_x, final_y, cropped


def draw_debug_anchors(
    frame: np.ndarray,
    left_anchor: Tuple[int, int],
    right_anchor: Tuple[int, int],
    center: Optional[Tuple[int, int]] = None,
) -> np.ndarray:
    """
    Render debug visuals: anchor line and crosshair at center.

    Args:
        frame:        BGR numpy array to draw on.
        left_anchor:  Left anchor pixel coordinate.
        right_anchor: Right anchor pixel coordinate.
        center:       Optional center point to draw a crosshair at.

    Returns:
        Frame with debug visuals applied (in place).
    """
    cv2.line(frame, left_anchor, right_anchor, (0, 0, 255), 2)
    cv2.circle(frame, left_anchor, 5, (0, 0, 255), -1)
    cv2.circle(frame, right_anchor, 5, (0, 0, 255), -1)
    if center:
        cx, cy = center
        cv2.line(frame, (cx - 12, cy), (cx + 12, cy), (0, 0, 255), 1)
        cv2.line(frame, (cx, cy - 12), (cx, cy + 12), (0, 0, 255), 1)
    return frame

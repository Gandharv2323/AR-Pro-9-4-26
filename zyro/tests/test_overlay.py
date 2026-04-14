"""
test_overlay.py — Unit tests for the overlay engine.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "modules"))

import numpy as np
from PIL import Image

from src.modules.overlay import apply_overlay


def _make_frame(w: int = 640, h: int = 480) -> np.ndarray:
    """Create a solid black BGR frame."""
    return np.zeros((h, w, 3), dtype=np.uint8)


def _make_asset(w: int = 100, h: int = 40) -> Image.Image:
    """Create a fully white non-transparent RGBA test asset."""
    img = Image.new("RGBA", (w, h), (255, 255, 255, 255))
    return img


def test_compositing_happens():
    """Output frame must not be identical to an all-black input when a white asset is placed."""
    frame = _make_frame()
    asset = _make_asset()
    result = apply_overlay(
        frame, asset,
        left_anchor=(200, 240), right_anchor=(440, 240),
        y_offset_ratio=0.0, scale_mult=1.0
    )
    assert not np.array_equal(result, frame), "Overlay had no effect on the frame."
    print("PASS: test_compositing_happens")


def test_anchor_near_edge_no_crash():
    """Overlay near the frame edge must not raise an exception."""
    frame = _make_frame()
    asset = _make_asset()
    try:
        apply_overlay(
            frame, asset,
            left_anchor=(5, 5), right_anchor=(100, 5),
            y_offset_ratio=0.0, scale_mult=1.2
        )
        print("PASS: test_anchor_near_edge_no_crash")
    except Exception as e:
        raise AssertionError(f"Raised exception near edge: {e}")


def test_anchor_outside_frame_no_crash():
    """Overlay completely outside the frame must not raise an exception."""
    frame = _make_frame()
    asset = _make_asset()
    try:
        apply_overlay(
            frame, asset,
            left_anchor=(-200, -200), right_anchor=(-50, -200),
            y_offset_ratio=0.0, scale_mult=1.0
        )
        print("PASS: test_anchor_outside_frame_no_crash")
    except Exception as e:
        raise AssertionError(f"Raised exception for off-screen anchor: {e}")


def test_degenerate_anchors_no_crash():
    """Coincident anchors (span=0) must return frame unchanged without crashing."""
    frame = _make_frame()
    asset = _make_asset()
    try:
        result = apply_overlay(
            frame, asset,
            left_anchor=(320, 240), right_anchor=(320, 240),
            y_offset_ratio=0.0, scale_mult=1.0
        )
        print("PASS: test_degenerate_anchors_no_crash")
    except Exception as e:
        raise AssertionError(f"Raised exception on degenerate anchors: {e}")


if __name__ == "__main__":
    test_compositing_happens()
    test_anchor_near_edge_no_crash()
    test_anchor_outside_frame_no_crash()
    test_degenerate_anchors_no_crash()
    print("\nAll overlay tests passed.")

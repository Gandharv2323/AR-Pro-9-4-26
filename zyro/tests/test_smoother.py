"""
test_smoother.py — Unit tests for the EMA Smoother class.
"""
from __future__ import annotations

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "modules"))

import pytest
from src.modules.smoother import Smoother


# ---------------------------------------------------------------------------
# Existing passing tests (preserved)
# ---------------------------------------------------------------------------

def test_first_frame_no_lag():
    """First update must return the exact input value (no initial lag)."""
    s = Smoother(alpha=0.35)
    result = s.update(42.0)
    assert result == 42.0


def test_convergence_after_50_frames():
    """After 50 frames of input 100, smoothed value must be within 0.1 of 100."""
    s = Smoother(alpha=0.35)
    for _ in range(50):
        val = s.update(100.0)
    assert abs(val - 100.0) < 0.1


def test_reset_reinitialises():
    """After reset(), the next update should return the raw value (no lag)."""
    s = Smoother(alpha=0.35)
    s.update(50.0)
    s.reset()
    result = s.update(99.0)
    assert result == 99.0


def test_is_initialised_flag():
    """is_initialised should be False before first update, True after."""
    s = Smoother()
    assert not s.is_initialised
    s.update(1.0)
    assert s.is_initialised


# ---------------------------------------------------------------------------
# New tests (Task 7f additions)
# ---------------------------------------------------------------------------

def test_smoother_reset_reinitializes_from_zero():
    """
    Feed 50 values of 100.0 → call reset() → feed 0.0.
    Next smoothed value must equal 0.0 exactly (no memory of old values).
    """
    s = Smoother(alpha=0.35)
    for _ in range(50):
        s.update(100.0)
    s.reset()
    result = s.update(0.0)
    assert result == 0.0, f"Expected 0.0 after reset, got {result}"


def test_smoother_alpha_zero_never_changes():
    """
    alpha=0.0 → after first init, value must never change regardless of new inputs.
    """
    s = Smoother(alpha=0.0)
    s.update(10.0)    # first call initialises to 10.0
    for v in [50.0, 100.0, -200.0, 0.5]:
        result = s.update(v)
        assert abs(result - 10.0) < 1e-9, f"Expected 10.0 but got {result}"


def test_smoother_alpha_one_equals_last_input():
    """
    alpha=1.0 → every output must equal the exact last input.
    """
    s = Smoother(alpha=1.0)
    for v in [10.0, 50.0, 99.9, -5.0, 0.0]:
        result = s.update(v)
        assert abs(result - v) < 1e-9, f"Expected {v} but got {result}"


def test_smoother_handles_negative_values():
    """Feed negative values; assert no exception and output is always negative."""
    s = Smoother(alpha=0.35)
    for v in range(-100, -50):
        result = s.update(float(v))
        assert result < 0, f"Expected negative output for input {v}, got {result}"


def test_smoother_output_between_input_and_previous():
    """EMA output must always lie between previous smoothed value and current input."""
    s = Smoother(alpha=0.35)
    prev = s.update(0.0)
    for v in [10.0, 5.0, 20.0, -5.0]:
        curr = s.update(v)
        lo, hi = min(prev, v), max(prev, v)
        assert lo <= curr <= hi, f"Out of range: prev={prev} input={v} output={curr}"
        prev = curr


def test_smoother_init_is_not_initialised():
    s = Smoother()
    assert not s.is_initialised


def test_smoother_is_initialised_after_one_update():
    s = Smoother()
    s.update(5.0)
    assert s.is_initialised


def test_smoother_reset_clears_initialised_flag():
    s = Smoother()
    s.update(5.0)
    s.reset()
    assert not s.is_initialised


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

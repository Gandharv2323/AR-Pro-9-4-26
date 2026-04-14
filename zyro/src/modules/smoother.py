"""
smoother.py — Exponential Moving Average (EMA) filter for overlay coordinates.
"""
from __future__ import annotations

import logging
from typing import Optional

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
import config

logger = logging.getLogger(__name__)


class Smoother:
    """
    Single-channel EMA smoother.

    Usage:
        s = Smoother(alpha=0.35)
        smoothed = s.update(raw_value)

    On the very first call, the output equals the input exactly (no initial lag).
    When the subject disappears and reappears, call `reset()` to avoid snap artifacts.
    """

    def __init__(self, alpha: float = config.EMA_ALPHA) -> None:
        """
        Args:
            alpha: Blending factor. 1.0 = no smoothing, 0.0 = no tracking.
        """
        self._alpha: float = alpha
        self._value: Optional[float] = None

    def update(self, new_value: float) -> float:
        """
        Apply one EMA step and return the smoothed value.

        Args:
            new_value: The raw measured value for this frame.

        Returns:
            The smoothed output value.
        """
        if self._value is None:
            # Initialise on first observation — zero lag on start.
            self._value = new_value
        else:
            # EMA: smooth = alpha * new + (1 - alpha) * previous
            self._value = self._alpha * new_value + (1.0 - self._alpha) * self._value
        return self._value

    def reset(self) -> None:
        """Reset smoother state (call when subject reappears after absence)."""
        self._value = None

    @property
    def is_initialised(self) -> bool:
        """True once the smoother has received at least one value."""
        return self._value is not None

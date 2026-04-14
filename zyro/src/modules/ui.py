"""
ui.py — HUD text rendering: FPS counter, item label, keyboard hint bar,
        status indicators, splash screen, and fade-in support.
"""
from __future__ import annotations

import collections
import logging
import time
from typing import Deque, Optional

import cv2
import numpy as np

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
import config

logger = logging.getLogger(__name__)

# Splash screen timing
_SPLASH_DURATION_S: float = 2.0
_SPLASH_FADE_S: float = 0.5


class HUD:
    """Renders all on-screen UI elements onto a BGR frame."""

    def __init__(self) -> None:
        self._fps_times: Deque[float] = collections.deque(maxlen=config.FPS_HISTORY_LEN)
        self._start_time: float = time.perf_counter()
        self._splash_done: bool = False

    # ------------------------------------------------------------------
    # FPS tracking
    # ------------------------------------------------------------------
    def record_frame(self) -> None:
        """Call once per rendered frame to update the FPS rolling window."""
        self._fps_times.append(time.perf_counter())

    def get_fps(self) -> float:
        """
        Compute current FPS from the rolling window.

        Returns:
            Frames per second as a float. Zero if fewer than 2 samples.
        """
        if len(self._fps_times) < 2:
            return 0.0
        return (len(self._fps_times) - 1) / (self._fps_times[-1] - self._fps_times[0])

    # ------------------------------------------------------------------
    # Drawing helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _draw_text(
        frame: np.ndarray,
        text: str,
        pos: tuple,
        font_scale: float = config.HUD_FONT_SCALE,
        color: tuple = config.HUD_COLOR_PRIMARY,
        thickness: int = 1,
    ) -> None:
        """Draw text with a 1-pixel black shadow for contrast."""
        x, y = pos
        font = config.HUD_FONT
        cv2.putText(frame, text, (x + 1, y + 1), font, font_scale,
                    config.HUD_COLOR_SHADOW, thickness + 1, cv2.LINE_AA)
        cv2.putText(frame, text, (x, y), font, font_scale, color, thickness, cv2.LINE_AA)

    # ------------------------------------------------------------------
    # Splash screen
    # ------------------------------------------------------------------
    def draw_splash(self, frame: np.ndarray) -> bool:
        """
        Draw startup splash overlay. Returns True while splash is active.

        Args:
            frame: BGR numpy array (modified in place).

        Returns:
            True if splash is still showing; False when done.
        """
        elapsed = time.perf_counter() - self._start_time
        total_show = _SPLASH_DURATION_S + _SPLASH_FADE_S

        if elapsed > total_show:
            self._splash_done = True
            return False

        # Alpha: fully opaque during splash, fade during last _SPLASH_FADE_S
        if elapsed < _SPLASH_DURATION_S:
            alpha = 1.0
        else:
            fade_progress = (elapsed - _SPLASH_DURATION_S) / _SPLASH_FADE_S
            alpha = max(0.0, 1.0 - fade_progress)

        # Semi-transparent dark overlay
        overlay = np.zeros_like(frame)
        cv2.addWeighted(overlay, alpha * 0.85, frame, 1.0 - alpha * 0.85, 0, frame)

        h, w = frame.shape[:2]
        cx, cy = w // 2, h // 2

        splash_color = (int(255 * alpha), int(255 * alpha), int(255 * alpha))
        gray_color   = (int(180 * alpha), int(180 * alpha), int(180 * alpha))
        cyan_color   = (int(255 * alpha), int(220 * alpha), 0)  # BGR cyan

        # Line 1 — "ZYRO AR" large
        text1 = "ZYRO AR"
        sz1, _ = cv2.getTextSize(text1, config.HUD_FONT, 2.5, 3)
        self._draw_text(frame, text1, (cx - sz1[0] // 2, cy - 60),
                        font_scale=2.5, color=splash_color, thickness=3)

        # Line 2 — tagline
        text2 = "Smart Mirror  Virtual Try-On"
        sz2, _ = cv2.getTextSize(text2, config.HUD_FONT, 0.85, 2)
        self._draw_text(frame, text2, (cx - sz2[0] // 2, cy + 10),
                        font_scale=0.85, color=gray_color, thickness=2)

        # Line 3 — status
        text3 = "Initializing..."
        sz3, _ = cv2.getTextSize(text3, config.HUD_FONT, 0.6, 1)
        self._draw_text(frame, text3, (cx - sz3[0] // 2, cy + 55),
                        font_scale=0.6, color=cyan_color, thickness=1)

        return True

    @property
    def splash_done(self) -> bool:
        return self._splash_done

    # ------------------------------------------------------------------
    # FPS counter
    # ------------------------------------------------------------------
    def draw_fps(self, frame: np.ndarray) -> None:
        """Render FPS counter top-right with colour coding."""
        fps = self.get_fps()
        if fps < config.FPS_WARNING_THRESHOLD and len(self._fps_times) >= 5:
            logger.warning("FPS dropped to %.1f", fps)
        fps_text = f"FPS: {fps:.1f}"
        if fps >= 25:
            fps_color = (0, 240, 120)    # Green
        elif fps >= 15:
            fps_color = (0, 215, 255)    # Yellow (BGR)
        else:
            fps_color = (0, 0, 255)      # Red
        h, w = frame.shape[:2]
        sz, _ = cv2.getTextSize(fps_text, config.HUD_FONT, config.HUD_FONT_SCALE, 1)
        self._draw_text(frame, fps_text, (w - sz[0] - 15, 35),
                        color=fps_color)

    # ------------------------------------------------------------------
    # Logo
    # ------------------------------------------------------------------
    def draw_logo(self, frame: np.ndarray) -> None:
        """Draw 'ZYRO AR' branding top-left."""
        self._draw_text(frame, "ZYRO AR", (15, 35),
                        font_scale=0.75, color=(255, 255, 255), thickness=2)

    # ------------------------------------------------------------------
    # Status indicators (face / body detection)
    # ------------------------------------------------------------------
    def draw_status_indicators(
        self,
        frame: np.ndarray,
        face_found: bool,
        pose_found: bool,
    ) -> None:
        """
        Draw filled circle status dots mid-left.

        Green = detected, Gray = not detected.
        """
        face_color = (0, 230, 0) if face_found else (100, 100, 100)
        pose_color = (0, 230, 0) if pose_found else (100, 100, 100)
        h = frame.shape[0]
        cy_base = h // 2 - 30
        # Face indicator
        cv2.circle(frame, (20, cy_base), 7, face_color, -1)
        self._draw_text(frame, "Face", (35, cy_base + 5),
                        font_scale=0.5, color=(220, 220, 220))
        # Body indicator
        cv2.circle(frame, (20, cy_base + 30), 7, pose_color, -1)
        self._draw_text(frame, "Body", (35, cy_base + 35),
                        font_scale=0.5, color=(220, 220, 220))

    # ------------------------------------------------------------------
    # Item label bar
    # ------------------------------------------------------------------
    def draw_item_label(
        self,
        frame: np.ndarray,
        glasses_label: str,
        shirt_label: str,
        active_category: str,
    ) -> None:
        """Render item labels bottom-center above hint bar."""
        h, w = frame.shape[:2]
        glasses_color = (0, 215, 255) if active_category == "glasses" else (160, 160, 160)
        shirt_color   = (0, 215, 255) if active_category == "shirts"   else (160, 160, 160)

        cat_icon_g = "[Glasses]"
        cat_icon_s = "[Shirt]"

        g_text = f"{cat_icon_g} {glasses_label}"
        s_text = f"{cat_icon_s}  {shirt_label}"

        sz_g, _ = cv2.getTextSize(g_text, config.HUD_FONT, 0.6, 1)
        sz_s, _ = cv2.getTextSize(s_text, config.HUD_FONT, 0.6, 1)

        self._draw_text(frame, g_text, (w // 2 - sz_g[0] // 2, h - 95),
                        font_scale=0.6, color=glasses_color)
        self._draw_text(frame, s_text, (w // 2 - sz_s[0] // 2, h - 65),
                        font_scale=0.6, color=shirt_color)

    # ------------------------------------------------------------------
    # Hint bar
    # ------------------------------------------------------------------
    def draw_hints(self, frame: np.ndarray, active_category: str) -> None:
        """Render keyboard hint bar along the bottom edge."""
        h, w = frame.shape[:2]
        bar_h = 36
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, h - bar_h), (w, h), (15, 15, 15), -1)
        cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)
        hints = "[</->] Switch   [Tab] Category   [1] Glasses  [2] Shirts   [D] Debug   [Q] Quit"
        sz, _ = cv2.getTextSize(hints, config.HUD_FONT, 0.45, 1)
        self._draw_text(frame, hints, (w // 2 - sz[0] // 2, h - 10),
                        font_scale=0.45, color=(190, 190, 190))

    # ------------------------------------------------------------------
    # Debug overlay
    # ------------------------------------------------------------------
    def draw_debug_overlay(
        self, frame: np.ndarray, face_lm: dict, pose_lm: dict
    ) -> None:
        """Draw all MediaPipe landmarks when debug mode is active."""
        for _, (x, y) in face_lm.items():
            cv2.circle(frame, (x, y), 1, (0, 255, 0), -1)
        for _, (x, y) in pose_lm.items():
            cv2.circle(frame, (x, y), 4, (255, 100, 0), -1)
        for idx in (config.GLASSES_ANCHOR_LEFT_IDX, config.GLASSES_ANCHOR_RIGHT_IDX):
            if idx in face_lm:
                cv2.circle(frame, face_lm[idx], 6, (0, 0, 255), -1)
        for idx in (config.SHIRT_ANCHOR_LEFT_IDX, config.SHIRT_ANCHOR_RIGHT_IDX):
            if idx in pose_lm:
                cv2.circle(frame, pose_lm[idx], 6, (0, 0, 255), -1)

    # ------------------------------------------------------------------
    # Full render pass
    # ------------------------------------------------------------------
    def render(
        self,
        frame: np.ndarray,
        glasses_label: str,
        shirt_label: str,
        active_category: str,
        face_lm: Optional[dict] = None,
        pose_lm: Optional[dict] = None,
        debug_mode: bool = False,
        face_found: bool = False,
        pose_found: bool = False,
    ) -> None:
        """
        Full HUD render pass.

        Args:
            frame:           BGR frame (modified in place).
            glasses_label:   Glasses selection text.
            shirt_label:     Shirt selection text.
            active_category: Active category for highlight.
            face_lm:         Face landmark dict.
            pose_lm:         Pose landmark dict.
            debug_mode:      If True, draw all landmarks.
            face_found:      Whether face is currently detected.
            pose_found:      Whether pose is currently detected.
        """
        self.record_frame()
        self.draw_logo(frame)
        self.draw_fps(frame)
        self.draw_status_indicators(frame, face_found, pose_found)
        self.draw_item_label(frame, glasses_label, shirt_label, active_category)
        self.draw_hints(frame, active_category)

        if debug_mode and face_lm is not None and pose_lm is not None:
            self.draw_debug_overlay(frame, face_lm, pose_lm)

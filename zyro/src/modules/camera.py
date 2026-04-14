"""
camera.py — Webcam initialisation, frame capture, mirror flip, FPS limiter.

Uses the new Tasks API pattern — no direct MediaPipe dependency here.
"""
from __future__ import annotations

import logging
import time
from typing import List, Optional, Tuple

import cv2
import numpy as np

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
import config
from src.exceptions import CameraError, CameraDisconnectedError

logger = logging.getLogger(__name__)

_CAMERA_OPEN_RETRIES: int = 3
_CAMERA_RETRY_DELAY_S: float = 1.0


class Camera:
    """Wraps a cv2.VideoCapture and enforces a target FPS via a perf_counter limiter."""

    def __init__(
        self,
        index: int = config.CAMERA_INDEX,
        width: int = config.FRAME_WIDTH,
        height: int = config.FRAME_HEIGHT,
        target_fps: int = config.TARGET_FPS,
    ) -> None:
        """
        Initialise the webcam with retry logic.

        Args:
            index:      OpenCV camera device index.
            width:      Requested capture width in pixels.
            height:     Requested capture height in pixels.
            target_fps: Maximum frames per second to capture.

        Raises:
            CameraError: If the camera cannot be opened after all retries.
        """
        self._cap: Optional[cv2.VideoCapture] = None
        for attempt in range(1, _CAMERA_OPEN_RETRIES + 1):
            logger.debug("Camera open attempt %d/%d (index=%d)", attempt, _CAMERA_OPEN_RETRIES, index)
            cap = cv2.VideoCapture(index)
            if cap.isOpened():
                self._cap = cap
                logger.info("Camera opened on index %d (attempt %d)", index, attempt)
                break
            cap.release()
            if attempt < _CAMERA_OPEN_RETRIES:
                logger.warning(
                    "Camera not opened yet (attempt %d/%d) — retrying in %.1fs",
                    attempt, _CAMERA_OPEN_RETRIES, _CAMERA_RETRY_DELAY_S,
                )
                time.sleep(_CAMERA_RETRY_DELAY_S)

        if self._cap is None or not self._cap.isOpened():
            raise CameraError(
                f"Cannot open camera at index {index} after {_CAMERA_OPEN_RETRIES} attempts. "
                "Try changing CAMERA_INDEX in .env"
            )

        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        self._frame_interval: float = 1.0 / target_fps
        self._last_frame_time: float = 0.0

        actual_w = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_h = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        actual_fps = self._cap.get(cv2.CAP_PROP_FPS)
        logger.info(
            "Camera properties — resolution: %dx%d, reported FPS: %.1f, target FPS: %d",
            actual_w, actual_h, actual_fps, target_fps,
        )

    def get_frame(self) -> np.ndarray:
        """
        Capture one frame from the webcam, apply mirror flip, and enforce FPS limit.

        Returns:
            Horizontally-flipped BGR numpy array.

        Raises:
            CameraDisconnectedError: If the camera stops delivering frames.
        """
        now = time.perf_counter()
        elapsed = now - self._last_frame_time
        if elapsed < self._frame_interval:
            time.sleep(self._frame_interval - elapsed)
        self._last_frame_time = time.perf_counter()

        assert self._cap is not None, "Camera not initialised"
        ret, frame = self._cap.read()
        if not ret or frame is None:
            raise CameraDisconnectedError(
                "Camera stopped delivering frames. "
                "Check the connection and try restarting."
            )
        return cv2.flip(frame, 1)

    def release(self) -> None:
        """Release the underlying VideoCapture resource."""
        if self._cap is not None:
            self._cap.release()
            logger.debug("Camera released.")

    def get_actual_resolution(self) -> Tuple[int, int]:
        """
        Return the actual resolution the camera is delivering.

        Returns:
            Tuple of (width, height) in pixels.
        """
        assert self._cap is not None
        w = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        return w, h


def list_available_cameras(max_check: int = 5) -> List[int]:
    """
    Scan camera indices 0..max_check-1, return list of working indices.

    Args:
        max_check: Number of indices to probe.

    Returns:
        List of integer indices for cameras that open successfully.
    """
    available: List[int] = []
    for i in range(max_check):
        cap = cv2.VideoCapture(i)
        if cap.isOpened():
            available.append(i)
            logger.debug("Camera index %d: available", i)
        cap.release()
    logger.info("Available cameras: %s", available if available else "none found")
    return available


def select_best_camera() -> int:
    """
    Return the first available camera index.

    Returns:
        First working camera index.

    Raises:
        CameraError: If no cameras are available.
    """
    cameras = list_available_cameras()
    if not cameras:
        raise CameraError(
            "No cameras found. Connect a webcam and try again."
        )
    best = cameras[0]
    logger.info("Selected camera index %d", best)
    return best

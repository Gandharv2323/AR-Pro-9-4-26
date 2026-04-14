"""
detector.py — MediaPipe FaceLandmarker and PoseLandmarker wrappers (Tasks API).

API: Uses the NEW MediaPipe Tasks Vision API (mediapipe >= 0.10.x).
     Model files: models/face_landmarker.task, models/pose_landmarker_lite.task
     These are .task bundle files — NOT the old mp.solutions API.

Both detectors share a single RGB-converted frame per loop iteration.
Results are returned as typed dataclasses, never raw tuples.
"""
from __future__ import annotations

import logging
import os
import sys
from dataclasses import dataclass, field
from typing import Dict, Tuple

import cv2
import mediapipe as mp
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
import config
from src.exceptions import ModelNotFoundError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Mediapipe Tasks imports
# ---------------------------------------------------------------------------
BaseOptions = mp.tasks.BaseOptions
VisionRunningMode = mp.tasks.vision.RunningMode
FaceLandmarker = mp.tasks.vision.FaceLandmarker
FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
PoseLandmarker = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions


# ---------------------------------------------------------------------------
# Result dataclasses
# ---------------------------------------------------------------------------

@dataclass
class FaceResult:
    """Structured result from FaceLandmarker detection."""
    found: bool
    landmarks: Dict[int, Tuple[int, int]] = field(default_factory=dict)


@dataclass
class PoseResult:
    """Structured result from PoseLandmarker detection."""
    found: bool
    landmarks: Dict[int, Tuple[int, int]] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Detector wrappers
# ---------------------------------------------------------------------------

def _resolve_model_path(model_path: str) -> str:
    """
    Resolve model path relative to zyro/ root regardless of CWD.

    Args:
        model_path: Path relative to zyro/ root (e.g. 'models/face_landmarker.task').

    Returns:
        Absolute path string.

    Raises:
        ModelNotFoundError: If the resolved path does not exist.
    """
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    abs_path = os.path.abspath(os.path.join(root, model_path))
    if not os.path.isfile(abs_path):
        raise ModelNotFoundError(
            f"Model not found: '{abs_path}'. "
            "Run:  python -m src.models.download_models   (from the zyro/ directory)"
        )
    return abs_path


class FaceDetector:
    """Wrapper around MediaPipe FaceLandmarker (Tasks API)."""

    def __init__(self, model_path: str = config.FACE_LANDMARKER_MODEL) -> None:
        """
        Initialise the face landmark detector.

        Args:
            model_path: Path to the face_landmarker.task bundle (relative to zyro/).

        Raises:
            ModelNotFoundError: If the model file is missing.
        """
        abs_model = _resolve_model_path(model_path)
        logger.info("FaceDetector: loading model from %s", abs_model)
        opts = FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=abs_model),
            running_mode=VisionRunningMode.IMAGE,
            num_faces=1,
            min_face_detection_confidence=config.FACE_DETECTION_CONFIDENCE,
            min_face_presence_confidence=config.FACE_DETECTION_CONFIDENCE,
            min_tracking_confidence=config.FACE_TRACKING_CONFIDENCE,
        )
        self._detector = FaceLandmarker.create_from_options(opts)
        logger.info("FaceDetector ready.")

    def detect(self, rgb_frame: np.ndarray) -> FaceResult:
        """
        Run FaceLandmarker on an RGB numpy frame.

        Args:
            rgb_frame: RGB uint8 numpy array.

        Returns:
            FaceResult with pixel-space landmark coordinates (empty if no face).
        """
        if rgb_frame is None:
            logger.warning("FaceDetector.detect() received None frame — returning not-found.")
            return FaceResult(found=False)
        try:
            h, w = rgb_frame.shape[:2]
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            result = self._detector.detect(mp_image)
        except Exception as exc:  # noqa: BLE001
            logger.warning("FaceDetector inference error: %s — returning not-found.", exc)
            return FaceResult(found=False)

        if not result.face_landmarks:
            return FaceResult(found=False)

        raw = result.face_landmarks[0]
        lm: Dict[int, Tuple[int, int]] = {
            i: (int(pt.x * w), int(pt.y * h))
            for i, pt in enumerate(raw)
        }
        return FaceResult(found=True, landmarks=lm)

    def close(self) -> None:
        """Release MediaPipe resources."""
        self._detector.close()
        logger.debug("FaceDetector closed.")


class PoseDetector:
    """Wrapper around MediaPipe PoseLandmarker (Tasks API)."""

    def __init__(self, model_path: str = config.POSE_LANDMARKER_MODEL) -> None:
        """
        Initialise the body pose detector.

        Args:
            model_path: Path to the pose_landmarker_lite.task bundle (relative to zyro/).

        Raises:
            ModelNotFoundError: If the model file is missing.
        """
        abs_model = _resolve_model_path(model_path)
        logger.info("PoseDetector: loading model from %s", abs_model)
        opts = PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=abs_model),
            running_mode=VisionRunningMode.IMAGE,
            num_poses=1,
            min_pose_detection_confidence=config.POSE_DETECTION_CONFIDENCE,
            min_pose_presence_confidence=config.POSE_DETECTION_CONFIDENCE,
            min_tracking_confidence=config.POSE_TRACKING_CONFIDENCE,
        )
        self._detector = PoseLandmarker.create_from_options(opts)
        logger.info("PoseDetector ready.")

    def detect(self, rgb_frame: np.ndarray) -> PoseResult:
        """
        Run PoseLandmarker on an RGB numpy frame.

        Args:
            rgb_frame: RGB uint8 numpy array.

        Returns:
            PoseResult with pixel-space landmark coordinates filtered by visibility.
        """
        if rgb_frame is None:
            logger.warning("PoseDetector.detect() received None frame — returning not-found.")
            return PoseResult(found=False)
        try:
            h, w = rgb_frame.shape[:2]
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            result = self._detector.detect(mp_image)
        except Exception as exc:  # noqa: BLE001
            logger.warning("PoseDetector inference error: %s — returning not-found.", exc)
            return PoseResult(found=False)

        if not result.pose_landmarks:
            return PoseResult(found=False)

        raw = result.pose_landmarks[0]
        lm: Dict[int, Tuple[int, int]] = {}
        for i, pt in enumerate(raw):
            if pt.visibility >= config.LANDMARK_VISIBILITY_THRESHOLD:
                lm[i] = (int(pt.x * w), int(pt.y * h))
            else:
                logger.debug(
                    "Pose landmark %d visibility %.2f below threshold — skipped.", i, pt.visibility
                )

        return PoseResult(found=bool(lm), landmarks=lm)

    def close(self) -> None:
        """Release MediaPipe resources."""
        self._detector.close()
        logger.debug("PoseDetector closed.")


# ---------------------------------------------------------------------------
# Shared frame utilities
# ---------------------------------------------------------------------------

def build_detect_frame(frame: np.ndarray) -> np.ndarray:
    """
    Resize BGR frame to detection resolution and convert to RGB.

    Args:
        frame: Full-resolution BGR numpy array.

    Returns:
        Smaller RGB numpy array for MediaPipe inference.
    """
    small = cv2.resize(frame, (config.DETECT_WIDTH, config.DETECT_HEIGHT))
    return cv2.cvtColor(small, cv2.COLOR_BGR2RGB)


def scale_landmarks(
    result: FaceResult | PoseResult,
    src_w: int, src_h: int,
    dst_w: int, dst_h: int,
) -> None:
    """
    Scale pixel coordinates from detection resolution to render resolution in place.

    Args:
        result: FaceResult or PoseResult to modify.
        src_w:  Detection frame width.
        src_h:  Detection frame height.
        dst_w:  Render frame width.
        dst_h:  Render frame height.
    """
    scale_x = dst_w / src_w
    scale_y = dst_h / src_h
    result.landmarks = {
        idx: (int(x * scale_x), int(y * scale_y))
        for idx, (x, y) in result.landmarks.items()
    }

"""
config.py — ALL constants for Zyro AR, loaded from environment / .env file.

No hardcoded values anywhere else in the codebase.
Types are validated at import time; invalid values raise ConfigurationError.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Dict, Any

import cv2
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Load .env (must be before any os.getenv calls)
# ---------------------------------------------------------------------------
_ENV_FILE = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=_ENV_FILE, override=False)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_int(key: str, default: int) -> int:
    """Read env var as int.  Raises ConfigurationError on bad type."""
    from src.exceptions import ConfigurationError
    val = os.getenv(key)
    if val is None:
        logger.debug("Config: %s not set, using default %s", key, default)
        return default
    try:
        return int(val)
    except ValueError as exc:
        raise ConfigurationError(
            f"Config error: {key}={val!r} is not a valid integer."
        ) from exc


def _get_float(key: str, default: float) -> float:
    """Read env var as float.  Raises ConfigurationError on bad type."""
    from src.exceptions import ConfigurationError
    val = os.getenv(key)
    if val is None:
        logger.debug("Config: %s not set, using default %s", key, default)
        return default
    try:
        return float(val)
    except ValueError as exc:
        raise ConfigurationError(
            f"Config error: {key}={val!r} is not a valid float."
        ) from exc


def _get_bool(key: str, default: bool) -> bool:
    """Read env var as bool (true/1/yes → True; false/0/no → False)."""
    from src.exceptions import ConfigurationError
    val = os.getenv(key)
    if val is None:
        logger.debug("Config: %s not set, using default %s", key, default)
        return default
    if val.lower() in ("true", "1", "yes"):
        return True
    if val.lower() in ("false", "0", "no"):
        return False
    raise ConfigurationError(
        f"Config error: {key}={val!r} is not a valid boolean."
    )


# ---------------------------------------------------------------------------
# Camera
# ---------------------------------------------------------------------------
CAMERA_INDEX: int = _get_int("CAMERA_INDEX", 0)
FRAME_WIDTH: int = _get_int("FRAME_WIDTH", 1280)
FRAME_HEIGHT: int = _get_int("FRAME_HEIGHT", 720)
TARGET_FPS: int = _get_int("TARGET_FPS", 30)

# Resolution used for MediaPipe detection (smaller = faster inference)
# On CPU-only machines, use 320x240 for acceptable speed
DETECT_WIDTH: int = _get_int("DETECT_WIDTH", 320)
DETECT_HEIGHT: int = _get_int("DETECT_HEIGHT", 240)

# ---------------------------------------------------------------------------
# MediaPipe confidence thresholds
# ---------------------------------------------------------------------------
FACE_DETECTION_CONFIDENCE: float = _get_float("FACE_DETECTION_CONFIDENCE", 0.6)
FACE_TRACKING_CONFIDENCE: float = 0.5
POSE_DETECTION_CONFIDENCE: float = _get_float("POSE_DETECTION_CONFIDENCE", 0.6)
POSE_TRACKING_CONFIDENCE: float = 0.5

# 0=lite, 1=full, 2=heavy
POSE_MODEL_COMPLEXITY: int = _get_int("MODEL_COMPLEXITY", 1)

# ---------------------------------------------------------------------------
# Smoothing
# ---------------------------------------------------------------------------
EMA_ALPHA: float = _get_float("EMA_ALPHA", 0.35)
FREEZE_DURATION_S: float = 0.3

# ---------------------------------------------------------------------------
# Landmark indices
# ---------------------------------------------------------------------------
# FaceMesh
GLASSES_ANCHOR_LEFT_IDX: int = 33    # Left eye outer corner
GLASSES_ANCHOR_RIGHT_IDX: int = 263  # Right eye outer corner

# BlazePose
SHIRT_ANCHOR_LEFT_IDX: int = 11      # Left shoulder
SHIRT_ANCHOR_RIGHT_IDX: int = 12     # Right shoulder

# ---------------------------------------------------------------------------
# Overlay multipliers
# ---------------------------------------------------------------------------
GLASSES_Y_OFFSET_RATIO: float = 0.05
GLASSES_SCALE_MULTIPLIER: float = 1.2

SHIRT_Y_OFFSET_RATIO: float = 1.2   # Pushes shirt down so neckline aligns with shoulders
SHIRT_SCALE_MULTIPLIER: float = 2.8

# Minimum landmark visibility to render overlay
LANDMARK_VISIBILITY_THRESHOLD: float = 0.5

# Freeze window for shirt fade when shoulder landmarks drop below threshold
SHIRT_FREEZE_DURATION_S: float = 0.5

# Phase 5 — Performance tuning
POSE_DETECTION_INTERVAL: int = 2
# FRAME_BUDGET_MS: max ms per frame before skipping inference
# Default 200ms = safe for CPU-only machines (~5 FPS baseline)
# Set lower (e.g. 66) on GPU machines for 15+ FPS
FRAME_BUDGET_S: float = _get_int("FRAME_BUDGET_MS", 200) / 1000.0

# Minimum change in span (px) before re-resizing asset
ASSET_RESIZE_THRESHOLD_PX: int = 3

# ---------------------------------------------------------------------------
# UI / HUD
# ---------------------------------------------------------------------------
HUD_FONT = cv2.FONT_HERSHEY_SIMPLEX
HUD_FONT_SCALE: float = 0.65
HUD_COLOR_PRIMARY: tuple = (255, 255, 255)
HUD_COLOR_SHADOW: tuple = (0, 0, 0)
HUD_FPS_POSITION: tuple = (20, 40)

# ---------------------------------------------------------------------------
# Debug / Dev
# ---------------------------------------------------------------------------
DEBUG_MODE: bool = _get_bool("DEBUG_MODE", False)
FPS_HISTORY_LEN: int = 30
FPS_WARNING_THRESHOLD: int = _get_int("FPS_WARNING_THRESHOLD", 10)
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()

# ---------------------------------------------------------------------------
# Asset paths (relative to zyro/ root)
# ---------------------------------------------------------------------------
ASSETS_DIR: str = "assets"
GLASSES_DIR: str = "assets/glasses"
ACCESSORIES_DIR: str = "assets/accessories"
SHIRTS_DIR: str = "assets/shirts"

# ---------------------------------------------------------------------------
# Model paths — resolved absolutely so detector.py works from any CWD
# ---------------------------------------------------------------------------
PROJECT_ROOT: Path = Path(__file__).parent          # zyro/ directory
MODELS_DIR: Path = PROJECT_ROOT / "models"

# String paths (relative to PROJECT_ROOT) used by _resolve_model_path()
FACE_LANDMARKER_MODEL: str = "models/face_landmarker.task"
POSE_LANDMARKER_MODEL: str = "models/pose_landmarker_lite.task"

# Absolute Path objects — use these for existence checks and logging
FACE_MODEL_PATH: Path = MODELS_DIR / "face_landmarker.task"
POSE_MODEL_PATH: Path = MODELS_DIR / "pose_landmarker_lite.task"


# ---------------------------------------------------------------------------
# Startup summary
# ---------------------------------------------------------------------------
def config_summary() -> Dict[str, Any]:
    """Return a dict of all key config values for startup logging."""
    return {
        "CAMERA_INDEX": CAMERA_INDEX,
        "FRAME_WxH": f"{FRAME_WIDTH}x{FRAME_HEIGHT}",
        "TARGET_FPS": TARGET_FPS,
        "DEBUG_MODE": DEBUG_MODE,
        "EMA_ALPHA": EMA_ALPHA,
        "FACE_CONFIDENCE": FACE_DETECTION_CONFIDENCE,
        "POSE_CONFIDENCE": POSE_DETECTION_CONFIDENCE,
        "LOG_LEVEL": LOG_LEVEL,
        "MODELS_DIR": str(MODELS_DIR),
    }

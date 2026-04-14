"""
download_models.py — Download MediaPipe model files from Google CDN.

Usage (from zyro/ directory):
    python -m src.models.download_models

Models downloaded:
  models/face_landmarker.task       (~3.6 MB)
  models/pose_landmarker_lite.task  (~5.5 MB)
"""
from __future__ import annotations

import logging
import os
import sys
import urllib.request
from pathlib import Path
from typing import Dict

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

logger = logging.getLogger(__name__)

MODELS: Dict[str, str] = {
    "face_landmarker.task": (
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
        "face_landmarker/float16/latest/face_landmarker.task"
    ),
    "pose_landmarker_lite.task": (
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
        "pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
    ),
}

_MIN_SIZE_BYTES = 1024 * 1024  # 1 MB — anything smaller is likely corrupt


def _progress_hook(block_num: int, block_size: int, total_size: int) -> None:
    """Write a simple progress bar to stdout (raw write, no buffering issues)."""
    downloaded = block_num * block_size
    if total_size > 0:
        pct = min(100, int(downloaded / total_size * 100))
        bar = "#" * (pct // 5) + "-" * (20 - pct // 5)
        sys.stdout.write(
            f"\r  [{bar}] {pct:3d}%  ({downloaded // 1024} / {total_size // 1024} KB)"
        )
        sys.stdout.flush()
    else:
        sys.stdout.write(f"\r  Downloaded {downloaded // 1024} KB")
        sys.stdout.flush()


def download_models(dest_dir: str = "models") -> None:
    """
    Download all required MediaPipe model files.

    Args:
        dest_dir: Directory to save models (relative to cwd or absolute).
    """
    dest_path = Path(dest_dir)
    dest_path.mkdir(parents=True, exist_ok=True)

    for filename, url in MODELS.items():
        target = dest_path / filename

        if target.exists() and target.stat().st_size >= _MIN_SIZE_BYTES:
            logger.info("SKIP %s — already exists (%d KB)",
                        filename, target.stat().st_size // 1024)
            continue

        logger.info("Downloading %s ...", filename)
        try:
            urllib.request.urlretrieve(url, str(target), reporthook=_progress_hook)
            sys.stdout.write("\n")  # newline after progress bar
            sys.stdout.flush()
            size_kb = target.stat().st_size // 1024
            logger.info("OK  %s — %d KB", filename, size_kb)
        except Exception as exc:
            sys.stdout.write("\n")
            sys.stdout.flush()
            logger.error("FAILED %s: %s", filename, exc)
            if target.exists():
                target.unlink()
            raise

    logger.info("All models downloaded successfully.")


if __name__ == "__main__":
    # Bootstrap minimal logging for standalone use
    logging.basicConfig(
        level=logging.INFO,
        format="[%(asctime)s] %(levelname)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    # Resolve dest_dir relative to zyro/ root
    zyro_root = Path(__file__).parent.parent.parent
    download_models(str(zyro_root / "models"))

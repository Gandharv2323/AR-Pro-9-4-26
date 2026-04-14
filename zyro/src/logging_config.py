"""
logging_config.py — Structured logging setup for Zyro AR.

Call ``setup_logging()`` once in ``main.py`` before any other import
that might emit log messages.  Every other module must use:

    import logging
    logger = logging.getLogger(__name__)

and NEVER call ``logging.basicConfig`` themselves.
"""
from __future__ import annotations

import logging
import logging.handlers
import os
from pathlib import Path


def setup_logging(debug_mode: bool = False) -> None:
    """
    Configure the root logger with:
    - Console handler: INFO (or DEBUG if debug_mode=True)
      Format: ``[HH:MM:SS] LEVEL  module: message``
    - Rotating file handler: DEBUG level, logs/zyro.log, max 5 MB, 3 backups

    Args:
        debug_mode: If True, set console level to DEBUG.
    """
    log_dir = Path(__file__).parent.parent / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "zyro.log"

    root = logging.getLogger()
    root.setLevel(logging.DEBUG)  # Lowest level — handlers filter further

    # ------------------------------------------------------------------ #
    # Console handler
    # ------------------------------------------------------------------ #
    console_fmt = logging.Formatter(
        fmt="[%(asctime)s] %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.DEBUG if debug_mode else logging.INFO)
    console_handler.setFormatter(console_fmt)

    # ------------------------------------------------------------------ #
    # Rotating file handler
    # ------------------------------------------------------------------ #
    file_fmt = logging.Formatter(
        fmt="%(asctime)s  %(levelname)-7s  %(name)s  %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    file_handler = logging.handlers.RotatingFileHandler(
        log_file,
        maxBytes=5 * 1024 * 1024,   # 5 MB
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(file_fmt)

    # Clear any handlers added by third-party imports before our setup
    if root.handlers:
        root.handlers.clear()

    root.addHandler(console_handler)
    root.addHandler(file_handler)

    # Silence overly verbose third-party loggers
    logging.getLogger("mediapipe").setLevel(logging.WARNING)
    logging.getLogger("PIL").setLevel(logging.WARNING)
    logging.getLogger("absl").setLevel(logging.WARNING)

    logging.getLogger(__name__).info(
        "Logging initialised — console=%s, file=%s",
        "DEBUG" if debug_mode else "INFO",
        log_file,
    )

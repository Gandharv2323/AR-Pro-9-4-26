"""
conftest.py — Shared pytest configuration for Zyro AR test suite.

Adds the zyro/ directory to sys.path so that all tests can import:
  - config
  - src.modules.*
  - src.exceptions
without per-file sys.path hacks.

Run from the project root (Zyro-AR-Prototype-9-4-26/):
    pytest zyro/tests/ -v --cov=zyro/src
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# zyro/ directory (parent of tests/)
_ZYRO_ROOT = str(Path(__file__).parent.parent)
if _ZYRO_ROOT not in sys.path:
    sys.path.insert(0, _ZYRO_ROOT)

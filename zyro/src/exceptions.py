"""
exceptions.py — Custom exception hierarchy for Zyro AR.

All project-specific exceptions inherit from ZyroError so callers can
catch the entire family with a single ``except ZyroError`` if desired.
"""
from __future__ import annotations


class ZyroError(Exception):
    """Base exception for all Zyro AR runtime errors."""


class CameraError(ZyroError):
    """Raised for camera initialisation or configuration failures."""


class CameraDisconnectedError(CameraError):
    """Raised when a frame read fails mid-session (camera unplugged, etc.)."""


class ModelNotFoundError(ZyroError):
    """Raised when a MediaPipe model file is missing from models/."""


class AssetNotFoundError(ZyroError):
    """Raised when a requested PNG asset is not present on disk."""


class ConfigurationError(ZyroError):
    """Raised when an environment variable has an invalid type or value."""

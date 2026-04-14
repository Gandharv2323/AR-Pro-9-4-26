"""
asset_loader.py — PNG loader with RGBA enforcement, manifest support, and in-memory caching.

Loads assets from assets/manifest.json when available; falls back to filesystem scan.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Dict, List, Optional

from PIL import Image

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
import config
from src.exceptions import AssetNotFoundError

logger = logging.getLogger(__name__)

_MANIFEST_FILENAME = "manifest.json"


class AssetLoader:
    """Loads and caches RGBA PNG assets from the assets/ directory."""

    def __init__(self, base_dir: str = config.ASSETS_DIR) -> None:
        """
        Args:
            base_dir: Path to the assets root directory (relative to cwd or absolute).
        """
        self._base_dir: str = base_dir
        self._cache: Dict[str, Image.Image] = {}

    def get_asset(self, name: str) -> Image.Image:
        """
        Return a cached RGBA PIL Image by filename (relative to assets root).

        Args:
            name: Filename relative to the assets root, e.g. 'glasses/glasses_01.png'.

        Returns:
            PIL Image in RGBA mode.

        Raises:
            AssetNotFoundError: If the asset file does not exist on disk.
        """
        if name not in self._cache:
            full_path = os.path.join(self._base_dir, name)
            if not os.path.isfile(full_path):
                raise AssetNotFoundError(
                    f"Asset not found: '{full_path}'. "
                    "Run python generate_assets.py to regenerate all assets."
                )
            img = Image.open(full_path).convert("RGBA")
            self._cache[name] = img
            logger.debug("Asset loaded: %s (%dx%d)", name, img.width, img.height)
        return self._cache[name]

    def list_assets(self, category: str) -> List[str]:
        """
        List all PNG filenames in a given category subfolder.

        Reads from manifest.json if present; falls back to filesystem scan.

        Args:
            category: Subdirectory name, e.g. 'glasses', 'shirts', 'accessories'.

        Returns:
            Sorted list of relative paths suitable for use with get_asset().
        """
        manifest_path = os.path.join(self._base_dir, _MANIFEST_FILENAME)
        if os.path.isfile(manifest_path):
            try:
                manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
                if category in manifest and isinstance(manifest[category], list):
                    items = [
                        f"{category}/{entry['file']}"
                        for entry in manifest[category]
                        if "file" in entry
                    ]
                    logger.debug("Manifest loaded %d assets for category '%s'", len(items), category)
                    return items
            except (json.JSONDecodeError, KeyError) as exc:
                logger.warning("manifest.json parse error — falling back to filesystem: %s", exc)

        # Filesystem fallback
        folder = os.path.join(self._base_dir, category)
        if not os.path.isdir(folder):
            logger.warning("Asset category folder missing: %s", folder)
            return []
        files = sorted(
            f"{category}/{fn}"
            for fn in os.listdir(folder)
            if fn.lower().endswith(".png")
        )
        logger.debug("Filesystem scan: %d assets in '%s'", len(files), category)
        return files

    def get_manifest_label(self, category: str, filename: str) -> str:
        """
        Retrieve the human-readable label for an asset from the manifest.

        Args:
            category: Category name (e.g. 'glasses').
            filename: Bare filename (e.g. 'glasses_01.png').

        Returns:
            Label string from manifest, or filename stem as fallback.
        """
        manifest_path = os.path.join(self._base_dir, _MANIFEST_FILENAME)
        if os.path.isfile(manifest_path):
            try:
                manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
                for entry in manifest.get(category, []):
                    if entry.get("file") == filename:
                        return entry.get("label", filename)
            except (json.JSONDecodeError, KeyError):
                pass
        return os.path.splitext(filename)[0].replace("_", " ").title()

    def preload_all(self) -> None:
        """Pre-cache all PNG assets found under the assets root directory."""
        total = 0
        for category in ("glasses", "accessories", "shirts"):
            items = self.list_assets(category)
            for name in items:
                self.get_asset(name)
                total += 1
        logger.info("Preloaded %d assets.", total)


class AssetManager:
    """
    Manages item selection state for glasses, shirts, and accessories.
    Supports next/prev cycling and instant in-memory switching.
    """

    CATEGORY_GLASSES = "glasses"
    CATEGORY_SHIRTS = "shirts"

    def __init__(self, loader: AssetLoader) -> None:
        """
        Args:
            loader: An AssetLoader instance whose base_dir is already configured.
        """
        self._loader = loader
        self._glasses_items: List[str] = loader.list_assets(self.CATEGORY_GLASSES)
        self._shirt_items: List[str] = loader.list_assets(self.CATEGORY_SHIRTS)
        self._glasses_idx: int = 0
        self._shirt_idx: int = 0
        self._active_category: str = self.CATEGORY_GLASSES
        logger.info(
            "AssetManager ready — glasses: %d, shirts: %d",
            len(self._glasses_items), len(self._shirt_items),
        )

    # ------------------------------------------------------------------
    # Active category
    # ------------------------------------------------------------------
    def toggle_category(self) -> None:
        """Toggle the active category between glasses and shirts."""
        if self._active_category == self.CATEGORY_GLASSES:
            self._active_category = self.CATEGORY_SHIRTS
        else:
            self._active_category = self.CATEGORY_GLASSES
        logger.debug("Category toggled to: %s", self._active_category)

    def set_category(self, category: str) -> None:
        """Directly set active category ('glasses' or 'shirts')."""
        if category in (self.CATEGORY_GLASSES, self.CATEGORY_SHIRTS):
            self._active_category = category
            logger.debug("Category set to: %s", category)

    @property
    def active_category(self) -> str:
        return self._active_category

    # ------------------------------------------------------------------
    # Navigation
    # ------------------------------------------------------------------
    def next_item(self) -> None:
        """Advance one item in the active category (wraps around)."""
        if self._active_category == self.CATEGORY_GLASSES and self._glasses_items:
            self._glasses_idx = (self._glasses_idx + 1) % len(self._glasses_items)
            logger.debug("Glasses → index %d", self._glasses_idx)
        elif self._shirt_items:
            self._shirt_idx = (self._shirt_idx + 1) % len(self._shirt_items)
            logger.debug("Shirts → index %d", self._shirt_idx)

    def prev_item(self) -> None:
        """Go back one item in the active category (wraps around)."""
        if self._active_category == self.CATEGORY_GLASSES and self._glasses_items:
            self._glasses_idx = (self._glasses_idx - 1) % len(self._glasses_items)
            logger.debug("Glasses ← index %d", self._glasses_idx)
        elif self._shirt_items:
            self._shirt_idx = (self._shirt_idx - 1) % len(self._shirt_items)
            logger.debug("Shirts ← index %d", self._shirt_idx)

    # ------------------------------------------------------------------
    # Current assets
    # ------------------------------------------------------------------
    def get_current_glasses(self) -> Optional[Image.Image]:
        """Return the currently selected glasses asset, or None if no glasses exist."""
        if not self._glasses_items:
            return None
        return self._loader.get_asset(self._glasses_items[self._glasses_idx])

    def get_current_shirt(self) -> Optional[Image.Image]:
        """Return the currently selected shirt asset, or None if no shirts exist."""
        if not self._shirt_items:
            return None
        return self._loader.get_asset(self._shirt_items[self._shirt_idx])

    # ------------------------------------------------------------------
    # HUD info helpers
    # ------------------------------------------------------------------
    def glasses_label(self) -> str:
        """Return a human-readable label like 'Classic Oval (1/5)'."""
        if not self._glasses_items:
            return "Glasses (none)"
        total = len(self._glasses_items)
        idx = self._glasses_idx + 1
        filename = os.path.basename(self._glasses_items[self._glasses_idx])
        label = self._loader.get_manifest_label("glasses", filename)
        return f"{label}  ({idx}/{total})"

    def shirt_label(self) -> str:
        """Return a human-readable label like 'White Tee (1/3)'."""
        if not self._shirt_items:
            return "Shirts (none)"
        total = len(self._shirt_items)
        idx = self._shirt_idx + 1
        filename = os.path.basename(self._shirt_items[self._shirt_idx])
        label = self._loader.get_manifest_label("shirts", filename)
        return f"{label}  ({idx}/{total})"

    def current_item_label(self) -> str:
        """Return label for the active category's current item."""
        if self._active_category == self.CATEGORY_GLASSES:
            return self.glasses_label()
        return self.shirt_label()

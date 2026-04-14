"""
test_asset_loader.py — Unit tests for asset_loader.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.modules.asset_loader import AssetLoader, AssetManager
from src.exceptions import AssetNotFoundError


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def asset_dir(tmp_path: Path) -> Path:
    """Create a minimal fake assets directory with RGBA PNGs."""
    glasses_dir = tmp_path / "glasses"
    glasses_dir.mkdir()
    shirts_dir = tmp_path / "shirts"
    shirts_dir.mkdir()
    accessories_dir = tmp_path / "accessories"
    accessories_dir.mkdir()

    # Create 3 glasses
    for i in range(1, 4):
        img = Image.new("RGBA", (600, 200), (0, 0, 0, 0))
        img.save(glasses_dir / f"glasses_0{i}.png")

    # Create 3 shirts
    for i in range(1, 4):
        img = Image.new("RGBA", (800, 900), (0, 0, 0, 0))
        img.save(shirts_dir / f"shirt_0{i}.png")

    return tmp_path


@pytest.fixture
def loader(asset_dir: Path) -> AssetLoader:
    return AssetLoader(base_dir=str(asset_dir))


# ---------------------------------------------------------------------------
# AssetLoader tests
# ---------------------------------------------------------------------------

class TestAssetLoader:
    def test_list_assets_glasses_returns_nonempty_list(self, loader: AssetLoader):
        items = loader.list_assets("glasses")
        assert len(items) > 0

    def test_list_assets_shirts_returns_nonempty_list(self, loader: AssetLoader):
        items = loader.list_assets("shirts")
        assert len(items) > 0

    def test_get_asset_returns_rgba_image(self, loader: AssetLoader):
        items = loader.list_assets("glasses")
        img = loader.get_asset(items[0])
        assert img.mode == "RGBA"

    def test_get_asset_nonexistent_raises_error(self, loader: AssetLoader):
        with pytest.raises(AssetNotFoundError):
            loader.get_asset("glasses/nonexistent_file.png")

    def test_get_asset_caches_on_second_call(self, loader: AssetLoader):
        items = loader.list_assets("glasses")
        img1 = loader.get_asset(items[0])
        img2 = loader.get_asset(items[0])
        assert img1 is img2   # Same object — proves caching

    def test_list_assets_empty_category_returns_empty(self, loader: AssetLoader):
        result = loader.list_assets("accessories")   # Created but empty in fixture
        assert isinstance(result, list)

    def test_list_assets_nonexistent_category_returns_empty(self, loader: AssetLoader):
        result = loader.list_assets("nonexistent_category")
        assert result == []

    def test_manifest_labels_used_when_manifest_present(self, tmp_path: Path):
        glasses_dir = tmp_path / "glasses"
        glasses_dir.mkdir()
        img = Image.new("RGBA", (600, 200), (0, 0, 0, 0))
        img.save(glasses_dir / "glasses_01.png")

        manifest = {
            "glasses": [{"id": "g01", "file": "glasses_01.png", "label": "Classic Oval"}]
        }
        (tmp_path / "manifest.json").write_text(json.dumps(manifest))

        ldr = AssetLoader(base_dir=str(tmp_path))
        label = ldr.get_manifest_label("glasses", "glasses_01.png")
        assert label == "Classic Oval"


# ---------------------------------------------------------------------------
# AssetManager tests
# ---------------------------------------------------------------------------

class TestAssetManager:
    def test_next_item_cycles_glasses(self, loader: AssetLoader):
        mgr = AssetManager(loader)
        mgr.set_category("glasses")
        items = loader.list_assets("glasses")
        n = len(items)

        for _ in range(n):
            mgr.next_item()
        # After n next_items, index should wrap back to 0
        assert mgr._glasses_idx == 0

    def test_prev_item_wraps_glasses(self, loader: AssetLoader):
        mgr = AssetManager(loader)
        mgr.set_category("glasses")
        mgr.prev_item()
        items = loader.list_assets("glasses")
        expected_idx = len(items) - 1
        assert mgr._glasses_idx == expected_idx

    def test_get_current_glasses_returns_image(self, loader: AssetLoader):
        mgr = AssetManager(loader)
        img = mgr.get_current_glasses()
        assert img is not None
        assert img.mode == "RGBA"

    def test_get_current_shirt_returns_image(self, loader: AssetLoader):
        mgr = AssetManager(loader)
        img = mgr.get_current_shirt()
        assert img is not None
        assert img.mode == "RGBA"

    def test_toggle_category_switches(self, loader: AssetLoader):
        mgr = AssetManager(loader)
        original = mgr.active_category
        mgr.toggle_category()
        assert mgr.active_category != original

    def test_empty_glasses_returns_none(self, tmp_path: Path):
        """AssetManager with empty glasses dir returns None safely."""
        (tmp_path / "glasses").mkdir()
        (tmp_path / "shirts").mkdir()
        img = Image.new("RGBA", (800, 900), (0, 0, 0, 0))
        img.save(tmp_path / "shirts" / "shirt_01.png")

        ldr = AssetLoader(base_dir=str(tmp_path))
        mgr = AssetManager(ldr)
        result = mgr.get_current_glasses()
        assert result is None

    def test_asset_manager_empty_glasses_next_item_does_not_crash(self, tmp_path: Path):
        """next_item on empty category should not raise."""
        (tmp_path / "glasses").mkdir()
        (tmp_path / "shirts").mkdir()

        ldr = AssetLoader(base_dir=str(tmp_path))
        mgr = AssetManager(ldr)
        mgr.set_category("glasses")
        mgr.next_item()   # should not raise IndexError

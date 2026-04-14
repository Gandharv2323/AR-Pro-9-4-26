"""
test_config.py — Unit tests for config.py including env var overrides and validation.
"""
from __future__ import annotations

import importlib
import os
import sys
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _reload_config(env_overrides: dict):
    """Helper: patch environment and reload config module."""
    # Build clean env starting from current env, applying overrides
    clean_env = {k: v for k, v in os.environ.items()}
    clean_env.update(env_overrides)
    # Remove keys set to None (simulate missing vars)
    for key, val in env_overrides.items():
        if val is None:
            clean_env.pop(key, None)

    with patch.dict(os.environ, clean_env, clear=False):
        # Reload dotenv by patching load_dotenv to no-op, then reload config
        with patch("config.load_dotenv"):
            import config as cfg
            importlib.reload(cfg)
        return cfg


class TestConfigEnvVars:
    def test_camera_index_reads_from_env(self):
        cfg = _reload_config({"CAMERA_INDEX": "2"})
        assert cfg.CAMERA_INDEX == 2

    def test_ema_alpha_reads_from_env(self):
        cfg = _reload_config({"EMA_ALPHA": "0.5"})
        assert abs(cfg.EMA_ALPHA - 0.5) < 1e-9

    def test_debug_mode_true_reads_from_env(self):
        cfg = _reload_config({"DEBUG_MODE": "true"})
        assert cfg.DEBUG_MODE is True

    def test_debug_mode_false_reads_from_env(self):
        cfg = _reload_config({"DEBUG_MODE": "0"})
        assert cfg.DEBUG_MODE is False

    def test_defaults_applied_when_env_missing(self):
        cfg = _reload_config({"CAMERA_INDEX": None, "EMA_ALPHA": None})
        assert cfg.CAMERA_INDEX == 0
        assert abs(cfg.EMA_ALPHA - 0.35) < 1e-9


class TestConfigValidation:
    def test_invalid_int_raises_configuration_error(self):
        from src.exceptions import ConfigurationError
        with pytest.raises((ConfigurationError, ValueError)):
            _reload_config({"CAMERA_INDEX": "not_an_int"})

    def test_invalid_float_raises_configuration_error(self):
        from src.exceptions import ConfigurationError
        with pytest.raises((ConfigurationError, ValueError)):
            _reload_config({"EMA_ALPHA": "not_a_float"})

    def test_invalid_bool_raises_configuration_error(self):
        from src.exceptions import ConfigurationError
        with pytest.raises((ConfigurationError, ValueError)):
            _reload_config({"DEBUG_MODE": "maybe"})


class TestConfigSummary:
    def test_config_summary_returns_dict(self):
        import config
        summary = config.config_summary()
        assert isinstance(summary, dict)
        assert "CAMERA_INDEX" in summary
        assert "TARGET_FPS" in summary

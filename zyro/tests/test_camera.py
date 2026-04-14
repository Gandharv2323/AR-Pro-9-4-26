"""
test_camera.py — Unit tests for camera.py (all cv2.VideoCapture mocked).
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch, call

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.modules.camera import Camera, list_available_cameras, select_best_camera
from src.exceptions import CameraError, CameraDisconnectedError


# ---------------------------------------------------------------------------
# Camera init tests
# ---------------------------------------------------------------------------

class TestCameraInit:
    def test_init_raises_camera_error_if_never_opens(self):
        """Camera that never opens after all retries → CameraError."""
        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = False

        with patch("src.modules.camera.cv2.VideoCapture", return_value=mock_cap), \
             patch("src.modules.camera.time.sleep"):    # Don't actually sleep
            with pytest.raises(CameraError):
                Camera(index=0)

    def test_init_succeeds_on_second_retry(self):
        """Camera that fails on first try but succeeds on second → no exception."""
        mock_cap_fail = MagicMock()
        mock_cap_fail.isOpened.return_value = False

        mock_cap_ok = MagicMock()
        mock_cap_ok.isOpened.return_value = True
        mock_cap_ok.read.return_value = (True, np.zeros((720, 1280, 3), dtype=np.uint8))

        call_count = {"n": 0}
        def make_cap(index):
            call_count["n"] += 1
            return mock_cap_fail if call_count["n"] == 1 else mock_cap_ok

        with patch("src.modules.camera.cv2.VideoCapture", side_effect=make_cap), \
             patch("src.modules.camera.time.sleep"):
            cam = Camera(index=0)   # Should not raise
        assert cam is not None


# ---------------------------------------------------------------------------
# get_frame tests
# ---------------------------------------------------------------------------

class TestGetFrame:
    def _make_camera(self, read_return):
        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = True
        mock_cap.read.return_value = read_return

        with patch("src.modules.camera.cv2.VideoCapture", return_value=mock_cap), \
             patch("src.modules.camera.cv2.flip", side_effect=lambda f, _: f):
            cam = Camera.__new__(Camera)
            cam._cap = mock_cap
            cam._frame_interval = 0.0
            cam._last_frame_time = 0.0
        return cam, mock_cap

    def test_get_frame_returns_ndarray(self):
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        cam, mock_cap = self._make_camera((True, frame))

        with patch("src.modules.camera.cv2.flip", return_value=frame), \
             patch("src.modules.camera.time.perf_counter", return_value=1.0), \
             patch("src.modules.camera.time.sleep"):
            cam._last_frame_time = 0.0
            cam._frame_interval = 0.0
            result = cam.get_frame()
        assert result is not None
        assert result.shape == (720, 1280, 3)

    def test_get_frame_raises_on_disconnect(self):
        """cap.read() returning False → CameraDisconnectedError."""
        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = True
        mock_cap.read.return_value = (False, None)

        cam = Camera.__new__(Camera)
        cam._cap = mock_cap
        cam._frame_interval = 0.0
        cam._last_frame_time = 0.0

        with patch("src.modules.camera.time.perf_counter", return_value=1.0), \
             patch("src.modules.camera.time.sleep"):
            with pytest.raises(CameraDisconnectedError):
                cam.get_frame()


# ---------------------------------------------------------------------------
# list_available_cameras
# ---------------------------------------------------------------------------

class TestListAvailableCameras:
    def test_returns_empty_when_no_cameras(self):
        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = False
        with patch("src.modules.camera.cv2.VideoCapture", return_value=mock_cap):
            result = list_available_cameras(max_check=3)
        assert result == []

    def test_returns_correct_indices(self):
        def make_cap(index):
            m = MagicMock()
            m.isOpened.return_value = (index in (0, 2))
            return m

        with patch("src.modules.camera.cv2.VideoCapture", side_effect=make_cap):
            result = list_available_cameras(max_check=4)
        assert 0 in result
        assert 2 in result
        assert 1 not in result
        assert 3 not in result


class TestSelectBestCamera:
    def test_raises_when_no_cameras(self):
        with patch("src.modules.camera.list_available_cameras", return_value=[]):
            with pytest.raises(CameraError):
                select_best_camera()

    def test_returns_first_available(self):
        with patch("src.modules.camera.list_available_cameras", return_value=[2, 1, 0]):
            idx = select_best_camera()
        assert idx == 2

"""
test_detector.py — Unit tests for detector.py module.

All MediaPipe calls are mocked — no real model or camera needed.
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.modules.detector import FaceResult, PoseResult, FaceDetector, PoseDetector
from src.exceptions import ModelNotFoundError


# ---------------------------------------------------------------------------
# FaceResult / PoseResult dataclass tests
# ---------------------------------------------------------------------------

class TestFaceResult:
    def test_face_result_dataclass_not_found(self):
        result = FaceResult(found=False)
        assert result.found is False
        assert result.landmarks == {}

    def test_face_result_accessing_landmarks_does_not_raise(self):
        result = FaceResult(found=False)
        lm = result.landmarks   # must not raise AttributeError
        assert isinstance(lm, dict)

    def test_face_result_with_landmarks(self):
        result = FaceResult(found=True, landmarks={33: (100, 200), 263: (300, 200)})
        assert result.found is True
        assert result.landmarks[33] == (100, 200)


class TestPoseResult:
    def test_pose_result_dataclass_not_found(self):
        result = PoseResult(found=False)
        assert result.found is False
        assert result.landmarks == {}

    def test_pose_result_accessing_landmarks_does_not_raise(self):
        result = PoseResult(found=False)
        lm = result.landmarks
        assert isinstance(lm, dict)

    def test_pose_result_with_landmarks(self):
        result = PoseResult(found=True, landmarks={11: (400, 300), 12: (600, 300)})
        assert result.found is True
        assert result.landmarks[12] == (600, 300)


# ---------------------------------------------------------------------------
# FaceDetector (mocked)
# ---------------------------------------------------------------------------

class TestFaceDetector:
    def test_detector_raises_model_not_found_on_missing_model(self):
        with pytest.raises(ModelNotFoundError):
            FaceDetector(model_path="nonexistent/path/face.task")

    def test_detect_returns_not_found_on_none_frame(self, tmp_path):
        """FaceDetector.detect(None) should return found=False, not raise."""
        fake_task = tmp_path / "face_landmarker.task"
        fake_task.write_bytes(b"fake" * 1000)

        with patch("src.modules.detector.FaceLandmarker") as MockFL:
            mock_instance = MagicMock()
            MockFL.create_from_options.return_value = mock_instance

            with patch("src.modules.detector._resolve_model_path", return_value=str(fake_task)):
                det = FaceDetector.__new__(FaceDetector)
                det._detector = mock_instance

            result = det.detect(None)
            assert result.found is False

    def test_detect_returns_not_found_when_no_face(self, tmp_path):
        """When MediaPipe returns empty face_landmarks, found should be False."""
        fake_task = tmp_path / "face_landmarker.task"
        fake_task.write_bytes(b"fake" * 1000)
        mock_mp_result = MagicMock()
        mock_mp_result.face_landmarks = []

        with patch("src.modules.detector.FaceLandmarker") as MockFL, \
             patch("src.modules.detector.mp") as mock_mp:
            mock_instance = MagicMock()
            mock_instance.detect.return_value = mock_mp_result
            MockFL.create_from_options.return_value = mock_instance
            mock_mp.Image.return_value = MagicMock()
            mock_mp.ImageFormat.SRGB = MagicMock()

            det = FaceDetector.__new__(FaceDetector)
            det._detector = mock_instance

            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            result = det.detect(frame)
            assert result.found is False

    def test_detect_returns_not_found_on_inference_exception(self):
        """Inference exceptions must be caught; return found=False."""
        det = FaceDetector.__new__(FaceDetector)
        det._detector = MagicMock()
        det._detector.detect.side_effect = RuntimeError("MediaPipe internal error")

        with patch("src.modules.detector.mp") as mock_mp:
            mock_mp.Image.return_value = MagicMock()
            mock_mp.ImageFormat.SRGB = MagicMock()
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            result = det.detect(frame)
        assert result.found is False


# ---------------------------------------------------------------------------
# PoseDetector (mocked)
# ---------------------------------------------------------------------------

class TestPoseDetector:
    def test_detector_raises_model_not_found_on_missing_model(self):
        with pytest.raises(ModelNotFoundError):
            PoseDetector(model_path="nonexistent/pose.task")

    def test_detect_returns_not_found_on_none_frame(self):
        det = PoseDetector.__new__(PoseDetector)
        det._detector = MagicMock()
        result = det.detect(None)
        assert result.found is False

    def test_detect_returns_not_found_on_inference_exception(self):
        det = PoseDetector.__new__(PoseDetector)
        det._detector = MagicMock()
        det._detector.detect.side_effect = RuntimeError("Pose error")

        with patch("src.modules.detector.mp") as mock_mp:
            mock_mp.Image.return_value = MagicMock()
            mock_mp.ImageFormat.SRGB = MagicMock()
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            result = det.detect(frame)
        assert result.found is False

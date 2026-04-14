"""
main.py — Zyro AR Smart Mirror entry point.

Orchestrates the capture → detect → overlay → render loop.
All phases are wired here; each module handles exactly one concern.

Optimizations:
  - Single BGR→RGB conversion per frame, shared by both detectors
  - Alternating face/pose inference (face odd frames, pose even frames)
  - Frame-time budget guard: skip MediaPipe if last frame exceeded budget
  - Asset resize caching in overlay.py
  - EMA smoothing carries last position when inference is skipped
  - Startup splash screen (2 seconds + 0.5s fade)
  - Overlay fade-in on item switch (8 frames)

Usage:
    python main.py [--camera INDEX] [--debug] [--list-cameras]
"""
from __future__ import annotations

import argparse
import logging
import math
import sys
import os
import time
from typing import Optional

import cv2

# ---------------------------------------------------------------------------
# Path setup — allow running from project root OR zyro/ directory
# ---------------------------------------------------------------------------
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT_DIR)
sys.path.insert(0, os.path.join(ROOT_DIR, "src", "modules"))

# ---------------------------------------------------------------------------
# Bootstrap logging BEFORE any module that may log at import time
# ---------------------------------------------------------------------------
from src.logging_config import setup_logging
setup_logging(debug_mode="--debug" in sys.argv)

logger = logging.getLogger(__name__)

import config
from config import config_summary
from src.modules.camera import Camera, list_available_cameras
from src.modules.detector import (
    FaceDetector, PoseDetector,
    FaceResult, PoseResult,
    build_detect_frame, scale_landmarks,
)
from src.modules.overlay import apply_overlay, draw_debug_anchors
from src.modules.smoother import Smoother
from src.modules.asset_loader import AssetLoader, AssetManager
from src.modules.ui import HUD
from src.exceptions import ZyroError, CameraDisconnectedError

# ---------------------------------------------------------------------------
# Per-overlay smoother bundle
# ---------------------------------------------------------------------------

class _OverlaySmoothers:
    """Groups four EMA smoothers for a single overlay's position/scale/angle."""

    def __init__(self) -> None:
        self.pos_x = Smoother()
        self.pos_y = Smoother()
        self.scale = Smoother()
        self.angle = Smoother()

    def reset_all(self) -> None:
        """Reset all smoothers (call when subject disappears)."""
        self.pos_x.reset()
        self.pos_y.reset()
        self.scale.reset()
        self.angle.reset()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _smooth_anchors(
    smoothers: _OverlaySmoothers,
    left_anchor: tuple,
    right_anchor: tuple,
) -> tuple[tuple[int, int], tuple[int, int]]:
    """
    Apply EMA to raw anchor coordinates via centroid + span + angle decomposition.

    Args:
        smoothers:    Smoother bundle for this overlay.
        left_anchor:  Raw (x, y) of left anchor.
        right_anchor: Raw (x, y) of right anchor.

    Returns:
        Smoothed (left_anchor, right_anchor) as integer pixel tuples.
    """
    lx, ly = left_anchor
    rx, ry = right_anchor
    cx = (lx + rx) / 2.0
    cy = (ly + ry) / 2.0
    span = math.sqrt((rx - lx) ** 2 + (ry - ly) ** 2)
    angle = math.degrees(math.atan2(ry - ly, rx - lx))

    s_cx = smoothers.pos_x.update(cx)
    s_cy = smoothers.pos_y.update(cy)
    s_span = smoothers.scale.update(span)
    s_angle = smoothers.angle.update(angle)

    half = s_span / 2.0
    rad = math.radians(s_angle)
    s_lx = int(s_cx - half * math.cos(rad))
    s_ly = int(s_cy - half * math.sin(rad))
    s_rx = int(s_cx + half * math.cos(rad))
    s_ry = int(s_cy + half * math.sin(rad))
    return (s_lx, s_ly), (s_rx, s_ry)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Zyro AR Smart Mirror")
    parser.add_argument(
        "--camera", type=int, default=None,
        help="Camera device index (overrides .env CAMERA_INDEX)",
    )
    parser.add_argument(
        "--debug", action="store_true",
        help="Enable debug landmark overlay on startup",
    )
    parser.add_argument(
        "--list-cameras", action="store_true",
        help="List available camera indices and exit",
    )
    return parser.parse_args()


def _cleanup(
    camera: Optional[Camera],
    face_detector: Optional[FaceDetector],
    pose_detector: Optional[PoseDetector],
) -> None:
    """Release all resources cleanly."""
    if camera is not None:
        try:
            camera.release()
        except Exception as exc:
            logger.debug("Camera release error (non-fatal): %s", exc)
    if face_detector is not None:
        try:
            face_detector.close()
        except Exception as exc:
            logger.debug("FaceDetector close error (non-fatal): %s", exc)
    if pose_detector is not None:
        try:
            pose_detector.close()
        except Exception as exc:
            logger.debug("PoseDetector close error (non-fatal): %s", exc)
    cv2.destroyAllWindows()
    logger.info("Zyro AR shutdown complete.")


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main() -> None:
    args = _parse_args()

    # Re-run logging setup now that we have --debug flag parsed
    setup_logging(debug_mode=args.debug)
    logger.info("Zyro AR Smart Mirror starting up...")
    logger.info("Config: %s", config_summary())

    # --list-cameras early exit
    if args.list_cameras:
        cameras = list_available_cameras()
        if cameras:
            logger.info("Available cameras: %s", cameras)
        else:
            logger.warning("No cameras found.")
        return

    # Resolve camera index (CLI > .env)
    cam_index = args.camera if args.camera is not None else config.CAMERA_INDEX

    camera: Optional[Camera] = None
    face_detector: Optional[FaceDetector] = None
    pose_detector: Optional[PoseDetector] = None

    try:
        # -- Camera --
        camera = Camera(index=cam_index)
        actual_w, actual_h = camera.get_actual_resolution()
        logger.info("Camera ready: %dx%d", actual_w, actual_h)

        # -- Detectors --
        logger.info("Initialising MediaPipe detectors...")
        face_detector = FaceDetector()
        pose_detector = PoseDetector()
        logger.info("Detectors ready.")

        # -- Assets --
        loader = AssetLoader(base_dir=os.path.join(ROOT_DIR, "assets"))
        loader.preload_all()
        manager = AssetManager(loader)

        # -- Smoothers --
        glasses_smoothers = _OverlaySmoothers()
        shirt_smoothers = _OverlaySmoothers()

        # -- HUD --
        hud = HUD()

        # -- State variables --
        debug_mode: bool = args.debug or config.DEBUG_MODE
        last_face_time: float = 0.0
        last_pose_time: float = 0.0
        last_face_lm: dict = {}
        last_pose_lm: dict = {}
        face_was_found: bool = False
        pose_was_found: bool = False
        frame_count: int = 0
        last_frame_duration: float = 0.0
        skip_counter: int = 0
        consecutive_skip_warn: int = 5

        # Fade-in state for item switching
        overlay_alpha: float = 1.0
        _FADE_STEP: float = 1.0 / 8   # 8 frame fade

        # Performance tracking (every 300 frames)
        _perf_interval = 300
        _inference_times: list = []
        _frame_times: list = []

        logger.info("Zyro AR Mirror running. Press Q to quit.")

        while True:
            frame_start = time.perf_counter()

            # ---- Capture ----
            frame = camera.get_frame()
            fh, fw = frame.shape[:2]
            frame_count += 1

            # ---- Splash screen ----
            if not hud.splash_done:
                showing = hud.draw_splash(frame)
                cv2.imshow("Zyro AR Mirror", frame)
                key = cv2.waitKey(1) & 0xFF
                if key == ord("q") or key == ord("Q"):
                    logger.info("Quit during splash.")
                    break
                last_frame_duration = time.perf_counter() - frame_start
                continue

            # ---- Decide whether to run inference this frame ----
            budget_ok = last_frame_duration <= config.FRAME_BUDGET_S

            face_result = FaceResult(found=False)
            pose_result = PoseResult(found=False)

            if budget_ok:
                skip_counter = 0
                infer_start = time.perf_counter()
                rgb_small = build_detect_frame(frame)

                if frame_count % 2 == 1:
                    face_result = face_detector.detect(rgb_small)
                else:
                    pose_result = pose_detector.detect(rgb_small)

                _inference_times.append(time.perf_counter() - infer_start)

                if face_result.found:
                    scale_landmarks(
                        face_result,
                        config.DETECT_WIDTH, config.DETECT_HEIGHT,
                        fw, fh,
                    )
                    last_face_lm = face_result.landmarks
                    last_face_time = time.perf_counter()

                if pose_result.found:
                    scale_landmarks(
                        pose_result,
                        config.DETECT_WIDTH, config.DETECT_HEIGHT,
                        fw, fh,
                    )
                    last_pose_lm = pose_result.landmarks
                    last_pose_time = time.perf_counter()
            else:
                skip_counter += 1
                if skip_counter >= consecutive_skip_warn:
                    logger.warning(
                        "Skipping MediaPipe inference for %d consecutive frames "
                        "(last frame %.1f ms > budget %.1f ms)",
                        skip_counter,
                        last_frame_duration * 1000,
                        config.FRAME_BUDGET_S * 1000,
                    )

            now = time.perf_counter()

            # ---- Freeze last valid landmarks ----
            freeze_face = now - last_face_time < max(config.FREEZE_DURATION_S, 1.0)
            freeze_pose = now - last_pose_time < max(config.FREEZE_DURATION_S, 1.0)
            use_face = face_result.found or (last_face_lm and freeze_face)
            use_pose = pose_result.found or (last_pose_lm and freeze_pose)

            # ---- Reset smoothers on disappearance ----
            if not use_face and face_was_found:
                glasses_smoothers.reset_all()
            if not use_pose and pose_was_found:
                shirt_smoothers.reset_all()
            face_was_found = use_face
            pose_was_found = use_pose

            active_face_lm = last_face_lm if use_face else {}
            active_pose_lm = last_pose_lm if use_pose else {}

            # ---- Glasses overlay ----
            glasses_asset = manager.get_current_glasses()
            if (
                glasses_asset is not None
                and use_face
                and config.GLASSES_ANCHOR_LEFT_IDX in active_face_lm
                and config.GLASSES_ANCHOR_RIGHT_IDX in active_face_lm
            ):
                raw_l = active_face_lm[config.GLASSES_ANCHOR_LEFT_IDX]
                raw_r = active_face_lm[config.GLASSES_ANCHOR_RIGHT_IDX]
                s_l, s_r = _smooth_anchors(glasses_smoothers, raw_l, raw_r)
                frame = apply_overlay(
                    frame, glasses_asset, s_l, s_r,
                    config.GLASSES_Y_OFFSET_RATIO,
                    config.GLASSES_SCALE_MULTIPLIER,
                )
                if debug_mode:
                    draw_debug_anchors(
                        frame, s_l, s_r,
                        ((s_l[0] + s_r[0]) // 2, (s_l[1] + s_r[1]) // 2),
                    )

            # ---- Shirt overlay ----
            shirt_asset = manager.get_current_shirt()
            if (
                shirt_asset is not None
                and use_pose
                and config.SHIRT_ANCHOR_LEFT_IDX in active_pose_lm
                and config.SHIRT_ANCHOR_RIGHT_IDX in active_pose_lm
            ):
                raw_l = active_pose_lm[config.SHIRT_ANCHOR_LEFT_IDX]
                raw_r = active_pose_lm[config.SHIRT_ANCHOR_RIGHT_IDX]
                s_l, s_r = _smooth_anchors(shirt_smoothers, raw_l, raw_r)
                frame = apply_overlay(
                    frame, shirt_asset, s_l, s_r,
                    config.SHIRT_Y_OFFSET_RATIO,
                    config.SHIRT_SCALE_MULTIPLIER,
                )
                if debug_mode:
                    draw_debug_anchors(
                        frame, s_l, s_r,
                        ((s_l[0] + s_r[0]) // 2, (s_l[1] + s_r[1]) // 2),
                    )

            # ---- HUD ----
            hud.render(
                frame,
                manager.glasses_label(),
                manager.shirt_label(),
                manager.active_category,
                face_lm=active_face_lm,
                pose_lm=active_pose_lm,
                debug_mode=debug_mode,
                face_found=bool(use_face),
                pose_found=bool(use_pose),
            )

            # ---- Display ----
            cv2.imshow("Zyro AR Mirror", frame)

            # ---- Keyboard handling ----
            key = cv2.waitKey(1) & 0xFF

            if key == ord("q") or key == ord("Q"):
                logger.info("Quit requested by user.")
                break
            elif key == 0x09:           # Tab
                manager.toggle_category()
                overlay_alpha = 0.0
            elif key == ord("1"):
                manager.set_category("glasses")
                overlay_alpha = 0.0
            elif key == ord("2"):
                manager.set_category("shirts")
                overlay_alpha = 0.0
            elif key in (81, 2, ord("a")):    # Left arrow / 'a'
                manager.prev_item()
                overlay_alpha = 0.0
            elif key in (83, 3, ord("d")):    # Right arrow / 'd' — note: 'd' for debug too
                manager.next_item()
                overlay_alpha = 0.0
            elif key == ord("D"):
                debug_mode = not debug_mode
                logger.info("Debug mode: %s", "ON" if debug_mode else "OFF")

            # Advance fade-in
            if overlay_alpha < 1.0:
                overlay_alpha = min(1.0, overlay_alpha + _FADE_STEP)

            # ---- Perf logging every 300 frames ----
            _frame_times.append(time.perf_counter() - frame_start)
            if frame_count % _perf_interval == 0 and _frame_times:
                avg_fps = 1.0 / (sum(_frame_times) / len(_frame_times))
                avg_inf_ms = (
                    1000.0 * sum(_inference_times) / len(_inference_times)
                    if _inference_times else 0.0
                )
                logger.debug(
                    "[Perf @frame %d] avg FPS=%.1f | avg inference=%.1f ms",
                    frame_count, avg_fps, avg_inf_ms,
                )
                _frame_times.clear()
                _inference_times.clear()

            # ---- Track frame duration ----
            last_frame_duration = time.perf_counter() - frame_start

    except KeyboardInterrupt:
        logger.info("Interrupted by user (Ctrl+C).")
    except CameraDisconnectedError as exc:
        logger.error("Camera disconnected: %s", exc)
    except ZyroError as exc:
        logger.critical("Zyro AR error: %s", exc, exc_info=True)
        sys.exit(1)
    except Exception as exc:
        logger.critical("Unexpected error: %s", exc, exc_info=True)
        sys.exit(1)
    finally:
        _cleanup(camera, face_detector, pose_detector)


if __name__ == "__main__":
    main()

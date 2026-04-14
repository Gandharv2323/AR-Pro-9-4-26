# ZYRO AR — PRODUCTION HARDENING PROMPT
### For Antigravity IDE · Claude Sonnet Agent · Execute In Order

---

You are a senior Python engineer working on the **Zyro AR Smart Mirror** project.
The prototype modules exist but the system is NOT production-ready.
Your job is to execute every task below in strict order without skipping.
Read the entire prompt before writing a single line of code.
After each numbered task, verify it works before moving to the next.

---

## ═══ CONTEXT: WHAT ALREADY EXISTS ═══════════════════════════════

```
zyro/
├── main.py, config.py, requirements.txt, generate_assets.py
├── src/modules/ → camera.py, detector.py, overlay.py,
│                   smoother.py, asset_loader.py, ui.py
├── assets/glasses/ → glasses_01/02/03.png (placeholders)
├── assets/shirts/  → EMPTY ← critical bug
├── assets/accessories/ → EMPTY
├── models/ → face_landmarker.task, pose_landmarker_lite.task
└── tests/ → test_smoother.py, test_overlay.py
```

Known problems: no logging, no error handling, shirts empty,
no .env config, no pinned deps, minimal tests, no installer.

---

## ═══ TASK 0 — READ AND AUDIT FIRST ════════════════════════════

Before writing anything:
1. Read `main.py` fully
2. Read `config.py` fully
3. Read `src/modules/detector.py` fully — note whether it uses
   the old `mp.solutions` API or new `mediapipe.tasks` API
4. Read `src/modules/overlay.py` fully
5. Read `generate_assets.py` fully
6. Run `python generate_assets.py` — confirm what it actually generates
7. Print the full directory tree to confirm what files exist

Do NOT assume. Read first, then act.

---

## ═══ TASK 1 — FIX DEPENDENCIES ════════════════════════════════

### 1a. Pin all versions in requirements.txt
Replace the current requirements.txt with exact pinned versions:

```
opencv-python==4.10.0.84
mediapipe==0.10.14
numpy==1.26.4
Pillow==10.4.0
python-dotenv==1.0.1
```

### 1b. Create requirements-dev.txt
```
pytest==8.2.2
pytest-cov==5.0.0
black==24.4.2
flake8==7.1.0
mypy==1.10.0
```

### 1c. Run pip install to verify no conflicts
```
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

If any version conflict exists, resolve it and update the pinned
version to the highest mutually compatible version.

---

## ═══ TASK 2 — GENERATE ALL MISSING ASSETS ══════════════════════

This is the most critical functional bug. shirts/ and accessories/
are empty — the overlay system cannot demo Phase 3 at all.

### 2a. Generate shirt assets (3 designs)

Using Pillow, create `generate_assets.py` (replace existing) that
generates ALL of the following:

**Shirt designs — each must be 800×900 px RGBA PNG:**

- `shirt_01.png` — Classic white T-shirt silhouette
  - White fill (#FFFFFF), dark gray outline (#333333), 3px stroke
  - Crew neckline centered at y=110 from top, width 160px
  - Sleeve ends at x=60 (left) and x=740 (right), y=280
  - Hem at y=860
  - Left chest pocket detail (80×60px rectangle at x=180, y=220)

- `shirt_02.png` — Navy blue polo shirt
  - Fill #1B3A6B, collar detail at top center
  - 3-button placket, slightly more fitted silhouette

- `shirt_03.png` — Black hoodie
  - Fill #1A1A1A, kangaroo pocket rectangle centered at y=600
  - Hood shape rising from both shoulders merging at top center
  - Drawstring dots visible at neckline

**For each shirt, the design MUST:**
- Be centered horizontally (chest center at x=400)
- Have fully transparent background (alpha=0 outside silhouette)
- Have the shoulder line at approximately y=180 from top
- Be sized so shoulder-to-shoulder span is ~540px (x=130 to x=670)
  This is the anchor span MediaPipe will use for scaling

### 2b. Generate accessories (3 designs)

**Earrings — each 200×400 px RGBA PNG:**

- `earrings_01.png` — Simple gold hoops
  Two circles (radius 40) at x=40 and x=160, y=200
  Gold fill #FFD700, 3px stroke

- `earrings_02.png` — Silver drop earrings
  Two teardrop shapes at same positions, silver #C0C0C0

- `earrings_03.png` — Pearl studs
  Two circles (radius 20) at x=40 and x=160, y=200, white #F5F5F5

### 2c. Generate additional glasses designs (supplement existing)

The 3 existing glasses are placeholders. Add:

- `glasses_04.png` — Thick black wayfarer frames (600×200 px RGBA)
- `glasses_05.png` — Thin gold wire frames (600×200 px RGBA)

### 2d. Run generate_assets.py and verify

After running, verify:
- `assets/shirts/` contains 3 PNG files, each ~800×900 px
- `assets/accessories/` contains 3 PNG files
- `assets/glasses/` contains 5 PNG files
- All files open without error in Pillow
- All files have RGBA mode (not RGB)
- No file is smaller than 5KB (if smaller, the silhouette is wrong)

---

## ═══ TASK 3 — ADD STRUCTURED LOGGING ══════════════════════════

### 3a. Create `src/logging_config.py`

```python
# Must implement:
# - Console handler: INFO level, format: "[HH:MM:SS] LEVEL module: message"
# - File handler: DEBUG level, rotating, max 5MB, 3 backups
# - File: logs/zyro.log (create logs/ dir if not exists)
# - Function: setup_logging(debug_mode: bool = False) -> None
# - Called once from main.py before anything else
```

### 3b. Replace ALL print() statements across every file

Go through every file and replace:
- `print(...)` → `logger.info(...)` or `logger.debug(...)`
- `print(f"ERROR: ...")` → `logger.error(...)`
- `print(f"WARNING: ...")` → `logger.warning(...)`

Each module must have at its top:
```python
import logging
logger = logging.getLogger(__name__)
```

Never use `logging.basicConfig` in module files — only in `logging_config.py`.

### 3c. Add performance logging

In `main.py` main loop, log at DEBUG level every 300 frames:
- Average FPS over last 300 frames
- Average inference time (ms)
- Average overlay time (ms)

---

## ═══ TASK 4 — ENVIRONMENT-BASED CONFIG ═════════════════════════

### 4a. Create `.env.example` (committed to repo)

```
# Zyro AR Configuration
CAMERA_INDEX=0
FRAME_WIDTH=1280
FRAME_HEIGHT=720
TARGET_FPS=30
DEBUG_MODE=False
EMA_ALPHA=0.35
FACE_DETECTION_CONFIDENCE=0.6
POSE_DETECTION_CONFIDENCE=0.6
MODEL_COMPLEXITY=1
LOG_LEVEL=INFO
```

### 4b. Create `.env` (not committed — add to .gitignore)

Copy from `.env.example` with local overrides.

### 4c. Rewrite `config.py` to use dotenv

```python
# config.py must:
# 1. Call load_dotenv() at top
# 2. Read every value from os.getenv() with sensible defaults
# 3. Validate types (int, float, bool) — raise ValueError if wrong type
# 4. Log a warning for any value falling back to default
# 5. Expose a config_summary() -> dict function for startup logging
```

### 4d. Create `.gitignore`

```
.env
__pycache__/
*.pyc
*.pyo
logs/
.pytest_cache/
.mypy_cache/
dist/
build/
*.egg-info/
.venv/
venv/
```

---

## ═══ TASK 5 — ERROR HANDLING HARDENING ═════════════════════════

### 5a. Wrap `main.py` entry point

```python
# main() function must be wrapped with:
# - try/except KeyboardInterrupt → log info, clean exit
# - try/except Exception as e → log critical with full traceback,
#   call cleanup(), sys.exit(1)
# - finally block: always release camera, destroy windows,
#   close MediaPipe detectors
```

### 5b. Harden `camera.py`

```python
# init_camera() must:
# - Retry up to 3 times if VideoCapture fails to open
# - Log each retry attempt
# - If all retries fail: raise RuntimeError with helpful message
#   "Cannot open camera at index {idx}. Try changing CAMERA_INDEX in .env"
# - After successful open: log camera properties (width, height, fps)

# get_frame() must:
# - Handle cap.read() returning False (disconnected camera)
# - Raise CameraDisconnectedError (custom exception) with context
# - Never return None silently
```

### 5c. Harden `detector.py`

```python
# Both detectors must:
# - Catch MediaPipe inference errors and return found=False (not crash)
# - Log a warning (not error) if landmark visibility below threshold
# - Handle the case where models/ directory is missing entirely
#   → raise ModelNotFoundError with instructions to run setup

# Verify: does detector.py use mp.solutions API or mediapipe.tasks API?
# If it uses mediapipe.tasks (new API with .task model files):
#   - Ensure BaseOptions path is resolved relative to project root, not CWD
#   - Use: Path(__file__).parent.parent.parent / "models" / "filename.task"
# If it uses mp.solutions (old API):
#   - Models folder is irrelevant for this API
#   - Remove the models/ download step from setup
# Document which API is being used in a comment at the top of detector.py
```

### 5d. Create `src/exceptions.py`

```python
# Define custom exceptions:
class ZyroError(Exception): pass
class CameraError(ZyroError): pass
class CameraDisconnectedError(CameraError): pass
class ModelNotFoundError(ZyroError): pass
class AssetNotFoundError(ZyroError): pass
class ConfigurationError(ZyroError): pass
```

---

## ═══ TASK 6 — FIX OVERLAY SYSTEM FOR SHIRTS ═══════════════════

After shirts/ is populated (Task 2), verify the shirt overlay
actually works end-to-end. This may require fixes in overlay.py.

### 6a. Test shirt overlay in isolation

Write a standalone test script `tests/debug_shirt_overlay.py`:
```python
# Load shirt_01.png
# Create a synthetic 1280x720 black frame
# Place fake shoulder anchors at (380, 300) and (900, 300)
# Call apply_overlay with shirt config values
# Save result as tests/debug_shirt_output.png
# Print: anchor span, computed target_w, target_h, paste_x, paste_y
```
Run it and open `debug_shirt_output.png` to visually verify alignment.

### 6b. Fix Y-offset for shirts

Shirts must appear BELOW the shoulder anchors, not centered on them.
In `config.py`:
```
SHIRT_Y_OFFSET_RATIO = 1.2   # Pushes shirt down by 1.2x shoulder span
```
Adjust until shirt neckline aligns with shoulder anchors visually.

### 6c. Verify glasses + shirt render simultaneously

In `main.py`, both overlays must render in the same frame.
The glasses must not be hidden when shirt is active and vice versa.
Both must be visible simultaneously at all times when detected.

### 6d. Handle partial body visibility

If pose is detected but shoulder landmarks have visibility < 0.5:
- Skip shirt overlay for that frame
- Freeze last valid shirt position for up to 0.5 seconds
- After 0.5 seconds: fade out shirt overlay (reduce alpha over 10 frames)
- This prevents sudden shirt disappearance when user turns slightly

---

## ═══ TASK 7 — EXPAND TEST COVERAGE ════════════════════════════

### 7a. Fix existing tests if broken

Run `pytest tests/ -v` first. Fix any failing tests before adding new ones.

### 7b. Create `tests/test_detector.py`

```python
# Tests (mock MediaPipe — do not require a real camera):
# test_face_result_dataclass_when_no_face()
#   → Patch detect_face to return FaceResult(found=False)
#   → Assert result.found is False
#   → Assert accessing result.landmarks does not raise AttributeError
# test_pose_result_dataclass_when_no_pose()
#   → Same pattern for PoseResult
# test_detector_handles_none_frame_gracefully()
#   → Pass None as frame → expect ZyroError or return found=False
#   → Must NOT raise AttributeError or unhandled exception
```

### 7c. Create `tests/test_asset_loader.py`

```python
# Tests:
# test_list_assets_glasses_returns_nonempty_list()
#   → Call list_assets("glasses") → assert len > 0
# test_list_assets_shirts_returns_nonempty_list()
#   → Call list_assets("shirts") → assert len > 0 (after Task 2)
# test_get_asset_returns_rgba_image()
#   → Load any asset → assert image.mode == "RGBA"
# test_get_asset_nonexistent_raises_error()
#   → Request "nonexistent.png" → assert raises AssetNotFoundError
# test_asset_manager_next_item_cycles()
#   → Create AssetManager → call next_item("glasses") N times
#   → After len(glasses_list) calls, index should wrap to 0
# test_asset_manager_empty_category_does_not_crash()
#   → Pass empty dir to AssetManager → calling next_item should
#     return None or raise AssetNotFoundError, not IndexError
```

### 7d. Create `tests/test_camera.py`

```python
# Tests (mock cv2.VideoCapture):
# test_init_camera_raises_on_failure()
#   → Patch cv2.VideoCapture to return isOpened()=False
#   → Assert raises CameraError after retries
# test_get_frame_returns_flipped_frame()
#   → Patch cap.read() to return (True, np.zeros((720,1280,3)))
#   → Call get_frame() → assert shape == (720, 1280, 3)
#   → The flip is applied internally — just verify no exception
# test_get_frame_raises_on_disconnect()
#   → Patch cap.read() to return (False, None)
#   → Assert raises CameraDisconnectedError
```

### 7e. Create `tests/test_config.py`

```python
# Tests (use monkeypatch for env vars):
# test_camera_index_reads_from_env()
#   → Set CAMERA_INDEX=2 in env → import config → assert CAMERA_INDEX == 2
# test_invalid_type_raises_config_error()
#   → Set EMA_ALPHA="not_a_float" → import config → assert raises ConfigurationError
# test_defaults_applied_when_env_missing()
#   → Clear all env vars → import config → assert CAMERA_INDEX == 0
```

### 7f. Create `tests/test_smoother.py` additions

Add to existing test file:
```python
# test_smoother_reset_reinitializes()
#   → Feed 50 values of 100.0 → call reset() → feed value 0.0
#   → Assert next smoothed value equals 0.0 (no memory of old values)
# test_smoother_alpha_boundary_values()
#   → alpha=0.0 → smoothed value should never change after init
#   → alpha=1.0 → smoothed value should equal last input exactly
# test_smoother_handles_negative_values()
#   → Feed values between -100 and -50 → assert no exception, output in range
```

### 7g. Run full test suite with coverage

```
pytest tests/ -v --cov=src --cov-report=term-missing
```

Target: ≥70% coverage. Fix any test that fails.

---

## ═══ TASK 8 — MODEL DOWNLOAD SCRIPT ════════════════════════════

### 8a. Verify which models are actually needed

Read `detector.py` to confirm exact model filenames and API.
The models in `models/` may or may not match what the code expects.
If there is a mismatch, fix `detector.py` to use the correct filenames
OR fix the model filenames to match what the code expects.

### 8b. Create `src/models/download_models.py`

```python
# Must implement:
# download_models(dest_dir: str = "models") -> None
#   - Check if models already exist and are >1MB (skip if so)
#   - Download with progress bar (use urllib with reporthook)
#   - Verify file size after download
#   - Print clear success/failure message

# MODELS dict with correct Google MediaPipe CDN URLs:
# face_landmarker.task:
#   https://storage.googleapis.com/mediapipe-models/face_landmarker/
#   face_landmarker/float16/latest/face_landmarker.task
# pose_landmarker_lite.task:
#   https://storage.googleapis.com/mediapipe-models/pose_landmarker/
#   pose_landmarker_lite/float16/latest/pose_landmarker_lite.task

# if __name__ == "__main__": block to run standalone
```

### 8c. Create model path resolver in `config.py`

```python
# Add to config.py:
PROJECT_ROOT = Path(__file__).parent.parent  # goes up from zyro/ to project root
MODELS_DIR = PROJECT_ROOT / "zyro" / "models"
FACE_MODEL_PATH = MODELS_DIR / "face_landmarker.task"
POSE_MODEL_PATH = MODELS_DIR / "pose_landmarker_lite.task"

# Validate at import time:
# if not FACE_MODEL_PATH.exists():
#     raise ModelNotFoundError(f"Run: python -m src.models.download_models")
```

---

## ═══ TASK 9 — ASSETS MANIFEST SYSTEM ═══════════════════════════

### 9a. Create `assets/manifest.json`

```json
{
  "version": "1.0",
  "glasses": [
    {"id": "g01", "file": "glasses_01.png", "label": "Classic Oval"},
    {"id": "g02", "file": "glasses_02.png", "label": "Round Retro"},
    {"id": "g03", "file": "glasses_03.png", "label": "Cat Eye"},
    {"id": "g04", "file": "glasses_04.png", "label": "Wayfarer"},
    {"id": "g05", "file": "glasses_05.png", "label": "Wire Frame"}
  ],
  "shirts": [
    {"id": "s01", "file": "shirt_01.png", "label": "White Tee"},
    {"id": "s02", "file": "shirt_02.png", "label": "Navy Polo"},
    {"id": "s03", "file": "shirt_03.png", "label": "Black Hoodie"}
  ],
  "accessories": [
    {"id": "a01", "file": "earrings_01.png", "label": "Gold Hoops"},
    {"id": "a02", "file": "earrings_02.png", "label": "Silver Drops"},
    {"id": "a03", "file": "earrings_03.png", "label": "Pearl Studs"}
  ]
}
```

### 9b. Update `asset_loader.py` to use manifest

```python
# AssetManager must:
# - Load manifest.json on init
# - Use manifest labels in UI display (not raw filenames)
# - Fall back to filesystem scan if manifest.json missing
# - Expose current_item_label() -> str for ui.py to display
```

---

## ═══ TASK 10 — UI POLISH FOR DEMO ══════════════════════════════

### 10a. Improve HUD in `ui.py`

Current HUD is basic. For demo-ready output:

```python
# draw_hud(frame, fps, category, item_label, item_index, item_total,
#          face_found, pose_found, debug_mode) -> frame

# Must render:
# TOP LEFT:  "ZYRO AR" logo text (white, 20px, bold-style)
# TOP RIGHT: FPS counter — green if >25, yellow if 15-25, red if <15
# MID LEFT:  Vertical status indicators:
#            "👁 Face" — green dot if detected, gray if not
#            "🧍 Body" — green dot if detected, gray if not
#            (use filled circles, not emoji — cv2.circle)
# BOTTOM:    Semi-transparent black bar (height 50px, alpha 0.6)
#            Inside bar: "[←/→] Switch   [Tab] Category   [D] Debug   [Q] Quit"
# BOTTOM CENTER above bar: Item label with category
#            e.g.  "👓 Wayfarer  (2/5)"   or   "👕 Navy Polo  (1/3)"
#            (use text, not emoji — cv2.putText)
```

### 10b. Add smooth overlay fade-in on item switch

When user presses ←/→ to switch item:
- New item fades in over 8 frames (alpha 0→1)
- Implement via `overlay_alpha` value in main loop state
- Blend: `final_frame = cv2.addWeighted(base_frame, 1.0, overlay_frame, overlay_alpha, 0)`

### 10c. Add startup splash screen

On launch, show a 2-second splash:
```python
# draw_splash(frame) -> frame
# Renders centered text on first frame:
# Line 1: "ZYRO AR" (large, white)
# Line 2: "Smart Mirror · Virtual Try-On" (smaller, gray)
# Line 3: "Initializing..." (small, cyan)
# Show for 2 seconds, then fade out over 0.5 seconds
```

---

## ═══ TASK 11 — MULTI-CAMERA SUPPORT ═══════════════════════════

Add to `camera.py`:

```python
def list_available_cameras(max_check: int = 5) -> list[int]:
    """Scan camera indices 0-max_check, return list of working indices."""
    # Try each index, check isOpened(), release immediately
    # Return list e.g. [0, 1, 2]
    # Log found cameras

def select_best_camera() -> int:
    """Return first available camera index, log selection."""
```

Add CLI argument in `main.py`:
```python
import argparse
parser = argparse.ArgumentParser(description="Zyro AR Smart Mirror")
parser.add_argument("--camera", type=int, default=None,
                    help="Camera index (overrides .env)")
parser.add_argument("--debug", action="store_true",
                    help="Enable debug overlay")
parser.add_argument("--list-cameras", action="store_true",
                    help="List available cameras and exit")
args = parser.parse_args()
```

---

## ═══ TASK 12 — PERFORMANCE OPTIMIZATION ════════════════════════

### 12a. Detection resolution decoupling

In `main.py` main loop:
```python
# Create two frames each iteration:
# detect_frame = cv2.resize(frame, (640, 480))  ← feed to MediaPipe
# render_frame = frame.copy()                   ← full resolution for display
# Scale landmark coordinates back to render_frame resolution:
# scale_x = render_frame.shape[1] / detect_frame.shape[1]  # e.g. 2.0
# scale_y = render_frame.shape[0] / detect_frame.shape[0]  # e.g. 1.5
# landmark_x_render = landmark_x_detect * scale_x
```

### 12b. Frame skip under load

```python
# In main loop, track processing_time for last frame
# If processing_time > (1.0 / TARGET_FPS):
#   skip MediaPipe inference this frame, reuse last landmarks
#   increment skip_counter
# If skip_counter > 5 consecutive frames: log warning
```

### 12c. Asset resize caching

In `overlay.py`:
```python
# Add module-level cache: _resize_cache: dict[str, tuple[int, Image]] = {}
# Key: f"{asset_name}_{target_width}"
# Before resize: check cache
# If cached and target_width within ±3px: return cached version
# Cache eviction: if cache > 20 entries, clear oldest 10
```

### 12d. Benchmark and document

After all optimizations:
- Run for 60 seconds
- Log min/avg/max FPS
- Log min/avg/max inference time
- Print a final performance report to console

Target: ≥25 FPS average on CPU-only machine (no GPU).

---

## ═══ TASK 13 — INSTALLER + SETUP SCRIPT ════════════════════════

### 13a. Create `setup.py`

```python
# setup.py for pip install -e . support
# Package name: zyro-ar
# Version: 1.0.0
# Entry point: zyro = zyro.main:main
# Include assets/ and models/ in package_data
```

### 13b. Create `pyproject.toml`

```toml
[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.backends.legacy:build"

[project]
name = "zyro-ar"
version = "1.0.0"
requires-python = ">=3.10"
description = "AR Smart Mirror with virtual try-on"

[project.scripts]
zyro = "zyro.main:main"
```

### 13c. Create `install.sh` (Linux/Mac)

```bash
#!/bin/bash
echo "=== Zyro AR Setup ==="
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env
python -m src.models.download_models
echo ""
echo "✅ Setup complete!"
echo "Run: source .venv/bin/activate && python zyro/main.py"
```

### 13d. Create `install.bat` (Windows)

```batch
@echo off
echo === Zyro AR Setup ===
python -m venv .venv
call .venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
copy .env.example .env
python -m src.models.download_models
echo.
echo Setup complete!
echo Run: .venv\Scripts\activate ^&^& python zyro/main.py
pause
```

### 13e. Rewrite `README.md` (proper documentation)

README must include:
1. Project title + 1-line description
2. Screenshot placeholder section
3. Requirements (Python 3.10+, webcam, 4GB RAM)
4. Quick Start (3 steps: clone → install → run)
5. Controls reference table (all keyboard shortcuts)
6. Config reference (.env variables table)
7. Folder structure
8. How to add custom assets (PNG spec)
9. Troubleshooting (5 common issues + fixes)
10. License

---

## ═══ TASK 14 — FINAL INTEGRATION TEST ══════════════════════════

Run these checks in order. Every item must pass before calling done.

### 14a. Clean environment test
```
# Delete __pycache__, .pyc files
# Fresh pip install from requirements.txt in a new venv
# Run: python zyro/main.py
# Expected: splash screen, then live mirror with overlays
```

### 14b. Full test suite
```
pytest tests/ -v --cov=src --cov-report=term-missing
```
All tests must pass. Coverage must be ≥70%.

### 14c. Logging verification
```
# Run for 30 seconds
# Check logs/zyro.log exists and has content
# Verify no print() statements in any src/ file
```

### 14d. Asset completeness check
```python
# Run this verification:
import json
from pathlib import Path
manifest = json.loads(Path("assets/manifest.json").read_text())
for category, items in manifest.items():
    for item in items:
        path = Path("assets") / category / item["file"]
        assert path.exists(), f"MISSING: {path}"
        assert path.stat().st_size > 5000, f"TOO SMALL: {path}"
        from PIL import Image
        img = Image.open(path)
        assert img.mode == "RGBA", f"NOT RGBA: {path}"
        print(f"✅ {path} — {img.size} — {img.mode}")
```
Every asset must pass all three assertions.

### 14e. 5-minute stability test
```
# Run main.py for 5 minutes
# Do the following during the test:
# - Walk in and out of frame 5 times
# - Switch glasses 10 times with arrow keys
# - Switch to shirts and back 5 times
# - Press D to toggle debug mode on/off 3 times
# Expected: no crashes, FPS stays above 20, no error logs
```

### 14f. Edge case manual tests
- Test with room lights off (poor lighting)
- Test with face partially covered (hand over half face)
- Test with rapid keyboard mashing (←→←→←→ fast)
- Test with two faces in frame (system should pick the closest/largest)

---

## ═══ TASK 15 — FINAL CHECKLIST ═════════════════════════════════

Before declaring done, verify every line is true:

```
[ ] python zyro/main.py runs with zero errors from fresh venv
[ ] Mirror effect working (right hand on right side)
[ ] Glasses overlay aligns to eyes, tracks head movement
[ ] Shirt overlay aligns to shoulders, tracks torso
[ ] Both overlays visible simultaneously
[ ] ←/→ cycles through 5 glasses designs
[ ] Tab switches to shirts category
[ ] ←/→ cycles through 3 shirt designs
[ ] D key toggles debug landmark visualization
[ ] Q key quits cleanly with no error messages
[ ] FPS counter shows ≥25 on screen
[ ] logs/zyro.log is being written
[ ] pytest tests/ shows all PASSED
[ ] assets/ has glasses(5), shirts(3), accessories(3) — all RGBA PNGs
[ ] .env.example committed, .env in .gitignore
[ ] requirements.txt has pinned versions
[ ] README.md has Quick Start in 3 steps
[ ] install.sh / install.bat work on clean machine
[ ] No hardcoded numbers outside config.py
[ ] No print() statements in src/ files
[ ] No bare except: clauses anywhere
```

Only when all 20 boxes are checked is this task complete.

---

## ═══ AGENT RULES (DO NOT SKIP) ════════════════════════════════

1. Execute tasks in order: 0 → 1 → 2 → ... → 15. No skipping.
2. After EVERY task, state: "Task N complete. Verified by: [what you checked]"
3. If any task produces an error, fix it before moving to the next task.
4. If a file already exists and is correct, say so and skip rewriting it.
5. If you find an existing bug NOT listed here, fix it and log what you fixed.
6. Never delete code without logging what you deleted and why.
7. Test after every module change — not just at the end.
8. When in doubt about an existing implementation, READ it before replacing it.

Start with Task 0. Go.
```

---

*Zyro AR — Production Hardening Prompt v2.0*
*Covers: deps · assets · logging · error handling · config · tests · UI · perf · packaging*

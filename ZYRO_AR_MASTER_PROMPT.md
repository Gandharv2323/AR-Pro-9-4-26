# ZYRO AR — MASTER PROMPT FOR ANTIGRAVITY IDE
### AR Smart Mirror · Virtual Try-On · Real-Time Webcam · Local GPU

> **Copy everything below this line into Antigravity IDE as your project root prompt.**
> AI agents must read this fully before writing a single line of code.

---

## ─── PROJECT OBJECTIVE ──────────────────────────────────────────

Build **Zyro**, a real-time AR smart mirror application that renders a horizontally-flipped webcam feed and overlays virtual accessories (Phase 1: glasses/earrings) and upper-body clothing (Phase 2: shirts) aligned to the user's face and body landmarks. The system must run entirely offline on local hardware with optional GPU acceleration, deliver ≥25 FPS on mid-range hardware, and present a clean keyboard-driven UI for item switching. The result must be demo-ready for a live audience presentation.

---

## ─── TECH STACK ─────────────────────────────────────────────────

### Language
- **Python 3.10+** (primary)
- No JavaScript unless explicitly requested for a separate UI frontend

### Core Libraries
| Library | Version | Purpose |
|---|---|---|
| `opencv-python` | ≥4.8 | Camera capture, frame rendering, image compositing |
| `mediapipe` | ≥0.10 | Face mesh (478 landmarks) + BlazePose (33 body landmarks) |
| `numpy` | ≥1.24 | Matrix ops, overlay math |
| `Pillow` | ≥10.0 | PNG alpha-channel asset loading |

### Optional / Enhancement
| Library | Purpose | Condition |
|---|---|---|
| `torch` (CPU/CUDA) | GPU-accelerated tensor ops | Only if GPU available |
| `onnxruntime-gpu` | ONNX model inference on GPU | If custom models added in Phase 3+ |
| `tkinter` or `PySimpleGUI` | Separate GUI panel | Only if keyboard UI is insufficient |

### Install Command (agents must run this first)
```
pip install opencv-python mediapipe numpy Pillow
```

### GPU Acceleration Strategy
- Detect GPU at startup: `cv2.cuda.getCudaEnabledDeviceCount()`
- If CUDA available: use `cv2.cuda` for frame operations where possible
- If not: fall back silently to CPU — do NOT crash or warn excessively
- All GPU code must be wrapped in try/except with CPU fallback

---

## ─── SYSTEM ARCHITECTURE ────────────────────────────────────────

### Data Flow (text diagram)

```
[Webcam]
   │
   ▼
[OpenCV VideoCapture] ──► [BGR Frame @ 640×480 or 1280×720]
   │
   ▼
[Mirror Flip] ──► cv2.flip(frame, 1)
   │
   ├────────────────────────────────────┐
   ▼                                    ▼
[MediaPipe FaceMesh]           [MediaPipe BlazePose]
478 face landmarks             33 body pose landmarks
   │                                    │
   ▼                                    ▼
[Face Anchor Points]           [Shoulder / Torso Anchors]
  nose_tip, ear_L/R,             left_shoulder, right_shoulder,
  eye corners, chin               mid_hip, neck
   │                                    │
   └──────────────┬─────────────────────┘
                  ▼
         [Overlay Engine]
         - Load PNG asset (RGBA)
         - Compute anchor centroid
         - Compute scale from landmark distance
         - Compute rotation angle from landmark pair
         - Apply affine transform
         - Alpha-blend onto frame
                  │
                  ▼
         [EMA Smoothing Filter]
         Exponential Moving Average on
         position, scale, rotation
                  │
                  ▼
         [UI HUD Renderer]
         - Item name overlay (cv2.putText)
         - FPS counter (top-right)
         - Keyboard hints (bottom bar)
                  │
                  ▼
         [cv2.imshow("Zyro AR Mirror")]
```

### Module Interaction Map
```
main.py
  ├── camera.py        (capture loop, FPS limiter)
  ├── detector.py      (MediaPipe wrappers)
  ├── overlay.py       (transform + alpha blend)
  ├── smoother.py      (EMA filter)
  ├── ui.py            (HUD drawing)
  ├── asset_loader.py  (PNG loading + caching)
  └── config.py        (all constants, NO hardcoded values elsewhere)
```

---

## ─── FOLDER STRUCTURE ───────────────────────────────────────────

```
zyro/
├── main.py                    # Entry point — orchestrates the main loop
├── config.py                  # All configurable constants
├── requirements.txt           # Pinned dependencies
├── README.md                  # Quick start guide
│
├── src/
│   └── modules/
│       ├── camera.py          # Webcam init, frame capture, FPS control
│       ├── detector.py        # MediaPipe FaceMesh + BlazePose wrappers
│       ├── overlay.py         # Overlay transform engine
│       ├── smoother.py        # EMA position/scale/rotation smoother
│       ├── ui.py              # HUD text, FPS display, keyboard hints
│       └── asset_loader.py    # PNG asset loader with caching
│
├── assets/
│   ├── glasses/
│   │   ├── glasses_01.png     # RGBA, transparent background
│   │   ├── glasses_02.png
│   │   └── glasses_03.png
│   ├── accessories/
│   │   └── earrings_01.png
│   └── shirts/
│       ├── shirt_01.png       # RGBA, transparent background
│       └── shirt_02.png
│
├── models/                    # Reserved for future ONNX/TFLite models
│   └── .gitkeep
│
└── tests/
    ├── test_overlay.py        # Unit tests for transform math
    └── test_smoother.py       # Unit test for EMA filter
```

---

## ─── CONFIG.PY SPECIFICATION ────────────────────────────────────

All magic numbers live here. No hardcoded values anywhere else.

```python
# config.py — ALL constants for Zyro AR

CAMERA_INDEX = 0
FRAME_WIDTH = 1280
FRAME_HEIGHT = 720
TARGET_FPS = 30

# MediaPipe
FACE_DETECTION_CONFIDENCE = 0.6
FACE_TRACKING_CONFIDENCE = 0.5
POSE_DETECTION_CONFIDENCE = 0.6
POSE_TRACKING_CONFIDENCE = 0.5

# Smoothing
EMA_ALPHA = 0.35         # Lower = smoother but laggier. Range: 0.2 to 0.6

# Glasses overlay
GLASSES_ANCHOR_LEFT_IDX  = 33    # MediaPipe FaceMesh left eye outer
GLASSES_ANCHOR_RIGHT_IDX = 263   # MediaPipe FaceMesh right eye outer
GLASSES_Y_OFFSET_RATIO   = 0.05  # Vertical nudge as ratio of face height
GLASSES_SCALE_MULTIPLIER = 1.2   # Fine-tune size of glasses relative to eye span

# Shirt overlay
SHIRT_ANCHOR_LEFT_IDX    = 11    # BlazePose left shoulder
SHIRT_ANCHOR_RIGHT_IDX   = 12    # BlazePose right shoulder
SHIRT_Y_OFFSET_RATIO     = 1.0   # Ratio of shoulder-width to shift shirt down
SHIRT_SCALE_MULTIPLIER   = 2.8   # Scale shirt relative to shoulder width

# UI
HUD_FONT                 = cv2.FONT_HERSHEY_SIMPLEX
HUD_FONT_SCALE           = 0.65
HUD_COLOR_PRIMARY        = (255, 255, 255)
HUD_COLOR_SHADOW         = (0, 0, 0)
HUD_FPS_POSITION         = (20, 40)
```

---

## ─── CORE FEATURES BREAKDOWN ────────────────────────────────────

### 1. Camera Feed (`camera.py`)
- Open webcam at `CAMERA_INDEX` using `cv2.VideoCapture`
- Set resolution to `FRAME_WIDTH × FRAME_HEIGHT`
- Implement FPS limiter using `time.perf_counter`
- Return raw BGR frame each loop iteration
- Raise clear `RuntimeError` if webcam cannot be opened

### 2. Mirror Effect (`camera.py`)
- Apply `cv2.flip(frame, 1)` immediately after capture
- This must happen before any detection or rendering
- The user sees themselves as in a mirror at all times

### 3. Face Tracking (`detector.py`)
- Initialize `mp.solutions.face_mesh.FaceMesh` with `static_image_mode=False`
- Convert BGR → RGB before processing: `cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)`
- Extract pixel coordinates for all required landmark indices from `config.py`
- Return a `FaceResult` dataclass: `{ found: bool, landmarks: dict[int, tuple(x,y)] }`
- If no face detected: return `FaceResult(found=False)`

### 4. Pose Tracking (`detector.py`)
- Initialize `mp.solutions.pose.Pose` with `model_complexity=1` for speed/accuracy balance
- Extract pixel coordinates for shoulder and hip landmarks
- Return a `PoseResult` dataclass: `{ found: bool, landmarks: dict[int, tuple(x,y)] }`
- If no pose detected: return `PoseResult(found=False)`
- Both `FaceMesh` and `Pose` must share the same RGB-converted frame in each loop

### 5. Overlay Engine (`overlay.py`)
The overlay engine is the heart of Zyro. It must do the following for every frame:

**Input:** RGBA PIL Image (asset), two anchor pixel coordinates (left, right), config multipliers
**Output:** BGR frame with asset composited in

**Steps (must follow in order):**
1. Compute anchor midpoint: `center = ((x1+x2)/2, (y1+y2)/2)`
2. Compute anchor span (euclidean distance between left and right anchors): `span = sqrt((x2-x1)² + (y2-y1)²)`
3. Compute rotation angle: `angle = degrees(atan2(y2-y1, x2-x1))`
4. Compute target width: `target_w = int(span * SCALE_MULTIPLIER)`
5. Compute target height: `target_h = int(asset_h * (target_w / asset_w))` (preserve aspect ratio)
6. Resize asset: `asset_resized = asset.resize((target_w, target_h), Image.LANCZOS)`
7. Rotate asset (expand=True to avoid clipping): `asset_rotated = asset_resized.rotate(-angle, expand=True, resample=Image.BICUBIC)`
8. Apply Y offset: `center_y += span * Y_OFFSET_RATIO`
9. Compute top-left paste position: `paste_x = center_x - asset_rotated.width // 2`, `paste_y = center_y - asset_rotated.height // 2`
10. Validate bounds (clamp to frame edges, do not crash if asset goes off-screen)
11. Alpha-blend using the asset's alpha channel as mask
12. Convert result back to BGR numpy array

### 6. Smoothing Filter (`smoother.py`)
- Implement a simple Exponential Moving Average (EMA) smoother
- State: `smoothed_value = None` (uninitialized)
- Update: `smoothed_value = alpha * new_value + (1 - alpha) * smoothed_value`
- First frame: initialize directly to the measured value (no lag on start)
- Create one `Smoother` instance per tracked quantity: `pos_x`, `pos_y`, `scale`, `angle`
- Reset smoother when subject disappears and re-appears to prevent snap artifacts

### 7. Asset Loader (`asset_loader.py`)
- Load PNG files from `assets/` folder using `PIL.Image.open(path).convert("RGBA")`
- Cache loaded assets in memory dictionary keyed by filename
- Provide `get_asset(name: str) -> PIL.Image` method
- Provide `list_assets(category: str) -> list[str]` method
- Raise informative error if asset file not found

### 8. UI Controls (`ui.py`)
- Draw item name in top-left corner (with 1px black shadow for visibility)
- Draw FPS counter in top-right corner
- Draw keyboard hint bar at the bottom: `[←/→] Switch item   [Tab] Toggle category   [Q] Quit`
- All text must have shadow/outline for readability against any background
- Keyboard handler in `main.py`: `cv2.waitKey(1)` checked every frame

---

## ─── DEVELOPMENT PHASES ─────────────────────────────────────────

### PHASE 1 — Basic Mirror + Camera
**Goal:** Get a working, flipped webcam feed displayed in a window.

**Tasks:**
1. Create `config.py` with all camera constants
2. Implement `camera.py`:
   - `init_camera()` → returns `cv2.VideoCapture` object
   - `get_frame(cap)` → returns flipped BGR frame
3. Implement minimal `main.py`:
   - Initialize camera
   - Loop: get frame → flip → `cv2.imshow` → check `q` to quit
4. Display FPS counter in top-right corner

**Expected Output:** A live window showing your horizontally-flipped webcam feed at the configured resolution, with FPS displayed, closable with `Q`.

**Test:** Run `main.py`, wave your right hand — it should appear on the right side of the screen (mirror effect confirmed).

---

### PHASE 2 — Face Tracking + Glasses Overlay
**Goal:** Detect face landmarks and overlay a glasses PNG aligned to the eyes.

**Tasks:**
1. Add `detector.py` with `FaceMesh` wrapper:
   - `init_face_detector()` → returns MediaPipe FaceMesh instance
   - `detect_face(frame, detector)` → returns `FaceResult`
2. Add `asset_loader.py` — load `assets/glasses/glasses_01.png`
3. Add `overlay.py` with `apply_overlay(frame, asset, left_anchor, right_anchor, y_offset_ratio, scale_mult)` function
4. Add `smoother.py` with `class Smoother` (EMA)
5. Connect in `main.py`:
   - Detect face every frame
   - Extract landmarks `GLASSES_ANCHOR_LEFT_IDX` and `GLASSES_ANCHOR_RIGHT_IDX`
   - Apply smoothing to both anchor points
   - Call `apply_overlay` with glasses asset
6. Add UI text: currently selected item name

**Expected Output:** Glasses float on the user's face, anchored to eye positions. They track smoothly when the user moves their head. They rotate correctly for head tilts up to ±30°. The glasses do not flicker or jump.

**Test:** Tilt head left and right — glasses must rotate. Move toward and away from camera — glasses must scale. Cover face with hand — glasses must disappear without crash.

---

### PHASE 3 — Pose Tracking + Shirt Overlay
**Goal:** Detect upper body pose and overlay a shirt PNG aligned to shoulders.

**Tasks:**
1. Extend `detector.py` with `Pose` wrapper:
   - `init_pose_detector()` → returns MediaPipe Pose instance
   - `detect_pose(frame, detector)` → returns `PoseResult`
2. Add shirt assets to `assets/shirts/`
3. Extend `overlay.py` — reuse `apply_overlay` with shirt-specific anchors (shoulders)
4. In `main.py`, run both FaceMesh and Pose detectors on each frame (same RGB conversion, reuse)
5. Add separate Smoother instances for shirt anchors
6. Make shirt overlay work alongside glasses overlay simultaneously

**Expected Output:** User sees glasses AND a shirt overlaid simultaneously. Both track the user's movements. The shirt scales with shoulder width as the user moves closer/farther. The shirt does not cover the face.

**Test:** Stand, sit, lean — verify shirt tracks correctly. Rotate body slightly — shirt should rotate. Verify glasses and shirt do not conflict visually.

---

### PHASE 4 — UI Controls + Item Switching
**Goal:** Allow user to switch between items in each category using the keyboard.

**Tasks:**
1. Create `AssetManager` class in `asset_loader.py`:
   - Holds list of glasses items and list of shirt items
   - `current_glasses_index` and `current_shirt_index`
   - `next_item(category)` and `prev_item(category)` methods
2. Keyboard bindings in `main.py`:
   - `←` / `→` arrows: cycle through items in active category
   - `Tab`: toggle active category (glasses / shirt)
   - `1`: switch to glasses category
   - `2`: switch to shirt category
   - `Q`: quit
3. Extend `ui.py`:
   - Show active category and item name prominently
   - Show item index (e.g., "Glasses 2/3")
   - Show keyboard hint bar at bottom

**Expected Output:** User can press `←` / `→` to switch between different glasses designs. Pressing `Tab` switches to shirts and `←` / `→` cycles through shirt options. All switches are instant (no loading delay — assets are pre-cached). UI clearly shows what is currently selected.

**Test:** Cycle through all glasses — confirm each loads and aligns correctly. Cycle through shirts. Rapidly press keys — no crashes.

---

### PHASE 5 — Optimization + Smoothing Polish
**Goal:** Ensure stable ≥25 FPS performance and smooth tracking under realistic conditions.

**Tasks:**
1. Profile the main loop using `time.perf_counter` around each section (detect, overlay, render)
2. Reduce MediaPipe input resolution if FPS < 20: resize frame to 640×480 for detection only, render at full resolution
3. Add `model_complexity=0` option in config for lower-end hardware
4. Tune `EMA_ALPHA` to find the best smoothness/latency trade-off (test at 0.2, 0.35, 0.5)
5. Cache the `Image.resize` operation — skip if anchor span has not changed by more than 2px
6. Add landmark visibility threshold check: skip overlay if MediaPipe landmark `visibility < 0.5`
7. Add "no face/pose detected" graceful handling — freeze last valid overlay position for up to 0.3s before hiding
8. Final pass: remove all `print()` debug statements, replace with optional `DEBUG_MODE` flag in config

**Expected Output:** Stable ≥25 FPS on a mid-range machine (Core i5/Ryzen 5 + integrated GPU). Smooth, jitter-free tracking. No crashes after 5 minutes of continuous use. No console spam.

**Test:** Run for 5 minutes, check FPS stays above 25. Walk out of frame and back — overlay reappears smoothly. Test in poor lighting — system should degrade gracefully, not crash.

---

## ─── AI AGENT INSTRUCTIONS ─────────────────────────────────────

These rules govern how you (the AI agent) must work. Follow them precisely.

1. **Build in phase order.** Do not start Phase 2 until Phase 1 produces a working output.
2. **One module at a time.** Write one complete module, then verify it works, then move to the next.
3. **Test after every module.** After writing any module, write a minimal test (even just a `if __name__ == "__main__"` block) to confirm it works in isolation before integrating.
4. **Do not import what does not exist yet.** If `detector.py` does not exist, do not import it in `main.py`. Use stubs.
5. **Log all errors with context.** If something fails, print the module name, function name, and the actual error — not just "something went wrong".
6. **Never hardcode.** Every magic number belongs in `config.py`. If you find yourself writing a literal number inside a function, stop and add it to config first.
7. **Fix before proceeding.** If a phase is not producing the expected output, debug and fix before moving to the next phase.
8. **Maintain the overlay engine contract.** `apply_overlay` must always accept the same signature. Never break the interface.
9. **Keep functions small.** Each function must do exactly one thing. If it does two things, split it.
10. **Comment the math.** Any line involving `atan2`, matrix ops, or coordinate transforms must have an inline comment explaining what it computes.
11. **Never use global variables.** Pass state explicitly through function arguments or class instances.
12. **Use dataclasses for structured returns.** Never return raw tuples from detector functions — use `FaceResult` and `PoseResult` dataclasses.

---

## ─── CODING STANDARDS ───────────────────────────────────────────

- **PEP 8** compliance throughout
- Function names: `snake_case`
- Class names: `PascalCase`
- Constants: `ALL_CAPS` in `config.py`
- Type hints on all function signatures: `def get_frame(cap: cv2.VideoCapture) -> np.ndarray:`
- Docstring on every public function: one-line summary + `Args:` + `Returns:`
- No function longer than 40 lines — if it is, split it
- No file longer than 150 lines — if it is, split the module
- All imports at the top of each file, grouped: stdlib → third-party → local
- No bare `except:` — always `except SpecificException as e:`

---

## ─── DEBUGGING + TESTING PLAN ──────────────────────────────────

### FPS Monitoring
- Track last 30 frame timestamps in a `deque(maxlen=30)`
- FPS = `len(deque) / (deque[-1] - deque[0])`
- Display on screen. If FPS drops below 15, print a warning to console

### Landmark Accuracy Checks
- In DEBUG_MODE, draw all 478 face landmarks as green dots (1px radius)
- In DEBUG_MODE, draw all 33 pose landmarks as blue dots
- In DEBUG_MODE, highlight the specific anchor landmarks used for overlays in red
- Add a toggle: press `D` to enable/disable debug landmark overlay

### Overlay Alignment Validation
- In DEBUG_MODE, draw a red crosshair at the computed overlay center point
- Draw a line between the two anchor points used for scale/rotation calculation
- This allows immediate visual diagnosis of misalignment

### Unit Tests (`tests/`)
- `test_overlay.py`: Test `apply_overlay` with a synthetic 640×480 black frame and a 100×40 white RGBA image
  - Assert output frame is not identical to input (compositing happened)
  - Assert no exception when anchor is near frame edge
  - Assert no exception when anchor is outside frame bounds (clamping test)
- `test_smoother.py`: Test `Smoother`
  - Assert that after 50 frames of input `100`, smoothed value is within 0.1 of `100`
  - Assert first frame returns exact input value (no lag on init)

---

## ─── COMMON PITFALLS TO AVOID ───────────────────────────────────

| Pitfall | Why it happens | How to avoid |
|---|---|---|
| Glasses float above/below eyes | Y offset not tuned, or wrong landmark index | Use `GLASSES_Y_OFFSET_RATIO` in config, visualize anchors in debug mode |
| Overlay flickers every other frame | Smoothing alpha too high, or smoother not initialized on first frame | Initialize smoother to first measured value on frame 0 |
| `cv2.imshow` freezes | `cv2.waitKey` not called in loop | Always call `cv2.waitKey(1)` every frame |
| Asset appears distorted | Aspect ratio not preserved during resize | Always compute `target_h` from `target_w / original_aspect` |
| Shirt covers face | Shirt Y offset not pushed down enough | Increase `SHIRT_Y_OFFSET_RATIO` |
| App crashes when user leaves frame | No `found` guard before accessing landmarks | Always check `result.found` before accessing `.landmarks` |
| Rotation flips 180° | `atan2` sign convention mismatch with flipped frame | Test rotation at 0°, 30°, 45°, 90° and verify visually |
| High latency on CPU | Running MediaPipe at full 1280×720 | Resize input to 640×480 for detection, render at full res |
| Hardcoded camera index breaks on some systems | `cv2.VideoCapture(0)` fails | Read from `config.CAMERA_INDEX`, allow CLI override via `--camera` arg |
| PNG loads as RGB not RGBA | `.convert("RGBA")` not called | Always call `.convert("RGBA")` in asset_loader |

---

## ─── PERFORMANCE CONSIDERATIONS ────────────────────────────────

1. **Frame resize for detection only.** Run MediaPipe on a 640×480 copy of the frame. Render overlays at the original resolution.
2. **Skip frames if behind.** If processing takes longer than `1/TARGET_FPS`, skip MediaPipe inference and reuse last valid landmarks.
3. **Asset resize caching.** Cache the last resized version of each asset. Only re-resize if the target width changes by more than 3px.
4. **Single RGB conversion.** Convert BGR→RGB once per frame, share with both FaceMesh and Pose detectors.
5. **Avoid Python-level loops over pixels.** All pixel operations must use NumPy vectorized operations or OpenCV functions — never `for x in range(width): for y in range(height)`.
6. **GPU acceleration (optional).** If `cv2.cuda.getCudaEnabledDeviceCount() > 0`, use `cv2.cuda.cvtColor` and upload/download frames to GPU for flip and resize operations. Wrap in try/except with CPU fallback.
7. **Benchmark target:**
   - Phase 1: ≥60 FPS (no detection)
   - Phase 2–3: ≥25 FPS (with detection + overlay)
   - Phase 5 optimized: ≥30 FPS

---

## ─── ASSET PREPARATION GUIDE ───────────────────────────────────

AI agents must create placeholder assets if real ones are not provided.

### Glasses Placeholder
- Size: 600 × 200 px
- RGBA with transparent background
- Two lens circles (dark gray, 30% opacity) connected by a bridge
- Saved as `assets/glasses/glasses_01.png`

### Shirt Placeholder
- Size: 800 × 900 px
- RGBA with transparent background
- Simple T-shirt silhouette in a solid color
- Neckline at approximately y=100px from top
- Saved as `assets/shirts/shirt_01.png`

**Critical:** The asset's "natural" alignment center must correspond to the anchor points. Glasses must be centered horizontally on the bridge. Shirt must be centered horizontally on the chest.

---

## ─── FINAL DEMO EXPECTATIONS ────────────────────────────────────

When the demo is run (`python main.py`), the following must be true:

1. A window titled **"Zyro AR Mirror"** opens within 3 seconds
2. The user sees themselves mirrored (right hand appears on right)
3. When a face is detected, glasses appear instantly, aligned to the eyes
4. When the upper body is visible, a shirt appears aligned to the shoulders
5. Both overlays track smoothly as the user moves, leans, and tilts
6. Pressing `→` cycles to the next glasses design (instant, no flicker)
7. Pressing `Tab` then `→` cycles through shirt options
8. The FPS counter is visible and shows ≥25 FPS on the target machine
9. Pressing `Q` closes cleanly with no errors
10. The application runs for 10+ minutes without crashing or degrading

---

## ─── QUICK START SEQUENCE FOR AGENTS ───────────────────────────

Run these steps in order without skipping:

```
STEP 1: Create folder structure as defined above
STEP 2: Create config.py with all constants
STEP 3: Create requirements.txt and run pip install
STEP 4: Create camera.py → run standalone test → verify mirror works
STEP 5: Create asset_loader.py → add placeholder PNGs → verify loading
STEP 6: Create smoother.py → run unit test → verify EMA math
STEP 7: Create detector.py → test with static image → verify landmarks print
STEP 8: Create overlay.py → test with hardcoded anchors → verify PNG composites
STEP 9: Create ui.py → test HUD rendering on a blank frame
STEP 10: Wire all modules in main.py → Phase 1 complete
STEP 11: Add face detection + glasses → Phase 2 complete
STEP 12: Add pose detection + shirt → Phase 3 complete
STEP 13: Add keyboard switching + UI → Phase 4 complete
STEP 14: Profile, optimize, tune EMA → Phase 5 complete
STEP 15: Run 5-minute stability test → ship demo
```

---

*End of Zyro AR Master Prompt. Version 1.0 — 2-3 day prototype target.*

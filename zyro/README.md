# Zyro AR — Smart Mirror Virtual Try-On

> **Real-time AR try-on for glasses and shirts powered by MediaPipe Face & Pose Landmarkers**

---

## 📸 Screenshots

> *Place demo screenshots here after first run*

---

## ✅ Requirements

| Requirement | Minimum |
|---|---|
| Python | 3.10+ |
| Webcam | USB or built-in, 720p recommended |
| RAM | 4 GB |
| OS | Windows 10+ / Ubuntu 20.04+ / macOS 12+ |
| GPU | Not required (CPU-only supported) |

---

## 🚀 Quick Start

```bash
# Step 1: Clone
git clone https://github.com/yourname/zyro-ar.git
cd zyro-ar

# Step 2: Install (Windows)
install.bat

# Step 2: Install (Linux / macOS)
bash install.sh

# Step 3: Run
.venv\Scripts\activate          # Windows
source .venv/bin/activate       # Linux/macOS
python zyro/main.py
```

---

## ⌨️ Controls

| Key | Action |
|---|---|
| `← / →` | Previous / Next item in active category |
| `Tab` | Toggle between Glasses and Shirts |
| `1` | Switch to Glasses category |
| `2` | Switch to Shirts category |
| `D` | Toggle debug landmark visualization |
| `Q` | Quit cleanly |
| `--list-cameras` | List available cameras and exit |
| `--camera N` | Use camera at index N |
| `--debug` | Start with debug mode enabled |

---

## ⚙️ Configuration (.env variables)

Edit `zyro/.env` to customise:

| Variable | Default | Description |
|---|---|---|
| `CAMERA_INDEX` | `0` | Webcam device index |
| `FRAME_WIDTH` | `1280` | Capture width |
| `FRAME_HEIGHT` | `720` | Capture height |
| `TARGET_FPS` | `30` | Target frames per second |
| `DEBUG_MODE` | `False` | Show landmark overlay on startup |
| `EMA_ALPHA` | `0.35` | Smoothing factor (0.2=more smooth, 0.6=more responsive) |
| `FACE_DETECTION_CONFIDENCE` | `0.6` | Face detection threshold |
| `POSE_DETECTION_CONFIDENCE` | `0.6` | Pose detection threshold |
| `MODEL_COMPLEXITY` | `1` | Pose model: 0=lite, 1=full, 2=heavy |
| `LOG_LEVEL` | `INFO` | Console log level (DEBUG/INFO/WARNING) |

---

## 📁 Folder Structure

```
zyro-ar/
├── install.bat / install.sh    ← One-click setup
├── setup.py / pyproject.toml  ← Packaging
│
└── zyro/
    ├── main.py                 ← Entry point
    ├── config.py               ← All constants (loaded from .env)
    ├── generate_assets.py      ← Asset generator
    ├── requirements.txt        ← Pinned production deps
    ├── requirements-dev.txt    ← Dev deps (pytest, black, etc.)
    ├── .env.example            ← Config template (committed)
    ├── .env                    ← Local config (gitignored)
    │
    ├── src/
    │   ├── exceptions.py       ← Custom exception hierarchy
    │   ├── logging_config.py   ← Structured logging setup
    │   └── modules/
    │       ├── camera.py       ← Camera wrapper (retry + detection)
    │       ├── detector.py     ← MediaPipe face + pose detectors
    │       ├── overlay.py      ← AR compositing engine
    │       ├── smoother.py     ← EMA position smoother
    │       ├── asset_loader.py ← Asset loading + manifest
    │       └── ui.py           ← HUD, splash, hints
    │
    ├── assets/
    │   ├── manifest.json       ← Asset metadata (labels, IDs)
    │   ├── glasses/            ← 5 PNG frames (RGBA)
    │   ├── shirts/             ← 3 PNG shirts (RGBA, 800×900)
    │   └── accessories/        ← 3 PNG earrings (RGBA)
    │
    ├── models/
    │   ├── face_landmarker.task    ← MediaPipe face model
    │   └── pose_landmarker_lite.task ← MediaPipe pose model
    │
    └── logs/
        └── zyro.log            ← Rotating log (auto-created)
```

---

## 🖼️ Adding Custom Assets

To add your own glasses or shirts:

1. Create a transparent-background PNG in **RGBA mode**
2. For glasses: `600×200 px`, lens centres at approximately `x=150` (left) and `x=450` (right)
3. For shirts: `800×900 px`, shoulder line at `y≈180`, shoulder span `x=130..670`
4. Drop the PNG into `assets/glasses/` or `assets/shirts/`
5. Add an entry to `assets/manifest.json`:
   ```json
   {"id": "g06", "file": "my_glasses.png", "label": "My Custom Style"}
   ```
6. Restart the app — new item appears automatically

---

## 🔧 Troubleshooting

| Problem | Fix |
|---|---|
| `Camera not found` | Change `CAMERA_INDEX=1` (or 2) in `.env`. Run `python zyro/main.py --list-cameras` |
| `ModelNotFoundError` | Run `python -m src.models.download_models` from `zyro/` directory |
| Low FPS (< 15) | Set `MODEL_COMPLEXITY=0` in `.env`. Close other camera apps. |
| Glasses too high/low | Adjust `GLASSES_Y_OFFSET_RATIO` in `.env` (or add to `.env`: negative = up) |
| Shirt invisible | Stand 1–2m from camera. Ensure good lighting. Show full torso. |
| ImportError on mediapipe | Run `pip install mediapipe==0.10.14` |

---

## 🧪 Running Tests

```bash
# From zyro/ directory
pip install -r requirements-dev.txt
pytest tests/ -v --cov=src --cov-report=term-missing
```

Target coverage: ≥70%

---

## 📝 License

MIT License — See `LICENSE` for details.

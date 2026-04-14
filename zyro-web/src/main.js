/**
 * main.js — Zyro AR Web Orchestrator
 *
 * Boot sequence:
 *   1. Splash screen
 *   2. Camera init
 *   3. MediaPipe detectors init (face, pose, hands) — parallel
 *   4. Three.js renderer init
 *   5. Load catalogue + manifest
 *   6. Wire gesture events
 *   7. Start AR loop (requestAnimationFrame)
 *
 * AR Loop (per frame):
 *   Frame N+0: hand inference   (every frame — gesture priority)
 *   Frame N+1: face inference   (every 2nd frame)
 *   Frame N+2: pose inference   (every 3rd frame — shirt only)
 *   → Update gesture engine
 *   → Update Three.js scene (head pose → glasses transform)
 *   → Render 3D
 *   → Draw UI canvas (hand skeleton, gesture icons)
 */

import { Splash }            from './ui/splash.js';
import { HUD }               from './ui/hud.js';
import { GestureViz }        from './ui/gesture-viz.js';
import { Catalogue }         from './ui/catalogue.js';
import { HandDetector }      from './ar-core/hand-detector.js';
import { FaceDetector }      from './ar-core/face-detector.js';
import { PoseDetector }      from './ar-core/pose-detector.js';
import { LandmarkSmoother }  from './gesture/smoother.js';
import { GestureEngine }     from './gesture/gesture-engine.js';
import { Renderer3D }        from './rendering/renderer-3d.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const video     = document.getElementById('webcam');
const canvas3d  = document.getElementById('canvas3d');
const canvasUI  = document.getElementById('canvasUI');

// ── Global state ──────────────────────────────────────────────────────────────
let faceLms  = null;
let poseLms  = null;
let handsLms = [];
let frameNum = 0;
let lastFrameTime = performance.now();
let debugMode = false;

// Current item + category
let currentItem     = null;
let currentCategory = 'glasses';

// Gesture-driven overlay offsets
let overlayOffset = { x: 0, y: 0, z: 0 };
let overlayScale  = 1.0;
let overlayRotY   = 0;


// ── Modules ───────────────────────────────────────────────────────────────────
const splash    = new Splash();
const hud       = new HUD();
const vizCanvas = canvasUI;

let renderer3d  = null;
let gestureViz  = null;
let gestureEng  = null;
let catalogue   = null;

const handSmoother = new LandmarkSmoother(0.45);
const faceSmoother = new LandmarkSmoother(0.40);
const poseSmoother = new LandmarkSmoother(0.35);

const faceDetector = new FaceDetector();
const poseDetector = new PoseDetector();
const handDetector = new HandDetector();

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap() {
  splash.setProgress(5, 'Starting camera…');

  // 1. Camera
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, facingMode: 'user' },
      audio: false,
    });
    video.srcObject = stream;
    await new Promise(r => { video.onloadedmetadata = r; });
    await video.play();
  } catch (err) {
    splash.setProgress(0, `❌ Camera error: ${err.message}`);
    return;
  }

  splash.setProgress(15, 'Camera ready. Loading AI models…');

  // Resize canvases to match video
  _resizeCanvases();
  window.addEventListener('resize', _resizeCanvases);

  // 2. Detectors — load in parallel for speed
  const progress = (msg) => splash.setProgress(splash._progress + 15, msg);
  await Promise.all([
    faceDetector.init(progress),
    poseDetector.init(progress),
    handDetector.init(progress),
  ]);

  splash.setProgress(75, 'Setting up 3D renderer…');

  // 3. Three.js renderer
  renderer3d = new Renderer3D(canvas3d);

  // 4. UI modules
  gestureViz = new GestureViz(canvasUI);
  gestureEng = new GestureEngine();
  catalogue  = new Catalogue();

  splash.setProgress(85, 'Loading product catalogue…');
  await catalogue.load('./manifest.json');

  // 5. Wire gesture events
  _wireGestureEvents();

  // 6. Wire catalogue events
  catalogue.addEventListener('item-select', (e) => {
    _loadItem(e.detail.item);
  });
  catalogue.addEventListener('category-change', (e) => {
    currentCategory = e.detail.category;
  });

  // 7. Wire control centre buttons
  document.getElementById('ccToggleDebug')?.addEventListener('click', () => {
    debugMode = !debugMode;
    document.getElementById('ccToggleDebug')?.classList.toggle('active', debugMode);
  });
  document.getElementById('ccReset')?.addEventListener('click', () => {
    overlayOffset = { x: 0, y: 0, z: 0 };
    overlayScale  = 1.0;
    overlayRotY   = 0;
    if (renderer3d) {
      renderer3d.gestureOffset = { ...overlayOffset };
      renderer3d.gestureScale  = overlayScale;
      renderer3d.gestureRotY   = overlayRotY;
    }
  });

  // Load initial item (first glasses fallback)
  const firstGlasses = catalogue.getItems('glasses')[0];
  if (firstGlasses) await _loadItem(firstGlasses);

  splash.setProgress(100, 'Ready!');
  setTimeout(() => {
    splash.hide();
    hud.show();
  }, 600);

  // 8. Start AR loop
  requestAnimationFrame(_arLoop);
}

// ── Gesture Event Wiring ──────────────────────────────────────────────────────
function _wireGestureEvents() {
  const eng = gestureEng;

  // TAP — select catalogue-hover item OR next item
  eng.addEventListener('tap', (e) => {
    hud.showGesture('tap');
    gestureViz.showGesture('tap');
    gestureViz.addRipple(e.detail.x, e.detail.y);
    if (catalogue.isOpen) {
      catalogue.confirmTouchHover();
    }
  });

  // DOUBLE-TAP — show/hide control centre
  eng.addEventListener('double-tap', (e) => {
    hud.showGesture('double-tap');
    gestureViz.showGesture('double-tap');
    gestureViz.addRipple(e.detail.x, e.detail.y);
    _toggleCC();
  });

  // PINCH & HOLD — context menu at hand position
  eng.addEventListener('hold', (e) => {
    hud.showGesture('hold');
    gestureViz.showGesture('hold');
    _showContextMenu(
      (1 - e.detail.x) * window.innerWidth,
      e.detail.y * window.innerHeight
    );
  });

  // DRAG — move overlay
  eng.addEventListener('drag', (e) => {
    const SENS = 0.8;
    overlayOffset.x -= e.detail.dx * SENS;   // Mirror: negate X
    overlayOffset.y -= e.detail.dy * SENS;
    if (renderer3d) renderer3d.gestureOffset = { ...overlayOffset };
    gestureViz.addDragPoint(e.detail.x, e.detail.y);
  });

  eng.addEventListener('drag-start', () => {
    gestureViz.clearDragTrail();
    gestureViz.showGesture('drag');
    hud.showGesture('drag');
  });

  eng.addEventListener('drag-end', () => {
    gestureViz.clearDragTrail();
  });

  // FLICK — next/prev item
  eng.addEventListener('flick', async (e) => {
    hud.showGesture('flick');
    gestureViz.showGesture('flick');
    const items = catalogue.getItems(currentCategory);
    if (!items.length) return;
    const idx = items.findIndex(i => i.id === currentItem?.id);
    let next;
    if (e.detail.dir === 'right' || e.detail.dir === 'up') {
      next = items[(idx + 1) % items.length];
    } else {
      next = items[(idx - 1 + items.length) % items.length];
    }
    if (next) await _loadItem(next);
  });

  // ZOOM — scale overlay
  eng.addEventListener('zoom', (e) => {
    hud.showGesture('zoom');
    gestureViz.showGesture('zoom');
    overlayScale = Math.max(0.3, Math.min(4, overlayScale * (1 + e.detail.delta)));
    if (renderer3d) renderer3d.gestureScale = overlayScale;
  });

  // ROTATE — rotate overlay
  eng.addEventListener('rotate', (e) => {
    hud.showGesture('rotate');
    gestureViz.showGesture('rotate');
    overlayRotY += e.detail.delta;
    if (renderer3d) renderer3d.gestureRotY = overlayRotY;
  });

  // PALM OPEN — toggle catalogue
  eng.addEventListener('palm-open', () => {
    hud.showGesture('palm-open');
    gestureViz.showGesture('palm-open');
    catalogue.toggle();
  });

  // WRIST RAISE — open control centre
  eng.addEventListener('wrist-raise', () => {
    hud.showGesture('wrist-raise');
    gestureViz.showGesture('wrist-raise');
    _toggleCC();
  });

  // DIRECT TOUCH — hover catalogue items
  eng.addEventListener('direct-touch', (e) => {
    if (catalogue.isOpen) {
      catalogue.handleDirectTouch(e.detail.x, e.detail.y);
    }
  });
}

// ── Item Loading ──────────────────────────────────────────────────────────────
async function _loadItem(item) {
  currentItem = item;
  hud.setItem(item.category, item.name);

  if (!renderer3d) return;

  let group;
  try {
    group = await renderer3d.loadModel(item.modelUrl);
  } catch {
    // Model not found → use fallback procedural geometry
    group = renderer3d.getFallbackMesh(item.category);
  }
  renderer3d.setActiveModel(group);
  currentCategory = item.category;
}

// ── AR Loop ───────────────────────────────────────────────────────────────────
function _arLoop(timestamp) {
  const now = performance.now();
  const dt  = now - lastFrameTime;
  lastFrameTime = now;

  // ── Inference schedule ─────────────────────────────────────────────────────
  // Hands: every frame (gesture latency critical)
  const rawHands = handDetector.detect(video, timestamp);
  handsLms = rawHands.map(h => handSmoother.update(h));

  // Face: every 2nd frame
  if (frameNum % 2 === 0) {
    const raw = faceDetector.detect(video, timestamp);
    faceLms = raw ? faceSmoother.update(raw) : null;
  }

  // Pose: every 3rd frame (body tracking less critical)
  if (frameNum % 3 === 0) {
    const raw = poseDetector.detect(video, timestamp);
    poseLms = raw ? poseSmoother.update(raw) : null;
  }

  frameNum++;

  // ── Gesture engine update ──────────────────────────────────────────────────
  gestureEng?.update(handsLms, timestamp);

  // Hold-progress visualization
  if (gestureEng?.state === 'PINCH_START' || gestureEng?.state === 'PINCH_HOLD') {
    const elapsed = now - gestureEng._pinchStartTime;
    const prog = Math.min(1, elapsed / 750);
    const c = gestureEng._pinchStartCenter;
    gestureViz?.setHoldProgress(prog, c?.x, c?.y);
  } else {
    gestureViz?.setHoldProgress(0);
  }

  // ── 3D scene update ────────────────────────────────────────────────────────
  renderer3d?.update(faceLms, poseLms, currentCategory ?? 'glasses');
  renderer3d?.render();

  // ── UI canvas ─────────────────────────────────────────────────────────────
  gestureViz?.draw(handsLms, dt / 1000, debugMode);

  // ── HUD ───────────────────────────────────────────────────────────────────
  hud.updateFPS(dt);
  hud.setDetection(!!faceLms, !!poseLms, handsLms.length > 0);

  requestAnimationFrame(_arLoop);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _resizeCanvases() {
  const w = window.innerWidth, h = window.innerHeight;
  canvas3d.width  = w; canvas3d.height  = h;
  canvasUI.width  = w; canvasUI.height  = h;
  renderer3d?.resize(w, h);
}

let ccOpen = false;
function _toggleCC() {
  const cc = document.getElementById('controlCenter');
  if (!cc) return;
  ccOpen = !ccOpen;
  cc.classList.toggle('hidden', !ccOpen);
}

function _showContextMenu(px, py) {
  const menu = document.getElementById('contextMenu');
  if (!menu) return;
  menu.style.left = `${Math.min(px, window.innerWidth  - 220)}px`;
  menu.style.top  = `${Math.min(py, window.innerHeight - 180)}px`;
  menu.classList.remove('hidden');

  const hide = () => { menu.classList.add('hidden'); document.removeEventListener('click', hide); };
  setTimeout(() => document.addEventListener('click', hide), 50);

  menu.querySelectorAll('.ctx-item').forEach(btn => {
    btn.onclick = () => {
      const action = btn.dataset.action;
      if (action === 'reset') {
        overlayOffset = { x:0, y:0, z:0 }; overlayScale = 1; overlayRotY = 0;
        if (renderer3d) { renderer3d.gestureOffset = {...overlayOffset}; renderer3d.gestureScale = 1; renderer3d.gestureRotY = 0; }
      }
      menu.classList.add('hidden');
    };
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
bootstrap().catch(err => {
  console.error('Zyro AR boot failed:', err);
  splash.setProgress(0, `❌ Boot failed: ${err.message}`);
});

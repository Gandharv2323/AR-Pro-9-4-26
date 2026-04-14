/**
 * main.js  — Zyro AR Web Orchestrator  v2
 *
 * FIXES v2:
 *   - Shared MediaPipe WASM pool (one load instead of three)
 *   - Staggered inference: hands every frame, face every 2nd, pose every 5th
 *   - Gesture engine public fields (no private access hacks)
 *   - Splash tracks progress properly via addProgress()
 *   - Catalogue item-select → async model load properly awaited
 *   - Resize handled before first frame
 *   - preloadModels() warms up GLB cache on boot
 *   - Context menu closes on next click or ESC
 *   - Debug toggle shows landmark indices
 *   - Record button captures canvas stream as WebM
 */

import { initPool }          from './ar-core/detector-pool.js';
import { HandDetector }      from './ar-core/hand-detector.js';
import { FaceDetector }      from './ar-core/face-detector.js';
import { PoseDetector }      from './ar-core/pose-detector.js';
import { LandmarkSmoother }  from './gesture/smoother.js';
import { GestureEngine }     from './gesture/gesture-engine.js';
import { Renderer3D }        from './rendering/renderer-3d.js';
import { GestureViz }        from './ui/gesture-viz.js';
import { HUD }               from './ui/hud.js';
import { Catalogue }         from './ui/catalogue.js';
import { Splash }            from './ui/splash.js';

// ── DOM ───────────────────────────────────────────────────────────────────────
const video    = document.getElementById('webcam');
const canvas3d = document.getElementById('canvas3d');
const canvasUI = document.getElementById('canvasUI');

// ── State ─────────────────────────────────────────────────────────────────────
let faceLms  = null;
let poseLms  = null;
let handsLms = [];
let frameNum = 0;
let lastFrameTime = performance.now();
let debugMode = false;
let recording = false;
let mediaRecorder = null;

let currentItem     = null;
let currentCategory = 'glasses';

let overlayOffset = { x: 0, y: 0, z: 0 };
let overlayScale  = 1.0;
let overlayRotY   = 0;

// Time-budget inference schedule (ms since last call)
let _lastFaceMs = 0;
let _lastPoseMs = 0;
const FACE_INTERVAL_MS = 80;    // ~12 Hz — face pose is stable
const POSE_INTERVAL_MS = 250;   // ~4  Hz — shirt anchor rarely changes fast

// ── Modules ───────────────────────────────────────────────────────────────────
const splash    = new Splash();
const hud       = new HUD();

let renderer3d  = null;
let gestureViz  = null;
let gestureEng  = null;
let catalogue   = null;

const handSmoother = new LandmarkSmoother(0.50);
const faceSmoother = new LandmarkSmoother(0.40);
const poseSmoother = new LandmarkSmoother(0.35);

const faceDetector = new FaceDetector();
const poseDetector = new PoseDetector();
const handDetector = new HandDetector();

let splashPct = 0;
function addProgress(delta, msg) {
  splashPct = Math.min(99, splashPct + delta);
  splash.setProgress(splashPct, msg);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap() {
  addProgress(2, 'Starting camera…');

  // ── 1. Camera ───────────────────────────────────────────────────────────────
  try {
    const constraints = {
      video: {
        width:  { ideal: 1280, max: 1920 },
        height: { ideal: 720,  max: 1080 },
        facingMode: 'user',
        frameRate: { ideal: 30, max: 60 },
      },
      audio: false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await new Promise((res, rej) => {
      video.onloadedmetadata = res;
      setTimeout(rej, 10000);   // 10s timeout
    });
    await video.play();
  } catch (err) {
    splash.setProgress(0, `❌ Camera: ${err.message}. Allow camera access and reload.`);
    return;
  }

  addProgress(10, 'Camera ready');

  // ── 2. Resize canvas to window ──────────────────────────────────────────────
  _resizeCanvases();
  window.addEventListener('resize', _resizeCanvases);

  // ── 3. MediaPipe shared WASM pool ───────────────────────────────────────────
  try {
    await initPool(msg => addProgress(0, msg));
    addProgress(15, 'WASM runtime loaded');
  } catch (err) {
    splash.setProgress(0, `❌ WASM: ${err.message}`);
    return;
  }

  // ── 4. Detectors — sequential (share WASM, faster than parallel) ────────────
  try {
    await faceDetector.init(msg => addProgress(0, msg));  addProgress(15, 'Face model ✓');
    await handDetector.init(msg => addProgress(0, msg));  addProgress(15, 'Hand model ✓');
    await poseDetector.init(msg => addProgress(0, msg));  addProgress(10, 'Pose model ✓');
  } catch (err) {
    splash.setProgress(0, `❌ Detector: ${err.message}`);
    return;
  }

  // ── 5. Three.js renderer ────────────────────────────────────────────────────
  addProgress(5, 'Setting up 3D renderer…');
  renderer3d = new Renderer3D(canvas3d);

  // ── 6. UI modules ───────────────────────────────────────────────────────────
  gestureViz = new GestureViz(canvasUI);
  gestureEng = new GestureEngine();
  catalogue  = new Catalogue();

  addProgress(5, 'Loading catalogue…');
  await catalogue.load('./manifest.json');

  // ── 7. Preload first GLB model ──────────────────────────────────────────────
  const firstItems = catalogue.getItems('glasses');
  if (firstItems[0]) {
    renderer3d.preloadModels(firstItems.map(i => i.modelUrl));
  }

  // ── 8. Wire events ──────────────────────────────────────────────────────────
  _wireGestureEvents();
  _wireControlCenter();
  _wireCatalogue();
  _wireKeyboard();

  // ── 9. Load first item ──────────────────────────────────────────────────────
  if (firstItems[0]) await _loadItem(firstItems[0]);

  // ── 10. Launch ──────────────────────────────────────────────────────────────
  addProgress(5, 'Ready! 🚀');
  setTimeout(() => {
    splash.hide();
    hud.show();
  }, 400);

  requestAnimationFrame(_arLoop);
}

// ── Gesture Events ────────────────────────────────────────────────────────────
function _wireGestureEvents() {
  const eng = gestureEng;

  eng.addEventListener('tap', e => {
    hud.showGesture('tap');
    gestureViz.showGesture('tap');
    gestureViz.addRipple(e.detail.x, e.detail.y);
    if (catalogue.isOpen) catalogue.confirmTouchHover();
  });

  eng.addEventListener('double-tap', e => {
    hud.showGesture('double-tap');
    gestureViz.addRipple(e.detail.x, e.detail.y);
    _toggleCC();
  });

  eng.addEventListener('hold', e => {
    hud.showGesture('hold');
    gestureViz.showGesture('hold');
    _showContextMenu(
      (1 - e.detail.x) * window.innerWidth,
      e.detail.y * window.innerHeight
    );
  });

  eng.addEventListener('drag-start', () => {
    gestureViz.clearDragTrail();
    gestureViz.showGesture('drag');
    hud.showGesture('drag');
    _closeContextMenu();
  });

  eng.addEventListener('drag', e => {
    // Moving overlay: dx/dy are normalized, convert to world units
    const SENS = 1.2;
    overlayOffset.x -= e.detail.dx * SENS;   // negate: mirror
    overlayOffset.y -= e.detail.dy * SENS;
    if (renderer3d) renderer3d.gestureOffset = { ...overlayOffset };
    gestureViz.addDragPoint(e.detail.x, e.detail.y);
  });

  eng.addEventListener('drag-end', () => {
    gestureViz.clearDragTrail();
  });

  eng.addEventListener('flick', async e => {
    hud.showGesture('flick');
    gestureViz.showGesture('flick');
    const items = catalogue.getItems(currentCategory);
    if (!items.length) return;
    const idx  = items.findIndex(i => i.id === currentItem?.id);
    const dir  = (e.detail.dir === 'right' || e.detail.dir === 'down') ? 1 : -1;
    const next = items[(idx + dir + items.length) % items.length];
    if (next && next.id !== currentItem?.id) await _loadItem(next);
  });

  eng.addEventListener('zoom', e => {
    hud.showGesture('zoom');
    overlayScale = Math.max(0.2, Math.min(5, overlayScale * (1 + e.detail.delta)));
    if (renderer3d) renderer3d.gestureScale = overlayScale;
  });

  eng.addEventListener('rotate', e => {
    hud.showGesture('rotate');
    overlayRotY += e.detail.delta;
    if (renderer3d) renderer3d.gestureRotY = overlayRotY;
  });

  eng.addEventListener('palm-open', () => {
    hud.showGesture('palm-open');
    gestureViz.showGesture('palm-open');
    catalogue.toggle();
  });

  eng.addEventListener('wrist-raise', () => {
    hud.showGesture('wrist-raise');
    gestureViz.showGesture('wrist-raise');
    _toggleCC();
  });

  eng.addEventListener('direct-touch', e => {
    if (catalogue.isOpen) catalogue.handleDirectTouch(e.detail.x, e.detail.y);
  });
}

// ── Control Center ────────────────────────────────────────────────────────────
let _ccOpen = false;

function _wireControlCenter() {
  document.getElementById('ccToggleCatalogue')?.addEventListener('click', () => catalogue.toggle());
  document.getElementById('ccToggleDebug')?.addEventListener('click', () => {
    debugMode = !debugMode;
    document.getElementById('ccToggleDebug')?.classList.toggle('active', debugMode);
  });
  document.getElementById('ccReset')?.addEventListener('click', _resetOverlay);
  document.getElementById('ccRecord')?.addEventListener('click', _toggleRecord);
}

function _resetOverlay() {
  overlayOffset = { x: 0, y: 0, z: 0 };
  overlayScale  = 1.0;
  overlayRotY   = 0;
  if (renderer3d) {
    renderer3d.gestureOffset = { ...overlayOffset };
    renderer3d.gestureScale  = 1.0;
    renderer3d.gestureRotY   = 0;
  }
}

function _toggleCC() {
  _ccOpen = !_ccOpen;
  const cc = document.getElementById('controlCenter');
  if (!cc) return;
  cc.classList.toggle('hidden', !_ccOpen);
  if (_ccOpen) cc.classList.remove('hidden');
}

// ── Catalogue ─────────────────────────────────────────────────────────────────
function _wireCatalogue() {
  catalogue.addEventListener('item-select', async e => {
    await _loadItem(e.detail.item);
    catalogue.close();
  });
  catalogue.addEventListener('category-change', e => {
    currentCategory = e.detail.category;
    // Preload models in new category
    const items = catalogue.getItems(currentCategory);
    renderer3d?.preloadModels(items.map(i => i.modelUrl));
  });
  document.getElementById('catalogueClose')?.addEventListener('click', () => catalogue.close());
}

// ── Keyboard Shortcuts ────────────────────────────────────────────────────────
function _wireKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape')  { _closeContextMenu(); catalogue.close(); _ccOpen = false; document.getElementById('controlCenter')?.classList.add('hidden'); }
    if (e.key === 'd')       { debugMode = !debugMode; }
    if (e.key === 'r')       { _resetOverlay(); }
    if (e.key === 'c')       { catalogue.toggle(); }
    if (e.key === 'ArrowRight') { _nextItem(1); }
    if (e.key === 'ArrowLeft')  { _nextItem(-1); }
  });
}

async function _nextItem(dir) {
  const items = catalogue.getItems(currentCategory);
  if (!items.length) return;
  const idx  = items.findIndex(i => i.id === currentItem?.id);
  const next = items[(idx + dir + items.length) % items.length];
  if (next) await _loadItem(next);
}

// ── Item Loading ──────────────────────────────────────────────────────────────
async function _loadItem(item) {
  currentItem     = item;
  currentCategory = item.category;
  hud.setItem(item.category, item.name);

  if (!renderer3d) return;

  let group;
  try {
    group = await renderer3d.loadModel(item.modelUrl);
  } catch {
    console.warn(`[Zyro] No GLB at ${item.modelUrl} — using fallback`);
    group = renderer3d.getFallbackMesh(item.category);
  }

  renderer3d.setActiveModel(group, item.category);
}

// ── AR Loop ───────────────────────────────────────────────────────────────────
function _arLoop(timestamp) {
  const now = performance.now();
  const dt  = Math.max(1, now - lastFrameTime);   // ms, clamped to avoid /0
  lastFrameTime = now;

  // ── Inference schedule (time-budget, not frame-count) ──────────────────────
  //  Hands: EVERY frame — gesture latency is critical (<~33ms target)
  //  Face:  max ~12 Hz — head pose changes slowly
  //  Pose:  max ~4  Hz — body anchor barely moves; only when shirt shown
  const ts = Math.floor(timestamp);

  // Always detect hands
  const rawHands = handDetector.detect(video, ts);
  handsLms = rawHands.map(h => handSmoother.update(h));

  // Face — time-gated
  if (now - _lastFaceMs >= FACE_INTERVAL_MS) {
    _lastFaceMs = now;
    const raw = faceDetector.detect(video, ts);
    faceLms = raw ? faceSmoother.update(raw) : null;
  }

  // Pose — time-gated, AND only when shirt is active (saves ~15ms/frame)
  const needPose = currentCategory === 'shirt' || currentCategory === 'bag';
  if (needPose && now - _lastPoseMs >= POSE_INTERVAL_MS) {
    _lastPoseMs = now;
    const raw = poseDetector.detect(video, ts);
    poseLms = raw ? poseSmoother.update(raw) : null;
  } else if (!needPose) {
    poseLms = null;  // clear cached pose when not needed
  }

  frameNum++;

  // ── Gesture engine ─────────────────────────────────────────────────────────
  gestureEng?.update(handsLms, timestamp);

  // Hold-progress arc
  if (gestureEng &&
      (gestureEng.state === 'PINCH_START' || gestureEng.state === 'PINCH_HOLD')) {
    const elapsed = now - gestureEng.pinchStartTime;
    const prog    = Math.min(1, elapsed / 750);
    const c       = gestureEng.pinchStartCenter;
    gestureViz?.setHoldProgress(prog, c?.x, c?.y);
  } else {
    gestureViz?.setHoldProgress(0);
  }

  // ── 3D scene ───────────────────────────────────────────────────────────────
  renderer3d?.update(faceLms, poseLms, currentCategory ?? 'glasses');
  renderer3d?.render();

  // ── 2D UI canvas ──────────────────────────────────────────────────────────
  gestureViz?.draw(handsLms, dt / 1000, debugMode);

  // ── HUD ───────────────────────────────────────────────────────────────────
  hud.updateFPS(dt);
  hud.setDetection(!!faceLms, needPose ? !!poseLms : false, handsLms.length > 0);

  requestAnimationFrame(_arLoop);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _resizeCanvases() {
  const w = window.innerWidth, h = window.innerHeight;
  canvas3d.width  = w; canvas3d.height  = h;
  canvasUI.width  = w; canvasUI.height  = h;
  renderer3d?.resize(w, h);
}

// Context menu
function _showContextMenu(px, py) {
  const menu = document.getElementById('contextMenu');
  if (!menu) return;
  menu.style.left = `${Math.min(px, window.innerWidth  - 220)}px`;
  menu.style.top  = `${Math.min(py, window.innerHeight - 200)}px`;
  menu.classList.remove('hidden');

  menu.querySelectorAll('.ctx-item').forEach(btn => {
    btn.onclick = () => {
      const a = btn.dataset.action;
      if (a === 'reset') _resetOverlay();
      if (a === 'fullscreen') document.documentElement.requestFullscreen?.();
      _closeContextMenu();
    };
  });
}

function _closeContextMenu() {
  document.getElementById('contextMenu')?.classList.add('hidden');
}

document.addEventListener('click', e => {
  const menu = document.getElementById('contextMenu');
  if (menu && !menu.contains(e.target)) _closeContextMenu();
});

// Record
function _toggleRecord() {
  const btn = document.getElementById('ccRecord');
  if (!recording) {
    const stream = canvas3d.captureStream?.(30);
    if (!stream) { console.warn('captureStream not supported'); return; }
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
    const chunks = [];
    mediaRecorder.ondataavailable = e => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `zyro-ar-${Date.now()}.webm`; a.click();
    };
    mediaRecorder.start();
    recording = true;
    btn?.classList.add('active');
    btn?.setAttribute('title', 'Stop Recording');
  } else {
    mediaRecorder?.stop();
    recording = false;
    btn?.classList.remove('active');
    btn?.setAttribute('title', 'Record');
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
bootstrap().catch(err => {
  console.error('[Zyro] Boot failure:', err);
  splash.setProgress(0, `❌ ${err.message}. Check console (F12). Try reloading.`);
});

/**
 * main.js  — Zyro AR Web Orchestrator  v3
 *
 * v3 KEY CHANGE: Face + Pose inference moved to inference-worker.js (Web Worker).
 *   - Main thread rAF loop now runs at native 60 FPS (no ML stall per frame)
 *   - Worker delivers results async → applied on next available frame
 *   - Hand detection stays on main thread (gesture latency is critical)
 *   - Worker and hand model load IN PARALLEL → faster boot
 *
 * Architecture:
 *   Main thread:  Camera → HandDetector → GestureEngine → Renderer → HUD
 *   Worker thread: FaceDetector → PoseLandmarker → postMessage results
 */

import { initPool }          from './ar-core/detector-pool.js';
import { HandDetector }      from './ar-core/hand-detector.js';
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

// ── AR State ──────────────────────────────────────────────────────────────────
let faceLms       = null;
let poseLms       = null;
let handsLms      = [];
let frameNum      = 0;
let lastFrameTime = performance.now();
let debugMode     = false;
let recording     = false;
let mediaRecorder = null;

let currentItem     = null;
let currentCategory = 'glasses';

let overlayOffset = { x: 0, y: 0, z: 0 };
let overlayScale  = 1.0;
let overlayRotY   = 0;

// Worker timing (controls how often we snapshot video → worker)
let _lastFaceRequestMs = 0;
let _lastPoseRequestMs = 0;
const FACE_REQUEST_INTERVAL_MS = 80;    // ~12 Hz
const POSE_REQUEST_INTERVAL_MS = 250;   // ~4  Hz

// ── Modules ───────────────────────────────────────────────────────────────────
const splash     = new Splash();
const hud        = new HUD();

let renderer3d  = null;
let gestureViz  = null;
let gestureEng  = null;
let catalogue   = null;

const handSmoother = new LandmarkSmoother(0.50);
const faceSmoother = new LandmarkSmoother(0.40);
const poseSmoother = new LandmarkSmoother(0.35);
const handDetector = new HandDetector();

// ── Splash progress helper ────────────────────────────────────────────────────
let splashPct = 0;
function addProgress(delta, msg) {
  splashPct = Math.min(99, splashPct + delta);
  splash.setProgress(splashPct, msg);
}

// ── Inference Worker wrapper ──────────────────────────────────────────────────
class InferenceWorker {
  constructor() {
    this._worker  = null;
    this._ready   = false;
    this._busy    = false;
    this._readyPr = null;
    this._readyCb = null;

    this._readyPr = new Promise(res => { this._readyCb = res; });
  }

  /** Start the worker, return Promise that resolves when worker posts 'ready' */
  start(onProgress) {
    this._worker = new Worker('./src/ar-core/inference-worker.js', { type: 'module' });

    this._worker.onmessage = (e) => {
      const { type } = e.data;

      if (type === 'ready') {
        this._ready = true;
        this._readyCb?.();
        onProgress?.(5, 'AI models ready ✓');

      } else if (type === 'init-progress') {
        onProgress?.(0, e.data.msg);

      } else if (type === 'init-error') {
        console.error('[InferenceWorker] init error:', e.data.msg);
        // Still resolve so bootstrap doesn't hang — face/pose disabled
        this._ready = true;
        this._readyCb?.();

      } else if (type === 'results') {
        this._busy = false;
        const { faceLandmarks, poseLandmarks, timestamp } = e.data;

        if (faceLandmarks) {
          faceLms = faceSmoother.update(faceLandmarks);
        } else if (faceLandmarks === null) {
          // Explicit null = no face detected
          faceLms = null;
        }

        if (poseLandmarks) {
          poseLms = poseSmoother.update(poseLandmarks);
        } else if (poseLandmarks === null) {
          poseLms = null;
        }
      }
    };

    this._worker.onerror = (err) => {
      console.error('[InferenceWorker] worker error:', err.message);
      this._busy = false;
    };

    return this._readyPr;
  }

  /**
   * Request detection. Captures current video frame and transfers to worker.
   * @param {boolean} runFace
   * @param {boolean} runPose
   */
  async requestDetection(runFace, runPose) {
    if (!this._ready || this._busy) return;
    if (!runFace && !runPose) return;

    this._busy = true;
    try {
      const imageBitmap = await createImageBitmap(video);
      this._worker.postMessage(
        { type: 'detect', imageBitmap, runFace, runPose, timestamp: performance.now() },
        [imageBitmap]   // zero-copy transfer
      );
    } catch (err) {
      console.warn('[InferenceWorker] createImageBitmap failed:', err.message);
      this._busy = false;
    }
  }

  terminate() { this._worker?.terminate(); }
}

const inferenceWorker = new InferenceWorker();

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap() {
  addProgress(2, 'Starting camera…');

  // ── 1. Camera ───────────────────────────────────────────────────────────────
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 },
               facingMode: 'user', frameRate: { ideal: 30 } },
      audio: false,
    });
    video.srcObject = stream;
    await new Promise((res, rej) => { video.onloadedmetadata = res; setTimeout(rej, 10000); });
    await video.play();
  } catch (err) {
    splash.setProgress(0, `❌ Camera: ${err.message}. Allow access & reload.`);
    return;
  }
  addProgress(8, 'Camera ready ✓');

  // ── 2. Resize canvases ──────────────────────────────────────────────────────
  _resizeCanvases();
  window.addEventListener('resize', _resizeCanvases);

  // ── 3. Start inference worker (loads face+pose in background) ───────────────
  addProgress(3, 'Starting AI worker…');
  const workerPromise = inferenceWorker.start((delta, msg) => addProgress(delta, msg));
  // NOTE: worker loading happens in parallel with step 4 below!

  // ── 4. Main thread: WASM pool + hand detector (parallel with worker) ────────
  try {
    await initPool(msg => addProgress(0, msg));
    addProgress(10, 'WASM pool ready ✓');
    await handDetector.init(msg => addProgress(0, msg));
    addProgress(15, 'Hand model ready ✓');
  } catch (err) {
    splash.setProgress(0, `❌ Hand detector: ${err.message}`);
    return;
  }

  // ── 5. Wait for worker (face + pose — may already be done) ──────────────────
  addProgress(0, 'Waiting for face/pose models…');
  await workerPromise;
  addProgress(20, 'All AI models loaded ✓');

  // ── 6. Three.js renderer ────────────────────────────────────────────────────
  addProgress(4, 'Setting up 3D renderer…');
  renderer3d = new Renderer3D(canvas3d);

  // ── 7. UI modules ───────────────────────────────────────────────────────────
  gestureViz = new GestureViz(canvasUI);
  gestureEng = new GestureEngine();
  catalogue  = new Catalogue();

  addProgress(3, 'Loading catalogue…');
  await catalogue.load('./manifest.json');

  // ── 8. Preload first-category GLBs ─────────────────────────────────────────
  const firstItems = catalogue.getItems('glasses');
  if (firstItems.length) renderer3d.preloadModels(firstItems.map(i => i.modelUrl));

  // ── 9. Wire events ──────────────────────────────────────────────────────────
  _wireGestureEvents();
  _wireControlCenter();
  _wireCatalogue();
  _wireKeyboard();

  // ── 10. Load first item ─────────────────────────────────────────────────────
  if (firstItems[0]) await _loadItem(firstItems[0]);

  // ── 11. Launch ──────────────────────────────────────────────────────────────
  addProgress(5, 'Ready! 🚀');
  setTimeout(() => { splash.hide(); hud.show(); }, 400);
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
    const SENS = 1.2;
    overlayOffset.x -= e.detail.dx * SENS;
    overlayOffset.y -= e.detail.dy * SENS;
    if (renderer3d) renderer3d.gestureOffset = { ...overlayOffset };
    gestureViz.addDragPoint(e.detail.x, e.detail.y);
  });

  eng.addEventListener('drag-end', () => gestureViz.clearDragTrail());

  eng.addEventListener('flick', async e => {
    hud.showGesture('flick');
    gestureViz.showGesture('flick');
    const items = catalogue.getItems(currentCategory);
    if (!items.length) return;
    const idx = items.findIndex(i => i.id === currentItem?.id);
    const dir = (e.detail.dir === 'right' || e.detail.dir === 'down') ? 1 : -1;
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
  cc?.classList.toggle('hidden', !_ccOpen);
  if (_ccOpen) cc?.classList.remove('hidden');
}

// ── Catalogue ─────────────────────────────────────────────────────────────────
function _wireCatalogue() {
  catalogue.addEventListener('item-select', async e => {
    await _loadItem(e.detail.item);
    catalogue.close();
  });
  catalogue.addEventListener('category-change', e => {
    currentCategory = e.detail.category;
    renderer3d?.preloadModels(catalogue.getItems(currentCategory).map(i => i.modelUrl));
  });
  document.getElementById('catalogueClose')?.addEventListener('click', () => catalogue.close());
}

// ── Keyboard ──────────────────────────────────────────────────────────────────
function _wireKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape')     { _closeContextMenu(); catalogue.close(); _ccOpen = false; document.getElementById('controlCenter')?.classList.add('hidden'); }
    if (e.key === 'd')          { debugMode = !debugMode; }
    if (e.key === 'r')          { _resetOverlay(); }
    if (e.key === 'c')          { catalogue.toggle(); }
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

// ── AR Loop (now runs at native 60 FPS) ───────────────────────────────────────
function _arLoop(timestamp) {
  const now = performance.now();
  const dt  = Math.max(1, now - lastFrameTime);
  lastFrameTime = now;

  // ── Hand detection — main thread, every frame ─────────────────────────────
  const rawHands = handDetector.detect(video, Math.floor(timestamp));
  handsLms = rawHands.map(h => handSmoother.update(h));

  // ── Issue async inference requests to worker (time-gated) ─────────────────
  const needPose = currentCategory === 'shirt' || currentCategory === 'bag';
  const runFace  = (now - _lastFaceRequestMs) >= FACE_REQUEST_INTERVAL_MS;
  const runPose  = needPose && (now - _lastPoseRequestMs) >= POSE_REQUEST_INTERVAL_MS;

  if (runFace) _lastFaceRequestMs = now;
  if (runPose) _lastPoseRequestMs = now;

  if (runFace || runPose) {
    // Fire-and-forget — results arrive via worker.onmessage and update faceLms/poseLms
    inferenceWorker.requestDetection(runFace, runPose);
  }

  frameNum++;

  // ── Gesture engine ─────────────────────────────────────────────────────────
  gestureEng?.update(handsLms, timestamp);

  // Hold arc progress
  if (gestureEng && (gestureEng.state === 'PINCH_START' || gestureEng.state === 'PINCH_HOLD')) {
    const prog = Math.min(1, (now - gestureEng.pinchStartTime) / 750);
    const c    = gestureEng.pinchStartCenter;
    gestureViz?.setHoldProgress(prog, c?.x, c?.y);
  } else {
    gestureViz?.setHoldProgress(0);
  }

  // ── 3D rendering — uses last known faceLms/poseLms (async, never stalls) ───
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

function _showContextMenu(px, py) {
  const menu = document.getElementById('contextMenu');
  if (!menu) return;
  menu.style.left = `${Math.min(px, window.innerWidth  - 220)}px`;
  menu.style.top  = `${Math.min(py, window.innerHeight - 200)}px`;
  menu.classList.remove('hidden');

  menu.querySelectorAll('.ctx-item').forEach(btn => {
    btn.onclick = () => {
      const a = btn.dataset.action;
      if (a === 'reset')      _resetOverlay();
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
      const a    = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `zyro-ar-${Date.now()}.webm`;
      a.click();
    };
    mediaRecorder.start();
    recording = true;
    btn?.classList.add('active');
  } else {
    mediaRecorder?.stop();
    recording = false;
    btn?.classList.remove('active');
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
bootstrap().catch(err => {
  console.error('[Zyro] Boot failure:', err);
  splash.setProgress(0, `❌ ${err.message}. Check console (F12) & reload.`);
});

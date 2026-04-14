/**
 * inference-worker.js — MediaPipe face + pose inference in a Web Worker
 *
 * DESIGN:
 *   - Runs completely off the main thread
 *   - Main thread sends ImageBitmap (zero-copy transfer)
 *   - Worker runs face AND/OR pose detection in IMAGE mode
 *   - Posts results back; main thread applies EMA and renders
 *
 * Protocol:
 *   SEND:    { type: 'detect', imageBitmap, runFace, runPose, timestamp }
 *   RECEIVE: { type: 'ready' }
 *            { type: 'init-progress', msg }
 *            { type: 'results', faceLandmarks, poseLandmarks, timestamp }
 *            { type: 'init-error', msg }
 */

import { FilesetResolver, FaceLandmarker, PoseLandmarker } from
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

const WASM_PATH      = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const FACE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const POSE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

let faceLandmarker = null;
let poseLandmarker = null;
let _busy          = false;

// ── Initialise ────────────────────────────────────────────────────────────────
async function init() {
  try {
    self.postMessage({ type: 'init-progress', msg: 'Worker: Loading WASM runtime…' });
    const fs = await FilesetResolver.forVisionTasks(WASM_PATH);

    // Face detector ─ GPU → CPU fallback
    self.postMessage({ type: 'init-progress', msg: 'Worker: Loading face model…' });
    for (const delegate of ['GPU', 'CPU']) {
      try {
        faceLandmarker = await FaceLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
          runningMode:                  'IMAGE',   // IMAGE = no timestamp constraint
          numFaces:                     1,
          minFaceDetectionConfidence:   0.5,
          minFacePresenceConfidence:    0.5,
          minTrackingConfidence:        0.5,
          outputFaceBlendshapes:        false,
          outputFacialTransformationMatrices: false,
        });
        console.log(`[Worker] FaceLandmarker delegate: ${delegate}`);
        break;
      } catch (e) {
        console.warn(`[Worker] Face ${delegate} failed:`, e.message);
        if (delegate === 'CPU') throw new Error('Face model failed on both GPU and CPU');
      }
    }

    // Pose detector ─ GPU → CPU fallback (non-fatal if both fail)
    self.postMessage({ type: 'init-progress', msg: 'Worker: Loading pose model…' });
    for (const delegate of ['GPU', 'CPU']) {
      try {
        poseLandmarker = await PoseLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
          runningMode:         'IMAGE',
          numPoses:            1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence:  0.5,
          minTrackingConfidence:      0.5,
        });
        console.log(`[Worker] PoseLandmarker delegate: ${delegate}`);
        break;
      } catch (e) {
        console.warn(`[Worker] Pose ${delegate} failed:`, e.message);
        if (delegate === 'CPU') {
          console.warn('[Worker] Pose detector disabled — shirt anchor unavailable');
        }
      }
    }

    self.postMessage({ type: 'ready' });

  } catch (err) {
    self.postMessage({ type: 'init-error', msg: err.message });
  }
}

// ── Message handler ───────────────────────────────────────────────────────────
self.onmessage = async (e) => {
  const { type, imageBitmap, runFace, runPose, timestamp } = e.data;

  if (type !== 'detect') return;

  // Drop frame if still processing previous one
  if (_busy) {
    imageBitmap?.close();
    return;
  }

  if (!imageBitmap) return;
  _busy = true;

  let faceLandmarks = null;
  let poseLandmarks = null;

  try {
    if (runFace && faceLandmarker) {
      const r = faceLandmarker.detect(imageBitmap);
      faceLandmarks = r.faceLandmarks?.[0] ?? null;
    }

    if (runPose && poseLandmarker) {
      const r = poseLandmarker.detect(imageBitmap);
      poseLandmarks = r.landmarks?.[0] ?? null;
    }
  } catch (err) {
    console.warn('[Worker] detect error:', err.message);
  } finally {
    imageBitmap.close();   // free GPU/CPU memory
    _busy = false;
  }

  self.postMessage({ type: 'results', faceLandmarks, poseLandmarks, timestamp });
};

// ── Boot ──────────────────────────────────────────────────────────────────────
init();

/**
 * hand-detector.js  — v2
 * Uses shared detector-pool WASM runtime.
 * GPU delegate with automatic CPU fallback.
 */

import { HandLandmarker } from
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
import { getFilesetResolver } from './detector-pool.js';

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export class HandDetector {
  constructor() {
    this._landmarker = null;
    this._lastTs = -1;
    this._lastResult = [];
  }

  async init(onProgress) {
    onProgress?.('Loading hand model…');
    const fs = getFilesetResolver();

    // Try GPU first; fall back to CPU if WebGL is unavailable
    for (const delegate of ['GPU', 'CPU']) {
      try {
        this._landmarker = await HandLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode:                    'VIDEO',
          numHands:                       2,
          minHandDetectionConfidence:     0.60,
          minHandPresenceConfidence:      0.60,
          minTrackingConfidence:          0.55,
        });
        console.log(`[HandDetector] Using delegate: ${delegate}`);
        break;
      } catch (err) {
        console.warn(`[HandDetector] delegate=${delegate} failed:`, err.message);
        if (delegate === 'CPU') throw err;
      }
    }
    onProgress?.('Hand detector ready ✓');
  }

  /**
   * @param {HTMLVideoElement} video
   * @param {number} timestamp — performance.now() in ms
   * @returns {Array<Array<{x,y,z}>>}  up to 2 × 21 landmarks
   */
  detect(video, timestamp) {
    if (!this._landmarker) return this._lastResult;
    // MediaPipe requires strictly increasing timestamps
    const ts = Math.floor(timestamp);
    if (ts <= this._lastTs) return this._lastResult;
    this._lastTs = ts;

    try {
      const r = this._landmarker.detectForVideo(video, ts);
      this._lastResult = r.landmarks ?? [];
    } catch (e) {
      console.warn('[HandDetector] detect error:', e.message);
    }
    return this._lastResult;
  }

  close() { this._landmarker?.close(); }
}

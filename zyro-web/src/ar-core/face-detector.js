/**
 * face-detector.js  — v2
 * Uses shared detector-pool WASM runtime. GPU → CPU fallback.
 */

import { FaceLandmarker } from
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
import { getFilesetResolver } from './detector-pool.js';

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export class FaceDetector {
  constructor() {
    this._landmarker = null;
    this._lastTs = -1;
    this._lastResult = null;
  }

  async init(onProgress) {
    onProgress?.('Loading face model…');
    const fs = getFilesetResolver();

    for (const delegate of ['GPU', 'CPU']) {
      try {
        this._landmarker = await FaceLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode:                  'VIDEO',
          numFaces:                     1,
          minFaceDetectionConfidence:   0.5,
          minFacePresenceConfidence:    0.5,
          minTrackingConfidence:        0.5,
          outputFaceBlendshapes:        false,
          outputFacialTransformationMatrices: false,
        });
        console.log(`[FaceDetector] Using delegate: ${delegate}`);
        break;
      } catch (err) {
        console.warn(`[FaceDetector] delegate=${delegate} failed:`, err.message);
        if (delegate === 'CPU') throw err;
      }
    }
    onProgress?.('Face detector ready ✓');
  }

  /**
   * @param {HTMLVideoElement} video
   * @param {number} timestamp
   * @returns {Array<{x,y,z}>|null} 478 landmarks or null
   */
  detect(video, timestamp) {
    if (!this._landmarker) return this._lastResult;
    const ts = Math.floor(timestamp);
    if (ts <= this._lastTs) return this._lastResult;
    this._lastTs = ts;

    try {
      const r = this._landmarker.detectForVideo(video, ts);
      this._lastResult = r.faceLandmarks?.[0] ?? null;
    } catch (e) {
      console.warn('[FaceDetector] detect error:', e.message);
    }
    return this._lastResult;
  }

  close() { this._landmarker?.close(); }
}

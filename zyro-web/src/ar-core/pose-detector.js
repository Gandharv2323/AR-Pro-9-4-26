/**
 * pose-detector.js  — v2
 * Uses shared detector-pool WASM runtime. GPU → CPU fallback.
 * Uses lite model for maximum speed.
 */

import { PoseLandmarker } from
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
import { getFilesetResolver } from './detector-pool.js';

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export class PoseDetector {
  constructor() {
    this._landmarker = null;
    this._lastTs = -1;
    this._lastResult = null;
  }

  async init(onProgress) {
    onProgress?.('Loading pose model…');
    const fs = getFilesetResolver();

    for (const delegate of ['GPU', 'CPU']) {
      try {
        this._landmarker = await PoseLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode:                'VIDEO',
          numPoses:                   1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence:  0.5,
          minTrackingConfidence:      0.5,
        });
        console.log(`[PoseDetector] Using delegate: ${delegate}`);
        break;
      } catch (err) {
        console.warn(`[PoseDetector] delegate=${delegate} failed:`, err.message);
        if (delegate === 'CPU') throw err;
      }
    }
    onProgress?.('Pose detector ready ✓');
  }

  /**
   * @param {HTMLVideoElement} video
   * @param {number} timestamp
   * @returns {Array<{x,y,z}>|null} 33 pose landmarks or null
   */
  detect(video, timestamp) {
    if (!this._landmarker) return this._lastResult;
    const ts = Math.floor(timestamp);
    if (ts <= this._lastTs) return this._lastResult;
    this._lastTs = ts;

    try {
      const r = this._landmarker.detectForVideo(video, ts);
      this._lastResult = r.landmarks?.[0] ?? null;
    } catch (e) {
      console.warn('[PoseDetector] detect error:', e.message);
    }
    return this._lastResult;
  }

  close() { this._landmarker?.close(); }
}

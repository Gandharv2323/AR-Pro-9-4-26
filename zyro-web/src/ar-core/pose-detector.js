/**
 * pose-detector.js
 * Wraps MediaPipe PoseLandmarker (Tasks Vision API).
 * Returns 33 body landmarks — used for shirt/garment anchor.
 */

import { FilesetResolver, PoseLandmarker } from
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

const WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL  = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export class PoseDetector {
  constructor() {
    this._landmarker = null;
    this._lastTs = -1;
    this._lastResult = null;
  }

  async init(onProgress) {
    onProgress?.('Loading pose model…');
    const fs = await FilesetResolver.forVisionTasks(WASM_PATH);
    this._landmarker = await PoseLandmarker.createFromOptions(fs, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode:               'VIDEO',
      numPoses:                  1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence:  0.5,
      minTrackingConfidence:      0.5,
    });
    onProgress?.('Pose detector ready');
  }

  /**
   * @param {HTMLVideoElement} video
   * @param {number} timestamp
   * @returns {Array<{x,y,z}>|null} — 33 pose landmarks or null
   */
  detect(video, timestamp) {
    if (!this._landmarker || timestamp === this._lastTs) return this._lastResult;
    this._lastTs = timestamp;
    const result = this._landmarker.detectForVideo(video, timestamp);
    this._lastResult = result.landmarks?.[0] ?? null;
    return this._lastResult;
  }

  close() { this._landmarker?.close(); }
}

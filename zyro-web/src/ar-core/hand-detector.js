/**
 * hand-detector.js
 * Wraps MediaPipe HandLandmarker (Tasks Vision API).
 * Detects up to 2 hands simultaneously.
 */

import { FilesetResolver, HandLandmarker } from
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

const WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL  = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export class HandDetector {
  constructor() {
    this._landmarker = null;
    this._lastTs = -1;
  }

  async init(onProgress) {
    onProgress?.('Loading hand model…');
    const fs = await FilesetResolver.forVisionTasks(WASM_PATH);
    this._landmarker = await HandLandmarker.createFromOptions(fs, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode:            'VIDEO',
      numHands:               2,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence:  0.55,
      minTrackingConfidence:      0.50,
    });
    onProgress?.('Hand detector ready');
  }

  /**
   * Detect hands in a video frame.
   * @param {HTMLVideoElement} video
   * @param {number} timestamp  — performance.now() in ms
   * @returns {Array<Array<{x,y,z}>>} — up to 2 arrays of 21 landmarks
   */
  detect(video, timestamp) {
    if (!this._landmarker) return [];
    if (timestamp === this._lastTs) return [];
    this._lastTs = timestamp;

    const result = this._landmarker.detectForVideo(video, timestamp);
    return result.landmarks ?? [];   // Array<Array<NormalizedLandmark>>
  }

  close() { this._landmarker?.close(); }
}

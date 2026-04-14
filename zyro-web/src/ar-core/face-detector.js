/**
 * face-detector.js
 * Wraps MediaPipe FaceLandmarker (Tasks Vision API).
 * Returns 478 landmarks per face.
 */

import { FilesetResolver, FaceLandmarker } from
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

const WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL  = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export class FaceDetector {
  constructor() {
    this._landmarker = null;
    this._lastTs = -1;
    this._lastResult = [];
  }

  async init(onProgress) {
    onProgress?.('Loading face model…');
    const fs = await FilesetResolver.forVisionTasks(WASM_PATH);
    this._landmarker = await FaceLandmarker.createFromOptions(fs, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode:                 'VIDEO',
      numFaces:                    1,
      minFaceDetectionConfidence:  0.5,
      minFacePresenceConfidence:   0.5,
      minTrackingConfidence:       0.5,
      outputFaceBlendshapes:       false,
      outputFacialTransformationMatrices: false,
    });
    onProgress?.('Face detector ready');
  }

  /**
   * @param {HTMLVideoElement} video
   * @param {number} timestamp
   * @returns {Array<{x,y,z}>|null}  — 478 landmarks or null
   */
  detect(video, timestamp) {
    if (!this._landmarker || timestamp === this._lastTs) return this._lastResult;
    this._lastTs = timestamp;
    const result = this._landmarker.detectForVideo(video, timestamp);
    this._lastResult = result.faceLandmarks?.[0] ?? null;
    return this._lastResult;
  }

  close() { this._landmarker?.close(); }
}

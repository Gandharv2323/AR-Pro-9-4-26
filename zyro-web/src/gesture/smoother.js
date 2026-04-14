/**
 * smoother.js
 * Per-landmark EMA (Exponential Moving Average) smoother.
 * Identical algorithm to Python src/modules/smoother.py.
 */

export class LandmarkSmoother {
  /**
   * @param {number} alpha  Smoothing factor 0 (heavy) – 1 (none). Default 0.45.
   */
  constructor(alpha = 0.45) {
    this.alpha = alpha;
    this._state = null;   // Array<{x, y, z}>
  }

  /**
   * Feed a new set of landmarks, get back smoothed landmarks.
   * @param {Array<{x,y,z}>} landmarks
   * @returns {Array<{x,y,z}>}
   */
  update(landmarks) {
    if (!landmarks || landmarks.length === 0) {
      this._state = null;
      return landmarks;
    }
    if (!this._state || this._state.length !== landmarks.length) {
      this._state = landmarks.map(lm => ({ ...lm }));
      return this._state;
    }
    const a = this.alpha;
    this._state = landmarks.map((lm, i) => ({
      x: a * lm.x + (1 - a) * this._state[i].x,
      y: a * lm.y + (1 - a) * this._state[i].y,
      z: a * lm.z + (1 - a) * this._state[i].z,
      // For MediaPipe, propagate visibility/presence if present
      visibility: lm.visibility,
      presence:   lm.presence,
    }));
    return this._state;
  }

  reset() { this._state = null; }
}

/**
 * Single-value EMA for scalars (FPS, pinch ratio, etc.)
 */
export class ScalarSmoother {
  constructor(alpha = 0.3) {
    this.alpha = alpha;
    this._val = null;
  }
  update(v) {
    if (this._val === null) { this._val = v; return v; }
    this._val = this.alpha * v + (1 - this.alpha) * this._val;
    return this._val;
  }
  get value() { return this._val ?? 0; }
  reset() { this._val = null; }
}

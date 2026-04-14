/**
 * gesture-engine.js
 * Apple Vision Pro-style gesture state machine.
 *
 * Emitted events (via addEventListener / dispatchEvent pattern):
 *   'tap'          — quick pinch release
 *   'double-tap'   — two taps within DOUBLE_TAP_MS
 *   'hold'         — pinch held > PINCH_HOLD_MS  { x, y }
 *   'drag'         — pinch dragging             { x, y, dx, dy }
 *   'drag-end'     — drag released
 *   'flick'        — rapid pinch flick          { dir: 'left'|'right'|'up'|'down' }
 *   'zoom'         — two-hand pinch zoom        { delta: number, scale: number }
 *   'rotate'       — two-hand rotation          { delta: number, angle: number }
 *   'palm-open'    — open palm detected
 *   'wrist-raise'  — wrist raised above threshold
 *   'direct-touch' — fingertip near UI zone     { zone: string, x, y }
 */

import {
  THRESHOLDS,
  isPinching, isPalmOpen, wristY,
  handCenter, handVelocity, twoHandDistance, twoHandAngle,
} from './gesture-recognizer.js';

const STATE = {
  IDLE: 'IDLE',
  PINCH_START: 'PINCH_START',
  PINCH_HOLD: 'PINCH_HOLD',
  DRAG: 'DRAG',
  TWO_HAND: 'TWO_HAND',
};

export class GestureEngine extends EventTarget {
  constructor() {
    super();
    this._state = STATE.IDLE;
    this._pinchStartTime = 0;
    this._pinchStartCenter = null;
    this._lastTapTime = 0;
    this._lastHandCenter = null;
    this._lastTimestamp = 0;

    // Two-hand state
    this._twoHandStartDist = null;
    this._twoHandStartAngle = null;
    this._twoHandScale = 1;
    this._twoHandAngleCumul = 0;

    // Palm open debounce
    this._palmOpenCooldown = 0;

    // Hold-progress timer
    this._holdFired = false;

    // Wrist raise
    this._wristRaiseCooldown = 0;

    // Touch zones (set by UI, normalized rects {x,y,w,h})
    this.touchZones = [];
  }

  /**
   * Main update — call every frame with smoothed hand landmarks.
   * @param {Array<Array<{x,y,z}>>}  handsLms  — up to 2 hands from MediaPipe
   * @param {number}                 timestamp — performance.now() in ms
   */
  update(handsLms, timestamp) {
    const dt = Math.min((timestamp - this._lastTimestamp) / 1000, 0.1);
    this._lastTimestamp = timestamp;

    const hands = handsLms ?? [];
    const h0 = hands[0] ?? null;
    const h1 = hands[1] ?? null;

    // ── Two-hand gestures ────────────────────────────────────────────────────
    if (h0 && h1) {
      this._handleTwoHands(h0, h1, dt);
      return;   // Exclusive: two-hand mode blocks single-hand logic
    }

    // Exit two-hand mode if we drop to < 2 hands
    if (this._state === STATE.TWO_HAND) {
      this._state = STATE.IDLE;
      this._twoHandStartDist = null;
      this._twoHandStartAngle = null;
    }

    if (!h0) {
      // No hands visible
      if (this._state !== STATE.IDLE) this._reset();
      this._lastHandCenter = null;
      return;
    }

    const now = performance.now();
    const center = handCenter(h0);
    const vel = handVelocity(h0, this._lastHandCenter, dt);
    const pinching = isPinching(h0);
    const palmOpen = isPalmOpen(h0);
    const wy = wristY(h0);

    // ── Palm Open ───────────────────────────────────────────────────────────
    if (palmOpen && now > this._palmOpenCooldown) {
      this._palmOpenCooldown = now + 1000;
      this._emit('palm-open', { x: center.x, y: center.y });
    }

    // ── Wrist Raise ─────────────────────────────────────────────────────────
    if (wy < THRESHOLDS.WRIST_RAISE && palmOpen && now > this._wristRaiseCooldown) {
      this._wristRaiseCooldown = now + 1500;
      this._emit('wrist-raise', { x: center.x, y: center.y });
    }

    // ── Direct Touch (fingertip enters UI zone) ──────────────────────────────
    this._checkDirectTouch(h0);

    // ── Single-hand pinch state machine ─────────────────────────────────────
    switch (this._state) {

      case STATE.IDLE:
        if (pinching) {
          this._state = STATE.PINCH_START;
          this._pinchStartTime = now;
          this._pinchStartCenter = { ...center };
          this._holdFired = false;
        }
        break;

      case STATE.PINCH_START: {
        if (!pinching) {
          // Released — classify as TAP or DOUBLE-TAP
          const elapsed = now - this._pinchStartTime;
          if (elapsed < 500) {   // quick release = tap
            if (now - this._lastTapTime < THRESHOLDS.DOUBLE_TAP_MS) {
              this._emit('double-tap', { x: center.x, y: center.y });
            } else {
              this._emit('tap', { x: center.x, y: center.y });
            }
            this._lastTapTime = now;
          }
          this._state = STATE.IDLE;
          break;
        }

        // Still pinching — check for drag vs hold
        const moveD = _dist(center, this._pinchStartCenter);
        if (moveD > THRESHOLDS.DRAG_START_PX) {
          this._state = STATE.DRAG;
          this._emit('drag-start', { x: center.x, y: center.y });
          break;
        }

        const heldMs = now - this._pinchStartTime;
        if (heldMs > THRESHOLDS.PINCH_HOLD_MS && !this._holdFired) {
          this._holdFired = true;
          this._state = STATE.PINCH_HOLD;
          this._emit('hold', { x: center.x, y: center.y });
        }
        break;
      }

      case STATE.PINCH_HOLD:
        if (!pinching) {
          this._state = STATE.IDLE;
        }
        break;

      case STATE.DRAG: {
        const dx = center.x - (this._lastHandCenter?.x ?? center.x);
        const dy = center.y - (this._lastHandCenter?.y ?? center.y);

        if (pinching) {
          // Still dragging
          this._emit('drag', { x: center.x, y: center.y, dx, dy });

          // Check for flick: fast release detection happens in next tick
        } else {
          // Released — check flick velocity
          if (vel.speed > THRESHOLDS.FLICK_VEL) {
            const dir = _flickDir(vel);
            this._emit('flick', { dir, vx: vel.x, vy: vel.y });
          } else {
            this._emit('drag-end', { x: center.x, y: center.y });
          }
          this._state = STATE.IDLE;
        }
        break;
      }
    }

    this._lastHandCenter = center;
  }

  /** Call this when two hands are detected */
  _handleTwoHands(h0, h1, dt) {
    const dist  = twoHandDistance(h0, h1);
    const angle = twoHandAngle(h0, h1);
    const bothPinching = isPinching(h0) && isPinching(h1);

    if (!bothPinching) {
      this._twoHandStartDist  = null;
      this._twoHandStartAngle = null;
      if (this._state === STATE.TWO_HAND) this._state = STATE.IDLE;
      return;
    }

    this._state = STATE.TWO_HAND;

    if (this._twoHandStartDist === null) {
      this._twoHandStartDist  = dist;
      this._twoHandStartAngle = angle;
      this._twoHandScale = 1;
      this._twoHandAngleCumul = 0;
      return;
    }

    // Zoom delta
    const scaleDelta = dist / this._twoHandStartDist;
    if (Math.abs(scaleDelta - this._twoHandScale) > 0.01) {
      this._emit('zoom', { delta: scaleDelta - this._twoHandScale, scale: scaleDelta });
      this._twoHandScale = scaleDelta;
    }

    // Rotation delta
    let angleDelta = angle - this._twoHandStartAngle;
    // Wrap to [-π, π]
    while (angleDelta >  Math.PI) angleDelta -= 2 * Math.PI;
    while (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;
    if (Math.abs(angleDelta - this._twoHandAngleCumul) > 0.01) {
      this._emit('rotate', { delta: angleDelta - this._twoHandAngleCumul, angle: angleDelta });
      this._twoHandAngleCumul = angleDelta;
    }
  }

  _checkDirectTouch(lms) {
    for (const zone of this.touchZones) {
      const tip = lms[8]; // Index TIP
      const tx = 1 - tip.x;  // Mirror correction
      if (tx >= zone.x && tx <= zone.x + zone.w &&
          tip.y >= zone.y && tip.y <= zone.y + zone.h) {
        this._emit('direct-touch', { zone: zone.id, x: tx, y: tip.y });
      }
    }
  }

  _reset() {
    this._state = STATE.IDLE;
    this._pinchStartCenter = null;
    this._holdFired = false;
  }

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /** Provide named touch zones for direct-touch detection */
  registerZone(id, x, y, w, h) {
    this.touchZones.push({ id, x, y, w, h });
  }

  clearZones() { this.touchZones = []; }

  get state() { return this._state; }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function _dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function _flickDir({ x, y }) {
  if (Math.abs(x) > Math.abs(y)) return x < 0 ? 'left' : 'right';
  return y < 0 ? 'up' : 'down';
}

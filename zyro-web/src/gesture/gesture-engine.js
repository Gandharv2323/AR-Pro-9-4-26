/**
 * gesture-engine.js  — v2
 * Apple Vision Pro-style gesture state machine.
 *
 * FIXES v2:
 *   - Bug: _lastHandCenter not updated inside DRAG state → jittery drag
 *   - Bug: pinchStartTime exposed as public getter (was private)
 *   - Bug: PALM_OPEN debounce was too short (1s → 1.5s)
 *   - Enhancement: FLICK direction now weighted (X dominant)
 *   - Enhancement: Velocity computed correctly in DRAG state
 *   - Enhancement: state exposed as public field with const enum
 *
 * Events emitted (CustomEvent, dispatchEvent):
 *   tap | double-tap | hold | drag-start | drag | drag-end
 *   flick | zoom | rotate | palm-open | wrist-raise | direct-touch
 */

import {
  THRESHOLDS,
  isPinching, isPalmOpen, wristY,
  handCenter, handVelocity, twoHandDistance, twoHandAngle,
} from './gesture-recognizer.js';

export const GESTURE_STATE = {
  IDLE:        'IDLE',
  PINCH_START: 'PINCH_START',
  PINCH_HOLD:  'PINCH_HOLD',
  DRAG:        'DRAG',
  TWO_HAND:    'TWO_HAND',
};

export class GestureEngine extends EventTarget {
  constructor() {
    super();

    // Public state (read-only externally — don't write)
    this.state            = GESTURE_STATE.IDLE;
    this.pinchStartTime   = 0;           // ms — used by main.js for hold-progress
    this.pinchStartCenter = null;        // {x,y} — used by main.js for hold-arc

    // Internal
    this._lastTapTime     = 0;
    this._lastHandCenter  = null;
    this._lastTimestamp   = 0;
    this._holdFired       = false;

    // Two-hand
    this._twoHandStartDist  = null;
    this._twoHandStartAngle = null;
    this._twoHandScale      = 1;
    this._twoHandAngleCumul = 0;

    // Debounce cooldowns (ms absolute)
    this._palmOpenCooldown  = 0;
    this._wristRaiseCooldown = 0;

    // Touch zones: { id, x, y, w, h } — normalized [0,1]
    this.touchZones = [];
  }

  /**
   * Call every frame with smoothed hand landmark arrays.
   * @param {Array<Array<{x,y,z}>>} handsLms — 0–2 hands
   * @param {number}                timestamp — performance.now() ms
   */
  update(handsLms, timestamp) {
    const dt = Math.min((timestamp - this._lastTimestamp) / 1000, 0.1); // cap at 100ms
    this._lastTimestamp = timestamp;

    const hands = handsLms ?? [];
    const h0 = hands[0] ?? null;
    const h1 = hands[1] ?? null;

    // ── Two-hand gestures (exclusive) ───────────────────────────────────────
    if (h0 && h1) {
      this._handleTwoHands(h0, h1);
      return;
    }

    // Exit two-hand mode
    if (this.state === GESTURE_STATE.TWO_HAND) {
      this.state = GESTURE_STATE.IDLE;
      this._twoHandStartDist  = null;
      this._twoHandStartAngle = null;
    }

    if (!h0) {
      if (this.state !== GESTURE_STATE.IDLE) this._reset();
      this._lastHandCenter = null;
      return;
    }

    const now    = performance.now();
    const center = handCenter(h0);
    const vel    = handVelocity(h0, this._lastHandCenter, dt);
    const pinch  = isPinching(h0);
    const palm   = isPalmOpen(h0);
    const wy     = wristY(h0);

    // ── Palm Open ────────────────────────────────────────────────────────────
    if (palm && now > this._palmOpenCooldown) {
      this._palmOpenCooldown = now + 1500;
      this._emit('palm-open', { x: center.x, y: center.y });
    }

    // ── Wrist Raise ──────────────────────────────────────────────────────────
    if (wy < THRESHOLDS.WRIST_RAISE && palm && now > this._wristRaiseCooldown) {
      this._wristRaiseCooldown = now + 2000;
      this._emit('wrist-raise', { x: center.x, y: center.y });
    }

    // ── Direct Touch ─────────────────────────────────────────────────────────
    this._checkDirectTouch(h0);

    // ── State machine ─────────────────────────────────────────────────────────
    switch (this.state) {

      case GESTURE_STATE.IDLE:
        if (pinch) {
          this.state            = GESTURE_STATE.PINCH_START;
          this.pinchStartTime   = now;
          this.pinchStartCenter = { ...center };
          this._holdFired       = false;
        }
        break;

      case GESTURE_STATE.PINCH_START: {
        if (!pinch) {
          // Released quickly → TAP or DOUBLE-TAP
          if (now - this._lastTapTime < THRESHOLDS.DOUBLE_TAP_MS) {
            this._emit('double-tap', { x: center.x, y: center.y });
          } else {
            this._emit('tap', { x: center.x, y: center.y });
          }
          this._lastTapTime = now;
          this.state = GESTURE_STATE.IDLE;
          break;
        }

        // Still pinching — did we move?
        const moveD = _dist(center, this.pinchStartCenter);
        if (moveD > THRESHOLDS.DRAG_START_PX) {
          this.state = GESTURE_STATE.DRAG;
          this._emit('drag-start', { x: center.x, y: center.y });
          break;
        }

        // Long hold?
        if (now - this.pinchStartTime > THRESHOLDS.PINCH_HOLD_MS && !this._holdFired) {
          this._holdFired = true;
          this.state = GESTURE_STATE.PINCH_HOLD;
          this._emit('hold', { x: center.x, y: center.y });
        }
        break;
      }

      case GESTURE_STATE.PINCH_HOLD:
        if (!pinch) this.state = GESTURE_STATE.IDLE;
        break;

      case GESTURE_STATE.DRAG: {
        const dx = this._lastHandCenter ? center.x - this._lastHandCenter.x : 0;
        const dy = this._lastHandCenter ? center.y - this._lastHandCenter.y : 0;

        if (pinch) {
          this._emit('drag', { x: center.x, y: center.y, dx, dy });
        } else {
          // Released — was it a flick?
          if (vel.speed > THRESHOLDS.FLICK_VEL) {
            this._emit('flick', { dir: _flickDir(vel), vx: vel.x, vy: vel.y, speed: vel.speed });
          } else {
            this._emit('drag-end', { x: center.x, y: center.y });
          }
          this.state = GESTURE_STATE.IDLE;
        }
        break;
      }
    }

    // ⚠️  FIX: update _lastHandCenter ALWAYS (was missing in DRAG case)
    this._lastHandCenter = center;
  }

  // ── Two-hand handler ─────────────────────────────────────────────────────
  _handleTwoHands(h0, h1) {
    const dist   = twoHandDistance(h0, h1);
    const angle  = twoHandAngle(h0, h1);
    const both   = isPinching(h0) && isPinching(h1);

    if (!both) {
      this._twoHandStartDist  = null;
      this._twoHandStartAngle = null;
      if (this.state === GESTURE_STATE.TWO_HAND) this.state = GESTURE_STATE.IDLE;
      return;
    }

    this.state = GESTURE_STATE.TWO_HAND;

    if (this._twoHandStartDist === null) {
      this._twoHandStartDist  = dist;
      this._twoHandStartAngle = angle;
      this._twoHandScale      = 1;
      this._twoHandAngleCumul = 0;
      return;
    }

    // Zoom
    const scaleDelta = dist / this._twoHandStartDist;
    if (Math.abs(scaleDelta - this._twoHandScale) > 0.008) {
      this._emit('zoom', { delta: scaleDelta - this._twoHandScale, scale: scaleDelta });
      this._twoHandScale = scaleDelta;
    }

    // Rotate
    let dA = angle - this._twoHandStartAngle;
    while (dA >  Math.PI) dA -= 2 * Math.PI;
    while (dA < -Math.PI) dA += 2 * Math.PI;
    if (Math.abs(dA - this._twoHandAngleCumul) > 0.012) {
      this._emit('rotate', { delta: dA - this._twoHandAngleCumul, angle: dA });
      this._twoHandAngleCumul = dA;
    }
  }

  // ── Direct touch ─────────────────────────────────────────────────────────
  _checkDirectTouch(lms) {
    const tip = lms[8]; // index fingertip
    const tx  = 1 - tip.x; // mirror correction
    for (const zone of this.touchZones) {
      if (tx >= zone.x && tx <= zone.x + zone.w &&
          tip.y >= zone.y && tip.y <= zone.y + zone.h) {
        this._emit('direct-touch', { zone: zone.id, x: tx, y: tip.y });
      }
    }
  }

  _reset() {
    this.state            = GESTURE_STATE.IDLE;
    this.pinchStartCenter = null;
    this._holdFired       = false;
  }

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  registerZone(id, x, y, w, h) { this.touchZones.push({ id, x, y, w, h }); }
  clearZones()                  { this.touchZones = []; }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function _dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function _flickDir({ x, y }) {
  // Weight horizontal more than vertical (matches natural flick)
  if (Math.abs(x) * 1.2 > Math.abs(y)) return x < 0 ? 'left' : 'right';
  return y < 0 ? 'up' : 'down';
}

/**
 * gesture-viz.js
 * Draws hand skeleton, gesture icons, ripple effects, and hold-progress arc
 * onto the 2D UI canvas.
 */

import { LM } from '../gesture/gesture-recognizer.js';

// Connections matching MediaPipe hand topology
const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],         // Thumb
  [0,5],[5,6],[6,7],[7,8],         // Index
  [0,9],[9,10],[10,11],[11,12],    // Middle
  [0,13],[13,14],[14,15],[15,16],  // Ring
  [0,17],[17,18],[18,19],[19,20],  // Pinky
  [5,9],[9,13],[13,17],            // Palm arch
];

const FINGER_TIPS = [4, 8, 12, 16, 20];

const GESTURE_ICONS = {
  'tap':         { icon: '🤏', label: 'Tap',          color: '#00d4ff' },
  'double-tap':  { icon: '✌️', label: 'Double Tap',   color: '#00ff88' },
  'hold':        { icon: '🤚', label: 'Hold',          color: '#ff6b35' },
  'drag':        { icon: '👆', label: 'Drag',          color: '#9d4edd' },
  'flick':       { icon: '⚡', label: 'Flick',         color: '#00d4ff' },
  'zoom':        { icon: '🔍', label: 'Zoom',          color: '#00ff88' },
  'rotate':      { icon: '🔄', label: 'Rotate',        color: '#ff6b35' },
  'palm-open':   { icon: '✋', label: 'Catalogue',     color: '#9d4edd' },
  'wrist-raise': { icon: '🌁', label: 'Control',       color: '#00d4ff' },
};

export class GestureViz {
  /**
   * @param {HTMLCanvasElement} canvas  — the UI overlay canvas
   */
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');

    // Active gesture notification
    this._activeGesture = null;
    this._gestureAlpha = 0;

    // Ripple pool
    this._ripples = [];

    // Hold progress (0-1)
    this._holdProgress = 0;
    this._holdPos = null;

    // Drag trail
    this._dragTrail = [];
  }

  get ctx() { return this._ctx; }

  /** Call to trigger a gesture visual for 1.5s */
  showGesture(type) {
    this._activeGesture = type;
    this._gestureAlpha = 1;
  }

  /** Add a ripple at normalized position */
  addRipple(nx, ny) {
    const x = (1 - nx) * this._canvas.width;
    const y = ny * this._canvas.height;
    this._ripples.push({ x, y, r: 0, alpha: 0.9, t: 0 });
  }

  setHoldProgress(progress, nx, ny) {
    this._holdProgress = progress;
    if (nx !== undefined) this._holdPos = { x: (1-nx) * this._canvas.width, y: ny * this._canvas.height };
  }

  addDragPoint(nx, ny) {
    this._dragTrail.push({
      x: (1 - nx) * this._canvas.width,
      y: ny * this._canvas.height,
      t: performance.now(),
    });
    if (this._dragTrail.length > 30) this._dragTrail.shift();
  }
  clearDragTrail() { this._dragTrail = []; }

  /**
   * Draw everything — call each frame after clearing the canvas.
   * @param {Array<Array<{x,y,z}>>} handsLms  — 0-2 smoothed hand landmark arrays
   * @param {number}                dt         — delta time seconds
   * @param {boolean}               debug      — show z-depth + confidence
   */
  draw(handsLms, dt, debug = false) {
    const { _ctx: ctx, _canvas: cv } = this;

    // Clear
    ctx.clearRect(0, 0, cv.width, cv.height);

    // ── Drag trail ──────────────────────────────────────────────────────────
    if (this._dragTrail.length > 1) {
      const now = performance.now();
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 1; i < this._dragTrail.length; i++) {
        const a = this._dragTrail[i - 1], b = this._dragTrail[i];
        const age = (now - b.t) / 500;
        ctx.globalAlpha = Math.max(0, 1 - age) * 0.6;
        ctx.strokeStyle = '#9d4edd';
        ctx.lineWidth = 3 * (1 - age * 0.5);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── Ripples ─────────────────────────────────────────────────────────────
    const keepRipples = [];
    for (const rp of this._ripples) {
      rp.t += dt;
      rp.r  = rp.t * 300;
      rp.alpha = Math.max(0, 0.9 - rp.t * 2.5);
      if (rp.alpha > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0,212,255,${rp.alpha})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
        keepRipples.push(rp);
      }
    }
    this._ripples = keepRipples;

    // ── Hold progress arc ────────────────────────────────────────────────────
    if (this._holdProgress > 0 && this._holdPos) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(
        this._holdPos.x, this._holdPos.y, 28,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * this._holdProgress
      );
      ctx.strokeStyle = '#ff6b35';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }

    // ── Hand skeletons ───────────────────────────────────────────────────────
    for (const lms of (handsLms ?? [])) {
      this._drawSkeleton(lms, debug);
    }

    // ── Gesture notification fade ────────────────────────────────────────────
    this._gestureAlpha = Math.max(0, this._gestureAlpha - dt * 1.2);
    if (this._activeGesture && this._gestureAlpha > 0) {
      const info = GESTURE_ICONS[this._activeGesture];
      if (info) this._drawGestureLabel(info, this._gestureAlpha);
    }
  }

  _drawSkeleton(lms, debug) {
    const { _ctx: ctx, _canvas: cv } = this;
    const toX = (lm) => (1 - lm.x) * cv.width;
    const toY = (lm) => lm.y * cv.height;

    // Connections
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 2;

    for (const [a, b] of CONNECTIONS) {
      const pa = lms[a], pb = lms[b];
      const t = b / 20;   // 0=wrist, 1=tip
      const alpha = 0.5 + 0.5 * t;
      ctx.strokeStyle = `rgba(0,212,255,${alpha})`;
      ctx.beginPath();
      ctx.moveTo(toX(pa), toY(pa)); ctx.lineTo(toX(pb), toY(pb));
      ctx.stroke();
    }

    // Landmark dots
    for (let i = 0; i < lms.length; i++) {
      const lm = lms[i];
      const isTip = FINGER_TIPS.includes(i);
      const isWrist = i === LM.WRIST;
      const r = isTip ? 5 : isWrist ? 5 : 3;

      ctx.beginPath();
      ctx.arc(toX(lm), toY(lm), r, 0, Math.PI * 2);

      if (isTip) {
        ctx.fillStyle = '#00ff88';
      } else if (isWrist) {
        ctx.fillStyle = '#ff6b35';
      } else {
        ctx.fillStyle = 'rgba(0,212,255,0.7)';
      }
      ctx.fill();

      if (debug) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '8px monospace';
        ctx.fillText(i, toX(lm) + 4, toY(lm) - 4);
      }
    }

    ctx.restore();
  }

  _drawGestureLabel({ icon, label, color }, alpha) {
    const { _ctx: ctx, _canvas: cv } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    const x = cv.width / 2, y = cv.height - 110;
    const padX = 20, padY = 12, h = 52, r = 26;
    const tw = ctx.measureText(label).width + 50;
    const w = Math.max(140, tw);

    // Background pill
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, r);
    ctx.fillStyle = 'rgba(8,8,18,0.85)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Icon
    ctx.font = '22px serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(icon, x - w / 2 + padX, y);

    // Label
    ctx.font = '600 14px "Space Grotesk", sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.fillText(label, x - w / 2 + padX + 32, y);

    ctx.restore();
  }
}

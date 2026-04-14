/**
 * hud.js
 * Heads-Up Display — FPS counter, detection status dots, item label.
 */

import { ScalarSmoother } from '../gesture/smoother.js';

export class HUD {
  constructor() {
    this._hudEl        = document.getElementById('hud');
    this._fpsEl        = document.getElementById('hudFPS');
    this._dotFace      = document.getElementById('dotFace');
    this._dotPose      = document.getElementById('dotPose');
    this._dotHand      = document.getElementById('dotHand');
    this._categoryEl   = document.getElementById('hudCategory');
    this._itemNameEl   = document.getElementById('hudItemName');
    this._hintBar      = document.getElementById('hintBar');
    this._gestureEl    = document.getElementById('gestureIndicator');
    this._gestureIcon  = document.getElementById('gestureIcon');
    this._gestureLabel = document.getElementById('gestureLabel');

    this._fpsSmoother  = new ScalarSmoother(0.15);
    this._lastTime     = performance.now();
    this._gestureTimer = null;
  }

  show() {
    this._hudEl?.classList.remove('hidden');
    this._hintBar?.classList.remove('hidden');
  }

  /** Call every frame — dt in ms */
  updateFPS(dt) {
    const fps = this._fpsSmoother.update(1000 / Math.max(dt, 1));
    if (this._fpsEl) this._fpsEl.textContent = `${Math.round(fps)} FPS`;
    // Colour by speed
    const color = fps >= 20 ? '#00ff88' : fps >= 12 ? '#ff6b35' : '#ff3355';
    if (this._fpsEl) this._fpsEl.style.color = color;
  }

  /** Update detection status dots */
  setDetection(face, pose, hand) {
    this._dot(this._dotFace, face);
    this._dot(this._dotPose, pose);
    this._dot(this._dotHand, hand);
  }

  _dot(el, active) {
    if (!el) return;
    el.classList.toggle('active', Boolean(active));
  }

  /** Update displayed item name */
  setItem(category, name) {
    const EMOJI = { glasses:'👓', shirt:'👕', hat:'🎩', watch:'⌚', bag:'👜' };
    if (this._categoryEl) this._categoryEl.textContent = `${EMOJI[category] ?? '📦'} ${_cap(category)}`;
    if (this._itemNameEl) this._itemNameEl.textContent = name;
  }

  /** Flash gesture notification banner for 1.5s with re-triggered slide-up animation */
  showGesture(type) {
    const ICONS = {
      'tap':         ['🤏', 'Tap',        '#00d4ff'],
      'double-tap':  ['✌️', 'Double Tap', '#00ff88'],
      'hold':        ['🤚', 'Hold',       '#ff6b35'],
      'drag':        ['👆', 'Drag',       '#9d4edd'],
      'flick':       ['⚡', 'Flick',      '#00d4ff'],
      'zoom':        ['🔍', 'Zoom',       '#00ff88'],
      'rotate':      ['🔄', 'Rotate',     '#ff6b35'],
      'palm-open':   ['✋', 'Catalogue',  '#9d4edd'],
      'wrist-raise': ['🌁', 'Control',    '#00d4ff'],
    };
    const info = ICONS[type];
    if (!info || !this._gestureEl) return;
    const [icon, label, color] = info;
    if (this._gestureIcon)  this._gestureIcon.textContent = icon;
    if (this._gestureLabel) {
      this._gestureLabel.textContent = label;
      this._gestureLabel.style.color = color;
    }
    this._gestureEl.style.borderColor = `${color}55`;

    // Re-trigger slide-up animation every call
    this._gestureEl.classList.remove('hidden', 'show');
    void this._gestureEl.offsetWidth;  // force reflow
    this._gestureEl.classList.add('show');

    clearTimeout(this._gestureTimer);
    this._gestureTimer = setTimeout(() => {
      this._gestureEl?.classList.add('hidden');
      this._gestureEl?.classList.remove('show');
    }, 1600);
  }
}

function _cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

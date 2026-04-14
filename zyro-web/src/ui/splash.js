/**
 * splash.js
 * Animated loading screen with multi-step progress.
 */

export class Splash {
  constructor() {
    this._el     = document.getElementById('splash');
    this._bar    = document.getElementById('splashBar');
    this._status = document.getElementById('splashStatus');
    this._progress = 0;
  }

  /** Update progress (0-100) and status text */
  setProgress(pct, text) {
    this._progress = pct;
    if (this._bar)    this._bar.style.width = `${pct}%`;
    if (this._status) this._status.textContent = text;
  }

  /** Fade out and remove splash */
  hide() {
    if (!this._el) return;
    this._el.classList.add('fade-out');
    setTimeout(() => {
      this._el.style.display = 'none';
    }, 900);
  }
}

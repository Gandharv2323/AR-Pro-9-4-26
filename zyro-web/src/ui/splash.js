/**
 * splash.js  — v2
 * Tracks progress internally; provides addProgress() + public accessor.
 */

export class Splash {
  constructor() {
    this._el       = document.getElementById('splash');
    this._bar      = document.getElementById('splashBar');
    this._statusEl = document.getElementById('splashStatus');
    this._pct      = 0;
  }

  /** Set absolute progress and status text */
  setProgress(pct, text) {
    this._pct = Math.min(100, Math.max(0, pct));
    if (this._bar)      this._bar.style.width = `${this._pct}%`;
    if (this._statusEl) this._statusEl.textContent = text;
  }

  /** Fade out splash after optional delay */
  hide(delayMs = 0) {
    setTimeout(() => {
      this._el?.classList.add('fade-out');
      setTimeout(() => {
        if (this._el) this._el.style.display = 'none';
      }, 900);
    }, delayMs);
  }
}

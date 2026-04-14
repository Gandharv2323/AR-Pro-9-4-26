/**
 * detector-pool.js
 * Single MediaPipe WASM runtime shared across face, pose and hand detectors.
 * Avoids loading the WASM bundle three separate times (~80 MB saved).
 *
 * Usage:
 *   import { initPool, getFilesetResolver } from './detector-pool.js';
 *   await initPool(progressCb);
 *   const fs = getFilesetResolver();
 */

import { FilesetResolver } from
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

const WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';

let _resolver = null;
let _initPromise = null;

/**
 * Initialise the shared WASM runtime exactly once.
 * Safe to call multiple times — subsequent calls are no-ops.
 * @param {(msg: string) => void} [onProgress]
 */
export async function initPool(onProgress) {
  if (_resolver) return _resolver;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    onProgress?.('Loading MediaPipe WASM runtime…');
    _resolver = await FilesetResolver.forVisionTasks(WASM_PATH);
    onProgress?.('WASM runtime ready');
    return _resolver;
  })();

  return _initPromise;
}

/** Return the shared resolver (throws if initPool not yet awaited). */
export function getFilesetResolver() {
  if (!_resolver) throw new Error('Detector pool not initialised. Call initPool() first.');
  return _resolver;
}

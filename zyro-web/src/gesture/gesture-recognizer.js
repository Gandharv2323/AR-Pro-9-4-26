/**
 * gesture-recognizer.js
 * Low-level hand landmark analysis → raw gesture primitives
 * All coordinates are MediaPipe normalized [0,1]
 */

// ── MediaPipe Hand Landmark Indices ─────────────────────────────────────────
export const LM = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
};

// ── Thresholds ───────────────────────────────────────────────────────────────
export const THRESHOLDS = {
  PINCH_CLOSED:    0.055,   // thumb-index distance (normalized to hand size)
  PINCH_OPEN:      0.09,    // hysteresis gap
  PALM_SPREAD_MIN: 0.14,    // avg finger spread for open palm
  PALM_Z_MAX:      0.05,    // palm facing camera (z of index MCP)
  DIRECT_TOUCH_Z: -0.03,    // finger extended toward camera
  DOUBLE_TAP_MS:   380,
  PINCH_HOLD_MS:   750,
  DRAG_START_PX:   0.025,   // normalized units
  FLICK_VEL:       0.55,    // normalized units / second
  WRIST_RAISE:     0.25,    // wrist Y < this = raised (top of frame)
};

/**
 * Compute distance between two landmarks (normalized).
 * Optionally normalized to hand-size (wrist→middle_MCP).
 */
export function lmDist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Compute hand size (wrist to middle finger MCP) for normalization.
 */
export function handSize(lms) {
  return lmDist(lms[LM.WRIST], lms[LM.MIDDLE_MCP]);
}

/**
 * Pinch ratio: 0 = fully closed, 1 = fully open
 * Uses thumb-tip ↔ index-tip distance, normalized to hand size.
 */
export function pinchRatio(lms) {
  const sz = handSize(lms) || 0.001;
  const dist = lmDist(lms[LM.THUMB_TIP], lms[LM.INDEX_TIP]);
  // Clamp to [0, 1], invert so 1 = open, 0 = closed
  return Math.min(1, Math.max(0, dist / sz / 0.5));
}

/**
 * Return true when pinch is closed (thumb touches index).
 */
export function isPinching(lms) {
  const sz = handSize(lms) || 0.001;
  return lmDist(lms[LM.THUMB_TIP], lms[LM.INDEX_TIP]) / sz < THRESHOLDS.PINCH_CLOSED;
}

/**
 * Return true when palm is open (all fingers extended, facing camera).
 */
export function isPalmOpen(lms) {
  const sz = handSize(lms) || 0.001;
  const tips = [LM.INDEX_TIP, LM.MIDDLE_TIP, LM.RING_TIP, LM.PINKY_TIP];
  const mcps = [LM.INDEX_MCP, LM.MIDDLE_MCP, LM.RING_MCP, LM.PINKY_MCP];
  // Each finger tip must be further from wrist than its MCP
  for (let i = 0; i < tips.length; i++) {
    const tipDist = lmDist(lms[tips[i]], lms[LM.WRIST]);
    const mcpDist = lmDist(lms[mcps[i]], lms[LM.WRIST]);
    if (tipDist < mcpDist * 1.2) return false;
  }
  // Avg spread between adjacent fingertips
  let spread = 0;
  for (let i = 0; i < tips.length - 1; i++) {
    spread += lmDist(lms[tips[i]], lms[tips[i + 1]]);
  }
  return (spread / (tips.length - 1)) / sz > THRESHOLDS.PALM_SPREAD_MIN * 0.7;
}

/**
 * Wrist Y normalized position (0=top, 1=bottom).
 * Returns < WRIST_RAISE when hand is raised.
 */
export function wristY(lms) {
  return lms[LM.WRIST].y;
}

/**
 * Hand center (average of all landmark positions).
 */
export function handCenter(lms) {
  let x = 0, y = 0;
  for (const lm of lms) { x += lm.x; y += lm.y; }
  return { x: x / lms.length, y: y / lms.length };
}

/**
 * Compute hand velocity (center displacement / dt) in normalized units/sec.
 * prevCenter: { x, y }, dt in seconds.
 */
export function handVelocity(lms, prevCenter, dt) {
  if (!prevCenter || dt < 0.001) return { x: 0, y: 0, speed: 0 };
  const c = handCenter(lms);
  const vx = (c.x - prevCenter.x) / dt;
  const vy = (c.y - prevCenter.y) / dt;
  return { x: vx, y: vy, speed: Math.sqrt(vx * vx + vy * vy) };
}

/**
 * Check if index fingertip is "pointing" toward a 2D screen region.
 * rect: { x, y, w, h } in normalized [0,1].
 */
export function isPointingAt(lms, rect) {
  const tip = lms[LM.INDEX_TIP];
  // Mirror flip: because webcam is mirrored
  const tx = 1 - tip.x;
  return tx >= rect.x && tx <= rect.x + rect.w &&
         tip.y >= rect.y && tip.y <= rect.y + rect.h;
}

/**
 * Two-hand distance (between hand centers). Normalized.
 */
export function twoHandDistance(lmsA, lmsB) {
  const a = handCenter(lmsA), b = handCenter(lmsB);
  return lmDist(a, b);
}

/**
 * Two-hand angle (center-to-center line angle, radians).
 */
export function twoHandAngle(lmsA, lmsB) {
  const a = handCenter(lmsA), b = handCenter(lmsB);
  return Math.atan2(b.y - a.y, b.x - a.x);
}

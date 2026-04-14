/**
 * renderer-3d.js  — v3
 * Three.js scene manager for 3D GLB asset overlay.
 *
 * v3 changes:
 *   - Shirt uses real pose shoulder anchor (not face bridge)
 *   - Face-derived torso fallback when pose landmarks unavailable
 *   - Debug logging for shirt anchor tuning (set SHIRT_DEBUG = true)
 *   - CAT_CONFIG tuned for glasses_01 real scale
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { estimateHeadPose, normToWorld } from './head-pose.js';

const DRACO_CDN = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

// Set true to log pose anchor values to console each frame (shirt debugging)
let SHIRT_DEBUG = false;
export function setShirtDebug(v) { SHIRT_DEBUG = v; }

// ── Category-specific display tuning ──────────────────────────────────────────
// yOff:        World-space Y offset after anchor (positive = up)
// targetWidth: How wide the model appears in world units at reference depth
// depth:       Z distance from camera (negative = in front)
const CAT_CONFIG = {
  glasses: {
    yOff:        0.01,    // Sit on nose bridge — no offset needed
    targetWidth: 0.20,    // ~20cm wide — matches real eyewear
    depth:       -1.8,    // Arm's-length ≈ 60cm from camera
    anchor:      'face',  // Uses nose bridge landmark
  },
  hat: {
    yOff:        0.28,    // Above forehead
    targetWidth: 0.32,
    depth:       -1.8,
    anchor:      'face',
  },
  shirt: {
    yOff:        -0.12,   // Fine-tune: shoulder midpoint → neckline align (tuned Apr 2026)
    targetWidth:  0.72,   // Shoulder width in world units (tuned Apr 2026)
    depth:        -2.0,
    anchor:       'pose', // Uses shoulder landmarks from PoseLandmarker
    // Pose fallback (when pose is unavailable): estimate torso from face
    // torsoDropFactor: how many face-heights below nose to place shirt neckline
    torsoDropFactor: 1.6,
  },
  watch: {
    yOff:        0.0,
    targetWidth: 0.12,
    depth:       -1.8,
    anchor:      'face',
  },
  bag: {
    yOff:       -0.55,
    targetWidth: 0.45,
    depth:       -2.0,
    anchor:      'pose',
    torsoDropFactor: 2.2,
  },
};

// MediaPipe Pose landmark indices (0-indexed, PoseLandmarker order)
const POSE_IDX = {
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_HIP:      23,
  R_HIP:      24,
};

export class Renderer3D {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this._canvas = canvas;
    this._w = canvas.width  || window.innerWidth;
    this._h = canvas.height || window.innerHeight;

    // WebGL renderer — transparent background
    this._renderer = new THREE.WebGLRenderer({
      canvas,
      alpha:              true,
      antialias:          true,
      premultipliedAlpha: false,
      powerPreference:    'high-performance',
    });
    this._renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this._renderer.setSize(this._w, this._h);
    this._renderer.setClearColor(0x000000, 0);
    this._renderer.shadowMap.enabled  = false;   // perf: disabled
    this._renderer.toneMapping        = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.2;

    // Camera — 60° vertical FOV matching typical frontal webcam
    this._camera = new THREE.PerspectiveCamera(60, this._w / this._h, 0.001, 50);
    this._camera.position.set(0, 0, 0);
    this._camera.lookAt(0, 0, -1);

    this._scene = new THREE.Scene();
    this._setupLights();

    // Loaders
    const draco = new DRACOLoader();
    draco.setDecoderPath(DRACO_CDN);
    this._loader = new GLTFLoader();
    this._loader.setDRACOLoader(draco);

    // Cache: url → { group, normalizedScale }
    this._cache = new Map();

    // Active model in scene
    this._active = null;
    this._activeCategory = 'glasses';

    // Gesture offsets applied on top of face pose
    this.gestureOffset = { x: 0, y: 0, z: 0 };
    this.gestureScale  = 1.0;
    this.gestureRotY   = 0;

    // Fallback geometry cache
    this._fallbacks = new Map();

    // Pre-create env map (grey gradient — fast, no image needed)
    this._setupEnvMap();
  }

  // ── Lights ─────────────────────────────────────────────────────────────────
  _setupLights() {
    // Ambient
    this._scene.add(new THREE.AmbientLight(0xffffff, 1.2));

    // Key — upper right (ring-light style for selfie)
    const key = new THREE.DirectionalLight(0xfff5ee, 2.5);
    key.position.set(1.5, 3, 3);
    this._scene.add(key);

    // Fill — soft left
    const fill = new THREE.DirectionalLight(0xd0e8ff, 1.0);
    fill.position.set(-2, 1, 2);
    this._scene.add(fill);

    // Rim — blue tint from behind, makes metallic glasses pop
    const rim = new THREE.DirectionalLight(0x7ec8ff, 0.8);
    rim.position.set(0, -2, -3);
    this._scene.add(rim);
  }

  // ── Env map for PBR reflections ───────────────────────────────────────────
  _setupEnvMap() {
    // 4-pixel procedural "studio" environment
    const data = new Uint8Array([
      180, 195, 210, 255,   // top-left  light grey-blue
      210, 215, 220, 255,   // top-right lighter
      100, 110, 120, 255,   // bot-left  dark
      130, 140, 150, 255,   // bot-right mid
    ]);
    const tex = new THREE.DataTexture(data, 2, 2, THREE.RGBAFormat);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.needsUpdate = true;
    this._scene.environment = tex;
  }

  // ── Resize ─────────────────────────────────────────────────────────────────
  resize(w, h) {
    this._w = w; this._h = h;
    this._renderer.setSize(w, h);
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
  }

  // ── Model loading ──────────────────────────────────────────────────────────
  /**
   * Load a .glb, auto-normalize its scale, cache and return a clone.
   * @param {string} url
   * @returns {Promise<THREE.Group>}
   */
  async loadModel(url) {
    if (this._cache.has(url)) {
      return this._cache.get(url).clone(true);
    }
    return new Promise((resolve, reject) => {
      this._loader.load(url, (gltf) => {
        const group = gltf.scene;

        // ── Normalize to unit bounding box ────────────────────────────────
        const box = new THREE.Box3().setFromObject(group);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) group.scale.setScalar(1 / maxDim);

        // Centre pivot at origin
        const centre = new THREE.Vector3();
        box.getCenter(centre);
        group.position.sub(centre.multiplyScalar(1 / maxDim));

        // Enhance materials
        group.traverse(obj => {
          if (!obj.isMesh) return;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => {
            if (!m) return;
            if (m.metalness !== undefined) {
              m.metalness = Math.max(m.metalness, 0.3);
              m.envMapIntensity = 1.8;
            }
            m.needsUpdate = true;
          });
        });

        this._cache.set(url, group);
        resolve(group.clone(true));

      }, undefined, (err) => {
        console.warn('[Renderer3D] loadModel failed:', url, err.message ?? err);
        reject(err);
      });
    });
  }

  /**
   * Preload a list of model URLs into cache (fire-and-forget).
   * @param {string[]} urls
   */
  preloadModels(urls) {
    for (const url of urls) {
      if (!this._cache.has(url)) {
        this.loadModel(url).catch(() => {});  // silently cache; failure = fallback
      }
    }
  }

  /**
   * Set the active group to display. Replaces previous.
   * @param {THREE.Group|null} group
   * @param {string} category
   */
  setActiveModel(group, category = 'glasses') {
    if (this._active) this._scene.remove(this._active);
    this._active = group;
    this._activeCategory = category;
    if (group) this._scene.add(group);
  }

  /**
   * Procedural fallback geometry when .glb is unavailable.
   * @param {'glasses'|'hat'|'shirt'|'watch'|'bag'} category
   * @returns {THREE.Group}
   */
  getFallbackMesh(category) {
    if (this._fallbacks.has(category)) return this._fallbacks.get(category).clone(true);

    const group = new THREE.Group();

    if (category === 'glasses') {
      const metalMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a2e, metalness: 0.95, roughness: 0.08,
        envMapIntensity: 2.0,
      });
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x88ccff, metalness: 0, roughness: 0,
        transparent: true, opacity: 0.25,
      });

      // Lenses
      [-0.35, 0.35].forEach(xPos => {
        const lens = new THREE.Mesh(
          new THREE.TorusGeometry(0.20, 0.03, 16, 60), metalMat
        );
        lens.position.x = xPos;
        group.add(lens);

        // Glass fill
        const fill = new THREE.Mesh(
          new THREE.CircleGeometry(0.19, 32), glassMat
        );
        fill.position.x = xPos;
        fill.position.z = 0.01;
        group.add(fill);
      });

      // Bridge
      const bridge = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8), metalMat
      );
      bridge.rotation.z = Math.PI / 2;
      group.add(bridge);

      // Arms
      [-1, 1].forEach(side => {
        const arm = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.009, 0.72, 8), metalMat
        );
        arm.position.x = side * 0.52;
        arm.position.z = -0.18;
        arm.rotation.y = side * 0.35;
        arm.rotation.z = Math.PI / 2;
        group.add(arm);
      });

    } else if (category === 'hat') {
      const mat = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.85 });
      const brim  = new THREE.Mesh(new THREE.CylinderGeometry(0.60, 0.62, 0.05, 32), mat);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.40, 0.52, 32), mat);
      crown.position.y = 0.28; group.add(brim, crown);

    } else {
      // Generic coloured cube
      const mat = new THREE.MeshStandardMaterial({
        color: 0x9d4edd, metalness: 0.6, roughness: 0.3,
      });
      group.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.1), mat));
    }

    this._fallbacks.set(category, group);
    return group.clone(true);
  }

  // ── Per-frame update ───────────────────────────────────────────────────────
  /**
   * Update 3D model transform from face/pose landmarks + gesture offsets.
   * @param {Array<{x,y,z}>|null} faceLms
   * @param {Array<{x,y,z}>|null} _poseLms   (reserved — shirt body anchor)
   * @param {string}              category
   */
  update(faceLms, poseLms, category) {
    if (!this._active) return;

    const cfg     = CAT_CONFIG[category] ?? CAT_CONFIG.glasses;
    const fov     = this._camera.fov;
    const aspect  = this._camera.aspect;
    const depth   = cfg.depth;

    let wp, anchorScale;

    // ── SHIRT / BAG: use pose shoulder anchor ─────────────────────────────────
    if (cfg.anchor === 'pose') {

      const pose = estimateHeadPose(faceLms, this._w);
      let anchorNorm = null;

      // ── Try pose landmarks first ────────────────────────────────────────────
      if (poseLms && poseLms.length > POSE_IDX.R_SHOULDER) {
        const lSho = poseLms[POSE_IDX.L_SHOULDER];
        const rSho = poseLms[POSE_IDX.R_SHOULDER];

        const lVis  = lSho.visibility ?? 1;
        const rVis  = rSho.visibility ?? 1;
        const avgV  = (lVis + rVis) / 2;

        if (avgV > 0.4) {
          // Shoulder midpoint (normalized coords)
          const mx = (lSho.x + rSho.x) / 2;
          const my = (lSho.y + rSho.y) / 2;
          // Shoulder span → scale reference (in normalized space)
          const shoulderSpanNorm = Math.abs(rSho.x - lSho.x);
          anchorScale = Math.max(0.3, Math.min(4.0, shoulderSpanNorm / 0.30));
          anchorNorm  = { x: mx, y: my };

          if (SHIRT_DEBUG) {
            const lH = poseLms[POSE_IDX.L_HIP];
            const rH = poseLms[POSE_IDX.R_HIP];
            console.table({
              L_shoulder:     { x: lSho.x.toFixed(3), y: lSho.y.toFixed(3), vis: lVis.toFixed(2) },
              R_shoulder:     { x: rSho.x.toFixed(3), y: rSho.y.toFixed(3), vis: rVis.toFixed(2) },
              L_hip:          { x: lH?.x.toFixed(3), y: lH?.y.toFixed(3) },
              R_hip:          { x: rH?.x.toFixed(3), y: rH?.y.toFixed(3) },
              shoulderSpan:   shoulderSpanNorm.toFixed(3),
              anchorScale:    anchorScale.toFixed(2),
              cfg_yOff:       cfg.yOff,
              cfg_targetWidth: cfg.targetWidth,
            });
          }
        }
      }

      // ── Fallback: estimate torso position from face ─────────────────────────
      if (!anchorNorm && pose) {
        const faceHeight = pose.chin ? Math.abs(pose.chin.y - pose.eyeMid.y) : 0.12;
        anchorNorm  = {
          x: pose.nosePos.x,
          y: pose.nosePos.y + faceHeight * (cfg.torsoDropFactor ?? 1.6),
        };
        anchorScale = pose.scale;

        if (SHIRT_DEBUG) {
          console.log('[Shirt] Using FACE FALLBACK anchor',
            anchorNorm, 'faceHeight:', faceHeight.toFixed(3));
        }
      }

      if (!anchorNorm) return;  // No face AND no pose — nothing to do

      wp           = normToWorld(anchorNorm, anchorScale, fov, aspect, depth);
      anchorScale  = anchorScale ?? 1;

    } else {
      // ── GLASSES / HAT / WATCH: use face anchor ─────────────────────────────
      const pose = estimateHeadPose(faceLms, this._w);
      if (!pose) return;   // Keep last position rather than flicker

      const anchor = (category === 'hat') ? pose.eyeMid : pose.bridgePos;
      wp           = normToWorld(anchor, pose.scale, fov, aspect, depth);
      anchorScale  = pose.scale;

      // Face rotation applied here (not for shirts — body doesn't rotate like head)
      this._active.rotation.set(pose.pitch * 0.8, pose.yaw + this.gestureRotY, pose.roll);
    }

    // ── Position ───────────────────────────────────────────────────────────────
    this._active.position.set(
      wp.x + this.gestureOffset.x,
      wp.y + cfg.yOff + this.gestureOffset.y,
      wp.z + this.gestureOffset.z
    );

    // ── Scale ─────────────────────────────────────────────────────────────────
    // After normalization model is 1 world-unit wide.
    // targetWidth = desired world-units. Multiply by anchorScale (depth proxy).
    const s = cfg.targetWidth * anchorScale * this.gestureScale;
    this._active.scale.setScalar(Math.max(0.001, s));

    if (SHIRT_DEBUG) {
      console.log('[Shirt] model.position', this._active.position);
      console.log('[Shirt] model.scale', this._active.scale.x.toFixed(3));
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  render() {
    this._renderer.render(this._scene, this._camera);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────
  dispose() {
    this._cache.forEach(g => g.traverse(o => {
      if (!o.isMesh) return;
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => m?.dispose());
    }));
    this._cache.clear();
    this._renderer.dispose();
  }
}

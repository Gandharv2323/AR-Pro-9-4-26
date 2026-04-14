/**
 * renderer-3d.js  — v2
 * Three.js scene manager for 3D GLB asset overlay.
 *
 * FIXES v2:
 *   - Auto-normalize: fit any GLB to a canonical bounding box on load
 *   - Scale formula corrected — models now visible at normal camera distance
 *   - Mirror correction: model X is flipped to match mirrored video
 *   - GLB not found → elegant fallback procedural geometry (no crash)
 *   - Preload: preloadModels() to warm up cache
 *   - PBR setup: traverse + envMapIntensity on all mesh materials
 *   - dispose() properly clears cache
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { estimateHeadPose, normToWorld } from './head-pose.js';

const DRACO_CDN = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

// Category-specific tuning
const CAT_CONFIG = {
  glasses: { yOff:  0.01, targetWidth: 0.18, depth: -1.8 },
  hat:     { yOff:  0.25, targetWidth: 0.30, depth: -1.8 },
  shirt:   { yOff: -0.55, targetWidth: 0.60, depth: -2.0 },
  watch:   { yOff:  0.0,  targetWidth: 0.12, depth: -1.8 },
  bag:     { yOff: -0.3,  targetWidth: 0.40, depth: -2.0 },
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
  update(faceLms, _poseLms, category) {
    if (!this._active) return;

    const pose = estimateHeadPose(faceLms, this._w);

    if (!pose) {
      // No face — keep showing last known position (don't flicker off)
      return;
    }

    const cfg = CAT_CONFIG[category] ?? CAT_CONFIG.glasses;

    // Anchor landmark
    const anchor = (category === 'hat') ? pose.eyeMid : pose.bridgePos;

    // Convert to world space
    const wp = normToWorld(anchor, pose.scale, this._camera.fov, this._camera.aspect, cfg.depth);

    // Apply gesture + category offsets
    this._active.position.set(
      wp.x + this.gestureOffset.x,
      wp.y + cfg.yOff + this.gestureOffset.y,
      wp.z + this.gestureOffset.z
    );

    // Rotation — face pose + user rotate gesture
    this._active.rotation.set(pose.pitch * 0.8, pose.yaw + this.gestureRotY, pose.roll);

    // Scale = (canonical size / 1.0 after normalization) × face scale × gesture
    // After normalization, model is 1 unit wide. We want targetWidth in world space.
    const worldHeight = 2 * Math.abs(cfg.depth) * Math.tan((this._camera.fov * Math.PI / 180) / 2);
    const worldWidth  = worldHeight * this._camera.aspect;
    const targetWorldUnits = (cfg.targetWidth / worldWidth) * worldWidth; // = targetWidth directly
    const s = targetWorldUnits * pose.scale * this.gestureScale;
    this._active.scale.setScalar(Math.max(0.001, s));
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

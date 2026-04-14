/**
 * renderer-3d.js
 * Three.js scene manager for 3D GLB asset rendering.
 *
 * Responsibilities:
 *   - Transparent WebGL canvas overlaid on webcam video
 *   - Load .glb garments via GLTFLoader
 *   - Position + orient glasses at head pose
 *   - Apply gesture-driven scale / position / rotation offsets
 *   - PBR lighting (ambient + directional + env map)
 *   - Fallback: procedural Three.js geometry if no GLB provided
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { estimateHeadPose, normToWorld } from './head-pose.js';

const DRACO_CDN = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

export class Renderer3D {
  /**
   * @param {HTMLCanvasElement} canvas  — the transparent overlay canvas
   */
  constructor(canvas) {
    this._canvas = canvas;
    this._w = canvas.width;
    this._h = canvas.height;

    // Three.js core
    this._renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.setSize(this._w, this._h);
    this._renderer.setClearColor(0x000000, 0);  // fully transparent
    this._renderer.shadowMap.enabled = true;
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.2;

    // Camera — FOV 60° matching typical webcam
    this._camera = new THREE.PerspectiveCamera(60, this._w / this._h, 0.01, 100);
    this._camera.position.set(0, 0, 0);
    this._camera.lookAt(0, 0, -1);

    // Scene + lighting
    this._scene = new THREE.Scene();
    this._setupLights();

    // GLTF + DRACO loaders
    const draco = new DRACOLoader();
    draco.setDecoderPath(DRACO_CDN);
    this._loader = new GLTFLoader();
    this._loader.setDRACOLoader(draco);

    // Loaded models cache — key: url → THREE.Group
    this._modelCache = new Map();

    // Currently active mesh shown in scene
    this._activeGroup = null;

    // Gesture-driven transform offsets (applied on top of face pose)
    this.gestureOffset = { x: 0, y: 0, z: 0 };
    this.gestureScale  = 1.0;
    this.gestureRotY   = 0;   // radians (two-hand rotate)

    // Procedural fallback geometry per category
    this._fallbackCache = new Map();
  }

  // ── Resize ─────────────────────────────────────────────────────────────────
  resize(w, h) {
    this._w = w; this._h = h;
    this._renderer.setSize(w, h);
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
  }

  // ── Lighting ───────────────────────────────────────────────────────────────
  _setupLights() {
    // Key light (from upper-right, simulates selfie ring light)
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(1, 2, 2);
    this._scene.add(key);

    // Fill light (from left, softer)
    const fill = new THREE.DirectionalLight(0xccddff, 0.8);
    fill.position.set(-1, 0.5, 1);
    this._scene.add(fill);

    // Ambient for PBR base
    this._scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    // Back light (rim effect — makes glasses "pop")
    const rim = new THREE.DirectionalLight(0x00d4ff, 0.5);
    rim.position.set(0, -1, -2);
    this._scene.add(rim);
  }

  // ── Model Loading ──────────────────────────────────────────────────────────
  /**
   * Load a .glb model and cache it. Returns a cloned Three.Group.
   * @param {string} url
   * @returns {Promise<THREE.Group>}
   */
  async loadModel(url) {
    if (this._modelCache.has(url)) {
      return this._modelCache.get(url).clone();
    }
    return new Promise((resolve, reject) => {
      this._loader.load(
        url,
        (gltf) => {
          const group = gltf.scene;
          // Ensure PBR materials are set up
          group.traverse(obj => {
            if (obj.isMesh) {
              obj.castShadow = false;
              obj.receiveShadow = false;
              if (obj.material) {
                // Enhance metallic materials
                if (obj.material.metalness !== undefined) {
                  obj.material.envMapIntensity = 1.5;
                }
              }
            }
          });
          this._modelCache.set(url, group);
          resolve(group.clone());
        },
        undefined,
        reject
      );
    });
  }

  /**
   * Set the active 3D model to show.
   * @param {THREE.Group|null} group
   */
  setActiveModel(group) {
    if (this._activeGroup) {
      this._scene.remove(this._activeGroup);
    }
    this._activeGroup = group;
    if (group) {
      this._scene.add(group);
    }
  }

  /**
   * Get or create a procedural fallback mesh for a category.
   * Used when no .glb is available.
   * @param {'glasses'|'shirt'|'hat'|'watch'|'bag'} category
   * @returns {THREE.Group}
   */
  getFallbackMesh(category) {
    if (this._fallbackCache.has(category)) {
      return this._fallbackCache.get(category).clone();
    }
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x222222, metalness: 0.9, roughness: 0.1,
    });

    if (category === 'glasses') {
      // Torus rims
      const rimGeo = new THREE.TorusGeometry(0.07, 0.012, 12, 48);
      const lRim = new THREE.Mesh(rimGeo, mat); lRim.position.x = -0.10;
      const rRim = new THREE.Mesh(rimGeo, mat); rRim.position.x =  0.10;
      // Bridge
      const bridgeGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.06, 8);
      const bridge = new THREE.Mesh(bridgeGeo, mat);
      bridge.rotation.z = Math.PI / 2;
      // Arms
      const armGeo = new THREE.CylinderGeometry(0.005, 0.004, 0.30, 8);
      const lArm = new THREE.Mesh(armGeo, mat);
      lArm.position.set(-0.22, 0, -0.07);
      lArm.rotation.y =  0.4;
      const rArm = new THREE.Mesh(armGeo, mat);
      rArm.position.set( 0.22, 0, -0.07);
      rArm.rotation.y = -0.4;
      group.add(lRim, rRim, bridge, lArm, rArm);

    } else if (category === 'hat') {
      const brimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.02, 32);
      const crownGeo = new THREE.CylinderGeometry(0.14, 0.15, 0.20, 32);
      const bMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.8 });
      group.add(new THREE.Mesh(brimGeo, bMat));
      const crown = new THREE.Mesh(crownGeo, bMat);
      crown.position.y = 0.11;
      group.add(crown);

    } else {
      // Generic placeholder — glowing box
      const geo = new THREE.BoxGeometry(0.2, 0.2, 0.05);
      const m = new THREE.MeshStandardMaterial({ color: 0x9d4edd, roughness: 0.3, metalness: 0.5 });
      group.add(new THREE.Mesh(geo, m));
    }

    this._fallbackCache.set(category, group);
    return group.clone();
  }

  // ── Per-frame update ───────────────────────────────────────────────────────
  /**
   * Update 3D overlay position/rotation based on face + gesture state.
   *
   * @param {Array<{x,y,z}>|null} faceLms     — 478 MediaPipe face landmarks
   * @param {Array<{x,y,z}>|null} poseLms     — 33 MediaPipe pose landmarks
   * @param {'glasses'|'shirt'|'hat'|'watch'|'bag'} category
   */
  update(faceLms, poseLms, category) {
    if (!this._activeGroup) return;

    const pose = estimateHeadPose(faceLms, this._w);

    if (!pose) {
      // No face — hide model
      this._activeGroup.visible = false;
      return;
    }

    this._activeGroup.visible = true;

    // ── Position ───────────────────────────────────────────────────────────
    let anchorNorm;
    if (category === 'glasses' || category === 'hat') {
      anchorNorm = pose.bridgePos;
    } else {
      anchorNorm = pose.faceCenter;
    }

    const worldPos = normToWorld(
      anchorNorm,
      pose.scale,
      this._camera.fov,
      this._camera.aspect,
      -2.0
    );

    // Category-specific Y offset
    const yOffsets = { glasses: 0.02, hat: 0.35, shirt: 1.0 };
    const yOff = yOffsets[category] ?? 0;

    this._activeGroup.position.set(
      worldPos.x + this.gestureOffset.x,
      worldPos.y + yOff + this.gestureOffset.y,
      worldPos.z + this.gestureOffset.z
    );

    // ── Rotation ─────────────────────────────────────────────────────────
    this._activeGroup.rotation.set(
      pose.pitch,
      pose.yaw  + this.gestureRotY,
      pose.roll
    );

    // ── Scale ─────────────────────────────────────────────────────────────
    const baseScale = pose.scale * 0.20;  // tune for model size
    const s = baseScale * this.gestureScale;
    this._activeGroup.scale.setScalar(s);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  render() {
    this._renderer.render(this._scene, this._camera);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────
  dispose() {
    this._renderer.dispose();
    this._modelCache.forEach(g => g.traverse(o => {
      if (o.isMesh) { o.geometry.dispose(); }
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material.dispose();
      }
    }));
    this._modelCache.clear();
  }
}

import * as THREE from 'three';
import { Steve, WorldCube } from './models.js';
import { ProceduralClouds } from './clouds.js';
import { VoxelEnvironment } from './environment.js';
import { CONFIG, sampleTimeline, mix } from './timeline.js';

export class Hero3D {
  constructor(container, onUpdate, onError) {
    this.container = container; this.onUpdate = onUpdate; this.onError = onError;
    this.disposed = false; this.progress = 0; this.target = 0; this.state = {};
    this.motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
    this.scene = new THREE.Scene();
    // Atmospheric Minecraft render-distance haze blending seamlessly into pastel sky
    this.scene.fog = new THREE.Fog('#d5e5e4', 22, 75);
    this.camera = new THREE.PerspectiveCamera(36, 1, .1, 140);
    this.scene.add(this.camera);
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = shadowCanvas.height = 64;
    const context = shadowCanvas.getContext('2d');
    const gradient = context.createRadialGradient(32, 32, 3, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(38,55,44,.30)'); gradient.addColorStop(1, 'rgba(38,55,44,0)');
    context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
    this.shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    this.contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false, toneMapped: false }));
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = CONFIG.landingY + .012;
    this.scene.add(this.contactShadow);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    container.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight('#fbf7e7', '#81998f', 2.5));
    const sun = new THREE.DirectionalLight('#fff5d8', 2.7); sun.position.set(-6, 14, 9); this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#c3d9e2', .7); fill.position.set(8, 3, -5); this.scene.add(fill);
    this.clouds = new ProceduralClouds(this.camera, innerWidth < 700);
    this.environment = new VoxelEnvironment(this.scene);
    this.lookAt = new THREE.Vector3();
    this.axisZ = new THREE.Vector3(0, 0, 1); this.axisX = new THREE.Vector3(1, 0, 0);
    this.turn = new THREE.Quaternion();
    this.compensation = new THREE.Quaternion();
    // Every turn is +90° about a screen-facing axis (anticlockwise). Alternating
    // Z/X visits +Y,+X,-Z,-Y,-X,+Z: all six faces without arbitrary rotation.
    this.orientations = [new THREE.Quaternion()];
    for (let i = 0; i < CONFIG.transitionCount; i++) {
      this.turn.setFromAxisAngle(i % 2 ? this.axisX : this.axisZ, CONFIG.quarterTurn);
      this.orientations.push(this.orientations[i].clone().premultiply(this.turn));
    }
    this.onResize = () => {
      this.width = container.clientWidth; this.height = container.clientHeight;
      this.camera.aspect = this.width / this.height; this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.width, this.height, false); this.requestFrame();
    };
    this.contextLost = event => { event.preventDefault(); cancelAnimationFrame(this.frame); this.onError(new Error('The graphics connection was interrupted. Reload to return to the sky.')); };
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    this.resizeObserver = new ResizeObserver(this.onResize); this.resizeObserver.observe(container);
    this.visibility = () => { if (!document.hidden) { this.previousTime = 0; this.requestFrame(); } };
    document.addEventListener('visibilitychange', this.visibility);
    this.onResize();
  }
  async load() {
    const results = await Promise.allSettled([Steve(), WorldCube()]);
    // Keep successfully loaded resources owned by the scene even on partial
    // failure, so the common disposal path frees everything.
    if (results[0].status === 'fulfilled') { this.steve = results[0].value; this.scene.add(this.steve.group); }
    if (results[1].status === 'fulfilled') { this.world = results[1].value; this.scene.add(this.world.group); }
    const failure = results.find(r => r.status === 'rejected');
    if (failure) throw failure.reason;
    if (this.disposed) { this.disposeResources(); return; }
    this.ready = true; this.requestFrame();
  }
  setProgress(progress) { this.target = progress; this.requestFrame(); }
  requestFrame() {
    if (this.disposed || this.frame || document.hidden) return;
    this.frame = requestAnimationFrame(time => this.render(time));
  }
  render(time) {
    this.frame = 0;
    if (this.disposed) return;
    const dt = this.previousTime ? Math.min((time - this.previousTime) / 1000, .05) : 1 / 60;
    this.previousTime = time;
    this.progress += (this.target - this.progress) * (this.motionPreference.matches ? 1 : 1 - Math.exp(-dt * 13));
    if (Math.abs(this.target - this.progress) < .00001) this.progress = this.target;
    const state = sampleTimeline(this.progress, this.state);
    const mobile = this.camera.aspect < .85;
    const distance = mix(mobile ? 1.65 : 1, mobile ? CONFIG.cameraMobileDistance : CONFIG.cameraDesktopDistance, state.reveal);
    const followY = mix(state.y + (mobile ? 2.05 : 2.55), 1.5, state.reveal);
    const dive = state.diveTilt ?? 0;

    // Camera smoothly follows Steve's descent and frames the diving silhouette:
    // - Gentle pull-back in Z (camZPull) to keep the full wingspan / arm-spread in frame
    // - Stable vertical tracking keeping Steve centered from sky drop through touchdown
    const camZPull = dive * 1.5;

    this.lookAt.set(0, followY, 0);
    this.camera.position.set(
      mix(CONFIG.cameraFallX, CONFIG.cameraWorldX, state.reveal) * distance,
      followY + mix(1.2, 4.5, state.reveal) * distance,
      (mix(CONFIG.cameraFallZ, CONFIG.cameraWorldZ, state.reveal) + camZPull) * distance
    );
    this.camera.lookAt(this.lookAt);

    if (this.ready) {
      const index = Math.min(CONFIG.transitionCount - 1, Math.floor(state.worldTurn));
      const fraction = state.worldTurn - index;
      this.world.group.quaternion.slerpQuaternions(this.orientations[index], this.orientations[index + 1], fraction);
      // Steve is a sibling, never a child of the rotating cube. Applying the
      // clockwise inverse to the biome orientation gives a stable upright rig.
      this.compensation.copy(this.world.group.quaternion).invert();
      this.steve.group.quaternion.copy(this.world.group.quaternion).multiply(this.compensation);
      this.steve.pose(state, this.motionPreference.matches);
      this.steve.group.visible = true;
      this.contactShadow.material.opacity = (1 - state.fall) * (1 - state.air) ** 4;
    }
    this.clouds.update(state, this.camera.aspect);
    this.environment.update(time, state);
    this.renderer.render(this.scene, this.camera);
    this.onUpdate(state);
    if (this.progress !== this.target) this.requestFrame();
  }
  snapshot() {
    return {
      ...this.state, ready: !!this.ready,
      worldQuaternion: this.world?.group.quaternion.toArray(),
      steveQuaternion: this.steve?.group.quaternion.toArray(),
      stevePosition: this.steve?.group.position.toArray(),
      worldMeshes: this.world?.sourceMeshes, steveMeshes: this.steve?.sourceMeshes,
      articulated: this.steve?.articulated, drawCalls: this.renderer.info.render.calls,
      cloudInstances: this.clouds.count,
      triangles: this.renderer.info.render.triangles,
    };
  }
  disposeResources() {
    this.environment?.dispose();
    const resources = new Set();
    this.scene.traverse(node => {
      if (node.geometry) resources.add(node.geometry);
      if (node.material) for (const m of (Array.isArray(node.material) ? node.material : [node.material])) resources.add(m);
      if (node.isInstancedMesh) node.dispose();
    });
    resources.forEach(resource => resource.dispose());
  }
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect(); document.removeEventListener('visibilitychange', this.visibility);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost);
    this.disposeResources(); this.shadowTexture.dispose(); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}

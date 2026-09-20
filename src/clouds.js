import * as THREE from 'three';

export class ProceduralClouds {
  constructor(camera, mobile) {
    this.group = new THREE.Group();
    camera.add(this.group);
    this.dummy = new THREE.Object3D();
    this.count = mobile ? 36 : 64;
    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    const colors = new Float32Array(this.geometry.attributes.position.count * 3);
    const shades = [.96, .98, 1, .95, .99, .97];
    for (let i = 0; i < colors.length / 3; i++) colors.fill(shades[Math.floor(i / 4)], i * 3, i * 3 + 3);
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // Soft face colors rather than scene lighting avoid dark undersides during
    // the camera wipe. Opaque depth-writing blocks have no transparency sorting.
    this.material = new THREE.MeshBasicMaterial({ color: '#eef2e9', vertexColors: true, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.count);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.mesh);
    // Deterministic positions: clouds retrace the same path on reverse scroll.
    this.seeds = Array.from({ length: this.count }, (_, i) => {
      const cluster = Math.floor(i / 4), block = i % 4;
      return { x: (cluster % 4 - 1.5) * 3.5 + (block % 2) * 1.3,
        y: (Math.floor(cluster / 4) - 1.5) * 2.2 + Math.floor(block / 2) * .8,
        z: -8 - (cluster % 3) * 2.2, sx: 3.2 + Math.sin(i * 13) * .6, sy: 0.9 + Math.cos(i * 7) * .25 };
    });
  }
  update(state, aspect) {
    for (let i = 0; i < this.count; i++) {
      const seed = this.seeds[i];
      // A full geometric wipe crosses the camera. At peak, overlapping blocks
      // fill the frustum; at rest they live around its periphery.
      const side = seed.x < 0 ? -1 : 1;
      const drift = (1 - state.cloud) * (3.8 + state.reveal * 3.6 + Math.abs(seed.x) * .4);
      const x = seed.x * Math.max(.8, aspect / 1.5) + side * drift;
      this.dummy.position.set(x, seed.y + (state.progress - .22) * 5, seed.z);
      // Flat, stepped Minecraft cloud slab proportions
      this.dummy.scale.set(seed.sx * (.75 + state.cloud * 1.1), seed.sy * (.75 + state.cloud * 1.2), 1.6 + state.cloud * .6);
      this.dummy.rotation.set(0, 0, 0); // Strictly axis-aligned voxel geometry
      this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

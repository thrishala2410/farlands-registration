import * as THREE from 'three';
import { CONFIG } from './timeline.js';

// ── Palette (Tuned to Farlands pastel Minecraft aesthetic) ───────────────────
export const PALETTE = {
  grassTop: new THREE.Color('#9cbb8a'),
  dirt: new THREE.Color('#7a6652'),
  dirtDark: new THREE.Color('#655342'),
  stone: new THREE.Color('#7e8f88'),
  stoneDark: new THREE.Color('#55645e'),
  wood: new THREE.Color('#6e5845'),
  leaves: new THREE.Color('#507664'),
  leavesLight: new THREE.Color('#628d75'),
  water: new THREE.Color('#6ba3a8'),
  gold: new THREE.Color('#d4b46e'),
  poppy: new THREE.Color('#c27a72'),
  dandelion: new THREE.Color('#dbbe6e'),
  anomaly: new THREE.Color('#9a7896'),
  cloud: new THREE.Color('#f0f5ed'),
};

// Generates a Minecraft-style 1x1x1 block geometry with vertex colors:
// Top face (+Y) = green, sides (+/-X, +/-Z) = dirt, bottom (-Y) = dark dirt.
function createGrassBlockGeometry() {
  const geom = new THREE.BoxGeometry(1, 1, 1);
  const colors = new Float32Array(24 * 3);
  for (let face = 0; face < 6; face++) {
    const col = face === 2 ? PALETTE.grassTop : (face === 3 ? PALETTE.dirtDark : PALETTE.dirt);
    for (let v = 0; v < 4; v++) {
      const idx = (face * 4 + v) * 3;
      colors[idx] = col.r; colors[idx + 1] = col.g; colors[idx + 2] = col.b;
    }
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geom;
}

export class VoxelEnvironment {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'VoxelEnvironment';
    scene.add(this.group);

    this.dummy = new THREE.Object3D();
    const blockMat = new THREE.MeshStandardMaterial({
      roughness: 0.94,
      metalness: 0.05,
      vertexColors: true,
      flatShading: true,
    });
    const standardBlockMat = new THREE.MeshStandardMaterial({
      roughness: 0.92,
      metalness: 0.05,
      flatShading: true,
    });

    // ── 1. Floating Voxel Debris (Fall Corridor) ─────────────────────────────
    // Kept below y = 20.5 and pushed to sides (|x| >= 2.8) so the initial
    // headline text "A different perspective." remains pristine and readable.
    // As Steve falls past y = 20 down to 2.2, these blocks rush past for parallax.
    const debrisDefinitions = [];
    const debrisHeights = [19.5, 18.0, 16.2, 14.5, 13.0, 11.2, 9.6, 8.0, 6.4, 5.0];
    debrisHeights.forEach((baseY, i) => {
      const angle = (i * 2.39996) % (Math.PI * 2);
      // Guarantee lateral clearance so center corridor is open
      const side = (i % 2 === 0) ? 1 : -1;
      const x = side * (3.0 + ((i % 3) * 1.2));
      const z = Math.sin(angle) * 2.5 - 1.0;
      const scale = 0.36 + ((i % 3) * 0.12);
      const type = (i % 4 === 0) ? 'gold' : (i % 3 === 0) ? 'wood' : (i % 2 === 0) ? 'stone' : 'grass';
      debrisDefinitions.push({
        baseX: x, baseY: baseY, baseZ: z,
        scale, type,
        speed: 0.9 + ((i % 3) * 0.35),
        phase: i * 1.37,
        rotSpeed: 0.18 + ((i % 2) * 0.10),
      });

      // Paired mini satellite block
      if (i % 2 === 0) {
        debrisDefinitions.push({
          baseX: x + (side * 0.7), baseY: baseY - 0.5, baseZ: z + 0.4,
          scale: scale * 0.65,
          type: type === 'grass' ? 'stone' : 'grass',
          speed: 1.1, phase: i * 1.37 + 1.2,
          rotSpeed: 0.22,
        });
      }
    });

    this.debrisSeeds = debrisDefinitions;
    this.debrisCount = debrisDefinitions.length;

    // Grass block debris mesh
    this.grassDebrisMesh = new THREE.InstancedMesh(createGrassBlockGeometry(), blockMat, this.debrisCount);
    this.grassDebrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.grassDebrisMesh);

    // Colored block debris mesh for stone, wood, ore
    this.colorDebrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), standardBlockMat, this.debrisCount);
    this.colorDebrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.debrisCount; i++) {
      const d = debrisDefinitions[i];
      const col = d.type === 'gold' ? PALETTE.gold : d.type === 'wood' ? PALETTE.wood : PALETTE.stone;
      this.colorDebrisMesh.setColorAt(i, col);
    }
    this.colorDebrisMesh.instanceColor.needsUpdate = true;
    this.group.add(this.colorDebrisMesh);

    // ── 2. Farlands Landscape & Glitched Terrain Chunks ─────────────────────
    // Distant voxel cliffs, suspended islands, cubic trees, and iconic
    // Farlands perforated grid formations surrounding the central WorldCube.
    const terrainBlocks = [];

    const addBlock = (x, y, z, color, sx = 1, sy = 1, sz = 1) => {
      terrainBlocks.push({ x, y, z, sx, sy, sz, color });
    };

    const addCubicTree = (tx, ty, tz) => {
      // 3-block tall wood trunk
      for (let h = 0; h < 3; h++) {
        addBlock(tx, ty + h, tz, PALETTE.wood);
      }
      // Leaves: 3x2x3 block canopy
      for (let ly = 2; ly < 4; ly++) {
        for (let lx = -1; lx <= 1; lx++) {
          for (let lz = -1; lz <= 1; lz++) {
            if (ly === 3 && Math.abs(lx) === 1 && Math.abs(lz) === 1) continue;
            if (lx === 0 && lz === 0 && ly < 3) continue;
            addBlock(tx + lx, ty + ly, tz + lz, ly === 3 ? PALETTE.leavesLight : PALETTE.leaves);
          }
        }
      }
      addBlock(tx, ty + 4, tz, PALETTE.leavesLight);
    };

    // Island A (Left floating island: stepped terrain + tree + waterfall)
    const islandAX = -17, islandAY = 0.5, islandAZ = -10;
    for (let ix = -3; ix <= 3; ix++) {
      for (let iz = -2; iz <= 2; iz++) {
        const d = Math.hypot(ix, iz);
        if (d <= 3.2) {
          addBlock(islandAX + ix, islandAY - 1.5, islandAZ + iz, PALETTE.stoneDark);
          addBlock(islandAX + ix, islandAY - 0.5, islandAZ + iz, PALETTE.dirt);
          addBlock(islandAX + ix, islandAY + 0.5, islandAZ + iz, PALETTE.grassTop);
        }
      }
    }
    addCubicTree(islandAX - 1, islandAY + 1.5, islandAZ);
    // Waterfall stepping off Island A edge
    addBlock(islandAX + 3, islandAY + 0.5, islandAZ, PALETTE.water, 0.8, 0.3, 0.8);
    addBlock(islandAX + 3.6, islandAY - 0.5, islandAZ, PALETTE.water, 0.5, 1.2, 0.5);
    addBlock(islandAX + 3.6, islandAY - 2.0, islandAZ, PALETTE.water, 0.4, 1.4, 0.4);

    // Island B (Right suspended plateau)
    const islandBX = 18, islandBY = 1.0, islandBZ = -12;
    for (let ix = -3; ix <= 3; ix++) {
      for (let iz = -2; iz <= 2; iz++) {
        const d = Math.hypot(ix, iz);
        if (d <= 3.0) {
          addBlock(islandBX + ix, islandBY - 1.4, islandBZ + iz, PALETTE.stone);
          addBlock(islandBX + ix, islandBY - 0.4, islandBZ + iz, PALETTE.dirt);
          addBlock(islandBX + ix, islandBY + 0.6, islandBZ + iz, PALETTE.grassTop);
        }
      }
    }
    addCubicTree(islandBX + 1, islandBY + 1.6, islandBZ);
    addBlock(islandBX - 1, islandBY + 1.3, islandBZ - 1, PALETTE.poppy, 0.35, 0.6, 0.35);
    addBlock(islandBX - 2, islandBY + 1.3, islandBZ + 1, PALETTE.dandelion, 0.35, 0.5, 0.35);

    // Island C (Far left suspended monolith)
    const islandCX = -23, islandCY = 3.5, islandCZ = 4;
    for (let h = 0; h < 6; h++) {
      addBlock(islandCX, islandCY + h, islandCZ, PALETTE.stone);
      if (h % 2 === 0) addBlock(islandCX + 1, islandCY + h, islandCZ, PALETTE.stone);
      if (h >= 4) addBlock(islandCX + 2, islandCY + h, islandCZ, PALETTE.grassTop);
    }
    addBlock(islandCX + 3, islandCY + 5.5, islandCZ - 1, PALETTE.anomaly, 1.0, 1.0, 1.0);

    // ── 3. Distant Farlands Glitched Wall (Positioned at z = -32, height y <= 7) ──
    // Lowered so it doesn't clip into the sky at scroll 0, but provides
    // the authentic Minecraft Farlands boundary grid across the horizon.
    const wallZ = -32;
    for (let wx = -24; wx <= 24; wx += 2.2) {
      for (let wy = -7; wy <= 7; wy += 2.2) {
        // Classic Farlands lattice / swiss cheese perforation
        const isSolid = ((Math.floor(wx / 2.2) + Math.floor(wy / 2.2)) % 3 !== 0) && (Math.abs(wx) > 6 || wy > 2);
        if (isSolid) {
          const col = wy < -2 ? PALETTE.stoneDark : (wy > 4 ? PALETTE.grassTop : PALETTE.stone);
          addBlock(wx, wy, wallZ + ((Math.abs(Math.floor(wx)) % 3) * 0.6), col, 2.0, 2.0, 2.0);
        }
      }
    }

    // Suspended floating stair steps in the distance
    for (let s = 0; s < 5; s++) {
      addBlock(10 + s * 1.8, 2 + s * 1.1, -26 - s * 1.0, PALETTE.stone, 1.5, 0.8, 1.5);
      addBlock(10 + s * 1.8, 2.5 + s * 1.1, -26 - s * 1.0, PALETTE.grassTop, 1.5, 0.3, 1.5);
    }

    // Build the InstancedMesh for the terrain
    this.terrainCount = terrainBlocks.length;
    const boxGeom = new THREE.BoxGeometry(1, 1, 1);
    this.terrainMesh = new THREE.InstancedMesh(boxGeom, standardBlockMat, this.terrainCount);
    this.terrainMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    terrainBlocks.forEach((tb, i) => {
      this.dummy.position.set(tb.x, tb.y, tb.z);
      this.dummy.scale.set(tb.sx, tb.sy, tb.sz);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.terrainMesh.setMatrixAt(i, this.dummy.matrix);
      this.terrainMesh.setColorAt(i, tb.color);
    });
    this.terrainMesh.instanceMatrix.needsUpdate = true;
    this.terrainMesh.instanceColor.needsUpdate = true;
    this.group.add(this.terrainMesh);

    // ── 4. High Voxel Cloud Slabs (Minecraft Strata) ─────────────────────────
    // Flat stepped cubic cloud layers placed high up and to the sides
    const cloudSlabs = [
      { x: -10, y: 23.5, z: -5, sx: 9.0, sy: 0.8, sz: 6.5 },
      { x: 11, y: 22.5, z: -4, sx: 11.0, sy: 0.9, sz: 8.0 },
      { x: -12, y: 20.0, z: 4, sx: 10.0, sy: 0.8, sz: 7.0 },
      { x: 12, y: 19.0, z: 6, sx: 8.5, sy: 0.8, sz: 6.0 },
      { x: -16, y: 16.0, z: -8, sx: 12.0, sy: 1.0, sz: 9.0 },
      { x: 15, y: 14.5, z: -6, sx: 14.0, sy: 1.0, sz: 10.0 },
    ];
    this.cloudSlabCount = cloudSlabs.length;
    this.cloudSlabsData = cloudSlabs;
    const cloudMat = new THREE.MeshBasicMaterial({
      color: PALETTE.cloud,
      transparent: true,
      opacity: 0.78,
      toneMapped: false,
    });
    this.cloudSlabsMesh = new THREE.InstancedMesh(boxGeom, cloudMat, this.cloudSlabCount);
    this.cloudSlabsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.cloudSlabsMesh);
  }

  update(time, state) {
    const t = time * 0.001;
    const reveal = state?.reveal ?? 0;

    // 1. Update Floating Debris
    for (let i = 0; i < this.debrisCount; i++) {
      const d = this.debrisSeeds[i];
      const isGrass = (d.type === 'grass');
      const targetMesh = isGrass ? this.grassDebrisMesh : this.colorDebrisMesh;

      const bob = Math.sin(t * d.speed + d.phase) * 0.20;
      const rotY = t * d.rotSpeed + d.phase;
      const rotX = Math.sin(t * 0.5 + d.phase) * 0.10;

      this.dummy.position.set(d.baseX, d.baseY + bob, d.baseZ);
      this.dummy.scale.setScalar(d.scale);
      this.dummy.rotation.set(rotX, rotY, 0);
      this.dummy.updateMatrix();

      targetMesh.setMatrixAt(i, this.dummy.matrix);

      const otherMesh = isGrass ? this.colorDebrisMesh : this.grassDebrisMesh;
      this.dummy.scale.setScalar(0.0001);
      this.dummy.updateMatrix();
      otherMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.grassDebrisMesh.instanceMatrix.needsUpdate = true;
    this.colorDebrisMesh.instanceMatrix.needsUpdate = true;

    // 2. Update High Voxel Cloud Slabs
    for (let i = 0; i < this.cloudSlabCount; i++) {
      const c = this.cloudSlabsData[i];
      const driftX = Math.sin(t * 0.08 + i) * 0.8;
      this.dummy.position.set(c.x + driftX, c.y, c.z);
      this.dummy.scale.set(c.sx, c.sy, c.sz);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.cloudSlabsMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.cloudSlabsMesh.instanceMatrix.needsUpdate = true;

    // 3. Farlands Terrain: gentle parallax breathing as camera descends
    this.terrainMesh.position.y = (1 - reveal) * -1.2;
  }

  dispose() {
    this.group.traverse(node => {
      if (node.isMesh) {
        node.geometry?.dispose();
        if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
        else node.material?.dispose();
      }
    });
    this.group.clear();
  }
}

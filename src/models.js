import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, mix } from './timeline.js';

const loader = new GLTFLoader();
const edgeMaterial = new THREE.LineBasicMaterial({ color: '#263b36', transparent: true, opacity: .19 });

// The CAD exports have six primitives per solid, identical materials, and no
// names or rig. Bake their static transforms and merge with vertex colors.
// This preserves the supplied geometry while removing hundreds of draw calls.
function collectSolids(gltf) {
  const solids = new Map();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(node => {
    if (!node.isMesh) return;
    const index = gltf.parser.associations.get(node)?.meshes;
    if (index === undefined) return;
    const geometry = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
    geometry.applyMatrix4(node.matrixWorld);
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
    }
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const color = node.material.color;
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (!solids.has(index)) solids.set(index, []);
    solids.get(index).push(geometry);
  });
  const resources = new Set();
  gltf.scene.traverse(n => { if (n.isMesh) { resources.add(n.geometry); for (const m of (Array.isArray(n.material) ? n.material : [n.material])) resources.add(m); } });
  for (const resource of resources) resource.dispose();
  return solids;
}

function makePart(solids, indices, pivot = [0, 0, 0]) {
  const pieces = indices.flatMap(index => solids.get(index) || []);
  if (!pieces.length) throw new Error('The model contains no renderable geometry.');
  const geometry = mergeGeometries(pieces);
  geometry.translate(-pivot[0], -pivot[1], -pivot[2]);
  pieces.forEach(g => g.dispose());
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 35), edgeMaterial));
  const group = new THREE.Group();
  group.position.set(...pivot);
  group.add(mesh);
  return group;
}

export async function WorldCube() {
  const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/world/output.gltf`);
  const solids = collectSolids(gltf);
  const core = new THREE.Box3();
  for (const geometry of solids.get(0) || []) { geometry.computeBoundingBox(); core.union(geometry.boundingBox); }
  if (core.isEmpty()) throw new Error('The world cube core could not be measured.');
  // Center on the actual cube core, not the asymmetrical trees and decorations.
  const center = core.getCenter(new THREE.Vector3());
  const group = new THREE.Group();
  const model = makePart(solids, [...solids.keys()]);
  model.position.copy(center).multiplyScalar(-1);
  const scale = CONFIG.cubeSize / .08;
  const normalized = new THREE.Group();
  normalized.scale.setScalar(scale); normalized.add(model); group.add(normalized);
  group.name = 'WorldCube';
  return { group, sourceMeshes: solids.size, center: center.toArray(), scale };
}

export async function Steve() {
  const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/steve/output.gltf`);
  const solids = collectSolids(gltf);
  const group = new THREE.Group(), model = new THREE.Group();
  model.rotation.order = 'YXZ';
  group.name = 'Steve'; group.add(model);
  const bounds = new THREE.Box3();
  for (const pieces of solids.values()) for (const g of pieces) { g.computeBoundingBox(); bounds.union(g.boundingBox); }
  const height = bounds.max.y - bounds.min.y;
  if (!height) throw new Error('Steve has no measurable geometry.');
  model.scale.setScalar(CONFIG.steveHeight / height);
  const parts = {};
  // Explicit mapping verified against the supplied 21-solid export. Face details
  // stay attached to the head and hands stay attached to their respective arms.
  if (solids.size === 21 && [...Array(21).keys()].every(i => solids.has(i))) {
    const definitions = {
      head: [[1, 5, 8, 9, 10, 11, 12, 13, 14, 15], [0, .0245, 0]],
      torso: [[3], [0, .0125, 0]],
      leftArm: [[0, 4, 7], [.0045, .0238, 0]],
      rightArm: [[16, 17, 18], [-.0045, .0238, 0]],
      leftLeg: [[2, 6], [.002, .012, 0]],
      rightLeg: [[19, 20], [-.002, .012, 0]],
    };
    for (const [name, [indices, pivot]] of Object.entries(definitions)) {
      parts[name] = makePart(solids, indices, pivot); model.add(parts[name]);
    }
  } else {
    model.add(makePart(solids, [...solids.keys()]));
  }
  const footBounds = new THREE.Box3();
  return {
    group, sourceMeshes: solids.size, articulated: !!parts.head,
    pose(state, reducedMotion) {
      const fall = state.fall, air = state.air, crouch = state.crouch;
      const dive = state.diveTilt ?? 0;

      // ── Body ───────────────────────────────────────────────────────────────
      // Smooth transition from upright fall (gentle tilt) into intentional
      // forward dive orientation (~68° forward pitch with 3/4 yaw for full profile visibility).
      const baseRotX = -0.13 * fall + 0.07 * air;
      const diveRotX = 1.18; // ~68° forward dive angle
      const baseRotY = 0.10 + 0.12 * fall;
      const diveRotY = 0.82; // 3/4 dynamic heading showing full body silhouette
      model.rotation.set(
        mix(baseRotX, diveRotX, dive),
        mix(baseRotY, diveRotY, dive),
        reducedMotion ? 0 : 0.07 * Math.sin(state.progress * 32) * fall * (1 - dive * 0.8) + (0.03 * Math.sin(state.progress * 20) * dive)
      );
      model.scale.y = CONFIG.steveHeight / height * (1 - crouch);

      if (parts.head) {
        // ── Head ─────────────────────────────────────────────────────────────
        // Lifts slightly to look forward in the direction of the dive toward the world.
        const baseHeadX = -0.09 * fall + 0.12 * crouch;
        const diveHeadX = -0.42; // head lifts to look forward
        parts.head.rotation.set(mix(baseHeadX, diveHeadX, dive), 0, 0);

        // ── Arms — skydiver diving silhouette (Ref Image 3) ──────────────────
        // Arms extend wide outward (Z axis) and sweep backward/upward (Y axis)
        // matching the skydiver wingspan silhouette.
        parts.leftArm.rotation.set(
          mix(-0.38 * fall - 0.95 * air + 1.6 * crouch, 0.05, dive),
          mix(0, 0.42, dive),
          mix(0.15 * fall + 0.10 * air, 1.42, dive)
        );
        parts.rightArm.rotation.set(
          mix(-0.30 * fall - 0.85 * air + 1.6 * crouch, 0.05, dive),
          mix(0, -0.42, dive),
          mix(-0.15 * fall - 0.10 * air, -1.42, dive)
        );

        // ── Legs — raised behind the body (Ref Image 3) ──────────────────────
        // Legs angle upward behind the body relative to the forward-tilted torso,
        // with slight outward splay for stability and a natural skydiver profile.
        parts.leftLeg.rotation.set(
          mix(0.13 * fall + 0.27 * air + crouch, 1.05, dive),
          0,
          mix(0.045 * fall, 0.22, dive)
        );
        parts.rightLeg.rotation.set(
          mix(-0.10 * fall + 0.19 * air + crouch, 1.05, dive),
          0,
          mix(-0.045 * fall, -0.22, dive)
        );
      }

      // All poses are foot-anchored, including impact compression.
      group.position.set(0, 0, 0); group.updateMatrixWorld(true);
      footBounds.setFromObject(group);
      group.position.y = state.y - footBounds.min.y;
    },
  };
}

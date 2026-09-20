import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { CONFIG as C, sampleTimeline } from '../src/timeline.js';

test('fall lands exactly on the surface and settles without a residual pose', () => {
  assert.equal(sampleTimeline(0).y, C.fallHeight);
  const state = sampleTimeline(.41);
  assert.equal(state.y, C.landingY);
  assert.equal(state.crouch, 0);
  assert.equal(state.fall, 0);
});
test('cloud wipe completely covers the scene setup', () => {
  assert.equal(sampleTimeline(.23).cloud, 1);
  assert.equal(sampleTimeline(.31).cloud, 0);
});
test('all five rotations happen only while airborne and settle at quarter turns', () => {
  for (let i = 0; i < C.transitionCount; i++) {
    const start = C.transitionsStart + i * C.transitionDuration;
    for (let j = 25; j < 68; j++) {
      const state = sampleTimeline(start + j / 100 * C.transitionDuration);
      assert.ok(state.y > C.landingY + .5);
      assert.ok(state.worldTurn > i && state.worldTurn < i + 1);
    }
    const state = sampleTimeline(start + C.transitionDuration * .99);
    assert.equal(state.worldTurn, i + 1);
    assert.equal(state.y, C.landingY);
    assert.equal(state.crouch, 0);
    assert.equal(state.currentBiomeIndex, i + 1);
  }
});
test('alternating positive Z/X quarter turns visit all six faces and cancel upright', () => {
  const orientation = new Quaternion(), quarter = new Quaternion();
  const faces = new Set(['0,1,0']);
  for (let i = 0; i < C.transitionCount; i++) {
    const before = orientation.clone();
    quarter.setFromAxisAngle(i % 2 ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1), C.quarterTurn);
    orientation.premultiply(quarter);
    assert.ok(Math.abs(before.angleTo(orientation) - Math.PI / 2) < 1e-10);
    const up = new Vector3(0, 1, 0).applyQuaternion(orientation.clone().invert());
    faces.add(up.toArray().map(v => Math.round(v) || 0).join(','));
    const steve = orientation.clone().multiply(orientation.clone().invert());
    assert.ok(steve.angleTo(new Quaternion()) < 1e-7);
  }
  assert.equal(faces.size, 6);
});
test('reverse scroll and arbitrary seeks are identical to forward samples', () => {
  const forward = Array.from({ length: 1001 }, (_, i) => sampleTimeline(i / 1000));
  const scratch = {};
  for (let i = 1000; i >= 0; i--) assert.deepEqual(sampleTimeline(i / 1000, scratch), forward[i]);
  for (const i of [720, 3, 900, 401, 20, 680]) assert.deepEqual(sampleTimeline(i / 1000), forward[i]);
});
test('timeline remains continuous across phase and transition boundaries', () => {
  for (let i = 1; i <= 10000; i++) {
    const a = sampleTimeline((i - 1) / 10000), b = sampleTimeline(i / 10000);
    assert.ok(Math.abs(a.y - b.y) < .07, `vertical discontinuity at ${i / 10000}`);
    assert.ok(Math.abs(a.worldTurn - b.worldTurn) < .01);
  }
});

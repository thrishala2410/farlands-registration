export const CONFIG = Object.freeze({
  quarterTurn: Math.PI / 2, fallHeight: 22, jumpHeight: 2.15,
  cubeSize: 4.4, steveHeight: 1.72, landingY: 2.2,
  fallEnd: 0.18, cloudPeak: 0.22, cloudEnd: 0.30,
  contact: 0.36, settled: 0.395, transitionsStart: 0.43,
  transitionDuration: 0.108, transitionCount: 5,
  cameraFallZ: 12, cameraWorldZ: 14, cameraFallX: 2.8, cameraWorldX: 7,
  cameraDesktopDistance: 1.22, cameraMobileDistance: 1.85,
  // Dive phase: character tilts forward into diving pose as fall accelerates
  // 0 -> 0.08: upright fall
  // 0.08 -> 0.22: gradual smooth transition (upright -> 15° -> 30° -> 45° -> 60° -> 75°)
  // 0.22 -> 0.32: full diving motion plunging toward Farlands world
  // 0.32 -> 0.36: landing recovery flare into touchdown
  diveStart: 0.08, divePeak: 0.22, diveEnd: 0.32,
});
export const BIOMES = [
  ['A softer landing.', 'A little earth. An entirely new outlook.'],
  ['The quiet wild.', 'Another side of somewhere unexpected.'],
  ['A change of scenery.', 'There is always more than meets the eye.'],
  ['A world underneath.', 'Even the familiar has a hidden side.'],
  ['Off the beaten sky.', 'A small leap can take you a long way.'],
  ['Come full of wonder.', 'Six little worlds. One new perspective.'],
];
export const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export const range = (v, a, b) => clamp((v - a) / (b - a));
export const smooth = v => { const t = clamp(v); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;

// Pure, absolute-time sampling: reversing or skipping scroll never queues events.
// Mutate a reusable result in the render loop to avoid per-frame garbage.
export function sampleTimeline(progress, out = {}) {
  const p = clamp(progress), c = CONFIG;
  out.progress = p;
  out.cloud = smooth(range(p, .13, c.cloudPeak)) * (1 - smooth(range(p, .245, c.cloudEnd)));
  out.reveal = smooth(range(p, .225, .345));
  out.intro = 1 - smooth(range(p, .025, .145));
  out.worldTurn = 0; out.currentBiomeIndex = 0; out.targetBiomeIndex = 0;
  out.jump = 0; out.crouch = 0; out.air = 0; out.phase = 'fall';
  // Dive tilt envelope: smooth transition into dive, hold full dive, flare for landing
  const diveIn = smooth(range(p, c.diveStart, c.divePeak));
  const diveOut = 1 - smooth(range(p, c.diveEnd, c.contact));
  out.diveTilt = diveIn * diveOut;
  if (p >= c.diveStart && p < c.contact) out.phase = 'dive';
  const approach = range(p, .27, c.contact);
  out.y = p < .225 ? mix(c.fallHeight, 12, smooth(range(p, 0, .225)))
    : mix(12, c.landingY, approach * approach);
  out.fall = 1 - smooth(range(p, .29, c.contact));
  if (p >= c.contact) {
    out.y = c.landingY; out.phase = 'rest'; out.diveTilt = 0;
    out.crouch = p < c.settled ? .16 * Math.sin(Math.PI * range(p, c.contact, c.settled)) : 0;
  }
  if (p >= c.transitionsStart) {
    const step = Math.min(c.transitionCount - 1, Math.floor((p - c.transitionsStart) / c.transitionDuration));
    const t = range(p, c.transitionsStart + step * c.transitionDuration, c.transitionsStart + (step + 1) * c.transitionDuration);
    const air = range(t, .16, .78);
    out.air = Math.sin(Math.PI * air);
    out.jump = c.jumpHeight * 4 * air * (1 - air);
    out.y = c.landingY + out.jump;
    out.crouch = t < .16 ? .19 * Math.sin(Math.PI * t / .16)
      : t > .78 && t < .92 ? .14 * Math.sin(Math.PI * (t - .78) / .14) : 0;
    out.worldTurn = step + smooth(range(t, .24, .68));
    out.currentBiomeIndex = step + (t >= .68 ? 1 : 0);
    out.targetBiomeIndex = Math.min(step + 1, c.transitionCount);
    out.phase = t < .16 ? 'anticipation' : t < .78 ? 'jump' : 'rest';
  }
  return out;
}


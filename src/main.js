import './style.css';
import './hackathon.css';

import { Hero3D } from './Hero3D.js';
import { BIOMES, range, smooth } from './timeline.js';

const $ = id => document.getElementById(id);
let hero, lastBiome = -1;
function updateUI(state) {
  $('intro').style.opacity = state.intro;
  $('intro').style.transform = `translateY(${-40 * (1 - state.intro)}px)`;
  $('chapter').style.opacity = smooth(range(state.progress, .375, .415)) * (1 - state.air * .65);
  $('progress-label').textContent = String(Math.round(state.progress * 100)).padStart(2, '0');
  $('progress-bar').style.transform = `scaleX(${state.progress})`;
  $('scroll-label').textContent = state.progress > .985 ? 'SCROLL BACK TO THE SKY' : state.progress > .37 ? 'A NEW PERSPECTIVE AWAITS' : 'SCROLL TO TAKE THE LEAP';
  if (lastBiome !== state.currentBiomeIndex) {
    lastBiome = state.currentBiomeIndex;
    $('chapter-number').textContent = `${String(lastBiome + 1).padStart(2, '0')} / 06`;
    $('chapter-title').textContent = BIOMES[lastBiome][0];
    $('chapter-description').textContent = BIOMES[lastBiome][1];
    if (state.progress >= .36) $('accessible-status').textContent = `Biome ${lastBiome + 1} of six. ${BIOMES[lastBiome][0]}`;
  }
}
function reportError(error) {
  console.error('Farlands:', error);
  $('loading').hidden = true; $('error').hidden = false;
  $('error').querySelector('p').textContent = 'We could not open the 3D world. Check your connection and that your browser supports WebGL, then try again.';
}
function scroll() {
  const available = $('journey').offsetHeight - innerHeight;
  hero?.setProgress(Math.max(0, Math.min(1, scrollY / Math.max(1, available))));
}
async function init() {
  try {
    hero = new Hero3D($('scene'), updateUI, reportError);
    scroll(); await hero.load(); $('loading').hidden = true;
    // Read-only observability for development/browser validation; never shipped.
    if (import.meta.env.DEV) window.__farlands = { snapshot: () => hero.snapshot() };
  } catch (error) { reportError(error); hero?.dispose(); }
}
$('return-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }));
$('retry').addEventListener('click', () => location.reload());
window.addEventListener('scroll', scroll, { passive: true });
window.addEventListener('resize', scroll, { passive: true });
window.addEventListener('pagehide', event => { if (!event.persisted) hero?.dispose(); });
if (import.meta.hot) import.meta.hot.dispose(() => { hero?.dispose(); window.removeEventListener('scroll', scroll); window.removeEventListener('resize', scroll); });
init();

import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { CONFIG as C } from '../src/timeline.js';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_PATH || 'C:/Users/jai07/AppData/Local/BraveSoftware/Brave-Browser/Application/brave.exe',
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [], responses = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('fonts.googleapis')) errors.push(m.text()); });
  page.on('response', r => { if (/models\/.+\.(gltf|bin)/.test(r.url())) responses.push({ url: r.url(), status: r.status() }); });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__farlands?.snapshot().ready, { timeout: 30000 });
  async function seek(progress) {
    await page.evaluate(p => window.scrollTo(0, p * (document.getElementById('journey').offsetHeight - innerHeight)), progress);
    await page.waitForFunction(p => Math.abs(window.__farlands.snapshot().progress - p) < .0002, progress);
    await page.waitForTimeout(100);
    return page.evaluate(() => window.__farlands.snapshot());
  }
  const initial = await seek(0);
  assert.equal(initial.steveMeshes, 21); assert.equal(initial.worldMeshes, 100); assert.equal(initial.articulated, true);
  await page.screenshot({ path: 'test-results/01-sky.png' });
  const cloud = await seek(.23); assert.equal(cloud.cloud, 1);
  await page.screenshot({ path: 'test-results/02-clouds.png' });
  const landed = await seek(.41); assert.equal(landed.y, C.landingY);
  await page.screenshot({ path: 'test-results/03-landing.png' });
  let previousQuaternion = landed.worldQuaternion;
  const samples = [initial, cloud, landed];
  for (let i = 0; i < C.transitionCount; i++) {
    const start = C.transitionsStart + i * C.transitionDuration;
    const airborne = await seek(start + .46 * C.transitionDuration);
    assert.ok(airborne.y > C.landingY + 1.5);
    assert.ok(airborne.steveQuaternion.slice(0, 3).every(v => Math.abs(v) < 1e-9));
    await page.screenshot({ path: `test-results/jump-${i + 1}.png` });
    const rest = await seek(start + .98 * C.transitionDuration);
    const dot = Math.abs(previousQuaternion.reduce((sum, v, j) => sum + v * rest.worldQuaternion[j], 0));
    assert.ok(Math.abs(2 * Math.acos(Math.min(1, dot)) - Math.PI / 2) < 1e-6);
    assert.equal(rest.y, C.landingY); previousQuaternion = rest.worldQuaternion;
    samples.push(airborne, rest);
    await page.screenshot({ path: `test-results/biome-${i + 2}.png` });
  }
  const reversed = await seek(.41);
  assert.deepEqual(reversed.worldQuaternion, landed.worldQuaternion);
  assert.deepEqual(reversed.steveQuaternion, landed.steveQuaternion);
  await seek(.75); await seek(.02); await seek(.94); await seek(0);
  await page.getByRole('button', { name: 'Restart the journey' }).click();
  await seek(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await seek(0); await page.screenshot({ path: 'test-results/mobile-sky.png' });
  await seek(.23); await page.screenshot({ path: 'test-results/mobile-clouds.png' });
  await seek(.41); await page.screenshot({ path: 'test-results/mobile-landing.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seek(.99); await seek(.41);
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.goto('http://127.0.0.1:5173');
  await mobile.waitForFunction(() => window.__farlands?.snapshot().ready);
  assert.equal(await mobile.evaluate(() => window.__farlands.snapshot().cloudInstances), 36);
  await mobile.evaluate(() => window.scrollTo(0, .23 * (document.getElementById('journey').offsetHeight - innerHeight)));
  await mobile.waitForFunction(() => Math.abs(window.__farlands.snapshot().progress - .23) < .0002);
  await mobile.screenshot({ path: 'test-results/mobile-native-clouds.png' });
  await mobile.close();
  const broken = await browser.newPage();
  await broken.route('**/models/steve/output.bin', route => route.abort());
  await broken.goto('http://127.0.0.1:5173');
  await broken.locator('#error').waitFor({ state: 'visible' });
  assert.equal(await broken.locator('#loading').isVisible(), false);
  await broken.close();
  assert.equal(responses.length, 4); assert.ok(responses.every(r => r.status === 200));
  assert.deepEqual(errors, []);
  await writeFile('test-results/browser-report.json', JSON.stringify({ responses, errors, samples }, null, 2));
  console.log('PASS: assets, desktop/mobile, clouds, five exact quarter turns, upright Steve, reverse/fast scroll, reduced motion.');
  console.log(`Rendering: ${initial.drawCalls} draw calls, ${initial.triangles} triangles.`);
} finally { await browser.close(); }

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { easeProgress, frameAtProgress, progressAtFrame, chapterAtFrame, variantForStage, fitFrame, nearbyFrames, resolutionForFit, initialResolutionCap, qualityLagDelay } from '../dist/timeline.mjs';

const manifest = JSON.parse(readFileSync(new URL('../dist/assets/manifest.json', import.meta.url)));

test('phone streaming starts conservatively and respects data-saving preferences', () => {
  const phone = { coarsePointer: true, shortSide: 443 };
  assert.equal(initialResolutionCap(phone), 720, 'Unknown networks still start conservatively');
  assert.equal(initialResolutionCap({ ...phone, effectiveType: '4g', downlink: 10 }), 720);
  assert.equal(initialResolutionCap({ ...phone, effectiveType: '4g', downlink: 1.6 }), 540);
  assert.equal(initialResolutionCap({ ...phone, effectiveType: '3g' }), 540);
  assert.equal(initialResolutionCap({ ...phone, shortSide: 820 }), Infinity, 'Tablets retain fitted resolution');
  assert.equal(initialResolutionCap({ ...phone, coarsePointer: false }), Infinity);
  assert.equal(initialResolutionCap({ coarsePointer: false, saveData: true }), 540);
});

test('quality adapts earlier only when measured delivery cannot meet scroll demand', () => {
  assert.equal(qualityLagDelay(300, 30, 4), 350);
  assert.equal(qualityLagDelay(300, 5, 4), 800);
  assert.equal(qualityLagDelay(300, 0, 4), 800);
  assert.equal(qualityLagDelay(300, 30, 1), 800, 'Wait for several completed samples');
});

test('scroll easing is time-based, reversible and does not overshoot', () => {
  let at60Hz = 0;
  let at120Hz = 0;
  for (let tick = 0; tick < 12; tick++) at60Hz = easeProgress(at60Hz, 1, 1000 / 60);
  for (let tick = 0; tick < 24; tick++) at120Hz = easeProgress(at120Hz, 1, 1000 / 120);
  assert.ok(Math.abs(at60Hz - at120Hz) < 1e-10);
  assert.ok(at60Hz > .8 && at60Hz < 1);
  let reversed = at60Hz;
  for (let tick = 0; tick < 60; tick++) {
    const next = easeProgress(reversed, 0, 1000 / 60);
    assert.ok(next <= reversed && next >= 0);
    reversed = next;
  }
  assert.equal(reversed, 0);
  assert.equal(easeProgress(1, 1, 16), 1);
  assert.equal(easeProgress(0, 0, 16), 0);
});

test('source map retains all motion and excludes only duplicated holds', () => {
  assert.equal(manifest.frames.length, 421);
  assert.deepEqual(manifest.frames, [
    ...Array.from({ length: 34 }, (_, i) => i + 1),
    ...Array.from({ length: 387 }, (_, i) => i + 95),
  ]);
});

test('image resolution matches fitted size and caps high-density demand', () => {
  const choices = manifest.variants.portrait.resolutions;
  assert.equal(resolutionForFit({ width: 351, height: 624 }, choices, 1).id, '540');
  assert.equal(resolutionForFit({ width: 351, height: 624 }, choices, 2).id, '720');
  assert.equal(resolutionForFit({ width: 351, height: 624 }, choices, 4).id, '720');
  assert.equal(resolutionForFit({ width: 800, height: 1422 }, choices, 2).id, '1080');
  for (const variant of Object.values(manifest.variants)) {
    assert.deepEqual(variant.resolutions.map(item => item.id), ['540', '720', '1080']);
    for (const resolution of variant.resolutions) {
      assert.equal(resolution.width / resolution.height, variant.width / variant.height);
    }
  }
});

test('forward and reverse mapping round-trip all frames with clamped endpoints', () => {
  for (const i of [...manifest.frames.keys()].reverse()) {
    assert.equal(frameAtProgress(progressAtFrame(i, 421), 421), i);
  }
  assert.equal(frameAtProgress(-1, 421), 0);
  assert.equal(frameAtProgress(2, 421), 420);
});

test('chapter boundaries match the original Blender timeline', () => {
  const boundaries = [[0, 'parts'], [44, 'parts'], [45, 'wifi'], [149, 'wifi'],
    [150, 'lora'], [254, 'lora'], [255, 'boards'], [374, 'boards'], [375, 'assembled'], [420, 'assembled']];
  for (const [frame, expected] of boundaries) {
    assert.equal(chapterAtFrame(frame, manifest.chapters).id, expected);
  }
});

test('connection links land on reviewed clear poses before seating, outside transition fades', () => {
  // The original boundaries at 45, 150 and 255 are partially or wholly blank.
  // These source frames show the main parts and the fully visible connector inset.
  const entries = [['wifi', 90, 151, 93], ['lora', 180, 241, 198], ['boards', 315, 376, 318]];
  for (const [id, target, source, seatingStart] of entries) {
    const chapter = manifest.chapters.find(item => item.id === id);
    assert.equal(chapter.targetIndex, target);
    assert.equal(manifest.frames[target], source);
    assert.ok(target > chapter.startIndex && target < seatingStart);
    assert.equal(chapterAtFrame(target, manifest.chapters).id, id);
  }
});

test('adaptive layout fits the full image without clipping', () => {
  for (const [width, height] of [[1392, 784], [366, 730], [744, 900], [500, 500], [820, 300]]) {
    const variant = variantForStage(width, height);
    assert.equal(variant, width > height ? 'landscape' : 'portrait');
    const image = manifest.variants[variant];
    const fit = fitFrame(width, height, image.width, image.height);
    assert.ok(fit.width <= width + .001 && fit.height <= height + .001);
    assert.ok(fit.left >= 0 && fit.top >= 0);
    assert.ok(Math.abs(fit.width / fit.height - image.width / image.height) < .0001);
  }
});

test('directional prefetch is bounded and prioritizes the requested frame', () => {
  for (const target of [0, 1, 200, 419, 420]) {
    for (const direction of [-1, 1]) {
      const nearby = nearbyFrames(target, direction, 421);
      assert.equal(nearby[0], target);
      assert.ok(nearby.length <= 12);
      assert.equal(new Set(nearby).size, nearby.length);
      assert.ok(nearby.every(i => i >= 0 && i < 421));
    }
  }
});

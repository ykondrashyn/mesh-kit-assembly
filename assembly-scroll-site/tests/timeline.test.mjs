import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { easeProgress, frameAtProgress, progressAtFrame, chapterAtFrame, variantForStage, fitFrame, nearbyFrames } from '../dist/timeline.mjs';

const manifest = JSON.parse(readFileSync(new URL('../dist/assets/manifest.json', import.meta.url)));

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

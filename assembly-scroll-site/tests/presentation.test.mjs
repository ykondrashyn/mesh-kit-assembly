import test from 'node:test';
import assert from 'node:assert/strict';
import { frameCrop, presentationForStage, chapterCopy } from '../dist/presentation.mjs';

test('phone layouts retain the connector circle and replace exported page furniture', () => {
  assert.equal(presentationForStage(920, 338), 'compact');
  assert.equal(presentationForStage(443, 840), 'phone');
  assert.equal(presentationForStage(1440, 900), 'full');
  for (const [orientation, layout, circle] of [
    ['landscape', 'compact', { x: 1570, y: 515, r: 252 }],
    ['portrait', 'phone', { x: 540, y: 1390, r: 300 }],
  ]) {
    const crop = frameCrop(orientation, layout);
    assert.ok(circle.x - circle.r >= crop.x);
    assert.ok(circle.x + circle.r <= crop.x + crop.width);
    assert.ok(circle.y - circle.r >= crop.y);
    assert.ok(circle.y + circle.r <= crop.y + crop.height);
  }
  assert.ok(frameCrop('landscape', 'compact').height < 1080);
  assert.ok(frameCrop('portrait', 'phone').height > 1740, 'Keep the simplified socket note');
  assert.equal(frameCrop('landscape', 'full').height, 1080);
  assert.equal(Object.keys(chapterCopy).length, 5);
});

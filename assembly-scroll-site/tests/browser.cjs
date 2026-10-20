const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = process.argv[2] || 'http://127.0.0.1:8766';
const output = path.resolve(__dirname, '../validation');
const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../dist/assets/manifest.json')));
const results = [];
const framePattern = (orientation, index) => new RegExp(`/${orientation}/(?:[0-9]+/)?frame-${String(manifest.frames[index]).padStart(4, '0')}\\.webp\\?`);

const state = page => page.evaluate(() => ({
  frame: Number(document.querySelector('canvas').dataset.frame),
  requested: Number(document.querySelector('#stage').dataset.requestedFrame),
  orientation: document.querySelector('canvas').dataset.orientation,
  progress: Number(document.querySelector('#stage').dataset.progress),
  decoded: Number(document.querySelector('#stage').dataset.decodedFrames),
  maxDecoded: Number(document.querySelector('#stage').dataset.maxDecodedFrames),
  maxDecodedBytes: Number(document.querySelector('#stage').dataset.maxDecodedBytes),
  maxRequests: Number(document.querySelector('#stage').dataset.maxRequests),
}));
async function waitFrame(page, index) {
  await page.waitForFunction(i => Number(document.querySelector('canvas').dataset.frame) === i, index);
}
async function waitSettled(page) {
  await page.waitForFunction(() => document.querySelector('#stage').dataset.settled === 'true');
}
async function go(page, index, expected = index, settle = true) {
  await page.evaluate(i => {
    const span = document.querySelector('#story').offsetHeight - document.querySelector('#stage').offsetHeight;
    window.scrollTo(0, i / 420 * span);
  }, index);
  await page.waitForFunction(i => Number(document.querySelector('#stage').dataset.requestedFrame) === i, expected);
  await waitFrame(page, expected);
  if (settle) await waitSettled(page);
}
async function fits(page) {
  const bounds = await page.evaluate(() => {
    const canvas = document.querySelector('canvas').getBoundingClientRect();
    const area = document.querySelector('#artwork').getBoundingClientRect();
    const controls = document.querySelector('.controls').getBoundingClientRect();
    return { canvas: canvas.toJSON(), area: area.toJSON(), controls: controls.toJSON(), innerHeight,
      orientation: document.querySelector('canvas').dataset.orientation };
  });
  assert.ok(bounds.canvas.left >= bounds.area.left - 1);
  assert.ok(bounds.canvas.right <= bounds.area.right + 1);
  assert.ok(bounds.canvas.top >= bounds.area.top - 1);
  assert.ok(bounds.canvas.bottom <= bounds.area.bottom + 1);
  assert.ok(bounds.canvas.bottom <= bounds.controls.top + 1);
  assert.ok(bounds.controls.bottom <= bounds.innerHeight + 1);
  return bounds;
}
async function run(name, fn) {
  if (process.env.SKIP_FULL_TRAVERSAL && /travers/.test(name)) {
    results.push({ name, skipped: true, reason: 'Explicitly skipped by SKIP_FULL_TRAVERSAL.' });
    return;
  }
  const details = await fn();
  results.push({ name, passed: true, details });
  console.log(`PASS ${name}`);
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const errors = [];
  let completed = false;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    const requests = [];
    page.on('request', req => requests.push(req.url()));
    await page.goto(url);
    await waitFrame(page, 0);
    await run('initial load selects landscape only', async () => {
      await page.waitForTimeout(400);
      assert.equal((await state(page)).orientation, 'landscape');
      assert.equal(requests.filter(item => item.includes('/portrait/')).length, 0);
      return { frameRequests: requests.filter(item => item.endsWith(manifest.version)).length, bounds: await fits(page) };
    });
    await run('mouse wheel advances and reverse wheel reverses', async () => {
      await page.mouse.wheel(0, 800);
      await page.waitForFunction(() => Number(document.querySelector('canvas').dataset.frame) > 20);
      await waitSettled(page);
      const forward = await state(page);
      await page.mouse.wheel(0, -500);
      await page.waitForFunction(i => Number(document.querySelector('canvas').dataset.frame) < i, forward.frame);
      await waitSettled(page);
      const backward = await state(page);
      await page.waitForTimeout(350);
      assert.equal((await state(page)).frame, backward.frame);
      return { forward, backward };
    });
    await run('complete forward and reverse frame traversal', async () => {
      for (let index = 0; index <= 420; index++) await go(page, index, index, false);
      for (let index = 420; index >= 0; index--) await go(page, index, index, false);
      await waitSettled(page);
      const final = await state(page);
      assert.ok(final.maxDecoded <= 12);
      assert.ok(final.maxDecodedBytes <= 48 * 1024 * 1024);
      assert.ok(final.maxRequests <= 4);
      return { positionsChecked: 842, ...final };
    });
    await run('desktop labels and connection seating views fit', async () => {
      const views = [];
      for (const index of [33, 129, 234, 363, 420]) {
        await go(page, index);
        views.push({ index, bounds: await fits(page) });
        await page.screenshot({ path: path.join(output, `desktop-${index}.png`) });
      }
      return views;
    });
    await run('chapter links and keyboard endpoints', async () => {
      await page.getByRole('link', { name: '03 LoRa', exact: true }).click();
      await waitFrame(page, 150);
      await page.getByRole('link', { name: 'Assembled', exact: true }).click();
      await waitFrame(page, 420);
      await page.keyboard.press('Home');
      await waitFrame(page, 0);
      await page.keyboard.press('End');
      await waitFrame(page, 420);
      return await state(page);
    });
    await run('tablet and phone resize preserve progress', async () => {
      await go(page, 129);
      await page.evaluate(() => document.activeElement?.blur());
      for (const viewport of [{ width: 768, height: 1024 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        await page.waitForFunction(() => document.querySelector('canvas').dataset.orientation === 'portrait');
        await waitFrame(page, 129);
        await page.waitForFunction(() => {
          const image = document.querySelector('canvas').getBoundingClientRect();
          const area = document.querySelector('#artwork').getBoundingClientRect();
          return image.right <= area.right + 1 && image.bottom <= area.bottom + 1 &&
            document.querySelector('#stage').offsetHeight === window.innerHeight;
        });
        await fits(page);
      }
      await page.screenshot({ path: path.join(output, 'phone-129.png') });
      for (const index of [33, 234, 363, 420]) {
        await go(page, index);
        await fits(page);
        await page.screenshot({ path: path.join(output, `phone-${index}.png`) });
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForFunction(() => document.querySelector('canvas').dataset.orientation === 'landscape');
      await waitFrame(page, 420);
      return await state(page);
    });
    await run('portrait traverses every frame forward and backward', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() => document.querySelector('canvas').dataset.orientation === 'portrait');
      for (let index = 0; index <= 420; index++) await go(page, index, index, false);
      for (let index = 420; index >= 0; index--) await go(page, index, index, false);
      await waitSettled(page);
      const result = await state(page);
      assert.ok(result.maxDecoded <= 12);
      assert.ok(result.maxDecodedBytes <= 48 * 1024 * 1024);
      assert.ok(result.maxRequests <= 4);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForFunction(() => document.querySelector('canvas').dataset.orientation === 'landscape');
      return { positionsChecked: 842, ...result };
    });
    await run('orientation change rejects a delayed old-orientation frame', async () => {
      await go(page, 10);
      await page.route(framePattern('landscape', 150), async route => {
        await new Promise(resolve => setTimeout(resolve, 500));
        await route.continue().catch(() => {});
      });
      await page.getByRole('link', { name: '03 LoRa', exact: true }).click();
      await page.waitForTimeout(70);
      await page.route(framePattern('portrait', 150), async route => {
        await new Promise(resolve => setTimeout(resolve, 350));
        await route.continue().catch(() => {});
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(100);
      const whileLoading = await fits(page);
      // A nearby portrait frame may arrive before the delayed exact target.
      // Either orientation must retain its own aspect ratio during that handoff.
      const ratio = whileLoading.orientation === 'portrait' ? 9 / 16 : 16 / 9;
      assert.ok(Math.abs(whileLoading.canvas.width / whileLoading.canvas.height - ratio) < .001);
      await page.waitForFunction(() => document.querySelector('canvas').dataset.orientation === 'portrait');
      await waitFrame(page, 150);
      await page.waitForTimeout(550);
      assert.equal((await state(page)).orientation, 'portrait');
      assert.equal((await state(page)).frame, 150);
      await page.unrouteAll({ behavior: 'wait' });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForFunction(() => document.querySelector('canvas').dataset.orientation === 'landscape');
      return await state(page);
    });
    await run('delayed frames retain the current picture and stale results cannot replace it', async () => {
      await go(page, 10);
      let delayStarted = false;
      await page.route(framePattern('landscape', 333), async route => {
        delayStarted = true;
        await new Promise(resolve => setTimeout(resolve, 450));
        await route.continue().catch(() => {});
      });
      await page.evaluate(() => window.scrollTo(0, 333 / 420 *
        (document.querySelector('#story').offsetHeight - document.querySelector('#stage').offsetHeight)));
      await page.waitForFunction(() => document.querySelector('#stage').dataset.requestedFrame === '333');
      assert.ok(delayStarted);
      assert.notEqual((await state(page)).frame, 333);
      await go(page, 20);
      await page.waitForTimeout(500);
      assert.equal((await state(page)).frame, 20);
      await page.unrouteAll({ behavior: 'wait' });
      return await state(page);
    });
    await run('frame failure exposes retry and recovers', async () => {
      let fail = true;
      const pattern = framePattern('landscape', 250);
      await page.route(pattern, route => fail ? route.abort('failed') : route.continue());
      await page.evaluate(() => window.scrollTo(0, 250 / 420 *
        (document.querySelector('#story').offsetHeight - document.querySelector('#stage').offsetHeight)));
      await page.getByRole('button', { name: 'Try again' }).waitFor({ state: 'visible' });
      assert.notEqual((await state(page)).frame, 250);
      fail = false;
      await page.getByRole('button', { name: 'Try again' }).click();
      await waitFrame(page, 250);
      await page.unrouteAll({ behavior: 'wait' });
      return await state(page);
    });
    await run('rapid direction changes settle at the exact requested frame', async () => {
      for (const index of [10, 410, 100, 355, 1, 420, 129]) {
        await page.evaluate(i => window.scrollTo(0, i / 420 *
          (document.querySelector('#story').offsetHeight - document.querySelector('#stage').offsetHeight)), index);
        await page.waitForTimeout(12);
      }
      await waitFrame(page, 129);
      await page.waitForTimeout(300);
      assert.equal((await state(page)).frame, 129);
      assert.ok((await state(page)).maxDecoded <= 12);
      return await state(page);
    });
    await run('reduced motion uses chapter stills with opt-in full animation', async () => {
      const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      const p = await reduced.newPage();
      p.on('pageerror', error => errors.push(error.message));
      const fetched = [];
      p.on('request', req => { if (req.url().includes('.webp')) fetched.push(req.url()); });
      await p.goto(url);
      await waitFrame(p, 33);
      assert.ok(fetched.length >= 5);
      assert.ok(fetched.every(url => /frame-(0034|0190|0295|0424|0481)\.webp/.test(url)));
      await p.getByRole('link', { name: '03 LoRa', exact: true }).click();
      await waitFrame(p, 234);
      await p.screenshot({ path: path.join(output, 'reduced-motion.png') });
      await fits(p);
      await p.getByRole('button', { name: 'Enable full animation' }).click();
      await waitFrame(p, 150);
      await go(p, 160);
      const result = await state(p);
      await reduced.close();
      return result;
    });
    await run('JavaScript-disabled fallback displays the labeled parts', async () => {
      const fallback = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
      const p = await fallback.newPage();
      await p.goto(url);
      const image = p.locator('.fallback img');
      await image.waitFor({ state: 'visible' });
      const loaded = await image.evaluate(img => img.complete && img.naturalWidth > 0);
      assert.ok(loaded);
      await p.screenshot({ path: path.join(output, 'no-javascript.png') });
      await fallback.close();
      return { imageLoaded: loaded };
    });
    await run('emulated phone touch swipe advances the assembly', async () => {
      const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const p = await mobile.newPage();
      await p.goto(url);
      await waitFrame(p, 0);
      const cdp = await mobile.newCDPSession(p);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 190, y: 650 }] });
      for (let y = 610; y >= 250; y -= 40) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190, y }] });
        await p.waitForTimeout(20);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForFunction(() => Number(document.querySelector('canvas').dataset.frame) > 5);
      const result = await state(p);
      await mobile.close();
      return result;
    });
    assert.deepEqual(errors, []);
    completed = true;
  } finally {
    const report = { browser: await browser.version(), completed, results, uncaughtErrors: errors,
      limitations: ['Chromium tested on macOS. Safari, Firefox and physical mobile devices were not tested.'] };
    fs.writeFileSync(path.join(output, 'browser-validation.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
})().catch(error => { console.error(error.stack); process.exit(1); });

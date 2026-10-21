const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.argv[2] || 'http://127.0.0.1:8766/';
const output = process.env.VALIDATION_OUTPUT || path.resolve(__dirname, '../validation/mobile-improvements/connectors.json');
const waitFrame = (page, index) => page.waitForFunction(i => document.querySelector('#assembly').dataset.frame === String(i), index);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const report = { checks: [], passed: false };
  try {
    for (const [name, width, height] of [['desktop', 1440, 900], ['portrait', 443, 840], ['landscape', 920, 338]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: name !== 'desktop', isMobile: name !== 'desktop' });
      const page = await context.newPage(), requests = [], errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('request', r => { if (r.url().includes('.webp')) requests.push(r.url()); });
      await page.goto(base);
      await waitFrame(page, 0);
      assert.equal(await page.locator('#enlarge-connector').isVisible(), false);
      for (const [chapter, index] of [['wifi', 90], ['lora', 180], ['boards', 315]]) {
        await page.locator(`[data-chapter="${chapter}"]`).click();
        await waitFrame(page, index);
        const before = await page.evaluate(() => ({ y: scrollY, progress: document.querySelector('#stage').dataset.progress, resolution: document.querySelector('#assembly').dataset.resolution }));
        const startRequests = requests.length;
        await page.locator('#enlarge-connector').focus();
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.querySelector('#connector-image').dataset.resolution === '1080');
        assert.equal(await page.locator('#connector-image').getAttribute('data-frame'), String(index));
        assert.ok(await page.locator('#close-connector').evaluate(e => e === document.activeElement));
        const box = await page.locator('#connector-image').boundingBox();
        assert.ok(box.width >= (name === 'portrait' ? 350 : 225));
        assert.ok(box.y >= 0 && box.y + box.height <= height);
        await page.mouse.wheel(0, 600);
        await page.waitForTimeout(200);
        assert.equal(await page.evaluate(() => scrollY), before.y);
        assert.equal(await page.locator('#assembly').getAttribute('data-frame'), String(index));
        if (chapter === 'boards') {
          assert.ok(await page.locator('#connector-note').isVisible());
          await page.screenshot({ path: output.replace('.json', `-${name}.png`) });
        }
        const sharpRequests = requests.slice(startRequests).filter(url => /\/(portrait|landscape)\/frame-/.test(url));
        assert.ok(sharpRequests.length <= 1, 'Inspection fetches only one native-resolution frame');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#connector-dialog').isVisible(), false);
        assert.ok(await page.locator('#enlarge-connector').evaluate(e => e === document.activeElement));
        await waitFrame(page, index);
        await page.waitForFunction(res => document.querySelector('#assembly').dataset.resolution === res, before.resolution);
        const s = await page.locator('#stage').evaluate(e => ({ ...e.dataset }));
        assert.equal(s.progress, before.progress);
        assert.ok(Number(s.maxRequests) <= 4 && Number(s.maxDecodedFrames) <= 12 && Number(s.maxDecodedBytes) <= 48 * 1024 * 1024);
        report.checks.push({ name, chapter, index, sharpRequests, size: box.width, metrics: s });
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    // A failed sharper image must keep the immediate enlarged copy usable.
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    let fail = true, delay = false;
    await page.route('**/portrait/frame-*.webp?*', async route => {
      if (delay) await new Promise(resolve => setTimeout(resolve, 600));
      await (fail ? route.abort() : route.continue()).catch(() => {});
    });
    await page.goto(base);
    await waitFrame(page, 0);
    await page.locator('[data-chapter="boards"]').click();
    await waitFrame(page, 315);
    await page.locator('#enlarge-connector').click();
    await page.locator('#connector-retry').waitFor({ state: 'visible' });
    assert.ok(await page.locator('#connector-image').evaluate(e => e.width > 200));
    fail = false;
    await page.locator('#connector-retry').click();
    await page.waitForFunction(() => document.querySelector('#connector-image').dataset.resolution === '1080');
    await page.locator('#close-connector').click();
    await page.locator('[data-chapter="wifi"]').click();
    await waitFrame(page, 90);
    delay = true;
    await page.locator('#enlarge-connector').click();
    await page.keyboard.press('Escape');
    await page.locator('[data-chapter="lora"]').click();
    await waitFrame(page, 180);
    await page.waitForTimeout(750);
    assert.equal(await page.locator('#assembly').getAttribute('data-frame'), '180');
    assert.equal(await page.locator('#connector-dialog').isVisible(), false);
    report.failureAndCancellation = true;
    await page.close();
    report.passed = true;
    console.log('PASS 9 connector views, keyboard focus, paused scrolling, single sharp image, retry and stale cancellation');
  } finally {
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

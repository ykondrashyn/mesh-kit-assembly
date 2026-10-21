const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.argv[2] || 'http://127.0.0.1:8766/';
const output = process.env.VALIDATION_OUTPUT || path.resolve(__dirname, '../validation/audit-fixes/regressions.json');
const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../dist/assets/manifest.json')));
const frame = (page, index) => page.waitForFunction(i => document.querySelector('#assembly').dataset.frame === String(i), index);
const state = page => page.evaluate(() => ({ stage: { ...document.querySelector('#stage').dataset }, canvas: { ...document.querySelector('#assembly').dataset } }));

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const report = { browser: browser.version(), completed: false, checks: [] };
  async function check(name, fn, options = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }) {
    if (process.env.CHECK && !name.includes(process.env.CHECK)) return;
    const context = await browser.newContext(options), page = await context.newPage(), errors = [];
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    try {
      const details = await fn(page, context);
      assert.deepEqual(errors, []);
      const final = await state(page);
      assert.ok(Number(final.stage.maxRequests) <= 4);
      assert.ok(Number(final.stage.maxDecodedFrames) <= 12);
      assert.ok(Number(final.stage.maxDecodedBytes) <= 48 * 1024 * 1024);
      assert.ok(Number(final.stage.maxCompressedBytes) <= 24 * 1024 * 1024);
      report.checks.push({ name, passed: true, details, final });
      console.log('PASS ' + name);
    } catch (error) {
      report.checks.push({ name, passed: false, error: error.message, final: await state(page) });
      throw error;
    } finally { await context.close(); }
  }
  try {
    await check('urgent chapter bypasses four stalled neighbors', async page => {
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      const held = [];
      await page.route(/\/landscape\/frame-000[2-6]\.webp\?/, async route => {
        held.push(route.request().url());
        await gate;
        await route.continue().catch(() => {});
      });
      try {
        await page.goto(new URL('?background=off', base).href, { waitUntil: 'domcontentloaded' });
        await frame(page, 0);
        await page.waitForFunction(() => document.querySelector('#stage').dataset.jobs === '4');
        assert.equal(held.length, 4);
        const requested = page.waitForRequest(/\/landscape\/(?:\d+\/)?frame-0376\.webp\?/, { timeout: 1000 });
        const start = Date.now();
        await page.locator('[data-chapter="boards"]').click();
        await requested;
        const targetStartMs = Date.now() - start;
        await frame(page, 315);
        // The old neighbor requests have not been released yet.
        return { targetStartMs, delayedNeighbors: held.length };
      } finally { release(); }
    });
    await check('recovery survives repeated slow probes at an unchanged endpoint', async page => {
      const requests = [];
      page.on('request', request => { if (request.url().includes('/720/')) requests.push(request.url()); });
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'connection', { value: { saveData: false, downlink: 1.6, effectiveType: '4g', addEventListener() {} } });
        window.auditDecodeSlow = true;
        window.auditDecodeSamples = [];
        const decode = window.createImageBitmap.bind(window);
        window.createImageBitmap = async (...args) => {
          const bitmap = await decode(...args);
          if (window.auditDecodeSlow && bitmap.width >= 720) await new Promise(resolve => setTimeout(resolve, 80));
          window.auditDecodeSamples.push({ width: bitmap.width, at: performance.now(), slow: window.auditDecodeSlow });
          return bitmap;
        };
      });
      await page.goto(base);
      await frame(page, 0);
      for (let i = 1; i <= 12; i++) {
        await page.evaluate(i => scrollTo(0, i * 10 / 420 * (document.querySelector('#story').offsetHeight - document.querySelector('#stage').offsetHeight)), i);
        await page.waitForTimeout(40);
      }
      await page.evaluate(() => scrollTo(0, document.querySelector('#story').offsetHeight - document.querySelector('#stage').offsetHeight));
      await frame(page, 420);
      await page.waitForFunction(() => window.auditDecodeSamples.filter(row => row.width === 720).length >= 12, null, { timeout: 70000 });
      const before = await state(page);
      assert.equal(before.stage.resolution, '540');
      await page.waitForTimeout(300);
      await page.evaluate(() => { window.auditDecodeSlow = false; });
      await page.waitForFunction(() => document.querySelector('#stage').dataset.resolution === '1080', null, { timeout: 26000 });
      await frame(page, 420);
      assert.equal(new Set(requests).size, requests.length, 'Repeated recovery probes must not redownload the same asset');
      return { before, mediumRequests: requests.length, samples: await page.evaluate(() => window.auditDecodeSamples.filter(row => row.width === 720)) };
    }, { viewport: { width: 443, height: 840 }, screen: { width: 443, height: 986 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    for (const [width, height] of [[1440, 900], [390, 844], [320, 568], [568, 320]]) {
      await check(`disclosure keeps keyboard focus visible at ${width}x${height}`, async page => {
        await page.goto(new URL('?background=off', base).href);
        await frame(page, 0);
        await page.locator('[data-chapter="boards"]').click();
        await frame(page, 315);
        const summary = page.locator('#instructions summary');
        const isOpen = () => page.locator('#instructions').evaluate(element => element.open);
        await summary.focus();
        await page.keyboard.press('Enter');
        for (let i = 0; i < 3; i++) {
          await page.keyboard.press('Tab');
          assert.equal(await isOpen(), true, 'Moving within the disclosure must keep it open');
        }
        await page.keyboard.press('Shift+Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'motion-toggle');
        assert.equal(await isOpen(), true);
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'enlarge-connector');
        assert.equal(await isOpen(), false, 'Leaving the disclosure must reveal the focused connector');
        const exposed = await page.locator('#enlarge-connector').evaluate(element => {
          const box = element.querySelector('span').getBoundingClientRect();
          return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
        });
        assert.ok(exposed);
        await page.screenshot({ path: output.replace('.json', `-focus-${width}x${height}.png`) });
        // Escape must also work if the disclosure opens without moving focus.
        await page.evaluate(() => { document.querySelector('#instructions').open = true; });
        await page.keyboard.press('Escape');
        assert.equal(await isOpen(), false);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'enlarge-connector');
        await summary.focus();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Escape');
        assert.equal(await isOpen(), false);
        assert.ok(await summary.evaluate(element => document.activeElement === element));
        // The connector modal keeps its native Escape and focus return behavior.
        await page.locator('#enlarge-connector').click();
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#connector-dialog').evaluate(element => element.open), false);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'enlarge-connector');
        return { width, height, exposed };
      }, { viewport: { width, height } });
    }
    report.completed = true;
  } finally {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

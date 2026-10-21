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
    report.completed = true;
  } finally {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

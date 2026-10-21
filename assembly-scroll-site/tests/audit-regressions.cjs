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
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      await check(`chapter URL and history navigation at ${width}x${height}`, async page => {
        const url = new URL(base);
        url.searchParams.set('background', 'off');
        url.hash = 'step-lora';
        await page.goto(url.href);
        await frame(page, 180);
        assert.equal(await page.locator('[aria-current="step"]').getAttribute('data-chapter'), 'lora');
        for (const [chapter, index] of [['boards', 315], ['wifi', 90]]) {
          await page.locator(`[data-chapter="${chapter}"]`).click();
          await frame(page, index);
          assert.equal(new URL(page.url()).hash, `#step-${chapter}`);
        }
        await page.goBack(); await frame(page, 315);
        await page.goBack(); await frame(page, 180);
        await page.goForward(); await frame(page, 315);
        await page.reload(); await frame(page, 315);
        const entries = await page.evaluate(() => history.length);
        await page.evaluate(() => scrollTo(0, 350 / 420 * (document.querySelector('#story').offsetHeight - document.querySelector('#stage').offsetHeight)));
        await frame(page, 350);
        await page.waitForFunction(() => document.querySelector('#stage').dataset.settled === 'true');
        assert.equal(await page.evaluate(() => history.length), entries, 'Scrolling must not add history entries');
        await page.waitForFunction(() => Math.abs(history.state.assemblyScroll.progress - 350 / 420) < 0.0001);
        await page.reload(); await frame(page, 350);
        await page.locator('[data-chapter="assembled"]').click(); await frame(page, 420);
        await page.goBack(); await frame(page, 350);
        await page.goForward(); await frame(page, 420);
        await page.evaluate(() => { location.hash = '#step-wifi'; });
        await frame(page, 90);
        const sameChapterEntries = await page.evaluate(() => history.length);
        await page.locator('[data-chapter="wifi"]').click(); await frame(page, 90);
        assert.equal(await page.evaluate(() => history.length), sameChapterEntries);
        await page.goBack(); await frame(page, 420);
        // History navigation remains usable while the connector modal is open.
        await page.goForward(); await frame(page, 90);
        await page.locator('#enlarge-connector').click();
        await page.goBack(); await frame(page, 420);
        assert.equal(await page.locator('#connector-dialog').evaluate(element => element.open), false);
        return { entries, hash: new URL(page.url()).hash };
      }, { viewport: { width, height }, deviceScaleFactor: 2 });
    }
    await check('chapter history removes page version labels without losing state', async page => {
      await page.addInitScript(() => {
        window.initialHistoryLength = history.length;
        history.replaceState({ ...history.state, unrelatedState: 'preserved' }, '');
      });
      const url = new URL(base);
      url.search = '?v=audit-fixes-4&background=off&v=progressive-loading&note=hello%20world';
      url.hash = 'step-lora';
      await page.goto(url.href); await frame(page, 180);
      const clean = new URL(page.url());
      assert.equal(clean.searchParams.has('v'), false);
      assert.equal(clean.searchParams.get('background'), 'off');
      assert.equal(clean.searchParams.get('note'), 'hello world');
      assert.equal(clean.hash, '#step-lora');
      assert.equal(await page.evaluate(() => history.length === window.initialHistoryLength), true);
      assert.equal(await page.evaluate(() => history.state.unrelatedState), 'preserved');
      await page.locator('[data-chapter="boards"]').click(); await frame(page, 315);
      await page.goBack(); await frame(page, 180);
      assert.equal(new URL(page.url()).searchParams.has('v'), false);
      await page.goForward(); await frame(page, 315);
      // A bookmarked label must not reset progress already saved on this entry.
      await page.evaluate(() => {
        const url = new URL(location.href); url.searchParams.set('v', 'old-bookmark');
        history.replaceState({ ...history.state, assemblyScroll: { hash: location.hash, progress: 350 / 420 } }, '', url);
      });
      await page.reload(); await frame(page, 350);
      assert.equal(new URL(page.url()).searchParams.has('v'), false);
      assert.equal(await page.evaluate(() => history.state.unrelatedState), 'preserved');
      await page.goto(new URL('?v=', base).href); await frame(page, 0);
      assert.equal(new URL(page.url()).search, '');
      return { cleanedURL: page.url() };
    });
    await check('chapter history preserves reduced motion', async page => {
      const url = new URL(base); url.hash = 'step-lora';
      await page.goto(url.href); await frame(page, 234);
      await page.locator('[data-chapter="boards"]').click(); await frame(page, 363);
      await page.goBack(); await frame(page, 234);
      await page.reload(); await frame(page, 234);
      assert.equal((await state(page)).stage.mode, 'reduced');
    }, { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await check('chapter history restores an unfragmented entry and preserves modified clicks', async (page, context) => {
      const url = new URL(base); url.hash = ''; url.searchParams.set('background', 'off');
      await page.goto(url.href); await frame(page, 0);
      await page.evaluate(() => scrollTo(0, 129 / 420 * (document.querySelector('#story').offsetHeight - document.querySelector('#stage').offsetHeight)));
      await frame(page, 129);
      await page.locator('[data-chapter="boards"]').click(); await frame(page, 315);
      await page.goBack(); await frame(page, 129);
      assert.equal(new URL(page.url()).hash, '');
      await page.goForward(); await frame(page, 315);
      const popupPromise = context.waitForEvent('page');
      await page.locator('[data-chapter="lora"]').click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
      const popup = await popupPromise;
      await popup.waitForLoadState(); await frame(popup, 180);
      assert.equal(new URL(popup.url()).hash, '#step-lora');
      assert.equal((await state(page)).canvas.frame, '315');
      await popup.close();
    });
    await check('reduced-motion scrolling saves history only after a pause', async page => {
      await page.addInitScript(() => {
        window.historyWrites = 0;
        const replace = history.replaceState.bind(history);
        history.replaceState = (...args) => { window.historyWrites++; return replace(...args); };
      });
      await page.goto(base); await frame(page, 33);
      await page.evaluate(() => { window.historyWrites = 0; });
      for (let i = 1; i <= 20; i++) {
        await page.evaluate(i => scrollTo(0, i / 40 * (document.querySelector('#story').offsetHeight - document.querySelector('#stage').offsetHeight)), i);
        await page.waitForTimeout(40);
      }
      assert.equal(await page.evaluate(() => window.historyWrites), 0);
      await page.waitForFunction(() => history.state.assemblyScroll.progress === 0.5);
      assert.equal(await page.evaluate(() => window.historyWrites), 1);
    }, { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    report.completed = true;
  } finally {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

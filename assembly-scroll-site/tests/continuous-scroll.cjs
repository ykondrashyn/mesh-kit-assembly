const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.argv[2] || 'http://127.0.0.1:8766/';
const output = process.env.VALIDATION_OUTPUT || path.resolve(__dirname, '../validation/continuous-scroll.json');
const profiles = [
  { name: 'desktop', width: 1440, height: 900, slow: false },
  { name: 'desktop-throttled', width: 1440, height: 900, slow: true },
  { name: 'phone-throttled', width: 390, height: 844, slow: true },
];
const state = page => page.evaluate(() => ({
  stage: { ...document.querySelector('#stage').dataset },
  canvas: { ...document.querySelector('canvas').dataset },
}));
const waitFrame = (page, frame) => page.waitForFunction(index =>
  Number(document.querySelector('canvas').dataset.frame) === index &&
  document.querySelector('#stage').dataset.settled === 'true', frame, { timeout: 20000 });

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const report = { url: base, browser: await browser.version(), completed: false, profiles: [] };
  try {
    for (const profile of profiles) {
      const context = await browser.newContext({
        viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      const errors = [], requests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (request.url().includes('.webp')) requests.push(request.url()); });
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      if (profile.slow) {
        await cdp.send('Network.emulateNetworkConditions', {
          offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 75000,
        });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      }
      await page.goto(base);
      await waitFrame(page, 0);
      const initial = await state(page);
      const span = await page.evaluate(() =>
        document.querySelector('#story').offsetHeight - document.querySelector('#stage').offsetHeight);
      assert.equal(span, profile.height * 12);
      const inactive = initial.stage.orientation === 'portrait' ? 'landscape' : 'portrait';
      assert.ok(requests.every(url => !url.includes(`/${inactive}/`)));
      await page.evaluate(() => {
        window.motionSamples = [];
        const sample = () => window.motionSamples.push({
          time: performance.now(), frame: Number(document.querySelector('canvas').dataset.frame),
          requested: Number(document.querySelector('#stage').dataset.requestedFrame),
          mode: document.querySelector('#stage').dataset.mode,
          resolution: document.querySelector('#stage').dataset.resolution,
        });
        new MutationObserver(sample).observe(document.querySelector('canvas'), {
          attributes: true, attributeFilter: ['data-frame'],
        });
      });
      const legs = [];
      for (const direction of [1, -1]) {
        await page.evaluate(() => { window.motionSamples = []; });
        const start = Date.now();
        // Native wheel events continue while frames load. Do not wait for each frame.
        for (let i = 0; i < 100; i++) {
          await page.mouse.wheel(0, direction * span / 95);
          await page.waitForTimeout(80);
        }
        const samples = await page.evaluate(() => window.motionSamples.slice());
        const frames = samples.filter((item, i) => i === 0 || item.frame !== samples[i - 1].frame);
        const nonChapter = new Set(frames.map(item => item.frame).filter(frame => ![33, 129, 234, 363, 420].includes(frame)));
        assert.ok(nonChapter.size >= 10, `${profile.name}: continuous motion had only ${nonChapter.size} intermediate poses`);
        assert.ok(samples.every(item => item.mode === 'animation'), 'Scrolling must not select still mode');
        for (let i = 1; i < frames.length; i++) {
          assert.ok((frames[i].frame - frames[i - 1].frame) * direction >= 0, 'Late results must not reverse the picture');
        }
        try {
          await waitFrame(page, direction > 0 ? 420 : 0);
        } catch (error) {
          console.error({ profile: profile.name, direction, state: await state(page),
            scroll: await page.evaluate(() => ({ y: scrollY, height: document.documentElement.scrollHeight, viewport: innerHeight })) });
          throw error;
        }
        const stopped = await state(page);
        await page.waitForTimeout(350);
        assert.equal((await state(page)).canvas.frame, stopped.canvas.frame);
        legs.push({ direction, durationMs: Date.now() - start, updates: frames.length,
          intermediatePoses: nonChapter.size, samples: frames, stopped });
      }
      const final = await state(page);
      assert.equal(final.stage.mode, 'animation');
      assert.ok(Number(final.stage.maxDecodedFrames) <= 12);
      assert.ok(Number(final.stage.maxDecodedBytes) <= 48 * 1024 * 1024);
      assert.ok(Number(final.stage.maxRequests) <= 4);
      if (profile.slow) {
        assert.equal(final.stage.resolution, '540');
        assert.ok(Number(final.stage.qualityDrops) >= 1);
      }
      assert.deepEqual(errors, []);
      const result = { profile, initial, final, legs, requests: requests.length, errors, passed: true };
      report.profiles.push(result);
      console.log(JSON.stringify({ profile: profile.name, resolution: final.stage.resolution,
        drops: final.stage.qualityDrops || 0, forwardUpdates: legs[0].updates, reverseUpdates: legs[1].updates }));
      await page.getByRole('link', { name: '03 LoRa', exact: true }).click();
      await waitFrame(page, 150);
      await page.evaluate(() => window.scrollTo(0, 234 / 420 *
        (document.querySelector('#story').offsetHeight - document.querySelector('#stage').offsetHeight)));
      await waitFrame(page, 234);
      await page.screenshot({ path: output.replace('.json', `-${profile.name}.png`) });
      await context.close();
    }
    report.completed = true;
    report.limitations = ['Chromium on macOS, phone viewport emulation. No physical phone, Safari or Firefox checks.',
      'Throttled profiles use 1.6 Mbps download, 150 ms latency and 4x CPU slowdown with a cold cache.'];
  } finally {
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

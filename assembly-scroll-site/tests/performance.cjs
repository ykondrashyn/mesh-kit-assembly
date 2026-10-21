const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.argv[2] || 'http://127.0.0.1:8766/';
const out = path.resolve(__dirname, '../validation/adaptive-performance.json');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const report = { browser: await browser.version(), scenarios: [] };
  try {
    for (const profile of [
      { name: 'desktop-local', viewport: { width: 1440, height: 900 }, cpu: 1, throttle: false },
      { name: 'simulated-slow-mobile', viewport: { width: 390, height: 844 }, cpu: 4, throttle: true },
    ]) {
      const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.throttle ? 2 : 1 });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
      if (profile.throttle) {
        await cdp.send('Network.emulateNetworkConditions', {
          offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 75000, connectionType: 'cellular4g',
        });
      }
      const frameRequests = new Set();
      let completedFrameRequests = 0, failedFrameRequests = 0, cancelledRequests = 0, bytes = 0;
      cdp.on('Network.requestWillBeSent', e => { if (e.request.url.includes('.webp')) frameRequests.add(e.requestId); });
      cdp.on('Network.loadingFinished', e => {
        if (frameRequests.has(e.requestId)) { completedFrameRequests++; bytes += e.encodedDataLength; }
      });
      cdp.on('Network.loadingFailed', e => { if (frameRequests.has(e.requestId)) { failedFrameRequests++; if (e.canceled) cancelledRequests++; } });
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#assembly').dataset.frame === '0', null, { timeout: 20000 });
      const firstFrameMs = await page.evaluate(() => performance.now());
      const baselineImageResponseEndMs = await page.evaluate(() => performance.getEntriesByType('resource').find(entry => /frame-0034\.webp$/.test(entry.name))?.responseEnd ?? null);
      await page.waitForTimeout(700);
      const experiment = await page.evaluate(async () => {
        const stage = document.querySelector('#stage');
        const canvas = document.querySelector('#assembly');
        let hintMutations = 0, longestFrozenMs = 0, updates = 0, loadingSamples = 0, samples = 0, maxLag = 0;
        let lastFrame = Number(canvas.dataset.frame);
        const started = performance.now();
        let lastChange = started;
        const mutation = new MutationObserver(records => { hintMutations += records.length; });
        mutation.observe(document.querySelector('#scroll-hint'), { childList: true });
        const intervals = [];
        let previousTick = started;
        let firstQualityReductionMs = null, longestAnimationFreezeMs = 0, chapterMismatches = 0, maximumContinuousFrameLag = 0;
        await new Promise(resolve => {
          function tick(now) {
            const elapsed = now - started;
            window.scrollTo(0, 2500 * Math.min(1, elapsed / 4000));
            intervals.push(now - previousTick);
            previousTick = now;
            const frame = Number(canvas.dataset.frame);
            if (Number(stage.dataset.qualityDrops) > 0 && firstQualityReductionMs === null) firstQualityReductionMs = elapsed;
            if (stage.dataset.mode === 'animation') longestAnimationFreezeMs = Math.max(longestAnimationFreezeMs, now - lastChange);
            const expectedChapter = frame >= 375 ? 'assembled' : frame >= 255 ? 'boards' : frame >= 150 ? 'lora' : frame >= 45 ? 'wifi' : 'parts';
            if (document.querySelector('[aria-current=step]')?.dataset.chapter !== expectedChapter) chapterMismatches++;
            if (frame !== lastFrame) {
              longestFrozenMs = Math.max(longestFrozenMs, now - lastChange);
              lastChange = now;
              lastFrame = frame;
              updates++;
            }
            const lag = Math.abs(Number(stage.dataset.requestedFrame) - frame);
            maxLag = Math.max(maxLag, lag);
            if (stage.dataset.mode === 'animation') maximumContinuousFrameLag = Math.max(maximumContinuousFrameLag, lag);
            if (!document.querySelector('#load-state').hidden) loadingSamples++;
            samples++;
            if (elapsed < 4000) requestAnimationFrame(tick);
            else {
              longestFrozenMs = Math.max(longestFrozenMs, now - lastChange);
              resolve();
            }
          }
          requestAnimationFrame(tick);
        });
        mutation.disconnect();
        intervals.sort((a, b) => a - b);
        return {
          durationMs: performance.now() - started, scrollDistancePx: 2500,
          firstQualityReductionMs, longestAnimationFreezeMs, maximumContinuousFrameLag, chapterMismatches,
          finalMode: stage.dataset.mode, qualityLagMs: Number(stage.dataset.qualityLagMs || 0), qualityDrops: Number(stage.dataset.qualityDrops || 0), finalResolution: stage.dataset.resolution,
          maximumDecodedBytes: Number(stage.dataset.maxDecodedBytes), maximumRequests: Number(stage.dataset.maxRequests),
          frameUpdatesDuringScroll: updates, longestFrozenMs, maximumFrameLag: maxLag,
          loadingSampleFraction: loadingSamples / samples, scrollHintDomReplacements: hintMutations,
          rafIntervalP95Ms: intervals[Math.floor(intervals.length * .95)],
          displayedFrameAtScrollEnd: Number(canvas.dataset.frame), requestedFrameAtScrollEnd: Number(stage.dataset.requestedFrame),
          displayedOrientation: canvas.dataset.orientation, decodedFrameLimitObserved: Number(stage.dataset.maxDecodedFrames),
          accessibleCanvasDescription: canvas.getAttribute('aria-label'),
          visibleText: document.body.innerText,
          canvasCssSize: { width: canvas.getBoundingClientRect().width, height: canvas.getBoundingClientRect().height },
          canvasBackingSize: { width: canvas.width, height: canvas.height },
        };
      });
      const beforeSettle = Date.now();
      let recovered = true;
      try {
        await page.waitForFunction(() => {
          const stage = document.querySelector('#stage');
          const count = 421;
          const span = document.querySelector('#story').offsetHeight - stage.offsetHeight;
          const position = Math.round(window.scrollY / span * (count - 1));
          const expected = stage.dataset.mode === 'animation' ? position :
            position >= 375 ? 420 : position >= 255 ? 363 : position >= 150 ? 234 : position >= 45 ? 129 : 33;
          return Number(document.querySelector('#assembly').dataset.frame) === expected && stage.dataset.settled === 'true';
        }, null, { timeout: 20000 });
      } catch { recovered = false; }
      report.scenarios.push({ profile, firstFrameMs, baselineImageResponseEndMs, ...experiment,
        recoveredAfterStopping: recovered, recoveryAfterStoppingMs: Date.now() - beforeSettle,
        frameRequests: frameRequests.size, completedFrameRequests, failedFrameRequests,
        completedFrameTransferBytes: bytes, cancelledRequests });
      assert.ok(recovered);
      assert.ok(experiment.maximumDecodedBytes <= 48 * 1024 * 1024);
      assert.ok(experiment.maximumRequests <= 4);
      assert.equal(experiment.scrollHintDomReplacements, 0);
      assert.equal(experiment.chapterMismatches, 0);
      if (profile.throttle) {
        assert.equal(experiment.finalMode, 'animation');
        assert.equal(experiment.finalResolution, '540');
        assert.ok(experiment.qualityDrops >= 1);
        assert.ok(experiment.qualityLagMs >= 800 && experiment.qualityLagMs < 1150);
      } else assert.equal(experiment.finalMode, 'animation');
      console.log(JSON.stringify(report.scenarios.at(-1), null, 2));
      await context.close();
    }

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.route(/\/app\.js(?:\?|$)/, route => route.abort('failed'));
    await page.goto(base);
    await page.waitForTimeout(500);
    report.scriptFailure = await page.evaluate(() => ({
      renderedFrame: document.querySelector('#assembly').dataset.frame || null,
      fallbackImages: document.querySelectorAll('.fallback img').length,
      fallbackLoaded: document.querySelector('.fallback img')?.naturalWidth > 0,
      instructionsOpen: document.querySelector('#instructions').open,
      errorVisible: !document.querySelector('#load-state').hidden,
      bodyText: document.body.innerText,
    }));
    await page.screenshot({ path: out.replace('.json', '-script-failure.png') });
    await context.close();

    const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const reducedPage = await reduced.newPage();
    await reducedPage.goto(base);
    await reducedPage.waitForFunction(() => document.querySelector('#assembly').dataset.frame === '33');
    await reducedPage.getByText('Instructions & options', { exact: true }).click();
    report.reducedMotion = await reducedPage.evaluate(() => ({
      frame: document.querySelector('#assembly').dataset.frame,
      modeToggleVisible: document.querySelector('#motion-toggle').checkVisibility(),
      navigationTargets: [...document.querySelectorAll('nav a')].map(b => ({
        name: b.innerText, width: b.getBoundingClientRect().width, height: b.getBoundingClientRect().height,
      })),
    }));
    await reduced.close();
    assert.equal(report.scriptFailure.fallbackLoaded, true);
    assert.equal(report.scriptFailure.instructionsOpen, true);
    const baseline = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../validation/best-practices-audit.json')));
    report.comparison = report.scenarios.map((result, index) => ({
      profile: result.profile.name, baselineFrozenMs: baseline.scenarios[index].longestFrozenMs,
      continuousAnimationFreezeMs: result.longestAnimationFreezeMs, qualityReductionAtMs: result.firstQualityReductionMs,
      baselineHintReplacements: baseline.scenarios[index].scrollHintDomReplacements, hintReplacements: result.scrollHintDomReplacements,
    }));
    report.limitations = [
      'Synthetic Chromium checks on this Mac with a localhost server.',
      'Network profile is 1.6 Mbps download, 150 ms latency and 4x CPU slowdown with browser cache disabled.',
      'These are laboratory measurements, not real-device results or field Core Web Vitals.',
      'Animation stays active under throttling. Slow-network frames may be skipped while catching up.',
      'Safari, Firefox and physical mobile devices were not tested.',
    ];
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ scriptFailure: report.scriptFailure, reducedMotion: report.reducedMotion }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });

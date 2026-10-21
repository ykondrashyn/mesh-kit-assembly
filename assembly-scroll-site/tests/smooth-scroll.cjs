const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../dist/assets/manifest.json')));
const target = id => manifest.chapters.find(chapter => chapter.id === id).targetIndex;

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const results = [];
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      await page.goto(process.argv[2] || 'http://127.0.0.1:8766/');
      await page.waitForFunction(() => document.querySelector('#assembly').dataset.frame === '0');
      const span = await page.evaluate(() =>
        document.querySelector('#story').offsetHeight - document.querySelector('#stage').offsetHeight);
      assert.equal(span, viewport.height * 12);
      await page.waitForTimeout(250);
      await page.evaluate(() => {
        window.observedFrames = [];
        window.observeMotion = true;
        function sample(now) {
          if (!window.observeMotion) return;
          const value = Number(document.querySelector('#assembly').dataset.frame);
          if (window.observedFrames.at(-1)?.frame !== value) {
            window.observedFrames.push({ frame: value, time: now });
          }
          requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
      await page.mouse.wheel(0, 480);
      await page.waitForFunction(() => Number(document.querySelector('#stage').dataset.targetProgress) > 0);
      await page.waitForFunction(() => document.querySelector('#stage').dataset.settled === 'true');
      const forward = await page.evaluate(() => window.observedFrames.slice());
      const end = Math.round(480 / span * 420);
      assert.equal(forward.at(-1).frame, end);
      assert.ok(forward.length >= 6, 'A wheel impulse should display intermediate poses');
      for (let i = 1; i < forward.length; i++) {
        const advance = forward[i].frame - forward[i - 1].frame;
        assert.ok(advance >= 0 && advance <= 5, `Unexpected wheel frame jump: ${advance}`);
      }
      await page.evaluate(() => { window.observedFrames = []; });
      await page.mouse.wheel(0, -240);
      await page.waitForFunction(() => Number(document.querySelector('#stage').dataset.targetProgress) < .04);
      await page.waitForFunction(() => document.querySelector('#stage').dataset.settled === 'true');
      const backward = await page.evaluate(() => window.observedFrames.slice());
      assert.equal(backward.at(-1).frame, Math.round(240 / span * 420));
      for (let i = 1; i < backward.length; i++) {
        assert.ok(backward[i].frame <= backward[i - 1].frame);
      }
      const stoppedFrame = backward.at(-1).frame;
      await page.waitForTimeout(400);
      assert.equal(await page.locator('#assembly').getAttribute('data-frame'), String(stoppedFrame));
      await page.getByRole('link', { name: '03 LoRa', exact: true }).click();
      await page.waitForFunction(index => Number(document.querySelector('#assembly').dataset.frame) === index, target('lora'));
      assert.equal(await page.locator('#stage').getAttribute('data-settled'), 'true');
      results.push({ viewport, scrollHeight: span, forward, backward, settledWithoutOvershoot: true });
      await page.evaluate(() => { window.observeMotion = false; });
      await page.close();
    }
    fs.writeFileSync(path.resolve(__dirname, '../validation/smooth-scroll.json'),
      JSON.stringify({ passed: true, browser: await browser.version(), results }, null, 2) + '\n');
    console.log('PASS longer scroll travel, intermediate poses, smooth reverse, stable settling and direct chapter navigation in both layouts');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack); process.exit(1); });

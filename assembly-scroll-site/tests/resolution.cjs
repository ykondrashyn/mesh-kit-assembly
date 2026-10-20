const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    for (const profile of [
      { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, orientation: 'landscape', resolution: '1080' },
      { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, orientation: 'portrait', resolution: '540' },
      { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, orientation: 'portrait', resolution: '720' },
    ]) {
      const context = await browser.newContext(profile);
      const page = await context.newPage();
      const requests = [], errors = [];
      page.on('request', request => requests.push(request.url()));
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(process.argv[2] || 'http://127.0.0.1:8766/');
      await page.waitForFunction(() => document.querySelector('canvas').dataset.frame === '0');
      const actual = await page.locator('#stage').evaluate(stage => ({ orientation: stage.dataset.orientation, resolution: stage.dataset.resolution }));
      assert.equal(actual.orientation, profile.orientation);
      assert.equal(actual.resolution, profile.resolution);
      assert.ok(!requests.some(url => url.includes(profile.orientation === 'portrait' ? '/landscape/' : '/portrait/')));
      assert.deepEqual(errors, []);
      console.log(`PASS ${profile.orientation} DPR ${profile.deviceScaleFactor}: ${actual.resolution}p`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

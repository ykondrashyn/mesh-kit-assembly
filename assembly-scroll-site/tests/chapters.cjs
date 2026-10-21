const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const base = process.argv[2] || 'http://127.0.0.1:8766/';
const output = process.env.VALIDATION_OUTPUT || path.resolve(__dirname, '../validation/chapter-navigation.json');
const manifestBytes = fs.readFileSync(path.resolve(__dirname, '../dist/assets/manifest.json'));
// Visually reviewed in both orientations, after the fades and before pressing.
// Independent expectations catch accidental reuse of the transition boundaries.
const entries = [
  { id: 'wifi', index: 90, source: 151, seated: 129 },
  { id: 'lora', index: 180, source: 241, seated: 234 },
  { id: 'boards', index: 315, source: 376, seated: 363 },
];
const waitFrame = (page, index) => page.waitForFunction(i =>
  Number(document.querySelector('#assembly').dataset.frame) === i &&
  document.querySelector('#stage').dataset.settled === 'true', index, { timeout: 20000 });

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const report = { url: base, browser: await browser.version(), completed: false,
    manifestSHA256: createHash('sha256').update(manifestBytes).digest('hex'), checks: [] };
  try {
    for (const [orientation, width, height] of [['landscape', 1440, 900], ['portrait', 390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base);
      await waitFrame(page, 0);
      const served = await context.request.get(new URL('./assets/manifest.json', base).href);
      assert.equal(createHash('sha256').update(await served.body()).digest('hex'), report.manifestSHA256);
      assert.equal(await page.locator('#assembly').getAttribute('data-orientation'), orientation);
      await page.evaluate(() => {
        window.chapterFrames = [];
        new MutationObserver(() => window.chapterFrames.push(Number(document.querySelector('#assembly').dataset.frame)))
          .observe(document.querySelector('#assembly'), { attributes: true, attributeFilter: ['data-frame'] });
      });
      for (const entry of entries) {
        const link = page.locator(`[data-chapter="${entry.id}"]`);
        // Exercise keyboard activation as well as clicking the bottom navigation.
        if (entry.id === 'boards') {
          await link.focus();
          await page.keyboard.press('Enter');
        } else {
          await link.click();
        }
        await waitFrame(page, entry.index);
        assert.equal(await link.getAttribute('aria-current'), 'step');
        assert.equal(await page.locator('#assembly').getAttribute('data-source-frame'), String(entry.source));
        // Index-only tests previously accepted a blank fade frame. Check rendered
        // pixels in both the main scene and the circular connector region too.
        const ink = await page.evaluate(orientation => {
          const canvas = document.querySelector('#assembly');
          const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
          const regions = orientation === 'landscape'
            ? { assembly: [.04, .18, .57, .75], connector: [.66, .21, .97, .79] }
            : { assembly: [.04, .16, .93, .56], connector: [.23, .57, .87, .89] };
          return Object.fromEntries(Object.entries(regions).map(([name, [l, t, r, b]]) => {
            let dark = 0, total = 0;
            for (let y = Math.floor(t * canvas.height); y < b * canvas.height; y++) {
              for (let x = Math.floor(l * canvas.width); x < r * canvas.width; x++) {
                if (pixels.data[(y * canvas.width + x) * 4] < 200) dark++;
                total++;
              }
            }
            return [name, dark / total];
          }));
        }, orientation);
        assert.ok(ink.assembly > .0015, `${orientation} ${entry.id}: main parts are blank`);
        assert.ok(ink.connector > .0015, `${orientation} ${entry.id}: connector close-up is blank`);
        await page.screenshot({ path: output.replace('.json', `-${orientation}-${entry.id}.png`) });
        await page.waitForTimeout(300);
        assert.equal(await page.locator('#assembly').getAttribute('data-frame'), String(entry.index));

        // Continue with native wheel events through seating, then reverse to the
        // same entry pose without waiting for individual animation frames.
        const legs = [];
        for (const end of [entry.seated, entry.index]) {
          await page.evaluate(() => { window.chapterFrames = []; });
          const delta = await page.evaluate(index => {
            const span = document.querySelector('#story').offsetHeight - document.querySelector('#stage').offsetHeight;
            return index / 420 * span - scrollY;
          }, end);
          await page.mouse.move(width / 2, height / 2);
          for (let step = 0; step < 16; step++) {
            await page.mouse.wheel(0, delta / 16);
            await page.waitForTimeout(50);
          }
          await waitFrame(page, end);
          const samples = await page.evaluate(() => window.chapterFrames.slice());
          assert.ok(new Set(samples).size >= 3, 'Wheel scrolling must show intermediate poses');
          for (let i = 1; i < samples.length; i++) {
            assert.ok((samples[i] - samples[i - 1]) * Math.sign(delta) >= 0, 'Frames must follow scroll direction');
          }
          assert.equal(await page.locator('#stage').getAttribute('data-mode'), 'animation');
          legs.push({ end, updates: samples.length });
        }
        report.checks.push({ orientation, ...entry, ink, legs, passed: true });
        console.log(`PASS ${orientation} ${entry.id}: visible parts and inset, forward seating and reverse scroll`);
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    report.completed = true;
    report.limitations = ['Chromium on macOS with a phone viewport. No physical phone, Safari or Firefox checks.'];
  } finally {
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

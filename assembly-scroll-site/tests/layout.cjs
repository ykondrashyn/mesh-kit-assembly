const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../dist/assets/manifest.json')));
const target = id => manifest.chapters.find(chapter => chapter.id === id).targetIndex;
const base = process.argv[2] || 'http://127.0.0.1:8766/';
const output = process.env.VALIDATION_OUTPUT || path.resolve(__dirname, '../validation/clean-layout.json');
const frame = (page, index) => page.waitForFunction(i =>
  document.querySelector('canvas').dataset.frame === String(i) &&
  document.querySelector('#stage').dataset.settled === 'true', index);
const geometry = page => page.evaluate(() => ({
  image: document.querySelector('canvas').getBoundingClientRect().toJSON(),
  progress: document.querySelector('#stage').dataset.targetProgress,
  footer: document.querySelector('.controls').getBoundingClientRect().toJSON(),
  viewport: { width: innerWidth, height: innerHeight },
}));

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const report = { url: base, browser: await browser.version(), completed: false, checks: [] };
  try {
    for (const [name, width, height] of [
      ['desktop', 1440, 900], ['tablet', 768, 1024], ['phone', 390, 844],
      ['small-phone', 320, 568], ['short-landscape', 844, 390],
    ]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base);
      await frame(page, 0);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.ok(await page.locator('#scroll-hint').isVisible());
      assert.equal(await page.locator('.progress-track').count(), 1);
      assert.equal(await page.locator('#instructions').evaluate(details => details.open), false);
      assert.equal(await page.locator('#motion-toggle').isVisible(), false);
      assert.equal(await page.locator('.masthead #instructions').count(), 1);
      assert.equal(await page.locator('.controls').innerText(), '01\nParts\n02\nWi-Fi\n03\nLoRa\n04\nBoards\n✓\nAssembled');
      await page.mouse.wheel(0, 480);
      await page.waitForFunction(() => Number(document.querySelector('canvas').dataset.frame) > 0);
      assert.equal(await page.locator('#scroll-hint').isVisible(), false);
      await page.evaluate(() => scrollTo(0, 129 / 420 *
        (document.querySelector('#story').offsetHeight - document.querySelector('#stage').offsetHeight)));
      await frame(page, 129);
      const before = await geometry(page);
      assert.ok(before.image.bottom <= before.footer.top + 1);
      assert.ok(before.footer.bottom <= height);
      assert.ok(height - before.footer.bottom <= 14);
      assert.equal(await page.locator('canvas').getAttribute('data-orientation'),
        width > height ? 'landscape' : 'portrait');
      await page.screenshot({ path: output.replace('.json', `-${name}.png`) });

      // Opening the disclosure must not shrink the drawing or move the timeline.
      await page.locator('#instructions summary').focus();
      await page.keyboard.press('Enter');
      assert.ok(await page.locator('#motion-toggle').isVisible());
      assert.deepEqual(await geometry(page), before);
      const panel = await page.locator('.instruction-body').boundingBox();
      assert.ok(panel.x >= 0 && panel.x + panel.width <= width);
      assert.ok(panel.y + panel.height <= before.footer.top);
      await page.getByRole('button', { name: 'Use chapter stills', exact: true }).click();
      await frame(page, 129);
      assert.equal(await page.locator('#stage').getAttribute('data-mode'), 'manual');
      await page.getByRole('button', { name: 'Enable full animation', exact: true }).click();
      assert.equal(await page.locator('#stage').getAttribute('data-mode'), 'animation');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#instructions').evaluate(details => details.open), false);
      assert.ok(await page.locator('#instructions summary').evaluate(summary => document.activeElement === summary));
      await page.keyboard.press('Enter');
      await page.mouse.click(30, height - 100);
      assert.equal(await page.locator('#instructions').evaluate(details => details.open), false);
      await page.keyboard.press('Home');
      await frame(page, 0);
      assert.equal(await page.locator('#scroll-hint').isVisible(), false);

      if (name === 'phone') {
        await page.getByRole('link', { name: '02 Wi-Fi', exact: true }).click();
        await frame(page, target('wifi'));
        await page.locator('#instructions summary').click();
        await page.addStyleTag({ content: '#instructions {font-size:30px} nav a, #motion-options, #instructions summary {font-size:26px}' });
        await page.locator('.instruction-body').focus();
        await page.keyboard.press('End');
        await page.waitForFunction(() => document.querySelector('.instruction-body').scrollTop > 0);
        const enlarged = await page.locator('.instruction-body').boundingBox();
        assert.ok(enlarged.x >= 0 && enlarged.x + enlarged.width <= width);
        assert.ok(enlarged.y + enlarged.height <= (await geometry(page)).footer.top);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: output.replace('.json', '-enlarged-instructions.png') });
      }
      assert.deepEqual(errors, []);
      report.checks.push({ name, passed: true, geometry: before, panel });
      await page.close();
    }
    report.completed = true;
    report.limitations = ['Chromium viewport emulation on macOS. Safari, Firefox and physical devices were not tested.'];
  } finally {
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
  console.log(`PASS ${report.checks.length} layouts, keyboard disclosure, optional stills, hint dismissal and enlarged text`);
})().catch(error => { console.error(error); process.exitCode = 1; });

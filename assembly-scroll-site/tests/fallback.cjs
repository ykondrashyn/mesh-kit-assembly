const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.argv[2] || 'http://127.0.0.1:8766/';
const results = [];
const visibleFrame = (p, frame) => p.waitForFunction(i => document.querySelector('canvas').dataset.frame === String(i), frame);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    for (const failure of ['javascript-disabled', 'script-blocked', 'manifest-blocked']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: failure !== 'javascript-disabled' });
      const p = await context.newPage();
      if (failure === 'script-blocked') await p.route(/\/app\.js(?:\?|$)/, r => r.abort('failed'));
      if (failure === 'manifest-blocked') await p.route('**/manifest.json', r => r.abort('failed'));
      await p.goto(base);
      await p.locator('.fallback img').waitFor({ state: 'visible' });
      assert.ok(await p.locator('.fallback img').evaluate(i => i.complete && i.naturalWidth > 0));
      assert.ok(await p.locator('#instructions').evaluate(d => d.open));
      await p.getByRole('link', { name: '02 Wi-Fi', exact: true }).click();
      assert.ok(await p.locator('#step-wifi').isVisible());
      assert.ok((await p.locator('#step-wifi').innerText()).includes('Press straight down'));
      if (failure === 'manifest-blocked') {
        await p.unroute('**/manifest.json');
        await p.getByRole('button', { name: 'Try again', exact: true }).click();
        await visibleFrame(p, 0);
      }
      results.push({ name: failure, passed: true });
      await p.screenshot({ path: path.resolve(__dirname, `../validation/${failure}.png`) });
      await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const p = await context.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(base); await visibleFrame(p, 0);
    await p.route(/\/landscape\/(?:720\/)?frame-\d+\.webp/, async route => {
      await new Promise(r => setTimeout(r, 1600));
      await route.continue().catch(() => {});
    });
    await p.evaluate(() => {
      window.qualityTiers = [document.querySelector('#stage').dataset.resolution];
      new MutationObserver(() => window.qualityTiers.push(document.querySelector('#stage').dataset.resolution))
        .observe(document.querySelector('#stage'), { attributes: true, attributeFilter: ['data-resolution'] });
    });
    const started = Date.now();
    await p.getByRole('link', { name: '03 LoRa', exact: true }).click();
    await p.waitForFunction(() => document.querySelector('#stage').dataset.resolution === '540');
    await visibleFrame(p, 150);
    const elapsed = Date.now() - started;
    const lag = Number(await p.locator('#stage').getAttribute('data-quality-lag-ms'));
    assert.ok(lag >= 800 && lag < 1050, `Lag timer was ${lag} ms`);
    assert.deepEqual(await p.evaluate(() => window.qualityTiers), ['1080', '720', '540']);
    assert.equal(await p.locator('#stage').getAttribute('data-mode'), 'animation');
    assert.equal(await p.locator('[aria-current="step"]').getAttribute('data-chapter'), 'lora');
    await p.waitForTimeout(1000);
    assert.equal(await p.locator('#stage').getAttribute('data-mode'), 'animation');
    await p.getByRole('button', { name: 'Use chapter stills', exact: true }).click();
    await visibleFrame(p, 234);
    assert.equal(await p.locator('#stage').getAttribute('data-mode'), 'manual');
    await p.getByRole('button', { name: 'Enable full animation', exact: true }).click();
    await visibleFrame(p, 150);
    assert.equal(await p.locator('#stage').getAttribute('data-resolution'), '540');
    results.push({ name: '1080p to 720p to 540p adaptation and optional stills', passed: true, elapsedMs: elapsed, lagMs: lag });
    const failedFrame = /\/540\/frame-0316\.webp/;
    await p.route(failedFrame, route => route.abort('failed'));
    await p.getByRole('link', { name: '04 Boards', exact: true }).click();
    await p.getByRole('button', { name: 'Try again', exact: true }).waitFor({ state: 'visible' });
    await p.waitForTimeout(1000);
    assert.equal(await p.locator('#stage').getAttribute('data-mode'), 'animation');
    assert.equal(await p.locator('#stage').getAttribute('data-resolution'), '540');
    assert.notEqual(await p.locator('canvas').getAttribute('data-frame'), '255');
    await p.unroute(failedFrame);
    await p.getByRole('button', { name: 'Try again', exact: true }).click();
    await visibleFrame(p, 255);
    results.push({ name: '540p failure retains animation mode and retry recovers', passed: true });
    await p.getByRole('link', { name: '03 LoRa', exact: true }).click();
    await visibleFrame(p, 150);
    await p.locator('#instructions summary').click();
    assert.ok(await p.locator('#instructions').evaluate(d => d.open));
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForFunction(() => {
      const area = document.querySelector('#artwork').getBoundingClientRect();
      return document.querySelector('canvas').dataset.orientation === (area.width > area.height ? 'landscape' : 'portrait');
    });
    await visibleFrame(p, 150);
    assert.equal(await p.locator('#stage').getAttribute('data-resolution'), '540');
    await p.addStyleTag({ content: '#instructions {font-size:30px} nav a, #scroll-hint, #motion-options, #instructions summary {font-size:22px}' });
    await p.waitForTimeout(200);
    const bounds = await p.evaluate(() => ({
      width: document.documentElement.scrollWidth, viewport: innerWidth,
      bottom: document.querySelector('.controls').getBoundingClientRect().bottom, height: innerHeight,
    }));
    assert.ok(bounds.width <= bounds.viewport);
    assert.ok(bounds.bottom <= bounds.height + 1);
    await p.locator('.instruction-body').focus();
    await p.keyboard.press('End');
    await p.waitForFunction(() => document.querySelector('.instruction-body').scrollTop > 0);
    await p.screenshot({ path: path.resolve(__dirname, '../validation/instructions-enlarged-phone.png') });
    results.push({ name: 'expanded instructions, enlarged text and keyboard scrolling', passed: true, bounds });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(JSON.stringify(results, null, 2));
  } finally {
    fs.writeFileSync(path.resolve(__dirname, '../validation/fallback-validation.json'), JSON.stringify({ results }, null, 2) + '\n');
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

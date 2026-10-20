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
      if (failure === 'script-blocked') await p.route('**/app.js', r => r.abort('failed'));
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
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await context.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(base); await visibleFrame(p, 0);
    let delay = true;
    await p.route(/\/landscape\/(?:720\/)?frame-\d+\.webp/, async route => {
      if (delay) await new Promise(r => setTimeout(r, 1600));
      await route.continue().catch(() => {});
    });
    const started = Date.now();
    await p.getByRole('link', { name: 'Assembled', exact: true }).click();
    await p.waitForFunction(() => document.querySelector('#stage').dataset.mode === 'auto');
    await visibleFrame(p, 420);
    const elapsed = Date.now() - started;
    const lag = Number(await p.locator('#stage').getAttribute('data-fallback-lag-ms'));
    assert.ok(lag >= 800 && lag < 1050, `Lag timer was ${lag} ms`);
    assert.ok(elapsed < 1400, `Fallback took ${elapsed} ms`);
    assert.ok((await p.locator('canvas').getAttribute('aria-label')).startsWith('Assembled.'));
    assert.equal(await p.locator('[aria-current="step"]').getAttribute('data-chapter'), 'assembled');
    await p.waitForTimeout(1000);
    assert.equal(await p.locator('#stage').getAttribute('data-mode'), 'auto');
    delay = false;
    await p.getByRole('button', { name: 'Try animation', exact: true }).click();
    await p.waitForFunction(() => document.querySelector('#stage').dataset.mode === 'animation');
    assert.equal(await p.locator('#stage').getAttribute('data-resolution'), '540');
    await p.getByRole('link', { name: '03 LoRa', exact: true }).click();
    await visibleFrame(p, 150);
    results.push({ name: 'automatic still fallback and explicit recovery', passed: true, elapsedMs: elapsed, lagMs: lag });
    await p.locator('#instructions summary').click();
    assert.ok(await p.locator('#instructions').evaluate(d => d.open));
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForFunction(() => {
      const area = document.querySelector('#artwork').getBoundingClientRect();
      return document.querySelector('canvas').dataset.orientation === (area.width > area.height ? 'landscape' : 'portrait');
    });
    await visibleFrame(p, 150);
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

const assert = require('node:assert/strict');
const { CDP, sleep, adb, save } = require('./android-device.cjs');
(async () => {
  const c = await CDP.open();
  const rotation = adb(['shell', 'settings', 'get', 'system', 'user_rotation']).toString().trim();
  const report = { checks: [], passed: false };
  try {
    await c.send('Page.navigate', { url: 'http://127.0.0.1:8766/?audit=android-mobile-fixes&connectors=' + Date.now() });
    await c.wait("document.querySelector('#assembly')?.dataset.frame==='0'");
    await sleep(500);
    for (const [id, index] of [['wifi', 90], ['lora', 180], ['boards', 315]]) {
      await c.tap(`[data-chapter="${id}"]`);
      await c.wait(`document.querySelector('#assembly').dataset.frame==='${index}'`);
      const before = await c.state();
      await c.tap('#enlarge-connector');
      await c.wait("document.querySelector('#connector-image').dataset.resolution==='1080'");
      adb(['shell', 'input', 'swipe', '540', '1700', '540', '900', '400']);
      await sleep(250);
      const during = await c.state();
      assert.equal(during.canvas.frame, before.canvas.frame);
      assert.equal(during.stage.targetProgress, before.stage.targetProgress);
      assert.ok(Math.abs(during.viewport.scrollY - before.viewport.scrollY) < 1);
      if (id === 'boards') {
        await c.shot('android-connector-portrait');
        adb(['shell', 'settings', 'put', 'system', 'user_rotation', '1']);
        await c.wait('innerWidth > innerHeight');
        await sleep(500);
        await c.shot('android-connector-landscape');
      }
      await c.tap('#close-connector');
      await c.wait(`!document.querySelector('#connector-dialog').open && document.querySelector('#assembly').dataset.frame==='${index}'`);
      if (id === 'boards') {
        await c.wait("document.querySelector('#assembly').dataset.orientation==='landscape'");
        adb(['shell', 'settings', 'put', 'system', 'user_rotation', '0']);
        await c.wait("document.querySelector('#assembly').dataset.orientation==='portrait'");
      }
      await sleep(250);
      const after = await c.state();
      assert.ok(Math.abs(Number(after.stage.targetProgress) - Number(before.stage.targetProgress)) < .002);
      assert.equal(after.canvas.frame, before.canvas.frame);
      assert.ok(Number(after.stage.maxDecodedBytes) <= 48 * 1024 * 1024);
      assert.ok(Number(after.stage.maxRequests) <= 4);
      report.checks.push({ id, before, during, after });
    }
    report.passed = true;
    console.log('PASS Android connector taps, paused native swipes and rotation while enlarged');
  } finally {
    adb(['shell', 'settings', 'put', 'system', 'user_rotation', rotation]);
    save('android-connectors', report); c.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

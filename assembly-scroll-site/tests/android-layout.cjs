const assert = require('node:assert/strict');
const { CDP, sleep, adb, save } = require('./android-device.cjs');

(async () => {
  const c = await CDP.open();
  const rotation = adb(['shell', 'settings', 'get', 'system', 'user_rotation']).toString().trim();
  const report = { states: [], passed: false };
  try {
    await c.send('Page.navigate', { url: 'http://127.0.0.1:8766/?audit=android-mobile-fixes&layout=' + Date.now() });
    await c.wait("document.querySelector('#assembly')?.dataset.frame==='0'");
    await c.tap('[data-chapter="boards"]');
    await c.wait("document.querySelector('#assembly').dataset.frame==='315'");
    for (const [angle, name] of [[0, 'portrait'], [1, 'landscape']]) {
      adb(['shell', 'settings', 'put', 'system', 'user_rotation', String(angle)]);
      await c.wait(`document.querySelector('#assembly').dataset.orientation==='${name}'`);
      await sleep(600);
      const s = await c.state();
      assert.ok(s.controls.bottom <= s.viewport.visualHeight + 1);
      assert.equal(s.canvas.frame, '315');
      assert.ok(s.nav.every(link => parseInt(link.font) >= 13));
      assert.ok(!s.horizontalOverflow);
      if (angle) assert.ok(s.canvasRect.width > 600, 'Use available landscape width');
      report.states.push(s);
      await c.shot('readability-' + name);
    }
    report.passed = true;
    console.log('PASS Android portrait and compact landscape readability');
  } finally {
    adb(['shell', 'settings', 'put', 'system', 'user_rotation', rotation]);
    save('readability-device', report);
    c.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

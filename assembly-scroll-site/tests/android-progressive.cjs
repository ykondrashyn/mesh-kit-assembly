const assert = require('node:assert/strict');
const { CDP, sleep, save } = require('./android-device.cjs');
(async () => {
  const c = await CDP.open(), report = { passed: false };
  try {
    await c.send('Network.enable');
    await c.send('Network.setCacheDisabled', { cacheDisabled: true });
    await c.send('Network.emulateNetworkConditions', { offline:false,latency:150,downloadThroughput:200000,uploadThroughput:75000 });
    await c.send('Page.navigate', { url:'http://127.0.0.1:8766/?audit=android-mobile-fixes&progressive='+Date.now() });
    await c.wait("document.querySelector('#assembly')?.dataset.frame==='0'",30000);
    report.opening = await c.state();
    for (const index of [60,120,180,240,300,360,420]) {
      await c.eval(`scrollTo(0,${index}/420*(document.querySelector('#story').offsetHeight-document.querySelector('#stage').offsetHeight))`);
      await sleep(100);
    }
    await c.wait("document.querySelector('#assembly').dataset.frame==='420'",30000);
    report.slow = await c.state();
    await c.send('Network.emulateNetworkConditions', { offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1 });
    await c.wait("Number(document.querySelector('#stage').dataset.resolution)>=720 && document.querySelector('#assembly').dataset.resolution==='1080'",45000);
    report.recovered = await c.state();
    assert.equal(report.recovered.canvas.frame,'420');
    assert.equal(report.recovered.stage.mode,'animation');
    assert.ok(Number(report.recovered.stage.qualityPromotions)>=1);
    assert.ok(Number(report.recovered.stage.maxRequests)<=4);
    assert.ok(Number(report.recovered.stage.maxDecodedFrames)<=12);
    assert.ok(Number(report.recovered.stage.maxDecodedBytes)<=48*1024*1024);
    assert.ok(Number(report.recovered.stage.maxCompressedBytes)<=24*1024*1024);
    await c.shot('android-quality-recovered');
    report.passed=true;
    console.log('PASS physical Android slow-to-fast recovery at the exact final pose');
  } finally {
    await c.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1}).catch(()=>{});
    await c.send('Network.setCacheDisabled',{cacheDisabled:false}).catch(()=>{});
    save('android-progressive',report);c.close();
  }
})().catch(e=>{console.error(e.message);process.exitCode=1});

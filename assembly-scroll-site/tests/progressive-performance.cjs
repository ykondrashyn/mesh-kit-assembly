// Run against an unchanged server for both the before and after measurements.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.argv[2] || 'http://127.0.0.1:8766/';
const output = process.env.VALIDATION_OUTPUT || path.resolve(__dirname, '../validation/progressive/after.json');
const runs = Number(process.env.RUNS || 3);
const profiles = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 443, height: 840, phone: true },
  { name: 'phone-slow', width: 443, height: 840, phone: true, slow: true },
];
const median = values => [...values].sort((a,b) => a-b)[Math.floor(values.length / 2)];
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const report = { url: base, browser: await browser.version(), runs: [], completed: false };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  try {
    for (const profile of profiles.filter(p => !process.env.PROFILE || p.name === process.env.PROFILE)) for (let run = 0; run < runs; run++) {
      const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height },
        screen: { width: profile.width, height: profile.height }, deviceScaleFactor: 2,
        hasTouch: Boolean(profile.phone), isMobile: Boolean(profile.phone) });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      if (profile.slow) {
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 75000 });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      }
      await page.addInitScript(() => {
        window.audit = { first: null, changes: [], longTasks: [] };
        new PerformanceObserver(list => window.audit.longTasks.push(...list.getEntries().map(x=>x.duration))).observe({ type:'longtask', buffered:true });
        new MutationObserver(() => {
          const c = document.querySelector('#assembly');
          if (!c || c.dataset.frame === undefined) return;
          const row = { at: performance.now(), frame: Number(c.dataset.frame), resolution: c.dataset.resolution };
          window.audit.first ??= row;
          const last = window.audit.changes.at(-1);
          if (!last || row.frame !== last.frame) window.audit.changes.push(row);
        }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-frame'] });
      });
      for (const cache of ['cold','warm']) {
        let bytes = 0, requests = 0, errors = [];
        const onData = event => { bytes += event.encodedDataLength; };
        const onRequest = req => { if (req.url().includes('.webp')) requests++; };
        const onError = e => errors.push(e.message);
        cdp.on('Network.loadingFinished', onData); page.on('request', onRequest); page.on('pageerror', onError);
        await page.goto(base);
        await page.waitForFunction(() => document.querySelector('#assembly').dataset.frame !== undefined, null, { timeout:20000 });
        const initial = await page.evaluate(() => ({...window.audit.first}));
        const legs = [];
        for (const direction of [1,-1]) {
          await page.evaluate(async direction => {
            window.audit.changes = [];
            const span = document.querySelector('#story').offsetHeight - document.querySelector('#stage').offsetHeight;
            for (let i=1;i<=60;i++) {
              window.scrollTo({ top: span * (direction > 0 ? i/60 : 1-i/60), behavior:'instant' });
              await new Promise(r=>setTimeout(r,65));
            }
          }, direction);
          const target = direction > 0 ? 420 : 0;
          await page.waitForFunction(target => Number(document.querySelector('#assembly').dataset.frame) === target &&
            document.querySelector('#stage').dataset.settled === 'true', target, { timeout:20000 });
          const changes = await page.evaluate(() => window.audit.changes);
          const gaps = changes.slice(1).map((x,i)=>x.at-changes[i].at).sort((a,b)=>a-b);
          assert.ok(changes.length > 10);
          assert.ok(changes.every((x,i)=>!i || (x.frame-changes[i-1].frame)*direction >= 0));
          legs.push({ direction, poses:changes.length, p95GapMs:gaps[Math.floor(gaps.length*.95)] || 0,
            maxGapMs:Math.max(0,...gaps), changes });
        }
        await page.waitForTimeout(900);
        const final = await page.evaluate(() => ({ stage:{...document.querySelector('#stage').dataset},
          canvas:{...document.querySelector('#assembly').dataset}, longTasks:window.audit.longTasks }));
        assert.equal(final.stage.mode, 'animation');
        assert.ok(Number(final.stage.maxRequests) <= 4);
        assert.ok(Number(final.stage.maxDecodedFrames) <= 12);
        assert.ok(Number(final.stage.maxDecodedBytes) <= 48*1024*1024);
        assert.deepEqual(errors, []);
        const result = { profile:profile.name, run, cache, firstImageMs:initial.at, initialResolution:initial.resolution, bytes, requests, legs, final };
        report.runs.push(result);
        console.log(JSON.stringify({ profile:result.profile,run,cache,firstImageMs:Math.round(initial.at),bytes,poses:legs.map(x=>x.poses) }));
        cdp.off('Network.loadingFinished', onData); page.off('request', onRequest); page.off('pageerror', onError);
      }
      await context.close();
    }
    report.summary = profiles.filter(p=>report.runs.some(r=>r.profile===p.name)).flatMap(p=>['cold','warm'].map(cache=>{
      const rows=report.runs.filter(r=>r.profile===p.name && r.cache===cache);
      return { profile:p.name,cache, firstImageMs:median(rows.map(r=>r.firstImageMs)), bytes:median(rows.map(r=>r.bytes)),
        p95GapMs:median(rows.map(r=>Math.max(...r.legs.map(l=>l.p95GapMs)))), poses:median(rows.map(r=>r.legs.reduce((n,l)=>n+l.poses,0))) };
    }));
    report.completed = true;
  } finally { fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n'); await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});

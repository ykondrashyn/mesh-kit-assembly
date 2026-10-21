// Focused investigation of the small warm-start regression in the main audit.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), revision = '95a4a91c2e5b7bffceb406a505951e294f1c3ee1';
const old = new Map();
for (const file of ['index.html','styles.css','app.js','frame-loader.mjs','timeline.mjs','presentation.mjs']) {
  old.set(file, execFileSync('git', ['show', `${revision}:assembly-scroll-site/dist/${file}`], { cwd: root }));
}
const server = http.createServer((req, res) => {
  const parts = new URL(req.url, 'http://localhost').pathname.split('/');
  const version = parts[1], relative = parts.slice(2).join('/') || 'index.html';
  const file = path.resolve(root, 'dist', relative);
  if (!['before','after'].includes(version) || !file.startsWith(path.join(root,'dist') + path.sep)) {
    res.writeHead(404).end(); return;
  }
  try {
    const data = version === 'before' && old.has(relative) ? old.get(relative) : fs.readFileSync(file);
    const type = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.webp':'image/webp'}[path.extname(file)];
    res.writeHead(200, {'Content-Type':type || 'application/octet-stream','Content-Length':data.length,'Cache-Control':'public, max-age=3600'}).end(data);
  } catch { res.writeHead(404).end(); }
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const rows = [], pages = {};
  try {
    for (const version of ['before','after']) {
      const context = await browser.newContext(process.env.SLOW ?
        {viewport:{width:443,height:840},screen:{width:443,height:840},deviceScaleFactor:2,hasTouch:true,isMobile:true} :
        {viewport:{width:1440,height:900},deviceScaleFactor:2});
      const p = await context.newPage(); pages[version] = p;
      if (process.env.SLOW) {
        const cdp=await context.newCDPSession(p);await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:75000});
        await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
      }
      await p.addInitScript(() => {
        new MutationObserver(() => {
          if (document.querySelector('#assembly')?.dataset.frame === '0') window.firstImage ??= performance.now();
        }).observe(document, {subtree:true,attributes:true,attributeFilter:['data-frame']});
      });
      await p.goto(`http://127.0.0.1:${server.address().port}/${version}/`);
      await p.waitForFunction(() => window.firstImage !== undefined);
    }
    for (let run=0;run<15;run++) for (const version of ['before','after']) {
      const p = pages[version]; await p.reload(); await p.waitForFunction(() => window.firstImage !== undefined);
      rows.push({version,run,...await p.evaluate(() => ({firstImageMs:window.firstImage,
        resourceBytes:performance.getEntriesByType('resource').reduce((n,x)=>n+x.transferSize,0),
        resources:performance.getEntriesByType('resource').filter(x=>/\.(js|mjs|json)(\?|$)/.test(x.name)).map(x=>({url:x.name,transferSize:x.transferSize,duration:x.duration}))}))});
    }
    fs.writeFileSync(path.join(root,`validation/progressive/startup${process.env.SLOW?'-slow':''}-investigation.json`),JSON.stringify({
      method:'15 alternating reloads after priming each version. Identical local server with explicit HTTP caching isolates warm startup scheduling from revalidation. This supplements the main unchanged-server runs.',
      baseline:revision,throttled:Boolean(process.env.SLOW),browser:await browser.version(),rows},null,2)+'\n');
    console.log(rows);
  } finally { await browser.close(); server.close(); }
})().catch(e=>{console.error(e);server.close();process.exitCode=1});

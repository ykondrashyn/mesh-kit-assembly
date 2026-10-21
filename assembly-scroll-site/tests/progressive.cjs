const { chromium }=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.argv[2]||'http://127.0.0.1:8766/';
const output=process.env.VALIDATION_OUTPUT||path.resolve(__dirname,'../validation/progressive/behavior.json');
const phone={viewport:{width:443,height:840},screen:{width:443,height:986},deviceScaleFactor:2,hasTouch:true,isMobile:true};
const state=p=>p.evaluate(()=>({stage:{...document.querySelector('#stage').dataset},canvas:{...document.querySelector('#assembly').dataset}}));
const waitFrame=(p,i)=>p.waitForFunction(i=>document.querySelector('#assembly').dataset.frame===String(i),i,{timeout:20000});
const go=(p,i)=>p.evaluate(i=>scrollTo({top:i/420*(document.querySelector('#story').offsetHeight-document.querySelector('#stage').offsetHeight),behavior:'instant'}),i);
function bounds(s){assert.ok(Number(s.stage.maxRequests)<=4);assert.ok(Number(s.stage.maxSpeculative)<=1);assert.ok(Number(s.stage.maxDecodedFrames)<=12);assert.ok(Number(s.stage.maxDecodedBytes)<=48*1024*1024);assert.ok(Number(s.stage.maxCompressedBytes)<=24*1024*1024)}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const report={checks:[],completed:false};
 async function check(name,fn,connection={downlink:10,effectiveType:'4g',saveData:false},options=phone){
  if(process.env.CHECK && !name.includes(process.env.CHECK))return;
  const context=await browser.newContext(options),p=await context.newPage(),errors=[],requests=[];
  await p.addInitScript(connection=>Object.defineProperty(navigator,'connection',{value:connection===null?undefined:{...connection,addEventListener(){}}}),connection);
  p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.url().includes('.webp'))requests.push(r.url())});
  try{const result=await fn(p,context,requests);assert.deepEqual(errors,[]);const final=await state(p);bounds(final);report.checks.push({name,passed:true,result,final});console.log('PASS '+name)}catch(error){console.error(name,await state(p));throw error}finally{await context.close()}
 }
 try{
  await check('sharp opening, full compressed preparation, automatic promotion and idle stop',async(p,c,requests)=>{
   await p.goto(base);await waitFrame(p,0);
   const first=await state(p);assert.equal(first.canvas.resolution,'1080');assert.equal(first.stage.resolution,'720');
   assert.ok(requests.filter(u=>!u.includes('frame-0034')).at(0).includes('/portrait/frame-0001'));
   await p.waitForFunction(()=>document.querySelector('#stage').dataset.preparedFrames==='421'&&document.querySelector('#stage').dataset.jobs==='0',null,{timeout:20000});
   await p.waitForFunction(()=>document.querySelector('#stage').dataset.resolution==='1080',null,{timeout:18000});
   const n=requests.length;await p.waitForTimeout(1000);assert.equal(requests.length,n);
   assert.ok(requests.every(u=>!u.includes('/landscape/')));
   const highBefore=requests.filter(u=>/\/portrait\/frame-/.test(u)).length;
   for(const i of [90,180,315,420,315,180,90,0]){await go(p,i);await waitFrame(p,i)}
   assert.equal(requests.filter(u=>/\/portrait\/frame-/.test(u)).length,highBefore,'Prepared high frames should be reused without HTTP requests');
   return {first,requests:n,highBefore};
  });
  await check('600 ms opening fallback, late same-pose sharpening and smooth resume',async(p)=>{
   await p.route('**/portrait/frame-0001.webp?*',async r=>{await new Promise(r=>setTimeout(r,1500));await r.continue().catch(()=>{})});
   await p.goto(base);await waitFrame(p,0);const first=await state(p);assert.equal(first.canvas.resolution,'720');
   await p.waitForFunction(()=>document.querySelector('#assembly').dataset.resolution==='1080');
   assert.equal((await state(p)).stage.resolution,'720');
   await go(p,180);await waitFrame(p,180);await p.waitForTimeout(800);assert.equal((await state(p)).canvas.frame,'180');
   return {first};
  });
  await check('immediate scroll ignores a delayed opening result',async(p)=>{
   await p.route('**/portrait/frame-0001.webp?*',async r=>{await new Promise(r=>setTimeout(r,1800));await r.continue().catch(()=>{})});
   await p.goto(base,{waitUntil:'domcontentloaded'});
   await p.waitForFunction(()=>document.querySelector('#stage').dataset.requestedFrame==='0');
   await go(p,180);await waitFrame(p,180);await p.waitForTimeout(2000);assert.equal((await state(p)).canvas.frame,'180');
  });
  await check('slow-to-fast connection recovers streaming quality without a reload',async(p,c)=>{
   const cdp=await c.newCDPSession(p);await cdp.send('Network.enable');
   await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:75000});
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
   await p.goto(base);await waitFrame(p,0);
   for(let i=0;i<40;i++){await go(p,i*10);await p.waitForTimeout(60)}
   await go(p,420);await waitFrame(p,420);const slow=await state(p);assert.equal(slow.stage.mode,'animation');
   await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:5000000,uploadThroughput:1000000});
   await p.waitForFunction(()=>Number(document.querySelector('#stage').dataset.resolution)>=720,null,{timeout:25000});
   await p.waitForFunction(()=>document.querySelector('#assembly').dataset.resolution==='1080');
   await p.waitForFunction(()=>document.querySelector('#stage').dataset.resolution==='1080',null,{timeout:30000});
   return {slow};
  },{downlink:1.6,effectiveType:'4g',saveData:false});
  await check('Data Saver prevents automatic high-resolution and distant downloads',async(p,c,requests)=>{
   await p.goto(base);await waitFrame(p,0);await p.waitForTimeout(3500);await go(p,180);await waitFrame(p,180);
   assert.ok(requests.every(u=>u.includes('/540/')));assert.equal((await state(p)).stage.distantPrefetch,'false');
   await p.locator('#enlarge-connector').click();await p.waitForFunction(()=>document.querySelector('#connector-image').dataset.resolution==='1080');
   assert.equal(requests.filter(u=>!u.includes('/540/')).length,1);
   await p.locator('#close-connector').click();
  },{saveData:true,downlink:100,effectiveType:'4g'});
  await check('missing connection API still opens sharply and refines chapter poses',async p=>{
   await p.goto(base);await waitFrame(p,0);assert.equal((await state(p)).canvas.resolution,'1080');
   await p.locator('[data-chapter="boards"]').click();await waitFrame(p,315);
   await p.waitForFunction(()=>document.querySelector('#assembly').dataset.resolution==='1080');
  },null);
  await check('hidden page suspends work, resumes safely, and rotation preserves position',async(p,c,requests)=>{
   await p.goto(base);await waitFrame(p,0);
   await p.evaluate(()=>{window.auditHidden=true;Object.defineProperty(document,'hidden',{get:()=>window.auditHidden,configurable:true});document.dispatchEvent(new Event('visibilitychange'))});
   await p.waitForTimeout(500);const before=requests.length;await p.waitForTimeout(3500);assert.equal(requests.length,before);
   await p.evaluate(()=>{window.auditHidden=false;document.dispatchEvent(new Event('visibilitychange'))});
   await go(p,315);await waitFrame(p,315);await p.setViewportSize({width:920,height:338});
   await p.waitForFunction(()=>document.querySelector('#assembly').dataset.orientation==='landscape');await waitFrame(p,315);
   await p.screenshot({path:output.replace('.json','-landscape.png')});
  });
  await check('failed refinements retain the pose and do not trigger retries forever',async(p,c,requests)=>{
   await p.route('**/portrait/frame-*.webp?*',r=>r.abort());
   await p.goto(base);await waitFrame(p,0);await go(p,315);await waitFrame(p,315);await p.waitForTimeout(2500);
   assert.equal((await state(p)).canvas.frame,'315');
   const before=requests.filter(u=>u.includes('/portrait/frame-0376.')).length;
   await p.waitForTimeout(2000);assert.equal(requests.filter(u=>u.includes('/portrait/frame-0376.')).length,before);
  });
  report.completed=true;
 }finally{fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

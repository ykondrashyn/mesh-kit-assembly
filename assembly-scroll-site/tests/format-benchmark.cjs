const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.argv[2]||'http://127.0.0.1:8767/';
const output=process.env.VALIDATION_OUTPUT||path.resolve(__dirname,'../validation/progressive/formats.json');
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))]||0;
(async()=>{
 const manifest=await(await fetch(base+'manifest.json')).json();
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const report={browser:await browser.version(),entries:manifest.entries,checks:[],completed:false};
 fs.mkdirSync(path.dirname(output),{recursive:true});
 try{
  for(const slow of [false,true])for(let i=0;i<manifest.entries.length;i++){
   const entry=manifest.entries[i],context=await browser.newContext({viewport:{width:1000,height:900}}),p=await context.newPage();
   const cdp=await context.newCDPSession(p);await cdp.send('Network.enable');let bytes=0;
   cdp.on('Network.loadingFinished',e=>{bytes+=e.encodedDataLength});
   if(slow){await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:75000});await cdp.send('Emulation.setCPUThrottlingRate',{rate:4})}
   const errors=[];p.on('pageerror',e=>errors.push(e.message));
   try{
    await p.goto(base+`?entry=${i}&test=1`);await p.waitForFunction(()=>window.bench?.ready,null,{timeout:30000});
    const first=await p.evaluate(()=>bench.draw(0));
    const jumps=await p.evaluate(async()=>{const rows=[];for(const i of [33,90,129,180,234,315,363,420,234,129,0])rows.push(await bench.draw(i));return rows});
    const legs=[];
    for(const direction of [1,-1]){
     await p.evaluate(async direction=>{bench.samples=[];for(let n=1;n<=60;n++){bench.target(Math.round(420*(direction>0?n/60:1-n/60)));await new Promise(r=>setTimeout(r,20))}},direction);
     await p.waitForFunction(()=>bench.idle(),null,{timeout:20000});
     const rows=await p.evaluate(()=>bench.samples);
     assert.equal(rows.at(-1).index,direction>0?420:0);
     assert.ok(rows.every((x,j)=>!j||(x.index-rows[j-1].index)*direction>=0));
     if(entry.kind==='video')assert.ok(rows.every(x=>Math.round(x.mediaTime*30)===x.index));
     legs.push({direction,presented:rows.length,p95LatencyMs:percentile(rows.map(x=>x.latencyMs),.95),rows});
    }
    if(entry.kind==='video')assert.ok(jumps.every(x=>Math.round(x.mediaTime*30)===x.index));
    assert.deepEqual(errors,[]);assert.deepEqual(await p.evaluate(()=>bench.errors),[]);
    const result={entry:i,profile:slow?'1.6Mbps-150ms-4xCPU':'normal',firstImageMs:first.at,transferredBytes:bytes,
     jumpP95Ms:percentile(jumps.map(x=>x.latencyMs),.95),decodeP95Ms:percentile(jumps.map(x=>x.decodeMs),.95),jumps,legs,passed:true};
    report.checks.push(result);
    console.log(`${result.profile} ${entry.variant} ${entry.size} ${entry.codec}: ${Math.round(result.jumpP95Ms)} ms p95, ${legs.map(x=>x.presented).join('/')} poses`);
   }catch(error){report.checks.push({entry:i,profile:slow?'slow':'normal',passed:false,error:error.message});console.error(entry.codec,error.message)}
   finally{await context.close();fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n')}
  }
  report.completed=true;
 }finally{fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

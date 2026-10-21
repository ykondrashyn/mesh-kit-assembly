const {CDP,sleep,adb,save,out}=require('./android-device.cjs');
const fs=require('node:fs');
const instrumentation=`(() => {
 const m=window.audit={frames:[],samples:[],resize:[],longTasks:[],shifts:[],paint:[],lcp:[],events:[]};
 const read=()=>{const s=document.querySelector('#stage'),c=document.querySelector('#assembly');return {t:performance.now(),frame:Number(c?.dataset.frame??-1),requested:Number(s?.dataset.requestedFrame??-1),mode:s?.dataset.mode,resolution:s?.dataset.resolution,progress:Number(s?.dataset.targetProgress??0),y:scrollY,h:innerHeight,vh:visualViewport.height,loading:!document.querySelector('#load-state')?.hidden}};
 for(const [type,key] of [['longtask','longTasks'],['layout-shift','shifts'],['paint','paint'],['largest-contentful-paint','lcp'],['event','events']])try{new PerformanceObserver(l=>m[key].push(...l.getEntries().map(e=>({name:e.name,t:e.startTime,duration:e.duration,value:e.value,hadRecentInput:e.hadRecentInput,interactionId:e.interactionId})))).observe({type,buffered:true,durationThreshold:16});}catch{}
 addEventListener('resize',()=>m.resize.push(read()));
 addEventListener('DOMContentLoaded',()=>{const c=document.querySelector('#assembly');new MutationObserver(()=>m.frames.push(read())).observe(c,{attributes:true,attributeFilter:['data-frame']});setInterval(()=>m.samples.push(read()),100);});
})()`;
(async()=>{
 const c=await CDP.open();const phase=process.argv[2]||'normal'; const report={phase,date:new Date().toISOString(),device:'Pixel 10 Pro XL',android:'17',chrome:'155.0.8059.81',cpuThrottling:false,cacheDisabled:true,network:phase==='slow'?{downloadBps:200000,latencyMs:150}:{throttled:false},requests:[],errors:[],chapters:[],legs:[]};let script;
 try{
 await c.send('Page.enable');await c.send('Network.enable');await c.send('Runtime.enable');
 c.handlers.push(m=>{if(m.method==='Network.requestWillBeSent')report.requests.push({id:m.params.requestId,url:m.params.request.url,t:m.params.timestamp});if(m.method==='Network.loadingFinished'){const r=report.requests.find(r=>r.id===m.params.requestId);if(r)r.bytes=m.params.encodedDataLength;}if(m.method==='Network.loadingFailed')report.errors.push({type:'request',...m.params});if(m.method==='Runtime.exceptionThrown')report.errors.push({type:'exception',details:m.params.exceptionDetails});});
 await c.send('Network.setCacheDisabled',{cacheDisabled:true});
 if(phase==='slow')await c.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:75000});
 script=(await c.send('Page.addScriptToEvaluateOnNewDocument',{source:instrumentation})).identifier;
 await c.send('Page.navigate',{url:'http://127.0.0.1:8766/?audit=android-mobile-fixes&run='+phase+'&time='+Date.now()});
 await c.wait("document.querySelector('#assembly')?.dataset.frame === '0'",30000);
 await sleep(500);report.initial=await c.state();report.initialRequests=report.requests.map(r=>({...r}));await c.shot(phase+'-opening');
 for(const direction of [1,-1]){
 const start=await c.eval('performance.now()'); const steps=[];
 for(let i=0;i<32;i++){
 adb(['shell','input','swipe','540',direction>0?'1900':'700','540',direction>0?'650':'1950','650']);
 await sleep(100); const s=await c.state();steps.push({frame:s.canvas.frame,requested:s.stage.requestedFrame,progress:s.stage.targetProgress,height:s.viewport.height,y:s.viewport.scrollY,resolution:s.stage.resolution,loading:s.load});
 if(Number(s.stage.targetProgress)===(direction>0?1:0))break;
 }
 const ended=await c.eval('performance.now()');await c.wait(`document.querySelector('#assembly').dataset.frame === '${direction>0?420:0}'`,30000);const settled=await c.eval('performance.now()');
 const before=await c.state();await sleep(500);const after=await c.state();report.legs.push({direction,start,ended,settled,steps,stopped:before.canvas.frame===after.canvas.frame,final:after});
 await c.shot(phase+(direction>0?'-assembled':'-returned'));
 console.log(JSON.stringify({phase,direction,swipes:steps.length,elapsedMs:Math.round(ended-start),settleMs:Math.round(settled-ended),resolution:after.stage.resolution,drops:after.stage.qualityDrops||0}));
 }
 for(const [id,frame]of [['wifi',90],['lora',180],['boards',315]]){const start=await c.eval('performance.now()');await c.tap(`[data-chapter="${id}"]`);await c.wait(`document.querySelector('#assembly').dataset.frame === '${frame}'`);await sleep(250);report.chapters.push({id,elapsedMs:Math.round((await c.eval('performance.now()'))-start),state:await c.state()});await c.shot(phase+'-'+id);}
 report.measurements=await c.eval('audit');report.final=await c.state();report.completed=true;
 }catch(e){report.failure=e.message;console.error(e.message);process.exitCode=1;}
 finally{
 if(script)await c.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:script}).catch(()=>{});
 await c.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1}).catch(()=>{});
 await c.send('Network.setCacheDisabled',{cacheDisabled:false}).catch(()=>{});c.close();save('android-'+phase,report);
 }
})();

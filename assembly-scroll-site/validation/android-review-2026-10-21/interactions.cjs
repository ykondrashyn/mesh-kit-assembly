const {CDP,sleep,adb,save}=require('./device.cjs');
(async()=>{
const c=await CDP.open();const report={date:new Date().toISOString(),checks:[]};
const check=async(name,fn)=>{try{const result=await fn();report.checks.push({name,...result,completed:true});console.log(JSON.stringify({name,...result.summary}));}catch(e){report.checks.push({name,error:e.message,completed:false});console.log(JSON.stringify({name,error:e.message}));}save('interactions',report);};
try{
await c.send('Page.enable');await c.send('Network.enable');
await c.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
await check('rotation',async()=>{
 await c.tap('[data-chapter="lora"]');await c.wait("document.querySelector('canvas').dataset.frame==='180'");const before=await c.state();
 adb(['shell','settings','put','system','user_rotation','1']);await c.wait("document.querySelector('canvas').dataset.orientation==='landscape'");await sleep(700);const landscape=await c.state();await c.shot('landscape-lora');
 await c.tap('[data-chapter="boards"]');await c.wait("document.querySelector('canvas').dataset.frame==='315'");await c.shot('landscape-boards');const boards=await c.state();
 adb(['shell','settings','put','system','user_rotation','0']);await c.wait("document.querySelector('canvas').dataset.orientation==='portrait'");await sleep(500);const portrait=await c.state();
 return {before,landscape,boards,portrait,summary:{before:before.stage.targetProgress,landscape:landscape.stage.targetProgress,boards:boards.canvas.frame,portrait:portrait.stage.targetProgress}};
});
await check('instructions',async()=>{await c.tap('#instructions summary');await sleep(300);const state=await c.state();await c.shot('instructions-open');const before=await c.eval('scrollY');await c.send('Input.synthesizeScrollGesture',{x:300,y:500,yDistance:-700,speed:700,gestureSourceType:'touch'});await sleep(250);const after=await c.eval('({page:scrollY,panel:document.querySelector(".instruction-body").scrollTop,maximum:document.querySelector(".instruction-body").scrollHeight-document.querySelector(".instruction-body").clientHeight})');await c.shot('instructions-scrolled');await c.tap('#instructions summary');return {state,before,after,summary:{panelWidth:state.panel.width,pageMoved:after.page-before,panelScroll:after.panel}};});
await check('pinch-zoom',async()=>{const before=await c.state();await c.send('Input.synthesizePinchGesture',{x:220,y:360,scaleFactor:2,relativeSpeed:400,gestureSourceType:'touch'});await sleep(500);const zoomed=await c.state();await c.shot('pinch-zoom');await c.send('Input.synthesizeScrollGesture',{x:160,y:320,yDistance:-170,speed:400,gestureSourceType:'touch'});await sleep(300);const panned=await c.state();await c.shot('pinch-panned');await c.send('Input.synthesizePinchGesture',{x:220,y:360,scaleFactor:0.5,relativeSpeed:400,gestureSourceType:'touch'});await sleep(300);return {before,zoomed,panned,summary:{scale:zoomed.viewport.visualScale,beforeFrame:before.canvas.frame,zoomedFrame:zoomed.canvas.frame,pannedFrame:panned.canvas.frame}};});
await check('reduced-motion-and-manual',async()=>{await c.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await c.tap('[data-chapter="lora"]');await c.wait("document.querySelector('#stage').dataset.mode==='reduced' && document.querySelector('canvas').dataset.frame==='234'");const reduced=await c.state();await c.shot('reduced-motion');await c.tap('#instructions summary');await c.tap('#motion-toggle');await c.wait("document.querySelector('#stage').dataset.mode==='animation'");const enabled=await c.state();await c.tap('#motion-toggle');await c.wait("document.querySelector('#stage').dataset.mode==='manual'");const manual=await c.state();await c.tap('#instructions summary');await c.send('Emulation.setEmulatedMedia',{features:[]});return {reduced,enabled,manual,summary:{reduced:reduced.stage.mode,enabled:enabled.stage.mode,manual:manual.stage.mode}};});
await check('failed-frame-and-retry',async()=>{
 await c.send('Network.setCacheDisabled',{cacheDisabled:true});await c.send('Page.navigate',{url:'https://ykondrashyn.github.io/mesh-kit-assembly/?audit=android-mobile-20261021&run=failure'});await c.wait("document.querySelector('canvas')?.dataset.frame==='0'");
 await c.send('Network.setBlockedURLs',{urls:['*frame-0376.webp*']});await c.tap('[data-chapter="boards"]');await c.wait("!document.querySelector('#retry').hidden",20000);const failed=await c.state();await c.shot('failed-frame');
 await c.send('Network.setBlockedURLs',{urls:[]});await c.tap('#retry');await c.wait("document.querySelector('canvas').dataset.frame==='315'");const retried=await c.state();return {failed,retried,summary:{message:failed.load,retriedFrame:retried.canvas.frame}};
});
await check('javascript-disabled',async()=>{
 await c.send('Emulation.setScriptExecutionDisabled',{value:true});await c.send('Page.reload',{ignoreCache:true});await sleep(1500);await c.shot('no-javascript');
 const r=await c.send('DOM.getDocument',{depth:2});const html=(await c.send('DOM.getOuterHTML',{nodeId:r.root.nodeId})).outerHTML;
 await c.send('Emulation.setScriptExecutionDisabled',{value:false});await c.send('Page.reload');await c.wait("document.querySelector('canvas')?.dataset.frame==='0'");return {baselineParts:html.includes('class="fallback"'),instructionsOpen:html.includes('id="instructions" open'),summary:{baselineInstructions:html.includes('id="instructions" open')}};
});
report.completed=true;
}finally{
adb(['shell','settings','put','system','user_rotation','0']);
await c.send('Emulation.setScriptExecutionDisabled',{value:false}).catch(()=>{});await c.send('Emulation.setEmulatedMedia',{features:[]}).catch(()=>{});await c.send('Network.setBlockedURLs',{urls:[]}).catch(()=>{});await c.send('Network.setCacheDisabled',{cacheDisabled:false}).catch(()=>{});save('interactions',report);c.close();
}
})().catch(e=>{console.error(e.message);process.exitCode=1;});

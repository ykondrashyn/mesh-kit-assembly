const {CDP,sleep,adb,save,out}=require('./device.cjs');const fs=require('node:fs');
(async()=>{const c=await CDP.open();const report={date:new Date().toISOString(),runs:[]};try{
await c.send('Emulation.setEmulatedMedia',{features:[]});await c.send('Network.setBlockedURLs',{urls:[]});
await c.send('Page.navigate',{url:'https://ykondrashyn.github.io/mesh-kit-assembly/?audit=android-mobile-20261021&run=rotation-check'});await c.wait("document.querySelector('canvas')?.dataset.frame==='0'");
await c.tap('[data-chapter="boards"]');await c.wait("document.querySelector('canvas').dataset.frame==='315'");
for(let run=0;run<2;run++){
const readings=[];for(const rotation of [1,0]){adb(['shell','settings','put','system','user_rotation',String(rotation)]);for(const delay of [100,400,1000,1500]){await sleep(delay);const s=await c.state();s.heightStyle=await c.eval('({custom:getComputedStyle(document.documentElement).getPropertyValue("--viewport-height"),stage:document.querySelector("#stage").offsetHeight,client:document.documentElement.clientHeight})');readings.push({rotation,delay,state:s});}}
await c.shot('rotation-return-'+run);fs.writeFileSync(out+'/rotation-phone-'+run+'.png',adb(['exec-out','screencap','-p']));report.runs.push(readings);save('rotation-check',report);
console.log(JSON.stringify({run,readings:readings.map(r=>({rotation:r.rotation,delay:r.delay,h:r.state.viewport.height,stage:r.state.heightStyle.stage,custom:r.state.heightStyle.custom,footerBottom:r.state.controls.bottom,frame:r.state.canvas.frame,progress:r.state.stage.targetProgress}))}));
}
}finally{adb(['shell','settings','put','system','user_rotation','0']);save('rotation-check',report);c.close();}})().catch(e=>{console.error(e.message);process.exitCode=1});

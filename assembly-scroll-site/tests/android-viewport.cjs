const assert = require('node:assert/strict');
const {CDP,sleep,adb,save}=require('./android-device.cjs');
(async()=>{
  const c=await CDP.open();
  const originalRotation=adb(['shell','settings','get','system','user_rotation']).toString().trim();
  const report={date:new Date().toISOString(),checks:[],passed:false};
  const geometry=async()=>{const s=await c.state();return {...s,stageHeight:await c.eval('document.querySelector("#stage").offsetHeight')};};
  try{
    await c.send('Page.navigate',{url:'http://127.0.0.1:8766/?audit=android-mobile-fixes'});
    await c.wait("document.querySelector('#assembly')?.dataset.frame==='0'");
    await c.tap('[data-chapter="boards"]');await c.wait("document.querySelector('#assembly').dataset.frame==='315'");
    for(let run=0;run<2;run++){
      for(const rotation of [1,0]){
        adb(['shell','settings','put','system','user_rotation',String(rotation)]);
        await c.wait(`document.querySelector('#assembly').dataset.orientation==='${rotation?'landscape':'portrait'}'`);
        await sleep(600);const s=await geometry();
        assert.ok(Math.abs(s.stageHeight-s.viewport.visualHeight)<2,'Stage must fit the settled visible viewport');
        assert.ok(s.controls.bottom<=s.viewport.visualHeight+1,'Footer must remain visible after rotation');
        assert.ok(Math.abs(Number(s.stage.targetProgress)-.75)<.002,'Rotation must preserve progress');
        assert.equal(s.canvas.frame,'315');
        report.checks.push({run,rotation,state:s});
      }
    }
    await c.shot('rotation-fixed');
    const before=await geometry();
    let after;
    for (let swipe=0; swipe<3; swipe++) {
      adb(['shell','input','swipe','540','1800','540','700','650']);await sleep(500);
      after=await geometry();
      if (after.viewport.height>before.viewport.height) break;
    }
    report.toolbar={before,after};
    assert.ok(Math.abs(after.span-before.span)<=1,'Toolbar movement must not change scroll travel');
    assert.ok(after.viewport.height>before.viewport.height,'Swipe should collapse browser chrome');
    report.toolbar={before,after};
    await c.send('Input.synthesizePinchGesture',{x:220,y:360,scaleFactor:2,relativeSpeed:400,gestureSourceType:'touch'});
    await sleep(300);const zoom=await geometry();
    assert.ok(zoom.viewport.visualScale>1.8);
    assert.equal(zoom.span,after.span);
    report.zoom=zoom;
    await c.send('Input.synthesizePinchGesture',{x:220,y:360,scaleFactor:.5,relativeSpeed:400,gestureSourceType:'touch'});
    report.passed=true;
    console.log('PASS Android rotation, stable toolbar scroll distance and pinch zoom');
  }finally{adb(['shell','settings','put','system','user_rotation',originalRotation]);save('android-viewport',report);c.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});

const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const report={passed:false};
  try{
    const page=await browser.newPage({viewport:{width:443,height:840},isMobile:true,hasTouch:true,deviceScaleFactor:2.4});
    await page.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{downlink:1.6,addEventListener(){}}}));
    let stall=false, fail=false;
    await page.route('**/*.webp*',async route=>{
      if(fail&&route.request().url().includes('frame-0241'))return route.abort('failed');
      await new Promise(resolve=>setTimeout(resolve,stall?1100:100));
      await route.continue().catch(()=>{});
    });
    await page.goto(process.argv[2] || 'http://127.0.0.1:8766/');
    await page.waitForFunction(()=>document.querySelector('#assembly').dataset.frame==='0');
    await page.evaluate(()=>{
      window.frameFeedback=[];
      new MutationObserver(()=>window.frameFeedback.push({frame:document.querySelector('#assembly').dataset.frame,visible:!document.querySelector('#load-state').hidden}))
        .observe(document.querySelector('#assembly'),{attributes:true,attributeFilter:['data-frame']});
    });
    for(let i=1;i<=65;i++){
      await page.evaluate(i=>scrollTo(0,i/420*(document.querySelector('#story').offsetHeight-document.querySelector('#stage').offsetHeight)),i);
      await page.waitForTimeout(65);
    }
    await page.waitForFunction(()=>document.querySelector('#assembly').dataset.frame==='65');
    const frames=await page.evaluate(()=>window.frameFeedback);
    assert.ok(frames.length>30);
    assert.equal(frames.filter(f=>f.visible).length,0,'Advancing images should not carry a loading badge');
    stall=true;
    await page.locator('[data-chapter="boards"]').click();
    await page.waitForTimeout(450);
    assert.ok(await page.locator('#load-state').isVisible(),'A stalled chapter tap should show feedback');
    assert.equal(await page.locator('#load-announcement').textContent(),'');
    await page.waitForFunction(()=>document.querySelector('#assembly').dataset.frame==='315');
    assert.equal(await page.locator('#load-state').isVisible(),false);
    stall=false;fail=true;
    await page.locator('[data-chapter="lora"]').click();
    await page.locator('#retry').waitFor({state:'visible'});
    assert.ok((await page.locator('#load-announcement').textContent()).includes('could not load'));
    fail=false;
    await page.locator('#retry').click();
    await page.waitForFunction(()=>document.querySelector('#assembly').dataset.frame==='180');
    assert.equal(await page.locator('#load-announcement').textContent(),'');
    report.passed=true;report.changedImages=frames.length;report.badgesWhileAdvancing=0;
    console.log('PASS quiet advancing frames, stalled chapter feedback and accessible error retry');
  }finally{
    if(process.env.VALIDATION_OUTPUT)fs.writeFileSync(process.env.VALIDATION_OUTPUT,JSON.stringify(report,null,2)+'\n');
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});

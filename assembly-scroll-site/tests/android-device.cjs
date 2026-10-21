const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const out = process.env.VALIDATION_DIR || path.resolve(__dirname, '../validation/mobile-improvements');
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = [];
    ws.onmessage = event => { const msg = JSON.parse(event.data); if (msg.id) { const p = this.pending.get(msg.id); if (!p) return; this.pending.delete(msg.id); clearTimeout(p.timer); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } else this.handlers.forEach(fn => fn(msg)); };
  }
  static async open() { const tabs = await (await fetch('http://127.0.0.1:9227/json/list')).json(); const target = tabs.find(t=>t.url.includes('audit=android-mobile-fixes')); if (!target) throw new Error('Open the dedicated assembly audit tab first'); const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;}); return new CDP(ws); }
  send(method,params={}) { return new Promise((resolve,reject)=>{ const id=++this.id; const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`CDP timeout ${method}`));},20000); this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}));}); }
  async eval(expression) { const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; }
  async state() { return this.eval(`(() => { const $=s=>document.querySelector(s); const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};return {stage:{...$('#stage').dataset},canvas:{...$('#assembly').dataset},viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visualHeight:visualViewport.height,visualWidth:visualViewport.width,visualScale:visualViewport.scale,visualOffset:visualViewport.offsetTop,scrollY},artwork:rect($('#artwork')),canvasRect:rect($('#assembly')),controls:rect($('.controls')),panelOpen:$('#instructions').open,panel:rect($('.instruction-body')),nav:[...document.querySelectorAll('nav a')].map(e=>({text:e.textContent,rect:rect(e),font:getComputedStyle(e).fontSize,current:e.getAttribute('aria-current')})),horizontalOverflow:document.documentElement.scrollWidth>innerWidth,load:$('#load-state').hidden?'':$('#load-message').textContent,span:$('#story').offsetHeight-$('#stage').offsetHeight,connection:navigator.connection?{type:navigator.connection.effectiveType,downlink:navigator.connection.downlink,rtt:navigator.connection.rtt,saveData:navigator.connection.saveData}:null}})()`); }
  async wait(expression,timeout=20000) { const end=Date.now()+timeout;while(Date.now()<end){if(await this.eval(expression))return;await sleep(100);}throw new Error('Wait failed: '+expression); }
  async tap(selector) { const p=await this.eval(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); await this.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,radiusX:2,radiusY:2}]});await this.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); }
  async shot(name) { const r=await this.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64')); }
  close() { this.ws.close(); }
}
const adb = args => execFileSync('adb',args,{timeout:20000});
const save=(name,data)=>fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(data,null,2)+'\n');
module.exports={CDP,sleep,adb,save,out};
if(require.main===module) (async()=>{const c=await CDP.open();try{console.log(JSON.stringify(await c.state(),null,2));}finally{c.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});

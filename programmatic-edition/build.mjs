import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

// All drawing is deterministic SVG geometry. No image-generation service is used.
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const modules = process.env.CODEX_NODE_MODULES || '/Users/ykondras/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const require = createRequire(path.join(modules, '_resolve.cjs'));
const sharp = require('sharp');
const {chromium} = require('playwright');
const OUT = path.join(ROOT, 'output');
await fs.mkdir(OUT, {recursive: true});

const ink = '#181818', muted = '#585858', rule = '#d1d1ce';
const escape = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const text = (s,x,y,size=24,weight=400,anchor='start',color=ink) => `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${color}">${escape(s)}</text>`;
const line = (x,y,x2,y2,color=ink,width=2,dash='') => `<path d="M${x} ${y} L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}"${dash?` stroke-dasharray="${dash}"`:''}/>`;
const curve = (d,width=3,color=ink) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const group = (svg,x=0,y=0,s=1) => `<g transform="translate(${x} ${y}) scale(${s})">${svg}</g>`;
const circle = (x,y,r,fill='white',stroke=ink,width=2) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
const polygon = (pts,fill='#fafafa',width=1.7) => `<polygon points="${pts.map(p=>p.join(',')).join(' ')}" fill="${fill}" stroke="${ink}" stroke-width="${width}" stroke-linejoin="round"/>`;
const arrow = (x,y,h=50,w=22) => `<path d="M${x-w*.17} ${y}h${w*.34}v${h*.66}h${w*.33}L${x} ${y+h}l${-w*.5} ${-h*.34}h${w*.33}Z" fill="${ink}"/>`;
const badge = (label,x,y,r=20) => circle(x,y,r,ink,ink,0)+text(label,x,y+7,r*.95,700,'middle','white');
const check = (x,y,s=1) => group(curve('M0 10 L10 20 L31 -3',4),x,y,s);

// The same projected CAD paths are reused at every step.
const shapes = {};
for (const key of ['xiao-iso','wio-iso','wio-bottom','stack-iso']) {
  const meta = JSON.parse(await fs.readFile(path.join(ROOT,'geometry',key+'.json'),'utf8'));
  let svg = await fs.readFile(path.join(ROOT,'geometry',key+'.svg'),'utf8');
  svg = svg.replace(/^<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'');
  svg = svg.replaceAll('stroke-width=".9"','stroke-width="1.65"').replaceAll('stroke-width="1.3"','stroke-width="2.1"');
  svg = svg.replaceAll('#171c23',ink).replaceAll('#fbfbfa','#fcfcfb');
  if (key === 'xiao-iso' || key === 'wio-iso') {
    const [x,y] = meta.landmarks.shield_center;
    const first = key === 'xiao-iso' ? 'XIAO' : 'WIO';
    const second = key === 'xiao-iso' ? 'ESP32S3' : 'SX1262';
    svg += `<g transform="matrix(.8660254 -.3535534 .5 .6123724 ${x} ${y})">${text(first,0,-4,27,700,'middle')}${text(second,0,27,26,700,'middle')}</g>`;
  }
  shapes[key] = {...meta,body:svg};
}
function board(key,x,y,s) {
  const m = shapes[key];
  const pts = Object.fromEntries(Object.entries(m.landmarks).map(([k,p])=>[k,[x+p[0]*s,y+p[1]*s]]));
  return {svg:group(m.body,x,y,s),...pts};
}
function boardAtOrigin(key,ox,oy,px) {
  const m=shapes[key],s=px/m.mm_to_px;
  return board(key,ox-(8-m.projected_bounds_mm[0]*22)*s,oy-(8-m.projected_bounds_mm[1]*22)*s,s);
}
const project = ([x,y,z=0]) => [.8660254038*x-.5*y,-.3535533906*x-.6123724357*y-.7071067812*z];

function antenna(kind,x,y,s=8) {
  const w=kind==='wifi'?17.5:7, len=kind==='wifi'?37.4:40;
  const p=(a,b,z=0)=>{const q=project([a,b,z]);return [x+q[0]*s,y+q[1]*s];};
  const a=p(0,0),b=p(w,0),c=p(w,len),d=p(0,len);
  let svg=polygon([a,b,p(w,0,-.16),p(0,0,-.16)],'#e5e5e3')+polygon([a,d,p(0,len,-.16),p(0,0,-.16)],'#ededeb')+polygon([a,b,c,d],'#f8f8f6',2);
  const feed=kind==='wifi'?p(w/2,len/2):p(w/2,3);
  svg+=`<ellipse cx="${feed[0]}" cy="${feed[1]}" rx="${s*.6}" ry="${s*.38}" fill="#c5c5c2" stroke="${ink}" stroke-width="1.3"/>`;
  const label=p(w/2,len*.70);
  svg+=`<g transform="rotate(-22.21 ${label[0]} ${label[1]})">${text(kind==='wifi'?'2.4 GHz':'LoRa',label[0],label[1],Math.max(s*1.8,14),400,'middle',muted)}</g>`;
  return {svg,feed};
}

// Schematic low-profile stamped RF plug. The crimp and cable leave toward
// the rear of the PCB, matching the photographed kit. Dimensions are visual.
function plug(x,y,px=12) {
  const p=(a,b,z=0)=>{const q=project([a,b,z]);return [x+q[0]*px,y+q[1]*px];};
  const edge=[[-.92,-.82],[.68,-.94],[1,-.60],[1,.55],[.60,.93],[-.68,.93],[-1,.50],[-1,-.50]];
  const top=edge.map(([a,b])=>p(a,b,.65));
  const bottom=edge.map(([a,b])=>p(a,b,.10));
  let svg=polygon([bottom[0],bottom[1],bottom[2],bottom[3],top[3],top[2],top[1],top[0]],'#d7d7d4',1.4);
  svg+=polygon([bottom[0],bottom[7],bottom[6],top[6],top[7],top[0]],'#dededb',1.4);
  svg+=polygon(top,'#f5f5f3',1.6);
  svg+=polygon([p(-.58,.55,.48),p(.58,.55,.48),p(.48,2.65,.48),p(-.48,2.65,.48)],'#e1e1de',1.5);
  svg+=polygon([p(.58,.55,.48),p(.48,2.65,.48),p(.48,2.65,.18),p(.58,.55,.18)],'#c9c9c6',1.2);
  for(const b of [1.5,2.15]) {const a=p(-.5,b,.5),c=p(.5,b,.5);svg+=line(...a,...c,ink,1.2);}
  return {svg,tail:p(0,2.65,.32)};
}
function socket(x,y,px=25) {
  const p=(a,b,z=0)=>{const q=project([a,b,z]);return [x+q[0]*px,y+q[1]*px];};
  let svg=polygon([p(-1.3,-1.3),p(1.3,-1.3),p(1.3,1.3),p(-1.3,1.3)],'#e8e8e5');
  const cx=x,cy=y-px*.27;
  svg+=`<ellipse cx="${cx}" cy="${cy+px*.22}" rx="${px*.98}" ry="${px*.7}" fill="#dededb" stroke="${ink}" stroke-width="1.5"/>`;
  svg+=`<ellipse cx="${cx}" cy="${cy}" rx="${px*.98}" ry="${px*.7}" fill="#fbfbf9" stroke="${ink}" stroke-width="1.7"/>`;
  svg+=`<ellipse cx="${cx}" cy="${cy}" rx="${px*.65}" ry="${px*.44}" fill="#ccccca" stroke="${ink}" stroke-width="1.4"/>`;
  svg+=curve(`M${cx-1.5} ${cy}v${-px*.30}q1.5 -5 3 0v${px*.30}`,2);
  return svg;
}

function snapDetail(cx,cy) {
  const top=plug(cx,cy-39,23);
  let s=circle(cx,cy,116,'white',ink,2);
  s+=text('PLUG DETAIL',cx,cy-134,17,700,'middle',muted);
  s+=socket(cx,cy+58,22)+top.svg;
  s+=curve(`M${top.tail} C${cx-58} ${cy-96} ${cx-79} ${cy-70} ${cx-86} ${cy-41}`,3.4);
  s+=arrow(cx,cy-11,38,20);
  return s;
}

function partsScene() {
  const a=board('xiao-iso',12,205,.46),b=board('wio-iso',292,214,.46);
  const c=antenna('wifi',730,465,8.2),d=antenna('lora',1025,465,8.2);
  const pc=plug(780,493,9),pd=plug(1044,500,9);
  let s=a.svg+b.svg+c.svg+d.svg;
  s+=curve(`M${c.feed} C690 480 655 520 700 523 C746 526 794 529 ${pc.tail[0]} ${pc.tail[1]}`,2.8)+pc.svg;
  s+=curve(`M${d.feed} C1087 507 1008 553 997 524 C993 510 1014 496 ${pd.tail[0]} ${pd.tail[1]}`,2.8)+pd.svg;
  for(const [x,id,label,sub] of [[140,'A','XIAO ESP32S3','Main board'],[420,'B','Wio-SX1262','Radio board'],[715,'C','2.4 GHz antenna','Wide strip'],[1000,'D','LoRa antenna','Narrow strip']]) {
    s+=badge(id,x-34,572,17)+text('1×',x+7,579,23,700,'middle');
    s+=text(label,x,617,23,700,'middle')+text(sub,x,648,20,400,'middle',muted);
  }
  return s;
}
function antennaScene(kind) {
  const key=kind==='wifi'?'xiao-iso':'wio-iso';
  const q=board(key,57,220,.67);
  const f=antenna(kind,775,540,kind==='wifi'?10.1:11.0);
  const cap=plug(q.rf[0],q.rf[1]-77,13);
  let s=q.svg+f.svg;
  // Cables are separate layout curves, fixed attachment points are never moved.
  const ty=kind==='wifi'?117:125;
  s+=curve(`M${f.feed} C870 323 795 ${ty} 608 ${ty} C430 ${ty} 335 104 ${cap.tail[0]} ${cap.tail[1]}`,3.2)+cap.svg;
  s+=line(q.rf[0],q.rf[1]-44,q.rf[0],q.rf[1]-3,'#9a9a96',1.4,'4 5');
  s+=arrow(q.rf[0],q.rf[1]-47,35,20);
  s+=snapDetail(969,262);
  s+=badge(kind==='wifi'?'A':'B',53,160,18)+badge(kind==='wifi'?'C':'D',kind==='wifi'?982:858,532,18);
  s+=text(kind==='wifi'?'Wide strip → XIAO':'Narrow strip → Wio',4,610,28,700);
  s+=text('Align the metal plug. Press gently until seated.',4,649,25,400,'start',muted);
  return s;
}

function undersideInset() {
  // Schematic section explains the otherwise hidden mating connector.
  let s=text('CONNECTOR DETAIL',0,0,17,700,'start',muted);
  s+=polygon([[0,38],[142,38],[142,49],[0,49]],'#f2f2ef',1.5);
  s+=polygon([[42,49],[100,49],[100,70],[42,70]],'#e1e1dd',1.5);
  s+=line(49,65,93,65,ink,2);
  s+=arrow(71,79,34,18);
  s+=polygon([[0,145],[142,145],[142,156],[0,156]],'#f2f2ef',1.5);
  s+=polygon([[38,124],[104,124],[104,145],[38,145]],'#e1e1dd',1.5);
  s+=line(45,127,97,127,ink,2);
  s+=text('Wio underside',162,49,21,400)+text('XIAO top',162,149,21,400);
  return s;
}
function stackScene() {
  const px=9.8,lower=boardAtOrigin('xiao-iso',360,555,px),upper=boardAtOrigin('wio-iso',360,329,px);
  let s='';
  s+=line(upper.b2b[0],upper.b2b[1],lower.b2b[0],lower.b2b[1],'#9c9c98',1.4,'6 6');
  s+=lower.svg+upper.svg;
  const u=plug(upper.rf[0],upper.rf[1]+1,9.8),l=plug(lower.rf[0],lower.rf[1]+1,9.8);
  // Attached antenna leads exit behind the boards, clear of the joining gap.
  s+=curve(`M${u.tail} C128 148 96 104 34 119`,3)+u.svg;
  s+=curve(`M${l.tail} C440 307 573 345 566 253 C564 189 541 163 520 153`,3)+l.svg;
  s+=text('D',23,110,21,700)+text('C',518,143,21,700);
  s+=arrow(108,336,62,27)+arrow(517,336,62,27);
  s+=badge('B',510,222,18)+badge('A',523,462,18);
  s+=text('Align here',8,442,20,700);
  s+=curve(`M111 436 L${lower.b2b[0]-8} ${lower.b2b[1]}`,1.5,muted);
  s+=group(undersideInset(),650,146);

  // Finished state shares the same CAD coordinates, with both plugs seated.
  const done=board('stack-iso',724,370,.34);
  const dp=plug(...done.wio_rf,7.3),xp=plug(...done.xiao_rf,7.3);
  const fa=antenna('lora',718,451,3.6),fb=antenna('wifi',1024,468,3.1);
  s+=fa.svg+fb.svg;
  // The hidden XIAO cable end is occluded by the upper board silhouette.
  s+=curve(`M${fb.feed} C1002 522 940 542 948 429 C951 397 881 379 ${xp.tail[0]} ${xp.tail[1]}`,2.4);
  s+=curve(`M${fa.feed} C663 409 684 344 ${dp.tail[0]} ${dp.tail[1]}`,2.4);
  s+=done.svg+dp.svg;
  s+=text('ASSEMBLED',819,589,18,700,'middle',muted)+check(930,574,.65);
  s+=text('Wio above XIAO. Press evenly at the connector.',4,610,27,700);
  s+=text('Keep both antenna cables outside the gap.',4,649,25,400,'start',muted);
  return s;
}

const scenes=[partsScene(),antennaScene('wifi'),antennaScene('lora'),stackScene()];
const titles=['Check the parts','Connect the 2.4 GHz antenna','Connect the LoRa antenna','Join the boards'];
const subtitles=['Match the letters throughout the guide.','XIAO ESP32S3 • Wi-Fi / Bluetooth','Wio-SX1262 • LoRa radio','Both component sides face up.'];
function panel(i) {
  return text(i+1,0,72,94,700)+text(titles[i],95,53,39,700)+text(subtitles[i],98,95,23,400,'start',muted)+scenes[i];
}
const svgRoot=(body,w,h,title)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><title>${escape(title)}</title><rect width="${w}" height="${h}" fill="white"/>${body}</svg>`;
const usbIcon=group(`<rect x="0" y="0" width="42" height="24" rx="5" fill="white" stroke="${ink}" stroke-width="2.4"/><path d="M8 24v20h25V24M20 44v26" fill="none" stroke="${ink}" stroke-width="2.4"/>${line(-11,62,52,-6,ink,3.8)}`,2020,57,.9);
let sheet=text('MESH KIT',60,100,67,700)+text('XIAO ESP32S3 + Wio-SX1262',63,153,32,400);
sheet+=text('ASSEMBLY GUIDE',2340,54,21,700,'end',muted);
sheet+=usbIcon+text('Keep USB unplugged',2100,104,24,700)+text('until assembly is complete.',2100,139,22,400,'start',muted);
sheet+=line(60,194,2340,194,ink,2.5)+line(1200,229,1200,1607,rule,1.5)+line(60,905,2340,905,rule,1.5);
for(let i=0;i<4;i++) sheet+=group(panel(i),i%2?1240:60,i<2?223:925);
sheet+=line(60,1624,2340,1624,rule,1.5);
sheet+=text('Match the small board connector. The side pins do not join the boards.',60,1663,21,400,'start',muted);
sheet+=`<a href="https://wiki.seeedstudio.com/wio_sx1262_with_xiao_esp32s3_kit/">${text('Seeed CAD + kit photos · simplified assembly views',2340,1663,19,400,'end',muted)}</a>`;
const full=svgRoot(sheet,2400,1697,'XIAO ESP32S3 and Wio-SX1262 assembly guide');
await fs.writeFile(path.join(OUT,'xiao-wio-assembly.svg'),full);
await sharp(Buffer.from(full)).resize(3600,2546).png().toFile(path.join(OUT,'xiao-wio-assembly.png'));
await sharp(Buffer.from(full)).resize(1800,1273).png().toFile(path.join(OUT,'xiao-wio-assembly-preview.png'));
for(let i=0;i<4;i++) {
  const filename=['01-parts','02-wifi-antenna','03-lora-antenna','04-join-boards'][i];
  let body=text('XIAO ESP32S3 + Wio-SX1262',64,59,24,400,'start',muted)+text(`${i+1} / 4`,1856,59,24,700,'end');
  body+=line(64,84,1856,84,rule,1.2)+group(panel(i),267,151,1.26);
  body+=text('Connect both antennas before USB power.',64,1042,21,400,'start',muted);
  const content=svgRoot(body,1920,1080,titles[i]);
  await fs.writeFile(path.join(OUT,filename+'.svg'),content);
  await sharp(Buffer.from(content)).png().toFile(path.join(OUT,filename+'.png'));
}

// Chromium prints SVG paths as vectors, preserving selectable text.
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
  const page=await browser.newPage();
  await page.setContent(`<!doctype html><meta charset="utf-8"><title>Mesh kit assembly</title><style>@page{size:A3 landscape;margin:0}html,body{margin:0;padding:0;width:420mm;height:297mm}svg{display:block;width:420mm;height:297mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>${full}`,{waitUntil:'load'});
  await page.evaluate(()=>document.fonts.ready);
  await page.pdf({path:path.join(OUT,'xiao-wio-assembly.pdf'),preferCSSPageSize:true,printBackground:true});
} finally {await browser.close();}
console.log('Created vector sheet, A3 PDF and four 1920 × 1080 step images.');

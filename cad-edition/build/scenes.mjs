import fs from 'node:fs/promises';
import {antenna,plug,socket,saveSvg} from './accessories.mjs';
const ROOT='/Users/ykondras/vid/assembly-manual/cad-edition';
const data={};
for(const key of ['xiao','wio']){
 const meta=JSON.parse(await fs.readFile(ROOT+'/cad/'+key+'-iso.json','utf8'));
 let svg=await fs.readFile(meta.svg,'utf8');svg=svg.replace(/^<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'');
 // Slightly heavier visible edges remain legible when printed four-up.
 svg=svg.replaceAll('stroke-width=".9"','stroke-width="1.5"').replaceAll('stroke-width="1.3"','stroke-width="1.7"');
 const [cx,cy]=meta.landmarks.shield_center;
 svg+=`<g transform="matrix(.8660254 -.3535534 .5 .6123724 ${cx} ${cy})" font-family="Arial" font-size="27" text-anchor="middle" font-weight="bold" fill="#181818"><text x="0" y="-5">${key==='xiao'?'XIAO':'WIO'}</text><text x="0" y="27">${key==='xiao'?'ESP32S3':'SX1262'}</text></g>`;
 data[key]={...meta,body:svg};
}
function board(key,x,y,s){
 const b=data[key],landmarks=Object.fromEntries(Object.entries(b.landmarks).map(([k,[a,c]])=>[k,[x+a*s,y+c*s]]));
 return {svg:`<g transform="translate(${x} ${y}) scale(${s})">${b.body}</g>`,...landmarks};
}
function atOrigin(key,ox,oy,pxPerMm){
 const b=data[key],s=pxPerMm/b.mm_to_px;
 const origin=[8-b.projected_bounds_mm[0]*b.mm_to_px,8-b.projected_bounds_mm[1]*b.mm_to_px];
 return board(key,ox-origin[0]*s,oy-origin[1]*s,s);
}
const cable=(d,w=3)=>`<path d="${d}" fill="none" stroke="#151515" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const note=(txt,x,y,size=18)=>`<text x="${x}" y="${y}" font-family="Arial" font-size="${size}" fill="#555">${txt}</text>`;
const arrows=[[],[],[],[]];
let b=board('xiao',24,142,9/22),w=board('wio',303,153,9/22),a=antenna('wifi',716,350,8),l=antenna('lora',1070,350,8);
let svg=b.svg+w.svg+a.svg+l.svg;
svg+=cable(`M${a.feed} C690 410 910 455 900 420 C890 405 865 405 848.4 406.2`)+plug(822,405,1.2);
svg+=cable(`M${l.feed} C1170 410 1060 455 1050 420 C1045 405 1070 406.2 1093.6 406.2`)+plug(1120,405,1.2,-1);
await saveSvg('scene-0',svg,1200,450,2.5);
for(let i=1;i<=2;i++){
 const key=i===1?'xiao':'wio';
 const q=board(key,67,130,.58),rf=q.rf,cap=[rf[0],rf[1]-75];
 const f=antenna(i===1?'wifi':'lora',775,395,9.6);
 svg=q.svg+f.svg;
 const neck=[cap[0]+22*1.6,cap[1]+1];
 svg+=cable(`M${f.feed} C880 200 820 25 650 22 C480 20 350 35 ${neck[0]} ${neck[1]}`,3.4)+plug(...cap,1.6);
 // Consistent enlarged connector, with the cable entering the crimp neck.
 svg+=`<circle cx="1055" cy="270" r="124" fill="#fff" stroke="#181818" stroke-width="1.5"/>`;
 svg+=note('Detail',1018,171,18);
 svg+=`<path d="M963 336 L1029 298 L1145 339 L1075 379Z" fill="#f5f5f5" stroke="#161616" stroke-width="1.1"/>`;
 svg+=socket(1050,321,3.5)+plug(1050,219,3.6);
 svg+=cable('M1129 221 C1150 222 1163 229 1172 235',5);
 arrows[i].push({x:rf[0]-10,y:rf[1]-49,w:20,h:32},{x:1036,y:263,w:28,h:34});
 await saveSvg('scene-'+i,svg,1200,450,2.5);
}
// Both boards share one projected coordinate system. Only Z separation is enlarged.
const px=8.3;
const lower=atOrigin('xiao',625,414,px),upper=atOrigin('wio',625,205,px);
a=antenna('wifi',240,372,7.1);l=antenna('lora',1087,245,7.1);
svg=a.svg+l.svg;
svg+=`<path d="M${upper.b2b} L${lower.b2b}" stroke="#777" stroke-width="1.4" stroke-dasharray="6 6" fill="none"/>`;
svg+=lower.svg+upper.svg;
// The plug cover sits over each socket. Cable tails point out of the stack.
svg+=cable(`M${a.feed} C230 424 380 440 763 435 C870 433 850 242 ${lower.rf[0]+22*.95} ${lower.rf[1]+2}`,3.1);
svg+=plug(lower.rf[0],lower.rf[1]+1,.95);
svg+=cable(`M${l.feed} C1180 150 1010 8 822 18 C730 20 635 30 ${upper.rf[0]+22*.95} ${upper.rf[1]+2}`,3.1);
svg+=plug(upper.rf[0],upper.rf[1]+1,.95);
arrows[3].push({x:452,y:212,w:25,h:46},{x:760,y:211,w:25,h:46});
svg+=note('B2B',366,292,18)+`<path d="M410 286 L${lower.b2b[0]-8} ${lower.b2b[1]}" stroke="#666" stroke-width="1.2" fill="none"/>`;

await saveSvg('scene-3',svg,1200,450,2.5);
await fs.writeFile(ROOT+'/assets/scene-arrows.json',JSON.stringify(arrows,null,2));
await fs.writeFile(ROOT+'/build/scene-metadata.json',JSON.stringify({data:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,{landmarks:v.landmarks,width:v.width,height:v.height}])),arrows},null,2));

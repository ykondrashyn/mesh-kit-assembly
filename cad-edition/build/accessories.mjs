import fs from 'node:fs/promises';
import sharp from '/Users/ykondras/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.mjs';
const root='/Users/ykondras/vid/assembly-manual/cad-edition';
export const P=([x,y,z=0])=>[.8660254*x-.5*y,-.3535534*x-.6123724*y-.7071068*z];
const poly=(pts,fill='#fafafa',stroke=1.6)=>`<polygon points="${pts.map(p=>p.join(',')).join(' ')}" fill="${fill}" stroke="#161616" stroke-width="${stroke}" stroke-linejoin="round"/>`;
export function antenna(kind, x=0,y=0,s=10){
 const w=kind==='wifi'?17.5:7,l=kind==='wifi'?37.4:40;
 const p=(a,b,z=0)=>{const q=P([a,b,z]);return [x+q[0]*s,y+q[1]*s];};
 const a=p(0,0),b=p(w,0),c=p(w,l),d=p(0,l),a1=p(0,0,-.25),b1=p(w,0,-.25),d1=p(0,l,-.25);
 let svg=poly([a,b,b1,a1],'#dddddd')+poly([a,d,d1,a1],'#eeeeee')+poly([a,b,c,d]);
 const pt=kind==='wifi'?p(w/2,l/2):p(w/2,3);
 // Antenna feed is a permanent solder joint, not another snap connector.
 svg+=`<ellipse cx="${pt[0]}" cy="${pt[1]}" rx="${s*.65}" ry="${s*.45}" fill="#bdbdbd" stroke="#333" stroke-width="1.2"/>`;
 const center=p(w/2,l*.65);
 const rot=-22.207;
 svg+=`<text x="${center[0]}" y="${center[1]}" font-family="Arial" font-size="${Math.max(10,s*1.5)}" text-anchor="middle" fill="#444" transform="rotate(${rot} ${center[0]} ${center[1]})">${kind==='wifi'?'2.4 GHz':'LoRa'}</text>`;
 return {svg,feed:pt};
}
export function plug(x,y,s=1,side=1){
 // Shallow stamped cover, single rim and horizontal coax crimp.
 return `<g transform="translate(${x} ${y}) scale(${s*side} ${s})" stroke="#151515" stroke-width="1.2" stroke-linejoin="round"><path d="M-9 0 Q-10-5-5-7 L6-8 Q10-7 10-3 L9 4 Q7 7-1 7 L-7 4Z" fill="#cfcfcf"/><path d="M-9-2 Q-9-6-4-8 L5-9 Q9-8 10-4 L8 1 Q4 4-3 3 L-8 1Z" fill="#f8f8f8"/><path d="M8-5 L18-3 L22 0 L21 4 L9 2Z" fill="#dedede"/><path d="M16-3 L16 3 M20-1 L20 4" fill="none"/></g>`;
}
export function socket(x,y,s=1){
 return `<g transform="translate(${x} ${y}) scale(${s})" stroke="#161616" stroke-width="1.1"><path d="M-13-2 L-3-10 L14-1 L4 8Z" fill="#e6e6e6"/><ellipse cx="0" cy="-2" rx="8" ry="5" fill="#fff"/><path d="M-8-2 L-8 2 A8 5 0 0 0 8 2 L8-2" fill="#d4d4d4"/><ellipse cx="0" cy="-2" rx="8" ry="5" fill="#fff"/><ellipse cx="0" cy="-2" rx="4.8" ry="2.8" fill="#bcbcbc"/><path d="M-1-1 L-1-5 Q0-7 1-5 L1-1" fill="#fff"/></g>`;
}
export async function saveSvg(name,svg,w,h,scale=2){
 const body=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${svg}</svg>`;
 await fs.writeFile(root+'/assets/'+name+'.svg',body);
 await sharp(Buffer.from(body)).resize(Math.round(w*scale),Math.round(h*scale)).png().toFile(root+'/assets/'+name+'.png');
}
const wifi=antenna('wifi',200,340,9),lora=antenna('lora',200,340,9);
await saveSvg('wifi-fpc',wifi.svg,400,400);
await saveSvg('lora-fpc',lora.svg,400,400);
await fs.writeFile(root+'/assets/antenna-landmarks.json',JSON.stringify({wifi:{feed:wifi.feed},lora:{feed:lora.feed}},null,2));

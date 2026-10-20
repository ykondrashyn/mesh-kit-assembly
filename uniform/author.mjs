const ROOT = '/Users/ykondras/vid/assembly-manual/uniform';
const WIKI = 'https://wiki.seeedstudio.com/wio_sx1262_with_xiao_esp32s3_kit/';
const BOARDS = ROOT + '/assets/board-masters.png';
const ACCESSORIES = ROOT + '/assets/accessory-masters.png';
let mode='native', imageIndex=0, imageStart=0, imageEnd=0;
const specs = {
  xiao: {file:BOARDS, size:[1774,887], box:[140,144,857,846], rf:[558,210]},
  wio: {file:BOARDS, size:[1774,887], box:[935,154,1698,777], rf:[1043,285]},
  wifi: {file:ACCESSORIES, size:[2172,724], box:[81,33,803,655], feed:[455,340]},
  lora: {file:ACCESSORIES, size:[2172,724], box:[912,34,1542,665], feed:[1464,576]},
  plug: {file:ACCESSORIES, size:[2172,724], box:[1736,286,2019,449], center:[1824,366], neck:[2011,366]},
};
function text(s,name,value,x,y,w,h,size=24,bold=false,color='#111111') {
  if(mode==='images') return null;
  const t=s.shapes.add({name,geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
  t.text=value;
  t.text.style={fontFamily:'Arial',fontSize:size,bold,color};
  t.text.insets=0;
  return t;
}
function region(s,name,file,size,box,left,top,scale,geometry) {
  const ordinal=imageIndex++;
  if(mode!=='images'||ordinal<imageStart||ordinal>=imageEnd) return null;
  const [x0,y0,x1,y1]=box;
  return s.images.add({name,path:file,contentType:'image/png',alt:name,fit:'contain',position:{left,top,width:(x1-x0)*scale,height:(y1-y0)*scale},crop:{left:x0/size[0],top:y0/size[1],right:1-x1/size[0],bottom:1-y1/size[1]},...(geometry?{geometry}:{})});
}
function asset(s,key,left,top,scale,name=key) {
  const a=specs[key];
  const image=region(s,name,a.file,a.size,a.box,left,top,scale);
  const at=point=>[left+(point[0]-a.box[0])*scale,top+(point[1]-a.box[1])*scale];
  return {image,rf:a.rf?at(a.rf):null,feed:a.feed?at(a.feed):null,at};
}
function plug(s,x,y,scale=.14,name='RF plug') {
  const a=specs.plug;
  const item=asset(s,'plug',x-(a.center[0]-a.box[0])*scale,y-(a.center[1]-a.box[1])*scale,scale,name);
  return item.at(a.neck);
}
function path(s,name,commands,width=4,color='#111111') {
  if(mode==='images') return null;
  return s.shapes.add({name,geometry:'custom',position:{left:0,top:0,width:1280,height:720},fill:'none',line:{style:'solid',fill:color,width},customPaths:[{width:1280,height:720,commands}]});
}
const M=p=>({moveTo:{x:p[0],y:p[1]}});
const C=(a,b,p)=>({cubicBezTo:{x1:a[0],y1:a[1],x2:b[0],y2:b[1],x:p[0],y:p[1]}});
function cable(s,name,start,curves,width=4) {
  path(s,name,[M(start),...curves.map(c=>C(c[0],c[1],c[2]))],width);
}
function dash(s,name,a,b,width=1.5) {
  const d=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const cmds=[];
  for(let n=0;n<d;n+=15){const t=n/d,u=Math.min(n+8,d)/d;cmds.push(M([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]),{lineTo:{x:a[0]+(b[0]-a[0])*u,y:a[1]+(b[1]-a[1])*u}});}
  path(s,name,cmds,width,'#666666');
}
function arrow(s,x,y,w=23,h=35) {
  if(mode==='images') return;
  s.shapes.add({name:'Seat downward',geometry:'downArrow',position:{left:x-w/2,top:y,width:w,height:h},fill:'#111111',line:{fill:'none',width:0}});
}
function zoom(s,key,rf) {
  const a=specs[key], cx=1068, cy=489;
  dash(s,'Detail leader',rf,[925,435]);
  if(mode!=='images') s.shapes.add({name:'Connector detail',geometry:'ellipse',position:{left:925,top:290,width:290,height:290},fill:'#ffffff',line:{fill:'#111111',width:2}});
  const b=[a.rf[0]-80,a.rf[1]-60,a.rf[0]+80,a.rf[1]+60];
  region(s,key+' identical RF detail',a.file,a.size,b,cx-115,cy-86.25,230/160,'ellipse');
  const neck=plug(s,cx,366,.36,'Same RF plug detail');
  cable(s,'Detail cable',neck,[[[1164,366],[1183,370],[1202,380]]],7);
  arrow(s,cx,410,31,40);
}
function title(s,i,label) {
  s.background.fill='#ffffff';
  text(s,'Step number',String(i),58,29,90,100,84,true);
  text(s,'Step title',label,166,50,1040,70,46,true);
  text(s,'Official image reference','Image references: Seeed Studio kit wiki',864,20,360,20,14,false,'#555555');
}
const names=['Parts','Wi-Fi / Bluetooth antenna','LoRa antenna','Board stack'];
const captions=['','Broad 2.4 GHz antenna + XIAO','Slim LoRa antenna + Wio-SX1262','Wio above XIAO. Align the small B2B connector.'];
const details=['','Align the metal cap. Seat it gently over the socket.','Align the metal cap. Seat it gently over the socket.','Gap enlarged for clarity. Press evenly with cables outside the stack.'];
export async function authorStep({presentation,input}) {
  const i=input.step;
  mode=input.stage||'native'; imageIndex=0; imageStart=input.start||0; imageEnd=input.end||100;
  let s=presentation.slides.items[i];
  if(!s) s=presentation.slides.add({width:1280,height:720});
  if(mode==='native'&&(s.images.items.length||s.shapes.items.length)) throw new Error('This step already contains content');
  title(s,i,names[i]);
  if(i===0){
    asset(s,'xiao',85,220,.30,'XIAO master');
    asset(s,'wio',370,228,.282,'Wio master');
    const wi=asset(s,'wifi',640,175,.35,'Wi-Fi FPC');
    const lo=asset(s,'lora',955,175,.35,'LoRa FPC');
    const wn=plug(s,850,470,.13,'Wi-Fi plug');
    const ln=plug(s,1110,500,.13,'LoRa plug');
    cable(s,'Wi-Fi lead',wi.feed,[[[730,428],[758,530],wn]]);
    cable(s,'LoRa lead',lo.feed,[[[1195,525],[1060,565],ln]]);
    const cols=[[85,'1x XIAO ESP32S3','Soldered pin headers'],[370,'1x Wio-SX1262','Empty side holes'],[665,'1x Wi-Fi / Bluetooth','2.4 GHz, broad antenna'],[960,'1x LoRa antenna','860-930 MHz, slim strip']];
    for(const [x,a,b] of cols){text(s,a,a,x,618,275,30,22,true);text(s,b,b,x,654,275,26,18,false,'#555555');}
    text(s,'Power instruction','Keep USB disconnected during assembly. Drawings are not to scale.',60,690,1160,25,18,false,'#555555');
  } else if(i===1||i===2){
    const key=i===1?'xiao':'wio';
    const board=asset(s,key,130,270,i===1?.47:.44,key+' master');
    const ant=asset(s,i===1?'wifi':'lora',590,145,.43,i===1?'Wi-Fi FPC':'LoRa FPC');
    const cap=[board.rf[0],board.rf[1]-76];
    const neck=plug(s,cap[0],cap[1],.16,'Antenna snap cap');
    cable(s,'Antenna lead',ant.feed,[[[i===1?700:900,130],[475,115],neck]]);
    arrow(s,board.rf[0],board.rf[1]-49,23,30);
    zoom(s,key,board.rf);
  } else {
    dash(s,'Rear alignment',[566,212],[566,426]);
    dash(s,'Front alignment',[669,346],[670,559]);
    const lo=asset(s,'lora',920,145,.43,'LoRa FPC');
    const wi=asset(s,'wifi',65,290,.45,'Wi-Fi FPC');
    const w=asset(s,'wio',565,158,.305,'Wio master');
    const x=asset(s,'xiao',565,370,.33,'XIAO master');
    const wn=plug(s,w.rf[0],w.rf[1],.10,'LoRa cap seated');
    const xn=plug(s,x.rf[0],x.rf[1],.10,'Wi-Fi cap seated');
    cable(s,'LoRa attached lead',lo.feed,[[[1110,160],[790,102],wn]],4);
    cable(s,'Wi-Fi attached lead',wi.feed,[[[230,580],[350,616],[500,616]],[[925,616],[925,390],xn]],4);
    arrow(s,530,350,24,45);
    arrow(s,830,350,24,45);
  }
  if(i>0){text(s,'Instruction',captions[i],60,638,1160,36,28,true);text(s,'Instruction detail',details[i],60,680,1160,28,22,false,'#555555');}
  const sourceBase='https://files.seeedstudio.com/wiki/';
  s.speakerNotes.text='Visual reference: '+WIKI+'\n'+sourceBase+'XIAO_ESP32S3_for_Meshtastic_LoRa/2.png\n'+sourceBase+'XIAO_ESP32S3_for_Meshtastic_LoRa/10.png\n'+sourceBase+'SeeedStudio-XIAO-ESP32S3/img/front-indication.png\nSimplified illustrations based on official kit images. Attach both antennas before USB power. The ESP32S3 kit uses the small B2B connector between boards. Step 3 shows an enlarged separation gap.';
  if(mode==='images'&&imageEnd>=imageIndex){
    for(const shape of s.shapes.items) if(/Antenna lead|attached lead|Detail cable/.test(shape.name)) shape.bringToFront();
    for(const img of s.images.items) if(/cap|plug/i.test(img.alt||'')) img.bringToFront();
  }
  return {step:i,stage:mode,slideId:s.id,imageCount:s.images.items.length,plannedImages:imageIndex};
}

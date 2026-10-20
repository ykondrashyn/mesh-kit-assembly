const ROOT='/Users/ykondras/vid/assembly-manual/uniform';
const FILE=ROOT+'/assets/rf-plug-final.png';
const SIZE=[1254,1254], BOX=[170,327,950,870], CENTER=[400,725], TIP=[944,475];
function cap(s,name,center,scale,flip=false){
  const width=(BOX[2]-BOX[0])*scale,height=(BOX[3]-BOX[1])*scale;
  const cx=(CENTER[0]-BOX[0])*scale,cy=(CENTER[1]-BOX[1])*scale;
  const im=s.images.add({path:FILE,contentType:'image/png',alt:name,fit:'contain',position:{left:center[0]-(flip?width-cx:cx),top:center[1]-cy,width,height},crop:{left:BOX[0]/SIZE[0],top:BOX[1]/SIZE[1],right:1-BOX[2]/SIZE[0],bottom:1-BOX[3]/SIZE[1]}});
  im.flipHorizontal=flip;
  const sign=flip?-1:1;
  return [center[0]+sign*(TIP[0]-CENTER[0])*scale,center[1]+(TIP[1]-CENTER[1])*scale];
}
function path(s,name,start,curves,width=5){
  return s.shapes.add({name,geometry:'custom',position:{left:0,top:0,width:1280,height:720},fill:'none',line:{style:'solid',fill:'#111111',width},customPaths:[{width:1280,height:720,commands:[{moveTo:{x:start[0],y:start[1]}},...curves.map(([a,b,p])=>({cubicBezTo:{x1:a[0],y1:a[1],x2:b[0],y2:b[1],x:p[0],y:p[1]}}))]}]});
}
export async function fixCaps({presentation,input}){
  const i=input.step,s=presentation.slides.items[i];
  const images=s.images.items.filter(im=>/cap|plug/i.test(im.alt||''));
  const shapes=s.shapes.items.filter(sh=>/lead|Detail cable/.test(sh.name));
  presentation.delete([...images,...shapes].map(el=>el.toSnapshot().aid));
  if(i===0){
    const a=cap(s,'Wi-Fi plug',[850,470],.04),b=cap(s,'LoRa plug',[1110,500],.04);
    path(s,'Wi-Fi lead',a,[[[935,430],[735,530],[770.9,282.45]]],4.2);
    path(s,'LoRa lead',b,[[[1210,465],[1168,445],[1148.2,364.7]]],4.2);
  }else if(i===1||i===2){
    const rf=i===1?[326.46,301.02]:[177.52,327.64];
    const tip=cap(s,'Antenna snap cap',[rf[0],rf[1]-76],.063,i===2);
    if(i===1) path(s,'Antenna lead',tip,[[[450,170],[705,132],[750.82,277.01]]],6.6);
    else path(s,'Antenna lead',tip,[[[35,175],[925,80],[827.36,378.06]]],6.6);
    const z=cap(s,'Same RF plug detail',[1068,393],.18);
    path(s,'Detail cable',z,[[[1190,337],[1200,354],[1202,381]]],18.9);
    const arrows=s.shapes.items.filter(sh=>sh.name==='Seat downward');
    const zoomArrow=arrows.find(sh=>sh.position.left>900);
    if(zoomArrow) zoomArrow.position={left:1052.5,top:429,width:31,height:32};
  }else{
    const w=cap(s,'LoRa cap seated',[597.94,197.96],.05,true);
    const x=cap(s,'Wi-Fi cap seated',[702.94,391.78],.05);
    path(s,'LoRa attached lead',w,[[[495,157],[511,116],[670,124]],[[1080,128],[1175,261],[1157.36,378.06]]],5.25);
    path(s,'Wi-Fi attached lead',x,[[[928,306],[970,595],[530,612]],[[330,620],[233,546],[233.3,428.15]]],5.25);
  }
  for(const im of s.images.items) if(/cap|plug/i.test(im.alt||'')) im.bringToFront();
  return {step:i,replaced:images.length,images:s.images.items.length};
}

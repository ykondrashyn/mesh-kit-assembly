import fs from 'node:fs/promises';
const ROOT='/Users/ykondras/vid/assembly-manual/cad-edition';
const titles=['Parts','Wi-Fi / Bluetooth antenna','LoRa antenna','Join the boards'];
const main=['XIAO ESP32S3 + Wio-SX1262','Broad 2.4 GHz antenna connects to XIAO.','Slim LoRa antenna connects to Wio.','Wio above XIAO. Align the small B2B connector.'];
const sub=['Keep USB disconnected during assembly.','Align the plug over the socket. Press gently until seated.','Align the plug over the socket. Press gently until seated.','Press evenly. Keep both antenna cables outside the gap.'];
function text(s,name,value,x,y,w,h,size=26,bold=false,color='#171717'){
 const t=s.shapes.add({name,geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 t.text=value;t.text.style={fontFamily:'Arial',fontSize:size,bold,color};t.text.insets=0;return t;
}
export async function author({presentation,input}){
 const i=input.step;
 const s=presentation.slides.items[i] || presentation.slides.add({width:1280,height:720});
 s.background.fill='#ffffff';
 if(s.images.items.length||s.shapes.items.length) throw Error('Slide already contains content');
 text(s,'Step',String(i+1),54,30,90,90,80,true);
 text(s,'Title',titles[i],156,44,1060,70,45,true);
 s.images.add({name:'Assembly illustration',path:ROOT+'/assets/scene-'+i+'.png',contentType:'image/png',alt:titles[i]+' assembly drawing',position:{left:40,top:135,width:1200,height:450},fit:'contain'});
 if(i===0){
  const xs=[72,342,657,963],labels=[['1x XIAO ESP32S3','Headers already fitted'],['1x Wio-SX1262','LoRa extension board'],['1x 2.4 GHz antenna','Wi-Fi / Bluetooth'],['1x LoRa antenna','Long, narrow strip']];
  for(let n=0;n<4;n++){text(s,'Part '+n,labels[n][0],xs[n],573,285,32,24,true);text(s,'Part detail '+n,labels[n][1],xs[n],610,285,26,21,false,'#555555');}
  text(s,'Kit title',main[i],56,665,760,32,25,true);
  text(s,'Power note','USB power last',940,666,280,30,23);
 }else{
  text(s,'Instruction',main[i],56,606,1168,42,30,true);
  text(s,'Detail',sub[i],56,652,1168,33,24);
 }
 const arrows=JSON.parse(await fs.readFile(ROOT+'/assets/scene-arrows.json','utf8'))[i]||[];
 for(const [j,a] of arrows.entries())s.shapes.add({name:'Assembly movement '+j,geometry:'downArrow',position:{left:40+a.x,top:135+a.y,width:a.w,height:a.h},fill:'#141414',line:{fill:'none',width:0}});
 s.speakerNotes.text='Assembly instructions for the ESP32S3 B2B kit. Source: https://wiki.seeedstudio.com/wio_sx1262_with_xiao_esp32s3_kit/\nOfficial board STEP: https://files.seeedstudio.com/products/SenseCAP/Wio_SX1262/Wio-SX1262_for_XIAO_3D_file.step\nXIAO model: https://files.seeedstudio.com/wiki/SeeedStudio-XIAO-ESP32S3/res/seeed-studio-xiao-esp32s3-3d_model.zip\nAntenna drawing: https://files.seeedstudio.com/wiki/XIAO_WiFi/antenna/FPC_Antenna_2.4GHz_1.16dbi_for_XIAO_ESP32S3/res/Datasheet_2.4GHz_FPC_Antenna_1.16dbi_for_XIAO_ESP32S3.pdf\nAntenna dimensions: https://files.seeedstudio.com/wiki/XIAO_ESP32S3_for_Meshtastic_LoRa/37.png\nGeometry is simplified for assembly. Reconstructed antennas, cable plugs, XIAO B2B connector and fitted headers are based on published drawings and original kit photos. Exploded separation is enlarged. Side headers do not join the two boards.';
 return {step:i+1,slide:s.id};
}

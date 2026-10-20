from pathlib import Path
import json
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'output'
OUT.mkdir(exist_ok=True)
W,H=landscape(A4)
c=canvas.Canvas(str(OUT/'xiao-wio-assembly-sheet.pdf'),pagesize=(W,H))
c.setTitle('XIAO ESP32S3 + Wio-SX1262: Assembly guide')
c.setAuthor('Technical illustrations from Seeed models and kit references')
def txt(x,y,s,size=11,bold=False,gray=0):
 c.setFillGray(gray)
 c.setFont('Helvetica-Bold' if bold else 'Helvetica',size)
 c.drawString(x,H-y-size,s)
def line(x,y,x2,y2):
 c.setStrokeGray(.75);c.setLineWidth(.5);c.line(x,H-y,x2,H-y2)
txt(25,18,'XIAO ESP32S3 + Wio-SX1262',24,True)
txt(25,49,'Assembly guide',12)
txt(575,26,'Antennas first. USB power last.',12,True)
line(25,76,W-25,76)
line(W/2,90,W/2,H-38)
line(25,319,W-25,319)
positions=[(25,90),(438,90),(25,331),(438,331)]
titles=['Parts','Wi-Fi / Bluetooth antenna','LoRa antenna','Join the boards']
texts=['','Broad 2.4 GHz antenna connects to XIAO.','Slim LoRa antenna connects to Wio.','Wio above XIAO. Align the small B2B connector.']
subs=['','Align the plug. Press gently until seated.','Align the plug. Press gently until seated.','Press evenly. Keep both cables outside the gap.']
arr=json.loads((ROOT/'assets/scene-arrows.json').read_text())
for i,(x,y) in enumerate(positions):
 txt(x,y,str(i+1),34,True)
 txt(x+41,y+9,titles[i],16,True)
 ix,iy,iw,ih=x+2,y+47,374,140.25
 c.drawImage(ImageReader(str(ROOT/f'assets/scene-{i}.png')),ix,H-iy-ih,iw,ih,mask='auto')
 scale=iw/1200
 for a in arr[i]:
  ax,ay=ix+a['x']*scale,iy+a['y']*scale
  aw,ah=a['w']*scale,a['h']*scale
  p=c.beginPath();p.moveTo(ax+aw*.32,H-ay);p.lineTo(ax+aw*.68,H-ay);p.lineTo(ax+aw*.68,H-(ay+ah*.58));p.lineTo(ax+aw,H-(ay+ah*.58));p.lineTo(ax+aw*.5,H-(ay+ah));p.lineTo(ax,H-(ay+ah*.58));p.lineTo(ax+aw*.32,H-(ay+ah*.58));p.close()
  c.setFillGray(.05);c.drawPath(p,fill=1,stroke=0)
 if i==0:
  for xx,a,b in [(x+4,'1x XIAO','ESP32S3'),(x+95,'1x Wio','SX1262'),(x+190,'1x 2.4 GHz','Wi-Fi / Bluetooth'),(x+291,'1x LoRa','Narrow strip')]:
   txt(xx,y+198,a,10,True);txt(xx,y+214,b,9,False,.35)
 else:
  txt(x,y+198,texts[i],10.5,True)
  txt(x,y+217,subs[i],10,False,.3)
 c.linkURL('https://wiki.seeedstudio.com/wio_sx1262_with_xiao_esp32s3_kit/',(x,H-y-237,x+379,H-y-40),relative=0,thickness=0)
txt(25,569,'Illustrated assembly guide. Exploded gap enlarged. Headers are already fitted to the XIAO.',8,False,.35)
txt(667,569,'Sources: Seeed Studio',8,False,.35)
c.linkURL('https://wiki.seeedstudio.com/wio_sx1262_with_xiao_esp32s3_kit/',(660,12,810,26),relative=0,thickness=0)
c.save()
print(OUT/'xiao-wio-assembly-sheet.pdf')

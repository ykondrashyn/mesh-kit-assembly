from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'output'
OUT.mkdir(exist_ok=True)
W, H = landscape(A4)
pdf = OUT / 'xiao-wio-assembly-sheet.pdf'
c = canvas.Canvas(str(pdf), pagesize=(W,H))
c.setTitle('XIAO ESP32S3 + Wio-SX1262 assembly guide')
c.setAuthor('Assembly illustrations based on Seeed documentation and original kit photos')

def text(x, top, s, size=11, bold=False, grey=0):
    c.setFillGray(grey)
    c.setFont('Helvetica-Bold' if bold else 'Helvetica', size)
    c.drawString(x,H-top-size,s)

def centered(x, top, s, size=10, bold=False, grey=0):
    c.setFillGray(grey)
    c.setFont('Helvetica-Bold' if bold else 'Helvetica',size)
    c.drawCentredString(x,H-top-size,s)

def image(name,x,top,w,h):
    c.drawImage(ImageReader(str(ROOT/'assets'/name)),x,H-top-h,w,h,preserveAspectRatio=True,anchor='c',mask='auto')

text(28,18,'XIAO ESP32S3 + Wio-SX1262',24,True)
text(28,49,'Assembly guide',12)
text(530,25,'Antennas first. USB power last.',13,True)
text(530,47,'Use the matching ESP32S3 kit with B2B connector.',9,False,0.3)
c.setStrokeGray(0.7)
c.setLineWidth(0.5)
c.line(28,H-76,W-28,H-76)
c.line(W/2, H-90, W/2, 51)
c.line(28,H-319,W-28,H-319)

panels = [(28,88),(440,88),(28,331),(440,331)]
titles = ['Parts','Wi-Fi / Bluetooth antenna','LoRa antenna','Board stack']
assets = ['step-0-parts-official-reference.png','step-1-wifi-board-corrected.png','step-2-lora-labeled.png','step-3-stack-official-reference.png']
image_refs = [
    'https://files.seeedstudio.com/wiki/XIAO_ESP32S3_for_Meshtastic_LoRa/2.png',
    'https://files.seeedstudio.com/wiki/SeeedStudio-XIAO-ESP32S3/img/front-indication.png',
    'https://files.seeedstudio.com/wiki/XIAO_ESP32S3_for_Meshtastic_LoRa/10.png',
    'https://files.seeedstudio.com/wiki/XIAO_ESP32S3_for_Meshtastic_LoRa/2.png'
]
for i,((x,y),title,asset) in enumerate(zip(panels,titles,assets)):
    text(x,y,str(i),34,True)
    text(x+42,y+8,title,16,True)
    image(asset,x+2,y+44,370,164)
    c.linkURL(image_refs[i],(x+2,H-y-208,x+372,H-y-44),relative=0,thickness=0)

x,y=panels[0]
for cx,label,detail in [(x+51,'1x XIAO','with pin headers'),(x+140,'1x Wio','SX1262'),(x+239,'1x Wi-Fi','2.4 GHz'),(x+332,'1x LoRa','860-930 MHz')]:
    centered(cx,y+201,label,10,True)
    centered(cx,y+214,detail,9,False,0.25)
x,y=panels[1]
text(x,y+201,'Broad antenna connects to XIAO.',11,True)
text(x,y+218,'Align the metal cap, then seat it gently.',10,False,0.25)
x,y=panels[2]
text(x,y+201,'Slim antenna connects to Wio.',11,True)
text(x,y+218,'Align the metal cap, then seat it gently.',10,False,0.25)
x,y=panels[3]
text(x,y+201,'Wio above XIAO. Align the small B2B connector.',10.5,True)
text(x,y+218,'Press evenly. Keep antenna cables outside the stack.',9.7,False,0.25)

text(28,570,'Attach antennas before USB power. Simplified drawings, click for references. Step 3 gap enlarged.',8,False,0.35)
label='Images: Seeed Studio kit wiki'
text(670,570,label,8,False,0.35)
c.linkURL('https://wiki.seeedstudio.com/wio_sx1262_with_xiao_esp32s3_kit/',(670,13,816,26),relative=0,thickness=0)
c.save()
print(pdf)

"""Lay out five LPub3D pages from official geometry and native rendered assets."""
from pathlib import Path
import json
import struct

ROOT = Path(__file__).resolve().parents[1]
W, H = 2000, 1125
placements = []
page = 1


def txt(s, x, y, size=32, bold=False):
    weight = 75 if bold else 50
    return [f'0 !LPUB INSERT TEXT "{s}" "Arial,{size},-1,5,{weight},0,0,0,0,0" "#191919"',
            f'0 !LPUB INSERT TEXT PLACEMENT LOCAL TOP_LEFT PAGE INSIDE OFFSET {x/W:.6f} {y/H:.6f}']


def pic(name, x, y, w, h):
    path = ROOT / 'assets' / f'{name}.png'
    iw, ih = struct.unpack('>II', path.read_bytes()[16:24])
    scale = min(w / iw, h / ih)
    px, py = x + (w-iw*scale)/2, y + (h-ih*scale)/2
    placements.append(dict(page=page, image=path.name, x=px, y=py,
                           width=iw*scale, height=ih*scale))
    return [f'0 !LPUB INSERT PICTURE "assets/{name}.png" SCALE {scale:.8f} OFFSET {px/W:.6f} {py/H:.6f}']


def header(title, sub):
    return txt(title, 60, 28, 52, True) + txt(sub, 65, 104, 29)


lines = ['0 FILE mesh-kit.ldr', '0 Mesh Kit assembly with connector close-ups',
         '0 Name: mesh-kit.ldr', '0 Author: YK',
         '0 !LPUB PAGE SIZE GLOBAL 7.5 13.3333 Custom',
         '0 !LPUB PAGE ORIENTATION GLOBAL LANDSCAPE',
         '0 !LPUB RESOLUTION GLOBAL 150 DPI',
         '0 !LPUB PAGE TEXT_PLACEMENT GLOBAL TRUE',
         '0 !LPUB PAGE DISPLAY_PAGE_NUMBER GLOBAL FALSE',
         '0 !LPUB ASSEM SHOW_STEP_NUMBER GLOBAL FALSE',
         '0 !LPUB ASSEM CAMERA_ANGLES GLOBAL 40 30',
         '0 !LPUB ASSEM CAMERA_ORTHOGRAPHIC GLOBAL TRUE',
         '0 !LPUB PLI SHOW GLOBAL FALSE', '0 !LPUB FINAL_MODEL_ENABLED GLOBAL FALSE']
lines += header('01  CHECK THE PARTS', 'Two boards and two antennas. Leave USB power disconnected.')
# A real visible assembly on page one also avoids LPub3D's picture-only document bug.
lines += ['0 !LPUB ASSEM MODEL_SCALE LOCAL 4.3',
          '0 !LPUB ASSEM PLACEMENT LOCAL CENTER PAGE INSIDE OFFSET -0.32 -0.18']
lines += pic('part-wio', 1060, 160, 525, 420)
lines += pic('part-wifi', 55, 650, 560, 375)
lines += pic('part-lora', 1050, 650, 560, 375)
for x, y, label, name, note in [
    (660, 255, 'A   1x', 'XIAO ESP32S3', 'Main board'),
    (1630, 255, 'B   1x', 'Wio-SX1262', 'LoRa board'),
    (660, 750, 'C   1x', 'Wi-Fi antenna', 'Broad, 2.4 GHz'),
    (1630, 750, 'D   1x', 'LoRa antenna', 'Long and narrow')]:
    lines += txt(label, x, y, 40, True) + txt(name, x, y+60, 30) + txt(note, x, y+106, 25)
lines += ['1 16 0 0 0 1 0 0 0 1 0 0 0 1 xiao-board.dat', '0 STEP']

for page, kind, board in [(2, 'wifi', 'xiao'), (3, 'lora', 'wio')]:
    lines += ['0 !LPUB INSERT PAGE']
    title = '02  CONNECT WI-FI' if kind == 'wifi' else '03  CONNECT LORA'
    sub = 'Broad antenna C + board A' if kind == 'wifi' else 'Narrow antenna D + board B'
    lines += header(title, sub)
    lines += pic(f'main-{kind}', 40, 180, 1190, 795)
    lines += txt('PLUG CLOSE-UP', 1320, 155, 34, True)
    lines += pic(f'close-{board}-align', 1300, 220, 620, 365)
    lines += txt('Center it over the socket.', 1315, 595, 27)
    lines += pic(f'close-{board}-seated', 1300, 655, 620, 300)
    lines += txt('Press straight down until seated.', 1315, 970, 27)
    lines += txt('Keep the plug level. Press the metal cap, not the cable.', 65, 1050, 31)
    lines += ['0 STEP']

page = 4
lines += ['0 !LPUB INSERT PAGE']
lines += header('04  JOIN THE BOARDS', 'Wio above XIAO. Keep both antennas connected and both shields facing up.')
lines += txt('ALIGN THE BOARDS', 75, 174, 34, True)
lines += txt('REAR CONNECTOR CLOSE-UP', 855, 174, 32, True)
lines += txt('JOINED', 1510, 174, 34, True)
lines += pic('main-exploded', 25, 240, 785, 700)
lines += pic('close-b2b', 860, 285, 540, 590)
lines += pic('main-assembled', 1430, 280, 520, 630)
lines += txt('Wio underside', 875, 235, 27)
lines += txt('XIAO top', 875, 900, 27)
lines += txt('Align the small connector,', 65, 980, 30)
lines += txt('then press straight down.', 65, 1025, 30)
lines += txt('XIAO socket shown simplified.', 855, 1000, 24)
lines += txt('Side header pins point down.', 1450, 1000, 27)
lines += ['0 STEP']

page = 5
lines += ['0 !LPUB INSERT PAGE']
lines += header('MESH KIT  /  STEPS 01-04', 'XIAO ESP32S3 + Wio-SX1262')
lines += txt('01  CHECK THE PARTS', 65, 170, 36, True)
for name, x in [('part-xiao', 55), ('part-wio', 290), ('part-wifi', 525), ('part-lora', 760)]:
    lines += pic(name, x, 235, 215, 270)
for label, x in [('A  XIAO', 80), ('B  Wio', 320), ('C  Wi-Fi', 550), ('D  LoRa', 785)]:
    lines += txt(label, x, 525, 27)
lines += txt('02  CONNECT WI-FI', 1055, 170, 36, True)
lines += pic('main-wifi', 1020, 230, 560, 315)
lines += txt('PLUG CLOSE-UP', 1630, 218, 23, True)
lines += pic('close-xiao-align', 1610, 263, 340, 270)
lines += txt('Broad antenna to XIAO. Press straight down.', 1055, 550, 27)
lines += txt('03  CONNECT LORA', 65, 625, 36, True)
lines += pic('main-lora', 35, 680, 540, 330)
lines += txt('PLUG CLOSE-UP', 630, 693, 23, True)
lines += pic('close-wio-align', 610, 738, 340, 270)
lines += txt('Narrow antenna to Wio. Press straight down.', 65, 1030, 27)
lines += txt('04  JOIN THE BOARDS', 1055, 625, 36, True)
lines += pic('main-exploded', 1020, 700, 535, 310)
lines += txt('REAR CONNECTOR', 1610, 685, 23, True)
lines += pic('close-b2b', 1580, 727, 375, 295)
lines += txt('Wio above XIAO. Press straight down.', 1055, 1030, 27)
lines += txt('XIAO socket simplified.', 1610, 1070, 20)
lines += ['0 STEP', '0 NOFILE']
lines += ['0 FILE xiao-board.dat', '0 XIAO board assembly', '0 !LDRAW_ORG Unofficial_Part',
          '1 16 0 0 0 1 0 0 0 1 0 0 0 1 xiao-official.dat',
          '1 16 0 0 0 1 0 0 0 1 0 0 0 1 xiao-kit-details.dat',
          '1 16 0 0 0 1 0 0 0 1 0 0 0 1 xiao-markings.dat', '0 NOFILE']
for name in ['xiao-official.dat', 'xiao-kit-details.dat', 'xiao-markings.dat']:
    lines += [f'0 FILE {name}', (ROOT/'parts'/name).read_text().rstrip(), '0 NOFILE']
(ROOT/'mesh-kit.mpd').write_text('\n'.join(lines)+'\n')
(ROOT/'research/layout-placements.json').write_text(json.dumps(placements, indent=2)+'\n')
print('Built five-page LPub3D instruction layout')

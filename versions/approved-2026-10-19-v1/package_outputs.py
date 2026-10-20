from pathlib import Path
import json
import shutil
import zipfile

root = Path(__file__).resolve().parent
out = root / 'output'
renders = Path('/Users/ykondras/Library/Application Support/Codex/artifact-sessions/exports/latest/9b3b6033ce5bd31cbd3aeeb95f686ee409066e8486cdb4ac14c466f06f35239d')
slide_names = ['00-parts.png','01-wifi-antenna.png','02-lora-antenna.png','03-board-stack.png']
for i, name in enumerate(slide_names,1):
    shutil.copy2(renders/f'slide-{i}.png', out/name)

sources = {
  'primary_visual_reference':'https://wiki.seeedstudio.com/wio_sx1262_with_xiao_esp32s3_kit/',
  'per_step_image_references':{
    '0': ['kit-photo.png','xiao-front-indication.png','wio-hardware.png','antenna-comparison.png'],
    '1': ['xiao-front-indication.png','kit-photo.png'],
    '2': ['wio-hardware.png','extension-comparison.jpg','kit-photo.png'],
    '3': ['kit-photo.png','wio-hardware.png','xiao-front-indication.png','antenna-comparison.png']
  },
  'official_reference_images': json.loads((root/'references'/'visual-reference-sources.json').read_text())['assets'],
  'source_chat':'codex://threads/01a08f79-ecf0-7870-8a2e-32f3d9cbe333',
  'source_video':'/Users/ykondras/vid/node.mov',
  'source_photos':[
    'PXL_20260814_183701502.jpg','PXL_20260814_183729433.jpg',
    'PXL_20260814_183758225.jpg','PXL_20260814_183837394.jpg',
    'PXL_20260814_184048488.jpg','PXL_20260814_184306445.jpg',
    'PXL_20260814_184542767.jpg'
  ],
  'official_sources':[
    'https://wiki.seeedstudio.com/wio_sx1262_with_xiao_esp32s3_kit/',
    'https://wiki.seeedstudio.com/xiao_esp32s3_wifi_usage/',
    'https://meshtastic.org/docs/getting-started/',
    'https://files.seeedstudio.com/wiki/XIAO_ESP32S3_for_Meshtastic_LoRa/10.png',
    'https://files.seeedstudio.com/wiki/XIAO_ESP32S3_for_Meshtastic_LoRa/2.png',
    'https://files.seeedstudio.com/wiki/SeeedStudio-XIAO-ESP32S3/img/front-indication.png',
    'https://files.seeedstudio.com/products/SenseCAP/Wio_SX1262/Wio-SX1262_for_XIAO_3D_file.step',
    'https://files.seeedstudio.com/wiki/SeeedStudio-XIAO-ESP32S3/res/seeed-studio-xiao-esp32s3-3d_model.zip',
    'https://files.seeedstudio.com/wiki/XIAO_WiFi/antenna/FPC_Antenna_2.4GHz_1.16dbi_for_XIAO_ESP32S3/res/Datasheet_2.4GHz_FPC_Antenna_1.16dbi_for_XIAO_ESP32S3.pdf',
    'https://files.seeedstudio.com/wiki/XIAO_ESP32S3_for_Meshtastic_LoRa/37.png'
  ],
  'image_creation':'Built-in imagegen, using original kit photos and official diagrams as references',
  'notes':[
    'Simplified assembly illustrations, not manufacturing drawings or physical 1:1 templates.',
    'Step 3 uses near-equal board footprints, based on XIAO 21x17.8mm and Wio carrier 21.44x17.78mm, with its exploded vertical gap enlarged for visibility.',
    'Antenna proportions in Step 3 are guided by the Seeed A-02 Wi-Fi drawing, 37.4x17.5mm, and LoRa drawing, 40x7mm.',
    'Pin headers are two rows of seven at 2.54mm pitch. Exposed leg length is illustrative.',
    'Board identification labels XIAO ESP32S3 and WIO SX1262 appear on the illustrated RF shields.',
    'ESP32S3 kit uses the small B2B connector, not side GPIO headers.',
    'Wio is above XIAO with component faces upward.',
    'XIAO is shown with two already-soldered 1x7 male pin headers extending below its PCB.',
    'Step 1 uses the full rectangular XIAO PCB outline with small rounded corners, and two long-edge header rows rather than separate front pin groups.',
    'Wio hole and button end faces XIAO USB-C.',
    'With USB-C facing forward, XIAO Wi-Fi socket is at rear-right and Wio LoRa socket at rear-left.',
    'Broad 2.4 GHz antenna attaches to XIAO, slim LoRa antenna attaches to Wio.',
    'Attach antennas before USB power.',
    'The downloaded base XIAO CAD model omits the populated kit B2B connector.'
  ]
}
(out/'sources.json').write_text(json.dumps(sources,indent=2)+'\n')
selected = ['step-0-parts-official-reference.png','step-1-wifi-board-corrected.png','step-2-lora-labeled.png','step-3-stack-official-reference.png']
with zipfile.ZipFile(out/'xiao-wio-slide-images-and-prompts.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in slide_names:
        z.write(out/name,'slides/'+name)
    for name in selected:
        z.write(root/'assets'/name,'illustrations/'+name)
    for p in sorted((root/'assets').glob('*prompt.txt')):
        z.write(p,'prompts/'+p.name)
    z.write(out/'sources.json','sources.json')
    for name in ['kit-photo.png','xiao-front-indication.png','wio-hardware.png','antenna-comparison.png','extension-comparison.jpg']:
        z.write(root/'references'/name,'official-reference-images/'+name)
    z.write(out/'xiao-wio-assembly-sheet.png','xiao-wio-assembly-sheet.png')
print(json.dumps({'slides':len(slide_names),'bundle':str(out/'xiao-wio-slide-images-and-prompts.zip')}))

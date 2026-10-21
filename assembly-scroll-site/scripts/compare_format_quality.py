#!/usr/bin/env python3
"""Compare decoded candidate pixels with source PNGs, focusing on non-white detail."""
from pathlib import Path
from PIL import Image, ImageChops, ImageFilter, ImageDraw, ImageFont
import json
import math
import subprocess
ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'.cache/format-benchmark'
OUT=ROOT/'validation/progressive'
manifest=json.loads((CACHE/'manifest.json').read_text())
indices=(33,129,234,363)
records=[]
portraits={}
for entry in manifest['entries']:
    folder='06-animation' if entry['variant']=='landscape' else '07-animation-portrait'
    images={}
    for index in indices:
        number=manifest['frames'][index]
        source=ROOT.parent/'ppt-demo-assets'/folder/'_source/frames'/f'frame-{number:04d}.png'
        with Image.open(source) as im:
            reference=im.convert('RGB').resize((entry['width'],entry['height']),Image.Resampling.LANCZOS)
        if entry['kind']=='images':
            name=entry['template'].replace('{frame}',f'{number:04d}')
            file=ROOT/'dist/assets'/name.removeprefix('/original/') if name.startswith('/original/') else CACHE/name.lstrip('/')
        else:
            file=CACHE/'quality-frames-exact'/entry['variant']/str(entry['size'])/entry['codec']/f'{index}.png'
            file.parent.mkdir(parents=True,exist_ok=True)
            if not file.exists():
                subprocess.run(['ffmpeg','-v','error','-threads','1','-ss',str(index/30),'-i',str(CACHE/entry['url'].lstrip('/')),'-frames:v','1',str(file)],check=True)
        with Image.open(file) as im:
            candidate=im.convert('RGB')
        assert candidate.size==reference.size
        mask=reference.convert('L').point(lambda x:255 if x<248 else 0).filter(ImageFilter.MaxFilter(3))
        histogram=ImageChops.difference(reference,candidate).convert('L').histogram(mask=mask)
        mse=sum(n*i*i for i,n in enumerate(histogram))/sum(histogram)
        records.append({'variant':entry['variant'],'size':entry['size'],'codec':entry['codec'],'index':index,'detail_rmse':math.sqrt(mse),'detail_psnr':10*math.log10(255*255/mse) if mse else 100})
        images[index]=candidate
        if entry['variant']=='portrait' and entry['size']==1080:
            portraits.setdefault('Source PNG',{})[index]=reference
    if entry['variant']=='portrait' and entry['size']==1080:
        portraits[entry['codec']]=images
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',16)
width,height=1040,310
sheet=Image.new('RGB',(width,height*len(portraits)),'white')
draw=ImageDraw.Draw(sheet)
for row,(name,images) in enumerate(portraits.items()):
    y=row*height
    draw.text((12,y+8),name,fill='black',font=font)
    for column,(index,box) in enumerate([(363,(415,535,665,785)),(129,(350,1150,730,1530)),(234,(350,1150,730,1530)),(363,(80,540,330,790))]):
        crop=images[index].crop(box).resize((250,250),Image.Resampling.NEAREST)
        sheet.paste(crop,(column*260,y+40))
sheet.save(OUT/'format-detail-comparison.png')
(OUT/'format-quality.json').write_text(json.dumps({'method':'Luma pixel error within a three-pixel-expanded non-white source mask. This is a detail distortion metric, not an OCR or subjective readability score.','records':records},indent=2)+'\n')
print(f'Compared {len(records)} decoded samples',flush=True)

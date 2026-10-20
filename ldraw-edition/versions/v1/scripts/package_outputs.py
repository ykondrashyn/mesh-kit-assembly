"""Validate native exports and arrange them into a sheet without redrawing them."""
from pathlib import Path
import hashlib
import json
import math
import re
import zipfile
from PIL import Image
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output'
sha=lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
reader=PdfReader(OUT/'mesh-kit-lpub3d.pdf')
assert len(reader.pages)==4
assert 'LPub3D' in str(reader.metadata.get('/Creator',''))
for page in reader.pages:
    assert abs(float(page.mediabox.width)/float(page.mediabox.height)-16/9)<.001

sections={}
current=None
for line in (ROOT/'mesh-kit.mpd').read_text().splitlines():
    if line.startswith('0 FILE '):
        current=line[7:]
        assert current not in sections
        sections[current]=[]
    elif line=='0 NOFILE': current=None
    elif current: sections[current].append(line)
assert sections['mesh-kit.ldr'].count('0 STEP')==4
primitive_counts={str(i):0 for i in range(1,6)}
for name,lines in sections.items():
    for line in lines:
        tokens=line.split()
        if not tokens or tokens[0]=='0': continue
        typ=tokens[0]
        assert typ in primitive_counts,(name,line)
        primitive_counts[typ]+=1
        if typ=='1':
            assert len(tokens)==15,(name,line)
            assert tokens[-1] in sections,(name,tokens[-1])
            numbers=tokens[2:14]
        else:
            expected={'2':8,'3':11,'4':14,'5':14}[typ]
            assert len(tokens)==expected,(name,line)
            numbers=tokens[2:]
        assert all(math.isfinite(float(n)) for n in numbers)

boards=json.loads((ROOT/'parts/boards-manifest.json').read_text())
for name,meta in boards['parts'].items():
    path=ROOT/'parts'/meta['filename']
    assert sha(path)==meta['output_sha256']
    assert '\n'.join(sections[path.name]).strip()==path.read_text().strip()

log=(ROOT/'research/export.log').read_text()
projections=re.findall(r'CameraProjection: (\w+)',log)
assert projections and set(projections)=={'Orthographic'}
assert 'return code 0' in log
pnglog=(ROOT/'research/export-png.log').read_text()
assert 'Failed to export' not in pnglog
pages=[]
for i in range(1,5):
    p=OUT/'pages'/f'mesh-kit_150_DPI_page_{i}.png'
    im=Image.open(p).convert('RGB')
    assert im.size==(2000,1125),(p,im.size)
    pages.append(im)
sheet=Image.new('RGB',(4008,2258),'#c9c9c7')
for i,im in enumerate(pages): sheet.paste(im,((i%2)*2008,(i//2)*1133))
sheet.save(OUT/'mesh-kit-assembly-sheet.png',optimize=True)
sheet.resize((1800,1014),Image.Resampling.LANCZOS).save(OUT/'mesh-kit-preview.png',optimize=True)

validation={
 'application':'LPub3D 2.4.9 r86 ARM64',
 'pdf_creator':reader.metadata.get('/Creator'),
 'pdf_pages':len(reader.pages),
 'page_aspect':'16:9',
 'png_export':'Direct LPub3D PNG page export',
 'png_size':[2000,1125],
 'render_projection':sorted(set(projections)),
 'mpd_sections':len(sections),
 'all_part_references_resolve':True,
 'official_parts_match_converted_DAT_files':True,
 'primitive_counts':primitive_counts,
 'ai_image_generation_used':False,
 'outputs':{str(p.relative_to(ROOT)):sha(p) for p in sorted(OUT.rglob('*')) if p.is_file() and p.suffix!='.zip'},
 'source_model_hashes':{str(p.relative_to(ROOT)):sha(p) for p in sorted((ROOT/'source-models').rglob('*.step'))},
}
(ROOT/'research/validation.json').write_text(json.dumps(validation,indent=2)+'\n')
with zipfile.ZipFile(OUT/'mesh-kit-ldraw-source.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    paths=[ROOT/'README.txt',ROOT/'mesh-kit.mpd']
    for folder in ('scripts','parts','source-models','output'):
        paths += [p for p in (ROOT/folder).rglob('*') if p.is_file() and p.suffix not in ('.zip','.pyc')]
    paths += [ROOT/'research'/n for n in ('export.log','export-png.log','conversion.log','validation.json')]
    for p in sorted(set(paths)):
        z.write(p,'mesh-kit-ldraw/'+str(p.relative_to(ROOT)))
print(json.dumps({k:v for k,v in validation.items() if k not in ('outputs','source_model_hashes')},indent=2))
print('Created',OUT/'mesh-kit-ldraw-source.zip')

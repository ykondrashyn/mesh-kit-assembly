"""Validate native sources and five-page exports, then package their dependencies."""
from pathlib import Path
import hashlib
import json
import math
import re
import shutil
import zipfile
from PIL import Image
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'output'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
reader = PdfReader(OUT/'mesh-kit-lpub3d.pdf')
assert len(reader.pages) == 5
assert 'LPub3D' in str(reader.metadata.get('/Creator', ''))
for page in reader.pages:
    assert abs(float(page.mediabox.width)/float(page.mediabox.height)-16/9) < .001


def validate_mpd(path, top, steps):
    sections = {}
    current = None
    for line in path.read_text().splitlines():
        if line.startswith('0 FILE '):
            current = line[7:]
            assert current not in sections
            sections[current] = []
        elif line == '0 NOFILE':
            current = None
        elif current:
            sections[current].append(line)
    assert sections[top].count('0 STEP') == steps
    counts = {str(i): 0 for i in range(1, 6)}
    for name, lines in sections.items():
        for line in lines:
            tokens = line.split()
            if not tokens or tokens[0] == '0':
                continue
            typ = tokens[0]
            assert typ in counts, (name, line)
            counts[typ] += 1
            if typ == '1':
                assert len(tokens) == 15, (name, line)
                assert tokens[-1] in sections, (name, tokens[-1])
                numbers = tokens[2:14]
            else:
                assert len(tokens) == {'2': 8, '3': 11, '4': 14, '5': 14}[typ]
                numbers = tokens[2:]
            assert all(math.isfinite(float(n)) for n in numbers)
    return sections, counts


layout, layout_counts = validate_mpd(ROOT/'mesh-kit.mpd', 'mesh-kit.ldr', 5)
geometry, geometry_counts = validate_mpd(ROOT/'geometry.mpd', 'geometry.ldr', 14)
for name in re.findall(r'INSERT PICTURE "([^"]+)"', '\n'.join(layout['mesh-kit.ldr'])):
    assert (ROOT/name).is_file(), name
configs = json.loads((ROOT/'assets/render-manifest.json').read_text())
assert len(configs) == 14
for c in configs:
    with Image.open(ROOT/'assets'/f'{c["name"]}.png') as im:
        assert im.mode == 'RGBA'
        assert min(im.size) > 400

boards = json.loads((ROOT/'parts/boards-manifest.json').read_text())
for name, meta in boards['parts'].items():
    path = ROOT/'parts'/meta['filename']
    assert sha(path) == meta['output_sha256']
    assert '\n'.join(geometry[path.name]).strip() == path.read_text().strip()
for name in ('detail-xiao-rf-official.dat', 'detail-wio-rf-official.dat',
             'detail-wio-b2b-official.dat', 'detail-xiao-b2b-schematic.dat'):
    assert '\n'.join(geometry[name]).strip() == (ROOT/'parts'/name).read_text().strip()

log = (ROOT/'research/export.log').read_text()
projections = re.findall(r'CameraProjection: (\w+)', log)
assert projections and set(projections) == {'Orthographic'}
assert 'return code 0' in log
pnglog = (ROOT/'research/export-png.log').read_text()
assert 'Failed to export' not in pnglog
pages = []
for i in range(1, 6):
    path = OUT/'pages'/f'mesh-kit_150_DPI_page_{i}.png'
    im = Image.open(path).convert('RGB')
    assert im.size == (2000, 1125), (path, im.size)
    pages.append(im)
shutil.copy2(OUT/'pages/mesh-kit_150_DPI_page_5.png', OUT/'mesh-kit-all-steps.png')
pages[4].resize((1800, 1013), Image.Resampling.LANCZOS).save(OUT/'mesh-kit-preview.png', optimize=True)
sheet = Image.new('RGB', (2008, 1705), '#c9c9c7')
for i, im in enumerate(pages):
    thumb = im.resize((1000, 563), Image.Resampling.LANCZOS)
    # Five pages in reading order at half size, with the overview centered below.
    x = (i % 2)*1008 if i < 4 else 504
    y = (i//2)*571
    sheet.paste(thumb, (x, y))
sheet.save(OUT/'mesh-kit-assembly-sheet.png', optimize=True)

validation = {
    'application': 'LPub3D 2.4.9 r86 ARM64',
    'pdf_creator': reader.metadata.get('/Creator'),
    'pdf_pages': len(reader.pages),
    'page_aspect': '16:9',
    'png_export': 'Direct LPub3D PNG page export',
    'png_size': [2000, 1125],
    'all_steps_slide': 'output/mesh-kit-all-steps.png',
    'render_projection': sorted(set(projections)),
    'geometry_render_assets': len(configs),
    'layout_mpd_sections': len(layout),
    'geometry_mpd_sections': len(geometry),
    'all_part_references_resolve': True,
    'all_picture_dependencies_present': True,
    'official_parts_match_converted_DAT_files': True,
    'connector_detail_parts_match_extracted_DAT_files': True,
    'primitive_counts': geometry_counts,
    'ai_image_generation_used': False,
    'outputs': {str(p.relative_to(ROOT)): sha(p) for p in sorted(OUT.rglob('*'))
                if p.is_file() and p.suffix != '.zip'},
    'source_model_hashes': {str(p.relative_to(ROOT)): sha(p)
                            for p in sorted((ROOT/'source-models').rglob('*.step'))},
}
(ROOT/'research/validation.json').write_text(json.dumps(validation, indent=2)+'\n')
package = OUT/'mesh-kit-ldraw-source.zip'
with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    paths = [ROOT/'README.txt', ROOT/'mesh-kit.mpd', ROOT/'geometry.mpd']
    for folder in ('scripts', 'parts', 'source-models', 'assets', 'output'):
        paths += [p for p in (ROOT/folder).rglob('*')
                  if p.is_file() and p.suffix not in ('.zip', '.pyc')]
    paths += [ROOT/'research'/n for n in ('export.log', 'export-png.log', 'conversion.log',
              'render-assets.log', 'layout-placements.json', 'visual-review.json', 'validation.json')]
    for p in sorted(set(paths)):
        z.write(p, 'mesh-kit-ldraw/'+str(p.relative_to(ROOT)))
with zipfile.ZipFile(package) as z:
    assert z.testzip() is None
    assert 'mesh-kit-ldraw/assets/close-b2b.png' in z.namelist()
    assert 'mesh-kit-ldraw/output/mesh-kit-all-steps.png' in z.namelist()
print(json.dumps({k: v for k, v in validation.items() if k not in ('outputs', 'source_model_hashes')}, indent=2))
print('Created', package)

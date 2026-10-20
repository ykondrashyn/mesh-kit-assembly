#!/usr/bin/env python3
"""Verify both animation variants and refresh the full PowerPoint asset ZIP."""
from pathlib import Path
from html.parser import HTMLParser
import hashlib
import json
import zipfile

SOURCE = Path(__file__).resolve().parent
ASSETS = SOURCE.parents[1]
animations = []
reports = {}
for name,label in [('06-animation','Assembly showcase, landscape'),('07-animation-portrait','Assembly showcase, portrait')]:
    source = ASSETS/name/'_source'
    video = json.loads((source/'video-validation.json').read_text())
    motion = json.loads((source/'animation-validation.json').read_text())
    opening = json.loads((source/'opening-validation.json').read_text())
    transitions = json.loads((source/'transition-validation.json').read_text())
    assert not transitions['errors'] and transitions['frames_checked']==450
    assert transitions['source_blend_sha256']==hashlib.sha256((source/'assembly-showcase.blend').read_bytes()).hexdigest()
    assert not opening['errors'] and opening['transition_frames_checked']==79
    assert opening['source_blend_sha256']==hashlib.sha256((source/'assembly-showcase.blend').read_bytes()).hexdigest()
    assert not motion['errors'] and motion['frames_checked']==450
    assert video['frames']==450 and video['duration_seconds']==15
    assert video['source_blend_sha256']==hashlib.sha256((source/'assembly-showcase.blend').read_bytes()).hexdigest()
    assert video['sha256']==hashlib.sha256((source.parent/'assembly-showcase.mp4').read_bytes()).hexdigest()
    animations.append(dict(file=name+'/assembly-showcase.mp4',label=label,
        pixels=[video['width'],video['height']],fps=30,duration_seconds=15,
        silent=True,native_blender_render=True,opening_layout=opening['layout'],
        opening_order=opening['opening_order'],poster=name+'/assembly-showcase-poster.png',
        editable_source=name+'/_source/assembly-showcase.blend',sha256=video['sha256']))
    reports[name]=dict(video=video,motion_validation=name+'/_source/animation-validation.json',
                       opening_validation=name+'/_source/opening-validation.json',
                       transition_validation=name+'/_source/transition-validation.json')

manifest_path = ASSETS/'_source/manifest.json'
manifest = json.loads(manifest_path.read_text())
assert len(manifest['assets'])==21
manifest['animations'] = animations
manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
validation_path = ASSETS/'_source/validation.json'
validation = json.loads(validation_path.read_text())
validation['animations'] = reports
validation['animation'] = reports['06-animation']
validation_path.write_text(json.dumps(validation,indent=2)+'\n')

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths=[]
    def handle_starttag(self,tag,attrs):
        for key,value in attrs:
            if key in ('href','src','poster') and value and not value.startswith(('http:','https:','#')):
                self.paths.append(value)
links=Links()
links.feed((ASSETS/'index.html').read_text())
assert all((ASSETS/name).is_file() for name in links.paths)
assert len(list(ASSETS.glob('0[1-5]-*/*.png')))==21
frames = list((SOURCE/'frames').glob('frame-*.png'))
assert len(frames) in (0,450)
for frame in frames:
    header=frame.read_bytes()[:24]
    assert header[:8]==b'\x89PNG\r\n\x1a\n'
    assert int.from_bytes(header[16:20],'big')==1080 and int.from_bytes(header[20:24],'big')==1920
delivery=dict(animations=animations,html_links_checked=len(links.paths),static_png_count=21,
              poster_count=2,portrait_rendered_frames=450,portrait_cached_frames=len(frames),
              source_geometry_sha256={p.name:hashlib.sha256(p.read_bytes()).hexdigest()
                                      for p in (SOURCE/'geometry-data/meshes').glob('*.gz')})
(SOURCE/'delivery-manifest.json').write_text(json.dumps(delivery,indent=2)+'\n')
destination=ASSETS.with_suffix('.zip')
temporary=destination.with_suffix('.new.zip')
skip_dirs={'frames','previews','__pycache__'}
with zipfile.ZipFile(temporary,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in sorted(ASSETS.rglob('*')):
        if not p.is_file() or skip_dirs.intersection(p.relative_to(ASSETS).parts):
            continue
        if p.suffix in ('.log','.blend1','.blend2','.pyc') or p.name=='.DS_Store':
            continue
        z.write(p,p.relative_to(ASSETS.parent))
with zipfile.ZipFile(temporary) as z:
    assert z.testzip() is None
    assert sum(n.endswith('.mp4') for n in z.namelist())==2
    assert sum(n.endswith('.png') for n in z.namelist())==23
temporary.replace(destination)
print(json.dumps(dict(zip=str(destination),bytes=destination.stat().st_size,
                      html_links_checked=len(links.paths),images=23,videos=2),indent=2))

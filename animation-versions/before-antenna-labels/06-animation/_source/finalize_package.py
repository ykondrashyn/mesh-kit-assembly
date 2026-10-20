#!/usr/bin/env python3
"""Register the verified video and refresh the existing PowerPoint asset ZIP."""
from pathlib import Path
from html.parser import HTMLParser
import hashlib
import json
import zipfile

SOURCE = Path(__file__).resolve().parent
ASSETS = SOURCE.parents[1]
video = json.loads((SOURCE/'video-validation.json').read_text())
motion = json.loads((SOURCE/'animation-validation.json').read_text())
assert not motion['errors'] and motion['frames_checked']==450
assert video['frames']==450 and video['duration_seconds']==15
assert video['source_blend_sha256']==hashlib.sha256((SOURCE/'assembly-showcase.blend').read_bytes()).hexdigest()
assert video['sha256']==hashlib.sha256((SOURCE.parent/'assembly-showcase.mp4').read_bytes()).hexdigest()

manifest_path = ASSETS/'_source/manifest.json'
manifest = json.loads(manifest_path.read_text())
assert len(manifest['assets'])==21
manifest['animations'] = [dict(file='06-animation/assembly-showcase.mp4',
    label='Assembly showcase',pixels=[1920,1080],fps=30,duration_seconds=15,
    silent=True,native_blender_render=True,poster='06-animation/assembly-showcase-poster.png',
    editable_source='06-animation/_source/assembly-showcase.blend',sha256=video['sha256'])]
manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
validation_path = ASSETS/'_source/validation.json'
validation = json.loads(validation_path.read_text())
validation['animation'] = dict(video=video,motion_validation='06-animation/_source/animation-validation.json')
validation_path.write_text(json.dumps(validation,indent=2)+'\n')


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths=[]
    def handle_starttag(self, tag, attrs):
        for key,value in attrs:
            if key in ('href','src','poster') and value and not value.startswith(('http:','https:','#')):
                self.paths.append(value)


links=Links()
links.feed((ASSETS/'index.html').read_text())
assert all((ASSETS/name).is_file() for name in links.paths)
assert len(list(ASSETS.glob('0[1-5]-*/*.png')))==21
frames = list((SOURCE/'frames').glob('frame-*.png'))
assert len(frames)==450
for frame in frames:
    header=frame.read_bytes()[:24]
    assert header[:8]==b'\x89PNG\r\n\x1a\n'
    assert int.from_bytes(header[16:20],'big')==1920 and int.from_bytes(header[20:24],'big')==1080
delivery=dict(video=video,html_links_checked=len(links.paths),original_png_count=21,
              new_poster_count=1,rendered_frames=450,
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
    assert sum(n.endswith('.mp4') for n in z.namelist())==1
    assert sum(n.endswith('.png') for n in z.namelist())==22
temporary.replace(destination)
print(json.dumps(dict(zip=str(destination),bytes=destination.stat().st_size,
                      html_links_checked=len(links.paths),images=22,videos=1),indent=2))

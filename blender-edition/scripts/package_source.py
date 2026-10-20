"""Package the standalone Blender project and verified output pages."""
from pathlib import Path
import hashlib
import json
import struct
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'output'
final = OUT/'mesh-kit-blender-source.zip'
required = [ROOT/'mesh-kit.blend',OUT/'mesh-kit-blender.pdf',OUT/'mesh-kit-all-steps.png']
for path in required:
    if not path.is_file() or path.stat().st_size == 0:
        raise RuntimeError('Missing deliverable: '+str(path))
pages = sorted((OUT/'pages').glob('0[1-5]-*.png'))
if len(pages)!=5:
    raise RuntimeError('Expected five output pages')
for path in pages:
    width,height = struct.unpack('>II',path.read_bytes()[16:24])
    if (width,height)!=(3200,1800):
        raise RuntimeError('Unexpected final page size: '+str(path))
manifest = json.loads((ROOT/'meshes/manifest.json').read_text())
for source in manifest['metadata']['sources'].values():
    path = ROOT/source['path']
    if hashlib.sha256(path.read_bytes()).hexdigest()!=source['sha256']:
        raise RuntimeError('Official source hash mismatch: '+str(path))
for filename in ('rf-plug-manifest.json','rf-plug-137-manifest.json'):
    plug = json.loads((ROOT/'meshes'/filename).read_text())['metadata']
    if hashlib.sha256((ROOT/plug['source_path']).read_bytes()).hexdigest()!=plug['source_sha256']:
        raise RuntimeError('Manufacturer plug source hash mismatch: '+filename)
validation = json.loads((ROOT/'research/blend-validation.json').read_text())
if not validation['passed'] or validation['blend_sha256']!=hashlib.sha256((ROOT/'mesh-kit.blend').read_bytes()).hexdigest():
    raise RuntimeError('Blender validation is stale or failed')
files = [ROOT/'mesh-kit.blend',ROOT/'README.txt']
for folder in ('scripts','meshes','source-models','output','research','references'):
    files.extend(p for p in (ROOT/folder).rglob('*') if p.is_file()
                 and p!=final and p.suffix not in ('.log','.pyc')
                 and '__pycache__' not in p.parts)
with zipfile.ZipFile(final,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for path in sorted(set(files)):
        archive.write(path,Path('mesh-kit-blender')/path.relative_to(ROOT))
with zipfile.ZipFile(final) as archive:
    if archive.testzip() is not None:
        raise RuntimeError('ZIP CRC check failed')
print('Packaged',len(set(files)),'files:',final)

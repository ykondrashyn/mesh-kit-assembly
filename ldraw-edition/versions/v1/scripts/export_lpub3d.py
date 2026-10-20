"""Export the MPD through the real LPub3D application, without image generation."""
from pathlib import Path
import argparse
import os
import re
import subprocess
import sys
import zipfile

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--lpub3d',default=os.environ.get('LPUB3D_BIN','/Applications/LPub3D.app/Contents/MacOS/LPub3D'))
args=parser.parse_args()
app=Path(args.lpub3d)
if not app.is_file():
    raise SystemExit('Install LPub3D and supply --lpub3d /path/to/executable')
library=Path(os.environ.get('LDRAWDIR',str(ROOT/'library/ldraw')))
if not (library/'parts/3001.dat').is_file():
    archive=app.parent.parent/'Resources/complete.zip'
    if not archive.is_file():
        raise SystemExit('Set LDRAWDIR to an extracted LDraw parts library')
    library.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        z.extractall(library.parent)
subprocess.run([sys.executable,str(ROOT/'scripts/build_project.py')],check=True)
out=ROOT/'output'
out.mkdir(exist_ok=True)
research=ROOT/'research'
research.mkdir(exist_ok=True)
env=dict(os.environ,LDRAWDIR=str(library),LPUB3D_DISABLE_UPDATE_CHECK='1',HOMEBREW_NO_AUTO_UPDATE='1')
command=[str(app),'--process-export','--export-option','pdf','--preferred-renderer','native',
         '--projection','orthographic','--clear-cache','--output-file',str(out/'mesh-kit-lpub3d.pdf'),str(ROOT/'mesh-kit.mpd')]
# LPub3D 2.4.9 can load native preferences before the CLI projection setting.
# A new process reads the persisted setting. Validate actual renderer output.
for attempt in range(1,4):
    log=research/f'export-{attempt}.log'
    print(f'LPub3D native export, attempt {attempt}',flush=True)
    with log.open('w') as stream:
        result=subprocess.run(command,env=env,cwd=ROOT,stdout=stream,stderr=subprocess.STDOUT)
    output=log.read_text()
    (research/'export.log').write_text(output)
    if result.returncode:
        raise SystemExit(f'LPub3D failed with code {result.returncode}, see {log}')
    projections=re.findall(r'CameraProjection: (\w+)',output)
    if projections and set(projections)=={'Orthographic'}:
        break
    if attempt==3:
        raise SystemExit('Renderer did not confirm orthographic projection, inspect research/export.log')
    print('Restarting LPub3D to apply its saved native projection preference',flush=True)
print(out/'mesh-kit-lpub3d.pdf')
pages=out/'pages'
pages.mkdir(exist_ok=True)
png_command=[str(app),'--process-export','--export-option','png','--export-directory',str(pages),
             '--preferred-renderer','native',str(ROOT/'mesh-kit.mpd')]
with (research/'export-png.log').open('w') as stream:
    result=subprocess.run(png_command,env=env,cwd=ROOT,stdout=stream,stderr=subprocess.STDOUT)
if result.returncode or len(list(pages.glob('mesh-kit_150_DPI_page_*.png')))!=4:
    raise SystemExit('LPub3D PNG export incomplete, inspect research/export-png.log')
print('Exported four native PNG pages')

"""Rebuild all geometry renders and export the five-page guide through LPub3D."""
from pathlib import Path
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--lpub3d', default=os.environ.get('LPUB3D_BIN', '/Applications/LPub3D.app/Contents/MacOS/LPub3D'))
parser.add_argument('--reuse-assets', action='store_true', help='Reuse existing native render PNGs for layout-only edits')
args = parser.parse_args()
app = Path(args.lpub3d)
if not app.is_file():
    raise SystemExit('Install LPub3D and supply --lpub3d /path/to/executable')
library = Path(os.environ.get('LDRAWDIR', str(ROOT/'library/ldraw')))
if not (library/'parts/3001.dat').is_file():
    archive = app.parent.parent/'Resources/complete.zip'
    if not archive.is_file():
        raise SystemExit('Set LDRAWDIR to an extracted LDraw parts library')
    library.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        z.extractall(library.parent)
out = ROOT/'output'
research = ROOT/'research'
for folder in (out, research, ROOT/'assets'):
    folder.mkdir(exist_ok=True)
env = dict(os.environ, LDRAWDIR=str(library), LPUB3D_DISABLE_UPDATE_CHECK='1', HOMEBREW_NO_AUTO_UPDATE='1')


def run(command, log_name, check_projection=False):
    # This LPub3D release may require a new process to load a changed native
    # projection preference. Validate the renderer log, not only the CLI flag.
    for attempt in range(1, 4):
        log = research/log_name
        print(f'LPub3D {log_name}, attempt {attempt}', flush=True)
        with log.open('w') as stream:
            result = subprocess.run([str(app)] + command, env=env, cwd=ROOT,
                                    stdout=stream, stderr=subprocess.STDOUT)
        output = log.read_text()
        if result.returncode or 'Failed to export' in output:
            raise SystemExit(f'LPub3D export failed, see {log}')
        projections = re.findall(r'CameraProjection: (\w+)', output)
        if not check_projection or (projections and set(projections) == {'Orthographic'}):
            return
        if attempt == 3:
            raise SystemExit(f'Renderer did not confirm orthographic projection, see {log}')
        print('Restarting LPub3D to apply its saved native projection preference', flush=True)


if not args.reuse_assets:
    subprocess.run([sys.executable, str(ROOT/'scripts/build_geometry.py')], check=True)
    run(['--process-file', '--preferred-renderer', 'native', '--projection', 'orthographic',
         '--clear-cache', str(ROOT/'geometry.mpd')], 'render-assets.log', True)
    configs = json.loads((ROOT/'assets/render-manifest.json').read_text())
    for index, config in enumerate(configs, 1):
        matches = list((ROOT/'LPub3D/assem').glob(
            f'geometry-0_1_0_0_0_1_0_0_0_1_{index}_3999_300_DPI_*.png'))
        if len(matches) != 1:
            raise SystemExit(f'Expected one native render for {config["name"]}, found {len(matches)}')
        shutil.copy2(matches[0], ROOT/'assets'/f'{config["name"]}.png')

subprocess.run([sys.executable, str(ROOT/'scripts/build_project.py')], check=True)
run(['--process-export', '--export-option', 'pdf', '--preferred-renderer', 'native',
     '--projection', 'orthographic', '--clear-cache', '--output-file',
     str(out/'mesh-kit-lpub3d.pdf'), str(ROOT/'mesh-kit.mpd')], 'export.log', True)
pages = out/'pages'
pages.mkdir(exist_ok=True)
run(['--process-export', '--export-option', 'png', '--export-directory', str(pages),
     '--preferred-renderer', 'native', str(ROOT/'mesh-kit.mpd')], 'export-png.log')
expected = {f'mesh-kit_150_DPI_page_{i}.png' for i in range(1, 6)}
if {p.name for p in pages.glob('mesh-kit_150_DPI_page_*.png')} != expected:
    raise SystemExit('LPub3D PNG export incomplete, inspect research/export-png.log')
print('Exported five native PNG pages and the PDF')

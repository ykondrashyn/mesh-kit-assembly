#!/usr/bin/env python3
"""Render selected preview frames or the complete timeline from the saved project."""
from pathlib import Path
import argparse
import sys
import bpy

ROOT = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--frames', default='all')
parser.add_argument('--preview', action='store_true')
parser.add_argument('--folder', default=None)
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
scene = bpy.context.scene
scene.render.resolution_percentage = 50 if args.preview else 100
scene.render.use_file_extension = True
folder = Path(args.folder).resolve() if args.folder else ROOT/('previews' if args.preview else 'frames')
folder.mkdir(exist_ok=True)
frames = list(range(scene.frame_start,scene.frame_end+1)) if args.frames=='all' else []
if args.frames!='all':
    for part in args.frames.split(','):
        if '-' in part:
            a,b=map(int,part.split('-'))
            frames.extend(range(a,b+1))
        else:
            frames.append(int(part))
for f in frames:
    scene.frame_set(f)
    scene.render.filepath = str(folder/f'frame-{f:04d}.png')
    print('RENDER', f, 'of', scene.frame_end,flush=True)
    bpy.ops.render.render(write_still=True)

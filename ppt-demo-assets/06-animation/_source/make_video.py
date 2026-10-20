#!/usr/bin/env python3
"""Render and encode the PowerPoint movie using Blender and FFmpeg.

python3 make_video.py                  Render the saved Blender project and encode
python3 make_video.py --rebuild        Rebuild the editable scene, render and encode
python3 make_video.py --skip-render    Encode an existing complete frame sequence
"""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import subprocess
from timing import FRAME_COUNT, DURATION_SECONDS

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--rebuild',action='store_true')
parser.add_argument('--skip-render',action='store_true')
args = parser.parse_args()


def run(command):
    subprocess.run([str(p) for p in command],check=True)


if args.rebuild:
    run(['blender','--background','--factory-startup','--python',SOURCE/'build_animation.py'])
if not args.skip_render:
    run(['blender','--background',SOURCE/'assembly-showcase.blend','--python',SOURCE/'render_animation.py'])
frames = [SOURCE/'frames'/f'frame-{i:04d}.png' for i in range(1,FRAME_COUNT+1)]
missing = [p.name for p in frames if not p.is_file()]
if missing:
    raise SystemExit('Missing animation frames: '+', '.join(missing[:20]))
output = ROOT/'assembly-showcase.mp4'
temporary = ROOT/'assembly-showcase.pending.mp4'
run(['ffmpeg','-hide_banner','-loglevel','warning','-y','-framerate','30','-start_number','1',
     '-i',SOURCE/'frames/frame-%04d.png','-frames:v',str(FRAME_COUNT),'-an',
     '-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p',
     '-profile:v','high','-level:v','4.1','-movflags','+faststart',temporary])
metadata = json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames',
    '-show_streams','-show_format','-of','json',str(temporary)]))
streams = metadata['streams']
assert len(streams)==1 and streams[0]['codec_type']=='video'
v = streams[0]
assert v['codec_name']=='h264' and v['pix_fmt']=='yuv420p'
assert (v['width'],v['height'])==(1920,1080)
assert v['r_frame_rate']=='30/1' and int(v['nb_read_frames'])==FRAME_COUNT
assert abs(float(metadata['format']['duration'])-DURATION_SECONDS)<.001
run(['ffmpeg','-hide_banner','-v','error','-i',temporary,'-f','null','-'])
temporary.replace(output)
poster = ROOT/'assembly-showcase-poster.png'
shutil.copyfile(frames[-1],poster)
report = dict(file=output.name,codec=v['codec_name'],pixel_format=v['pix_fmt'],
              width=v['width'],height=v['height'],fps=30,frames=FRAME_COUNT,duration_seconds=DURATION_SECONDS,
              audio_streams=0,decode_errors=0,bytes=output.stat().st_size,
              sha256=hashlib.sha256(output.read_bytes()).hexdigest(),
              source_blend_sha256=hashlib.sha256((SOURCE/'assembly-showcase.blend').read_bytes()).hexdigest(),
              ai_image_generation=False,visual_renderer='Blender EEVEE',encoder='FFmpeg libx264')
(SOURCE/'video-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))

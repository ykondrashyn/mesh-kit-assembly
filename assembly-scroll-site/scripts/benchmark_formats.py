#!/usr/bin/env python3
"""Reproduce local comparison assets without changing published artwork."""
import argparse
import concurrent.futures
import json
import subprocess
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FRAMES = list(range(1, 35)) + list(range(95, 482))
VARIANTS = {'landscape': ('06-animation', 1920, 1080), 'portrait': ('07-animation-portrait', 1080, 1920)}


def images(job):
    output, variant, size, number = job
    folder, width, height = VARIANTS[variant]
    dimensions = (round(width * size / min(width, height)), round(height * size / min(width, height)))
    source = ROOT.parent / 'ppt-demo-assets' / folder / '_source/frames' / f'frame-{number:04d}.png'
    with Image.open(source) as original:
        image = original.convert('RGB').resize(dimensions, Image.Resampling.LANCZOS)
        for codec, qualities in [('webp', (80, 88)), ('avif', (50, 65, 80))]:
            for quality in qualities:
                target = output / f'{variant}/{size}/{codec}-{quality}/frame-{number:04d}.{codec}'
                if target.exists():
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                options = {'method': 6} if codec == 'webp' else {'speed': 8, 'max_threads': 1}
                image.save(target, codec.upper(), quality=quality, **options)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ROOT / '.cache/format-benchmark')
    parser.add_argument('--workers', type=int, default=2)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    jobs = [(args.output, variant, size, frame) for variant in VARIANTS for size in (540, 720, 1080) for frame in FRAMES]
    with concurrent.futures.ProcessPoolExecutor(max_workers=args.workers) as pool:
        for i, _ in enumerate(pool.map(images, jobs, chunksize=4)):
            if i % 200 == 0:
                print(f'Image source positions prepared: {i}/{len(jobs)}', flush=True)
    entries = []
    for variant, (folder, width, height) in VARIANTS.items():
        source = ROOT.parent / 'ppt-demo-assets' / folder / '_source/frames/frame-%04d.png'
        for size in (540, 720, 1080):
            w, h = round(width * size / min(width, height)), round(height * size / min(width, height))
            for codec, qualities in [('webp', (80, 88)), ('avif', (50, 65, 80))]:
                for quality in qualities:
                    directory = args.output / f'{variant}/{size}/{codec}-{quality}'
                    entries.append({'variant': variant, 'size': size, 'codec': f'{codec}-{quality}', 'kind': 'images',
                        'template': f'/{variant}/{size}/{codec}-{quality}/frame-{{frame}}.{codec}',
                        'bytes': sum(f.stat().st_size for f in directory.iterdir()), 'width': w, 'height': h})
            original = ROOT / 'dist/assets' / variant
            if size != 1080:
                original /= str(size)
            entries.append({'variant': variant, 'size': size, 'codec': 'webp-original', 'kind': 'images',
                'template': f'/original/{variant}/' + (f'{size}/' if size != 1080 else '') + 'frame-{frame}.webp',
                'bytes': sum((original / f'frame-{f:04d}.webp').stat().st_size for f in FRAMES), 'width': w, 'height': h})
            for crf in (18, 23):
                for gop in (1, 6):
                    target = args.output / f'{variant}/{size}/h264-{crf}-g{gop}.mp4'
                    if not target.exists():
                        subprocess.run(['ffmpeg', '-v', 'error', '-threads', '2', '-framerate', '30', '-i', str(source),
                            '-vf', f"select='between(n,0,33)+between(n,94,480)',scale={w}:{h}:flags=lanczos,setpts=N/(30*TB)",
                            '-frames:v', '421', '-fps_mode', 'passthrough', '-c:v', 'libx264', '-preset', 'fast',
                            '-threads', '2', '-crf', str(crf), '-g', str(gop), '-keyint_min', str(gop), '-sc_threshold', '0',
                            '-bf', '0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', str(target)], check=True)
                    entries.append({'variant': variant, 'size': size, 'codec': f'h264-{crf}-g{gop}', 'kind': 'video',
                        'url': '/' + str(target.relative_to(args.output)), 'bytes': target.stat().st_size, 'width': w, 'height': h})
            print(f'Completed {variant} {size}p', flush=True)
    (args.output / 'manifest.json').write_text(json.dumps({'frames': FRAMES, 'entries': entries}, indent=2) + '\n')
    print(f'Comparison manifest: {args.output / "manifest.json"}', flush=True)


if __name__ == '__main__':
    main()

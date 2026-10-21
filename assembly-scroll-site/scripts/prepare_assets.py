#!/usr/bin/env python3
"""Convert existing Blender renders into the website's two synchronized sequences."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "ppt-demo-assets"
FRAMES = list(range(1, 35)) + list(range(95, 482))
VARIANTS = {
    "landscape": ("06-animation", 1920, 1080),
    "portrait": ("07-animation-portrait", 1080, 1920),
}
RESOLUTIONS = (540, 720, 1080)


def resolution_info(variant, width, height, short_edge):
    scale = short_edge / min(width, height)
    directory = variant if short_edge == 1080 else f"{variant}/{short_edge}"
    return {"id": str(short_edge), "width": round(width * scale),
            "height": round(height * scale),
            "urlTemplate": f"./assets/{directory}/frame-{{frame}}.webp"}


def convert(job):
    variant, folder, width, height, number, short_edge = job
    source = SOURCE / folder / "_source/frames" / f"frame-{number:04d}.png"
    info = resolution_info(variant, width, height, short_edge)
    relative = info["urlTemplate"].replace("{frame}", f"{number:04d}").removeprefix("./")
    target = ROOT / "dist" / relative
    with Image.open(source) as image:
        if image.size != (width, height):
            raise ValueError(f"Unexpected image size: {source}")
        image = image.convert("RGB")
        if short_edge != 1080:
            image = image.resize((info["width"], info["height"]), Image.Resampling.LANCZOS)
        # Retain existing full-resolution exports byte-for-byte.
        if short_edge != 1080 or not target.exists():
            image.save(target, "WEBP", quality=88, method=4)
    return {
        "variant": variant,
        "resolution": str(short_edge),
        "path": relative,
        "width": info["width"],
        "height": info["height"],
        "source_frame": number,
        "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "webp_sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
        "bytes": target.stat().st_size,
    }


def main():
    for variant in VARIANTS:
        for short_edge in RESOLUTIONS:
            directory = variant if short_edge == 1080 else f"{variant}/{short_edge}"
            (ROOT / "dist/assets" / directory).mkdir(parents=True, exist_ok=True)
    jobs = [(variant, folder, width, height, frame, short_edge)
            for variant, (folder, width, height) in VARIANTS.items()
            for short_edge in RESOLUTIONS for frame in FRAMES]
    with ThreadPoolExecutor(max_workers=4) as executor:
        records = list(executor.map(convert, jobs))
    digest = hashlib.sha256(json.dumps(records, sort_keys=True).encode()).hexdigest()[:16]
    manifest = {
        "version": digest,
        "frames": FRAMES,
        "variants": {key: {"width": value[1], "height": value[2],
                          "resolutions": [resolution_info(key, value[1], value[2], size)
                                          for size in RESOLUTIONS]}
                     for key, value in VARIANTS.items()},
        # Navigation lands after the fades, with the close-up visible and before seating.
        # Keep startIndex at the original boundary for ordinary scroll playback.
        "chapters": [
            {"id": "parts", "label": "Parts", "startIndex": 0, "targetIndex": 0, "stillIndex": 33,
             "description": "Step 1. Check the parts: LoRa antenna, Wio-SX1262, Wi-Fi antenna and XIAO ESP32S3."},
            {"id": "wifi", "label": "Wi-Fi", "startIndex": 45, "targetIndex": 90, "stillIndex": 129,
             "description": "Step 2. Connect the 2.4 GHz Wi-Fi antenna to XIAO. The circle magnifies the same connector."},
            {"id": "lora", "label": "LoRa", "startIndex": 150, "targetIndex": 180, "stillIndex": 234,
             "description": "Step 3. Connect the 868 MHz LoRa antenna to Wio. The circle magnifies the same connector."},
            {"id": "boards", "label": "Boards", "startIndex": 255, "targetIndex": 315, "stillIndex": 363,
             "description": "Step 4. Turn to the rear, align the board connector and join the boards. XIAO socket shown simplified."},
            {"id": "assembled", "label": "Assembled", "startIndex": 375, "targetIndex": 420, "stillIndex": 420,
             "description": "Assembly complete. Both antennas are connected and the joined boards face the front."},
        ],
    }
    (ROOT / "dist/assets/manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    page = ROOT / "dist/index.html"
    page.write_text(re.sub(r'(frame-0034\.webp)(?:\?v=[a-f0-9]+)?(?=")',
                           lambda match: f'{match[1]}?v={digest}', page.read_text()))
    evidence = ROOT / "validation"
    evidence.mkdir(exist_ok=True)
    report = {"quality": 88, "method": 4, "frames_per_orientation": len(FRAMES),
              "total_bytes_by_variant": {variant: sum(item["bytes"] for item in records if item["variant"] == variant)
                                         for variant in VARIANTS},
              "bytes_by_resolution": {
                  variant: {str(size): sum(item["bytes"] for item in records
                                          if item["variant"] == variant and item["resolution"] == str(size))
                            for size in RESOLUTIONS} for variant in VARIANTS}, "records": records}
    (evidence / "asset-manifest.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({key: value for key, value in report.items() if key != "records"}, indent=2))


if __name__ == "__main__":
    main()

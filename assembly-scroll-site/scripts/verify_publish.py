#!/usr/bin/env python3
"""Validate the static Pages payload without the original Blender sources."""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parents[1]
dist = root / "dist"
manifest = json.loads((dist / "assets/manifest.json").read_text())
assets = json.loads((root / "validation/asset-manifest.json").read_text())
expected = list(range(1, 35)) + list(range(95, 482))
if manifest["frames"] != expected:
    raise ValueError("Unexpected shared frame map")

record_paths = set()
for record in assets["records"]:
    relative = record["path"]
    file = dist / relative
    if not file.resolve().is_relative_to(dist.resolve()) or file.is_symlink():
        raise ValueError(f"Asset is outside the static directory: {relative}")
    if relative in record_paths:
        raise ValueError(f"Duplicate asset record: {relative}")
    record_paths.add(relative)
    data = file.read_bytes()
    if len(data) != record["bytes"] or hashlib.sha256(data).hexdigest() != record["webp_sha256"]:
        raise ValueError(f"Asset does not match its recorded hash: {relative}")

referenced = set()
for variant in manifest["variants"].values():
    for resolution in variant["resolutions"]:
        for number in expected:
            relative = resolution["urlTemplate"].replace("{frame}", f"{number:04d}").removeprefix("./")
            referenced.add(relative)
if referenced != record_paths or len(record_paths) != 2526:
    raise ValueError("Manifest and exported sequences disagree")

files = [path for path in dist.rglob("*") if path.is_file()]
if any(path.is_symlink() for path in dist.rglob("*")):
    raise ValueError("The Pages artifact must not contain symbolic links")
size = sum(path.stat().st_size for path in files)
if size >= 1024 ** 3:
    raise ValueError("The Pages artifact exceeds 1 GiB")
for name in ("index.html", "styles.css", "app.js", "timeline.mjs", "frame-loader.mjs", "quality.mjs"):
    if not (dist / name).is_file():
        raise ValueError(f"Required website file missing: {name}")
print(json.dumps({"verified_frames": len(record_paths), "static_files": len(files), "publish_bytes": size}, indent=2))

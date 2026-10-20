#!/usr/bin/env python3
"""Check every exported image and confirm the existing deliverables are untouched."""
from pathlib import Path
import hashlib
import json
from PIL import Image

root = Path(__file__).resolve().parents[1]
assembly = root.parent
evidence = root / "validation"
manifest = json.loads((root / "dist/assets/manifest.json").read_text())
assets = json.loads((evidence / "asset-manifest.json").read_text())
protected = json.loads((evidence / "preserved-assets.json").read_text())
errors = []
for name, expected in protected.items():
    if hashlib.sha256((assembly / name).read_bytes()).hexdigest() != expected:
        errors.append(f"Existing deliverable changed: {name}")
for record in assets["records"]:
    image = root / "dist" / record["path"]
    if hashlib.sha256(image.read_bytes()).hexdigest() != record["webp_sha256"]:
        errors.append(f"Export hash mismatch: {image.name}")
    with Image.open(image) as decoded:
        if decoded.size != (record["width"], record["height"]):
            errors.append(f"Unexpected dimensions: {record['path']}")
for variant, info in manifest["variants"].items():
    for resolution in info["resolutions"]:
        directory = (root / "dist" / resolution["urlTemplate"]).parent
        actual = sorted(int(path.stem.split("-")[1]) for path in directory.glob("frame-*.webp"))
        if actual != manifest["frames"]:
            errors.append(f"Unexpected frame set: {variant}/{resolution['id']}")
report = {"exported_frames_checked": len(assets["records"]), "protected_files_checked": len(protected),
          "errors": errors}
(evidence / "asset-validation.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
raise SystemExit(bool(errors))

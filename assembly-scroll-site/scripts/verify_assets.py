#!/usr/bin/env python3
"""Check every exported image and confirm the existing deliverables are untouched."""
from pathlib import Path
import hashlib
import json

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
    image = root / "dist/assets" / record["variant"] / f"frame-{record['source_frame']:04d}.webp"
    if hashlib.sha256(image.read_bytes()).hexdigest() != record["webp_sha256"]:
        errors.append(f"Export hash mismatch: {image.name}")
for variant in manifest["variants"]:
    actual = sorted(int(path.stem.split("-")[1]) for path in (root / "dist/assets" / variant).glob("frame-*.webp"))
    if actual != manifest["frames"]:
        errors.append(f"Unexpected frame set: {variant}")
report = {"exported_frames_checked": len(assets["records"]), "protected_files_checked": len(protected),
          "errors": errors}
(evidence / "asset-validation.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
raise SystemExit(bool(errors))

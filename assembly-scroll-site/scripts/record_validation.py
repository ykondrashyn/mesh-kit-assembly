#!/usr/bin/env python3
"""Summarize completed local checks and fingerprint the validated runtime."""
from pathlib import Path
import hashlib
import json
import re

root = Path(__file__).resolve().parents[1]
evidence = root / "validation"
read = lambda name: json.loads((evidence / name).read_text())
browser = read("browser-validation.json")
fallback = read("fallback-validation.json")
performance = read("best-practices-after.json")
assets = read("asset-validation.json")
unit_output = (evidence / "timeline-tests.txt").read_text()
passed = int(re.search(r"^# pass (\d+)$", unit_output, re.MULTILINE)[1])
assert re.search(r"^# fail 0$", unit_output, re.MULTILINE)
assert browser["completed"] and all(item.get("passed") for item in browser["results"])
assert all(item["passed"] for item in fallback["results"])
assert not assets["errors"]
assert all(item["recoveredAfterStopping"] and item["chapterMismatches"] == 0
           for item in performance["scenarios"])
files = sorted(path for path in (root / "dist").iterdir() if path.is_file())
files += [root / "dist/assets/manifest.json"]
report = {
    "local_preview": "http://127.0.0.1:8766/",
    "publication": "local only",
    "source_sha256": {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
                      for path in files},
    "browser": browser["browser"],
    "browser_checks_passed": len(browser["results"]),
    "fallback_checks_passed": len(fallback["results"]),
    "unit_tests_passed": passed,
    "traversed_positions": sum(item.get("details", {}).get("positionsChecked", 0)
                               for item in browser["results"] if isinstance(item.get("details"), dict)),
    "exported_frames_checked": assets["exported_frames_checked"],
    "protected_files_checked": assets["protected_files_checked"],
    "scroll_viewport_heights": 12,
    "easing_response_ms": 100,
    "maximum_decoded_frames": 12,
    "maximum_decoded_pixel_bytes": 48 * 1024 * 1024,
    "maximum_loader_jobs": 4,
    "fallback_lag_threshold_ms": 800,
    "limitations": browser["limitations"] + ["Network and CPU throttling are synthetic laboratory conditions.",
        "Bitmap pixel limits exclude canvas buffers, GPU storage and other browser overhead."]
}
(evidence / "site-source.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({key: value for key, value in report.items() if key != "source_sha256"}, indent=2))

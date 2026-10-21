#!/usr/bin/env python3
"""Summarize captured runs without replacing their raw timing evidence."""
import json
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'validation/progressive'
reports = {name: json.loads((ROOT / f'{name}.json').read_text())
           for name in ('before', 'after', 'background-off')}
assert all(report['completed'] and len(report['runs']) == 18 for report in reports.values())
rows = []
for baseline in reports['before']['summary']:
    identity = {key: baseline[key] for key in ('profile', 'cache')}
    row = dict(identity)
    for name, report in reports.items():
        summary = next(s for s in report['summary'] if all(s[k] == v for k, v in identity.items()))
        runs = [r for r in report['runs'] if all(r[k] == v for k, v in identity.items())]
        row[name] = {**summary, 'initialResolutions': [r['initialResolution'] for r in runs],
                     'sharpPosePercent': statistics.median([
                         100 * sum(x['resolution'] == '1080' for leg in r['legs'] for x in leg['changes']) /
                         sum(len(leg['changes']) for leg in r['legs']) for r in runs])}
    for comparison, reference in (('after', 'before'), ('after', 'background-off')):
        row[f'{comparison}-vs-{reference}'] = {
            key: 100 * (row[comparison][key] / row[reference][key] - 1)
            for key in ('firstImageMs', 'p95GapMs', 'bytes', 'poses') if row[reference][key]}
    rows.append(row)
output = {'aggregation': 'Median of three independent runs per profile and cache state. '
          'Gap uses the worse forward/reverse p95 in each run. Sharp pose percentage counts '
          'displayed pose changes, not time on screen.', 'comparisons': rows}
(ROOT / 'performance-comparison.json').write_text(json.dumps(output, indent=2) + '\n')
print(json.dumps(output, indent=2))

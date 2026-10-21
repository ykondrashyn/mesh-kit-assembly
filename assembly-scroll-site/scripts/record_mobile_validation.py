#!/usr/bin/env python3
"""Validate saved mobile evidence and fingerprint the locally tested runtime."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parents[1]
evidence = root / 'validation/mobile-improvements'
read = lambda name: json.loads((evidence / name).read_text())


def phone_result(name):
    data = read(f'android-{name}.json')
    assert data['completed']
    assert not [error for error in data['errors'] if error['type'] == 'exception']
    inactive = 'landscape' if data['initial']['canvas']['orientation'] == 'portrait' else 'portrait'
    assert not [r for r in data['initialRequests'] if f'/{inactive}/' in r['url']]
    metrics = data['final']['stage']
    assert int(metrics['maxDecodedFrames']) <= 12
    assert int(metrics['maxDecodedBytes']) <= 48 * 1024 * 1024
    assert int(metrics['maxRequests']) <= 4
    assert metrics['mode'] == 'animation'
    legs = []
    for leg in data['legs']:
        events = [e for e in data['measurements']['frames'] if leg['start'] <= e['t'] <= leg['ended']]
        # Repainting the same index after a toolbar resize is not a changed pose.
        changed = [e for i, e in enumerate(events) if not i or e['frame'] != events[i - 1]['frame']]
        gaps = sorted(b['t'] - a['t'] for a, b in zip(changed, changed[1:]))
        assert len(changed) >= 50
        assert all((b['frame'] - a['frame']) * leg['direction'] >= 0 for a, b in zip(changed, changed[1:]))
        assert all(e['mode'] == 'animation' for e in events)
        assert leg['stopped']
        assert int(leg['final']['canvas']['frame']) == (420 if leg['direction'] > 0 else 0)
        samples = [e for e in data['measurements']['samples'] if leg['start'] <= e['t'] <= leg['ended']]
        legs.append({
            'direction': leg['direction'], 'changedPoses': len(changed),
            'durationMs': round(leg['ended'] - leg['start']),
            'p95ChangeGapMs': round(gaps[int(len(gaps) * .95)]), 'maxChangeGapMs': round(max(gaps)),
            'loadingSamplePercent': round(100 * sum(e['loading'] for e in samples) / len(samples), 1),
            'stoppedAtEndpoint': True,
        })
    return {'initialResolution': data['initial']['canvas']['resolution'],
            'firstAnimationMs': round(data['measurements']['frames'][0]['t']),
            'legs': legs, 'longTasks': len(data['measurements']['longTasks']),
            'maxRequests': int(metrics['maxRequests']), 'maxDecodedImages': int(metrics['maxDecodedFrames']),
            'maxDecodedBytes': int(metrics['maxDecodedBytes']), 'initialInactiveRequests': 0}


browser = read('browser-validation.json')
continuous = read('continuous-scroll.json')
assert browser['completed'] and all(r.get('passed') for r in browser['results'])
assert continuous['completed'] and all(r['passed'] for r in continuous['profiles'])
for name in ['android-viewport.json', 'readability-device.json', 'android-connectors.json', 'connectors.json']:
    assert read(name)['passed'], name
assert all(r['passed'] for r in read('fallback-validation.json')['results'])
assert read('final-layout.json')['completed']
assert read('chapter-navigation.json')['completed']
unit_text = (evidence / 'unit-tests.txt').read_text()
assert re.search(r'^# fail 0$', unit_text, re.MULTILINE)
assets = read('publish-verification.json')
assert assets['verified_frames'] == 2526
restored = read('device-restored.json')
assert restored['settings'] == {'user_rotation': '0', 'accelerometer_rotation': '0', 'screen_off_timeout': '30000'}
assert '9227' not in restored['forwarding'] and '8766' not in restored['reverse']
changed = subprocess.check_output(['git', 'diff', '--name-only', '142191c3', '--'], cwd=root.parent, text=True).splitlines()
assert all(p.startswith('assembly-scroll-site/') for p in changed), 'Original deliverables changed'
runtime = sorted(p for p in (root / 'dist').iterdir() if p.is_file()) + [root / 'dist/assets/manifest.json']
report = {
    'passed': True, 'publication': 'Local commits only, GitHub Pages unchanged',
    'sourceSha256': {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in runtime},
    'unitTests': int(re.search(r'^# pass (\d+)$', unit_text, re.MULTILINE)[1]),
    'browserChecks': len(browser['results']), 'continuousProfiles': len(continuous['profiles']),
    'traversedPositions': sum(r.get('details', {}).get('positionsChecked', 0)
                             for r in browser['results'] if isinstance(r.get('details'), dict)),
    'verifiedFrames': assets['verified_frames'], 'protectedOriginalDeliverablesChanged': [],
    'phone': {name: phone_result(name) for name in ['normal', 'slow']},
    'baseline': json.loads((root / 'validation/android-review-2026-10-21/summary.json').read_text()),
    'limitations': [
        'One Pixel 10 Pro XL, Android 17 and Chrome 155. No iPhone, Safari, Firefox, lower-end Android or TalkBack journey.',
        'Current phone runs use a local USB-forwarded server. The baseline used public GitHub Pages. Timing is not a controlled A/B comparison.',
        'Phone network limits are synthetic, with the real phone CPU. Desktop throttling additionally uses 4x CPU slowdown.',
        'Changed poses are not display FPS. Identical-index repaint events are removed before interval calculations.',
        'Decoded pixel limits exclude canvas, GPU and complete browser process memory.',
        'No production deployment or field Core Web Vitals validation in this update.',
    ],
}
(evidence / 'summary.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: v for k, v in report.items() if k not in ['sourceSha256', 'baseline']}, indent=2))

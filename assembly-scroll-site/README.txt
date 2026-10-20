MESH KIT: SCROLL TO ASSEMBLE

A standalone, local website driven by normal page scrolling.
Scroll down to assemble, scroll up to reverse, or select a chapter.
Mouse wheel, trackpad, touch and keyboard scrolling use the browser's
normal behavior. There is no autoplay, audio, scroll trapping or server API.

PREVIEW

  python3 scripts/preview.py

Open http://127.0.0.1:8766 in your browser. Use --port to choose another
local port. Keep the preview process running while viewing the page.
The dist directory is the complete static website. Use an HTTP server,
not a file URL, because the application loads a JSON manifest and frames.

ASSETS

The website reuses existing Blender renders from ../ppt-demo-assets.
No original videos, Blender files, presentation images or ZIPs are edited.
Both orientations retain source frames 1-34 and 95-481, giving 421 positions.
The repeated reading and final holds are omitted only from this website.
Pause scrolling whenever you want more time to read.

To regenerate the WebP files, install Pillow in your Python environment:

  python3 scripts/prepare_assets.py

The conversion keeps native resolution, WebP quality 88, method 4.
Source and output hashes are recorded in validation/asset-manifest.json.
All assembly artwork comes from Blender. No AI-generated imagery is used.

INTERACTION

The stage remains visible over twelve viewport heights of scroll travel.
Wheel, touch and keyboard scrolling ease toward the requested position
with a short 100 ms response constant and no overshoot. Small wheel
movements settle over a few tenths of a second instead of jumping.
Chapter buttons still jump directly to the selected step. Reduced-motion
chapter stills respond immediately.
Its available width and height choose the landscape or portrait sequence.
Both sequences use the same source-frame map, so changing orientation
preserves the assembly progress.

The browser only fetches the selected orientation. It prefetches nearby
frames with at most four requests and decodes serially, keeping no more
than 12 decoded bitmaps. At native resolution that is approximately
95 MiB of bitmap pixels, excluding browser overhead and canvas buffers.
Old results cannot overwrite the current frame after a direction or
orientation change.

Reduced-motion preferences show five chapter stills. A visible button
enables full animation if desired. Without JavaScript, the parts lineup
remains available as a still image. Loading failures show a retry action.

CHECKS

  node --test tests/timeline.test.mjs
  python3 scripts/verify_assets.py

Browser checks use Playwright and an installed Chromium browser:

  PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
  CHROME_PATH=/absolute/path/to/chrome \
  node tests/browser.cjs http://127.0.0.1:8766

Use the same environment variables with tests/smooth-scroll.cjs to check
the longer scroll travel, intermediate poses and settling in both layouts.
SKIP_FULL_TRAVERSAL=1 skips the exhaustive unchanged-image traversal when
running the browser checks for interaction-only changes.

See validation/ for generated asset evidence, browser results and preview
screenshots. Browser validation requires the optional Playwright package.
It is not a runtime dependency of the website.

This version is local only. Nothing has been deployed.

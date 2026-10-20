MESH KIT: SCROLL TO ASSEMBLE

A standalone local website driven by normal page scrolling.
Scroll down to assemble, scroll up to reverse, or select a chapter.
Wheel, trackpad, touch and keyboard use native scrolling. There is no
sound, autoplay, backend or deployment.

PREVIEW

  python3 scripts/preview.py

Open http://127.0.0.1:8766 in your browser. Use --port for another local
port. The dist directory is the complete static site. Use an HTTP server
rather than a file URL because the application fetches a JSON manifest.

ARTWORK AND RESOLUTIONS

The website uses the original Blender PNGs in ../ppt-demo-assets.
No original videos, Blender projects, presentation images or ZIPs change.
Both orientations retain source frames 1-34 and 95-481: 421 positions.
Only repeated opening and ending holds are omitted. All artwork comes
from Blender, with no AI-generated imagery.

Install Pillow in your Python environment, then regenerate using:

  python3 scripts/prepare_assets.py

The script creates WebP images at quality 88, method 4, with Lanczos
resizing. Existing native-resolution files are retained byte-for-byte.
There are 421 images in each orientation at each resolution:

  Resolution     Landscape dimensions     Portrait dimensions
  540p           960 x 540                540 x 960
  720p           1280 x 720               720 x 1280
  1080p          1920 x 1080              1080 x 1920

Total sequence sizes are about 7.5 MB, 11.1 MB and 18.0 MB respectively
for each orientation. Exact byte totals and source/output hashes are in
validation/asset-manifest.json. The whole sequence is not preloaded.

The manifest retains the shared frame map and chapter boundaries. Each
orientation adds a resolutions array with id, width, height and
urlTemplate. The browser chooses the smallest image covering the fitted
artwork at device pixel ratio capped at 2. Orientation follows the
available artwork area. The baseline HTML picture uses viewport
orientation before enhancement.

INTERACTION AND LOADING

The stage remains visible over twelve viewport heights of scroll travel.
Motion eases toward the requested position with a 100 ms response constant
and no overshoot. Chapter links jump directly to a step. Resize and device
orientation changes retain progress. Drawing stops once the position
settles. Reading time is controlled by the visitor pausing their scroll.

The loader prioritizes the newest target and nearby frames. Active
requests finish during normal scrolling instead of being repeatedly
cancelled. Changes to orientation or resolution cancel the old selection.
There are at most four loader jobs, with serial image decoding.

Decoded images are limited to both 12 bitmaps and 48 MiB. Reservations for
an in-progress decode count toward the limit. Evicted images are closed.
The byte limit covers bitmap pixels, not total browser memory, canvas
buffers, GPU storage or the five small compressed chapter images.

Five 540p chapter stills are warmed before streaming animation frames.
When displayed motion remains at least two positions behind for 800 ms,
the viewer switches to these stills and explains why. It stays in this
mode until the visitor selects Try animation, which uses 540p. Reduced
motion also selects chapter stills, with an explicit animation option.
Everyone can select Use chapter stills.

The initial HTML includes a parts image, working chapter links and full
assembly instructions. These remain usable if JavaScript is unavailable
or fails. The instructions panel starts open and collapses only after the
enhanced viewer draws successfully. Expand Assembly instructions to read
all five steps. Loading failures keep the last valid image and offer
Try again. Image descriptions and chapter highlighting follow the actual
displayed view.

CHECKS

  node --test tests/*.test.mjs
  python3 scripts/verify_assets.py

Browser checks use Playwright and an installed Chromium browser:

  PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
  CHROME_PATH=/absolute/path/to/chrome \
  node tests/browser.cjs http://127.0.0.1:8766

Run these scripts with the same environment variables:

  tests/resolution.cjs    Orientation and resolution selection
  tests/smooth-scroll.cjs Easing, reverse motion and stable stopping
  tests/fallback.cjs      Script failures, retry, stills and readable text
  tests/performance.cjs   Repeatable desktop and throttled mobile audit

The default browser test traverses all 421 positions forward and backward
in each orientation. SKIP_FULL_TRAVERSAL=1 explicitly skips those two
checks. It is useful for a focused interaction check, not a substitute
for full release validation.

The performance test uses a fresh browser context with the cache disabled.
The mobile profile applies 1.6 Mbps download, 150 ms latency, 4x CPU slowdown
and device pixel ratio 2. Chapter holds are intentional, so its report
separates continuous-animation freezes from still mode.

After completing all checks, run python3 scripts/record_validation.py to
refresh the runtime fingerprint and coverage summary.

Evidence is in validation/. RESULTS.txt summarizes outcomes and tradeoffs.
best-practices-audit.json is the unchanged
baseline. best-practices-after.json records the new measurement. These are
laboratory measurements on this Mac, not field Core Web Vitals or physical
phone results. Safari, Firefox and physical devices remain unverified.

REPOSITORY

The Git repository lives in the parent assembly-manual directory and
includes the existing manuals and media. Its initial commit preserves
the state before these improvements. Python environments, Python caches
and macOS metadata are ignored. No remote is configured and nothing is
pushed or published.

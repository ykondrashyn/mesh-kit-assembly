MESH KIT: SCROLL TO ASSEMBLE

A static website driven by normal page scrolling.
Live site: https://ykondrashyn.github.io/mesh-kit-assembly/
Scroll down to assemble, scroll up to reverse, or select a chapter.
Wheel, trackpad, touch and keyboard use native scrolling. There is no
sound, autoplay or backend.

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

The viewer shows one progress bar, below the chapter links. CSS hides the
duplicate track embedded in the bottom 64 pixels of the Blender frames,
including the baseline parts image. Artwork sizing and all source files
remain unchanged. The display mask follows the image actually on screen.
validation/single-progress.json and its screenshots cover this display
change before the rest of the interface was simplified.

The artwork provides the step title, connector labels and short caption.
The initial scroll hint disappears after scrolling or selecting a chapter.
Instructions & options opens a panel at the top right with full written
instructions and the optional still mode. Opening it preserves artwork
size and progress. Escape closes it and returns focus to its summary.
Clicking outside or selecting a chapter also closes it. Resolution changes
happen quietly, with temporary loading feedback and Retry when needed.

The bottom contains only the chapter links and one progress line.
The same layout works in landscape and portrait. The separate
design/layout-concept.html remains a chapter-still design sketch.

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
the viewer lowers resolution one tier, from 1080p to 720p to 540p, while
keeping continuous animation active. The lower ceiling lasts for the
page visit, including resize and orientation changes, to avoid oscillation.
At 540p it keeps animating and retains the last picture while loading.
It never automatically selects chapter stills because of network delays.
Reduced motion selects stills with an explicit animation option.
Everyone can select Use chapter stills and resume animation at any time.

Completed downloads can advance the picture even if scrolling has passed
the original request window. Only frames between the displayed pose and
the current target can be used. Stale results from a direction, mode,
orientation or resolution change cannot replace the current picture.
After scrolling stops the viewer settles on the exact requested pose.

The initial HTML includes a parts image, working chapter links and full
assembly instructions. These remain usable if JavaScript is unavailable
or fails. The instructions panel starts open and collapses only after the
enhanced viewer draws successfully. Expand Instructions & options to read
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
  tests/continuous-scroll.cjs Sustained native wheel scrolling in both directions
  tests/layout.cjs        Five viewport layouts, disclosure, hint and enlarged text

The default browser test traverses all 421 positions forward and backward
in each orientation. SKIP_FULL_TRAVERSAL=1 explicitly skips those two
checks. It is useful for a focused interaction check, not a substitute
for full release validation.

The performance test uses a fresh browser context with the cache disabled.
The mobile profile applies 1.6 Mbps download, 150 ms latency, 4x CPU slowdown
and device pixel ratio 2. Chapter holds are intentional, so its report
records resolution reductions and animation freezes. The continuous-scroll
regression uses a cold cache, covers the full timeline in both directions
without waiting for individual frames, and requires intermediate poses,
monotonic movement, exact settling and bounded resource use. Pass a live
URL to run the same check against GitHub Pages. Set VALIDATION_OUTPUT to
save that run separately from the local report.

After completing all checks, run python3 scripts/record_validation.py to
refresh the runtime fingerprint and coverage summary.

Evidence is in validation/. RESULTS.txt summarizes outcomes and tradeoffs.
best-practices-audit.json is the unchanged
baseline. best-practices-after.json preserves the first improvement measurement.
adaptive-performance.json and continuous-scroll.json cover the fix that
keeps animation active during loading delays. continuous-scroll-live.json
records the same scrolling test against GitHub Pages, and live-source.json
verifies the deployed runtime against local hashes. These are
laboratory measurements on this Mac, not field Core Web Vitals or physical
phone results. Safari, Firefox and physical devices remain unverified.
clean-layout.json covers the simplified interface, with screenshots for
desktop, tablet, phone, small phone and short landscape viewports.
clean-layout-live.json repeats those checks against GitHub Pages.

REPOSITORY

The Git repository lives in the parent assembly-manual directory and
includes the existing manuals and media. Its initial commit preserves
the state before these improvements. Python environments, Python caches
and macOS metadata are ignored. The repository is published at
https://github.com/ykondrashyn/mesh-kit-assembly.

GITHUB PAGES

.github/workflows/pages.yml at the repository root publishes only dist.
It uses a sparse checkout of this site, runs the unit tests and validates
all exported frame hashes with scripts/verify_publish.py. Relevant changes
on main deploy automatically. The Actions tab also supports manual runs.
Original Blender projects, videos and manual archives remain in the
repository and are not part of the Pages payload. Local validation
reports retain the context in which their measurements were captured.

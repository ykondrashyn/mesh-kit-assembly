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
validation/asset-manifest.json. Complete background preparation is gated by
measured delivery and never blocks the opening frame.

The manifest retains the shared frame map and chapter boundaries. Each
orientation adds a resolutions array with id, width, height and
urlTemplate. The opening pose requests the smallest image covering the fitted artwork
at device pixel ratio capped at 2, up to 1080p. A conservative request
starts after 600 ms if that sharp opening is still unavailable. The normal
HTML parts image remains visible while loading. Phones begin scrolling at
up to 720p, or 540p on a reported constrained connection. Those are startup
choices, not permanent ceilings. Data Saver caps automatic requests at
540p. Explicit connector enlargement can still request 1080p.
Orientation follows the available artwork area. The baseline HTML picture uses viewport
orientation before enhancement.

INTERACTION AND LOADING

The stage follows the visible viewport, while the scroll distance remains
twelve small viewport heights. Collapsing browser controls changes the
stage without moving the scroll denominator. Rotation retains progress
and checks the settled viewport. Pinch zoom remains native.
Motion eases toward the requested position with a 100 ms response constant
and no overshoot. Chapter links jump directly to a step. Resize and device
orientation changes retain progress. Drawing stops once the position
settles. Reading time is controlled by the visitor pausing their scroll.

Connection links land after the transition fades, with the connector
close-up visible and before pressing: Wi-Fi at position 90, LoRa at 180,
and Boards at 315. Chapter boundaries remain at 45, 150 and 255 so normal
scrolling still includes the full transitions and rear rotation.

The viewer shows one progress bar, below the chapter links. CSS hides the
duplicate track embedded in the bottom 64 pixels of the Blender frames,
including the baseline parts image. All source files remain unchanged.
Phone layouts crop exported page furniture and keep the assembly and
complete connector circles. The mask follows the image actually on screen.
validation/single-progress.json and its screenshots cover this display
change before the rest of the interface was simplified.

The artwork retains its connector labels, chip markings and antenna labels.
Phones use 13px navigation labels and a 15px HTML step instruction. Short
landscape screens place the instruction beside a larger artwork region.
The mobile hint reads Swipe up to assemble. The hint disappears after
scrolling or selecting a chapter.
Instructions & options opens a panel at the top right with full written
instructions and the optional still mode. Opening it preserves artwork
size and progress. Escape closes it and returns focus to its summary.
Clicking outside or selecting a chapter also closes it. Resolution changes
happen quietly, with temporary loading feedback and Retry when needed.

The bottom contains only the chapter links and one progress line.
Both landscape and portrait remain supported. The separate
design/layout-concept.html remains a chapter-still design sketch.

PROGRESSIVE LOADING AND QUALITY RECOVERY

The loader prioritizes the requested pose before nearby motion frames.
Opening and paused-pose detail requests share the same scheduler. Ordinary
scrolling does not repeatedly cancel active motion downloads. A speculative
request can be cancelled to free a slot for an urgent target. Requests carry
browser priority hints, but the scheduler controls admission itself.

There are at most four jobs and one speculative job at a time, with serial
image decoding. Decoded images are limited to twelve bitmaps and 48 MiB,
including reservations for an in-progress decode. A separate 24 MiB cache
holds compressed image files. All limits are shared with connector inspection
and refinement. These are application cache limits, not total browser, GPU,
canvas or in-flight response memory measurements.

Decoded entries and compressed files are keyed by orientation, resolution
and frame. Useful entries survive resolution changes. Redundant decoded
versions of the same pose are removed. The compressed cache evicts unused
orientations and lower-resolution files before useful high-resolution files.
Fallback and runtime requests use matching versioned URLs for HTTP-cache reuse.

Five small chapter stills warm after foreground work rather than blocking
startup. High-resolution background preparation covers twelve positions ahead
and four behind, then reverses direction with scrolling. After three healthy
seconds and at least eight measured network responses averaging 5 Mbps or
more, it can prepare the rest of the active orientation. Browser-cache hits
are excluded from that throughput estimate. It never preloads the inactive
orientation or every resolution. Each asset gets only one speculative network
attempt per visit, preventing refetch loops after eviction or failure.

Speculation pauses when delivery falls behind, the target fails, Data Saver
is active, or the page is hidden. Measured transfer pressure also suspends
preparation until scrolling has paused for 600 ms. Briefly catching up does
not compete with the next visible request on a constrained link.
New work stops after preparation completes.
The ?background=off query is a validation switch that disables speculative
high-resolution preparation. It is not a user-facing quality control.

After 600 ms without scrolling, the exact displayed pose can sharpen to the
useful screen resolution without changing progress or the streaming tier.
A late or failed refinement preserves the valid image. Resuming scroll uses
the established motion tier, or already prepared sharper files when decoding
has sufficient headroom. Decode demand is capped at 60 displayed frames per
second so skipped timeline positions do not reject usable cached images.
A lower-quality result cannot replace a sharper
version of the same pose and layout.

Motion two or more positions behind for 800 ms lowers quality one tier.
Measured delivery pressure shortens that delay to 350 ms. Continuous animation
remains active even at 540p. Recovery needs three healthy seconds and three
distinct recent next-tier samples with at least 30 percent transfer and decode
headroom at the scrolling rate. Cached files only need decode headroom.
Wait ten seconds after a downgrade, five seconds between promotions, and
fifteen seconds after a failed probe. Connection APIs are optional hints.
Measured delivery supports recovery without them and without reloading.

Loading feedback appears only after a 600 ms image stall or an unresolved
chapter tap lasting 350 ms. Actual target failures retain the current view and
offer Retry. Corrupt compressed responses are discarded on retry, which also
bypasses HTTP cache. Reduced motion selects optional chapter stills. Everyone
can switch between stills and animation from Instructions & options.

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

CONNECTOR INSPECTION

Tap the circular close-up or its plus button to inspect that connector.
The dialog opens immediately with the displayed pose, then loads exactly
one native-resolution frame through the same bounded loader. Scrolling
pauses while the dialog is open. Close or Escape returns focus and resumes
the same progress, retaining a sharper cached pose when useful. Rotation during inspection
is supported. A failed sharp image keeps the immediate view and offers
Retry. These are enlarged views of the same parts, not additional pieces.

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
  tests/chapters.cjs      Visible chapter entry poses and forward/reverse seating
  tests/connectors.cjs    Enlargement, single-image loading, focus, retry and cancellation
  tests/loading-feedback.cjs Quiet advancing images, stalled taps and error announcements

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

The current mobile suite uses scripts/record_mobile_validation.py to
record its runtime fingerprint and coverage. The older record_validation.py
supports the root-level evidence and should run only after that entire
earlier suite has been repeated.

Evidence is in validation/. RESULTS.txt summarizes outcomes and tradeoffs.
best-practices-audit.json is the unchanged
baseline. best-practices-after.json preserves the first improvement measurement.
adaptive-performance.json and continuous-scroll.json cover the fix that
keeps animation active during loading delays. continuous-scroll-live.json
records the same scrolling test against GitHub Pages, and live-source.json
verifies the deployed runtime against local hashes. These are
laboratory measurements on this Mac, not field Core Web Vitals or physical
phone results. The later mobile-improvements folder contains actual Pixel
10 Pro XL Chrome checks, recorded separately from those older reports.
Those earlier reports did not cover Safari, Firefox, iPhone or lower-end Android.
Current progressive-loading coverage is listed in validation/progressive/RESULTS.txt.
clean-layout.json covers the simplified interface, with screenshots for
desktop, tablet, phone, small phone and short landscape viewports.
clean-layout-live.json repeats those checks against GitHub Pages.
chapter-navigation.json and chapter-navigation-live.json cover the later
chapter-link correction. They verify rendered content in the main scene
and connector inset, keyboard activation, and wheel motion through each
connection in both orientations. Screenshots accompany these reports.

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

MOBILE VALIDATION, 21 OCTOBER 2026

validation/mobile-improvements/RESULTS.txt covers this local-only update.
The earlier android-review-2026-10-21 folder preserves the public-site
baseline. Mobile tests use one dedicated tab and never clear browser data.
With the phone available and Chrome foreground, set up USB forwarding:

  adb reverse tcp:8766 tcp:8766
  adb forward tcp:9227 localabstract:chrome_devtools_remote

Open http://127.0.0.1:8766/?audit=android-mobile-fixes in a dedicated phone
Chrome tab. Record initial rotation and screen timeout settings before
changing them. The scripts expect Node 22 or later, adb, the original
1080 x 2404 test phone and locked portrait rotation. The swipe coordinates
are device-specific. Do not run the phone scripts concurrently.

  node tests/android-viewport.cjs
  node tests/android-layout.cjs
  node tests/android-connectors.cjs
  node tests/android-scroll.cjs normal
  node tests/android-scroll.cjs slow
  node tests/android-progressive.cjs

The slow phone run applies 1.6 Mbps and 150 ms latency to the real phone CPU.
It does not emulate a low-end device. Desktop continuous-scroll.cjs also
checks a 4x CPU slowdown. Disconnect only the dedicated audit tab, remove
the two temporary forwardings and restore recorded device settings when
done. The scripts restore network emulation and rotations they change.

Use VALIDATION_DIR=validation/mobile-improvements for browser.cjs and
fallback.cjs. Other browser scripts accept VALIDATION_OUTPUT for report
paths when documented in their source. Generate the current evidence
summary with python3 scripts/record_mobile_validation.py after testing.

PROGRESSIVE LOADING VALIDATION

  node --test tests/*.test.mjs
  PLAYWRIGHT_MODULE=/absolute/path/to/playwright node tests/progressive.cjs
  PLAYWRIGHT_MODULE=/absolute/path/to/playwright node tests/progressive-performance.cjs

The performance script takes three cold/warm runs for desktop, phone and
throttled phone. Set VALIDATION_OUTPUT to preserve a separate report. The
comparison uses a fresh baseline in validation/progressive/before.json.
The ?background=off URL allows a matched contention comparison:

  VALIDATION_OUTPUT=validation/progressive/background-off.json \
  PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
  node tests/progressive-performance.cjs 'http://127.0.0.1:8766/?background=off'
  python3 scripts/compare_progressive_performance.py

The focused warm-start investigation is reproducible with
node tests/startup-comparison.cjs using the same Playwright environment.
Add SLOW=1 for the constrained phone profile. It uses a temporary explicit-cache
server to isolate warm reloads, and does not replace the primary server results.

See validation/progressive/RESULTS.txt for measured improvements, byte costs,
regressions and unavailable coverage. Firefox/Safari smoke checks use Selenium:

  python3 tests/cross_browser.py

The Safari check requires Remote Automation already enabled by the user.
This script does not change browser preferences. Android checks require a
connected, authorized phone and are not replaced by desktop emulation.
The final progressive audit includes a connected Pixel 10 Pro XL. Its reports
are under validation/progressive/android. For a dedicated phone audit, set
VALIDATION_DIR=validation/progressive/android and optionally ANDROID_TARGET_ID
to the exact new Chrome tab ID. The phone scripts now record live device and
browser versions. Restore the settings and forwarding documented above afterward.

Scheduler references:
https://web.dev/articles/fetch-priority
https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/transferSize
https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap/close

LOCAL FORMAT COMPARISON

The production format remains WebP. Comparison outputs are reproducible,
local-only files under .cache/format-benchmark, excluded from Git and Pages.
Install Pillow with AVIF support in a Python environment and use FFmpeg with
libx264 available. The recorded run uses Pillow 13 and AVIF speed 8, one codec
thread per image worker. Each candidate uses original PNGs, not transcoded WebP.

  python3 scripts/benchmark_formats.py --workers 2
  python3 scripts/benchmark_server.py

Open http://127.0.0.1:8767 to compare formats and poses. The server implements
HTTP byte ranges. Generation resumes by retaining completed output files.
The benchmark includes all 421 poses, both orientations and all three sizes.
WebP candidates use quality 80/88 and method 6, AVIF uses quality 50/65/80,
and H.264 uses CRF 18/23 with GOP 1/6, no B-frames and faststart.

  PLAYWRIGHT_MODULE=/absolute/path/to/playwright node tests/format-benchmark.cjs

This records normal and throttled cases, precise random seeks, continuous
forward/reverse traces, transferred bytes and presented-frame latency.
Video remains paused and seeks with currentTime. Presented timestamps are
checked with requestVideoFrameCallback. Requested frames are not counted as
presented frames until confirmed. Different codec quality numbers are not
equivalent visual-quality ratings. Read the comparison report before choosing
a new production format. The original MP4 demos are unchanged.

  python3 scripts/compare_format_quality.py

This adds source-pixel comparisons and a contact sheet of chip, plug and antenna
labels. Read validation/progressive/FORMAT-COMPARISON.txt for the conclusions.
Generated candidates are retained locally but excluded from Git. Scripts and
measurement evidence are committed. Production remains WebP pending a separate
format decision and broader device validation.

AUDIT REGRESSIONS, 2026-10-21

The loader can release one obsolete neighboring download for a new visible
pose while retaining demanded downloads. Recovery uses batches of three
measurements. A failed batch may remeasure cached compressed images after
the 15-second cooldown, without resetting per-visit network-attempt tracking.

Instructions close when keyboard focus leaves the disclosure. Escape works
throughout the page while the disclosure is open and preserves outside focus.
The connector dialog retains its native Escape and focus-return behavior.

Chapter links support direct fragments such as #step-lora, Back/Forward,
reload and modified-click opening. Chapter clicks save the current position
and create a history entry. Scrolling saves the position on the current entry
after a 600 ms pause, without creating extra history entries or writing history
on every frame. Reload restores the saved position, or the linked chapter when
no position has been saved. Reduced motion continues to show chapter stills.

Run from assembly-scroll-site with Playwright and Chrome configured as above:

  node --test tests/*.test.mjs
  node tests/audit-regressions.cjs http://127.0.0.1:8766/

The browser suite covers blocked request slots, multiple unsuccessful recovery
rounds followed by successful recovery at the same pose, keyboard disclosure,
chapter fragments, history, reload, new tabs and bounded history writes.
The repeated-recovery check takes about 70 seconds because it exercises real
cooldowns. CHECK=urgent, CHECK=recovery, CHECK=disclosure or CHECK=history selects
a group. VALIDATION_OUTPUT selects the JSON report and screenshot prefix.

The existing cross_browser.py also checks fragments, Back/Forward and reload.
Set VALIDATION_OUTPUT to save a fresh Firefox/Safari report without overwriting
older evidence. Safari still requires Remote Automation enabled by the user.

Final evidence and coverage limits are in validation/audit-fixes/RESULTS.txt.
All fixes remain local until publication is separately requested.

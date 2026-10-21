import { QualityController, RECOVERY_SAMPLE_COUNT, cachedDecodeHasHeadroom, canPrepareWhileScrolling } from './quality.mjs?v=audit-fixes-2';
import { clamp, easeProgress, frameAtProgress, progressAtFrame, chapterAtFrame, variantForStage, fitFrame, resolutionForFit, initialResolutionCap, qualityLagDelay } from './timeline.mjs?v=progressive-1';
import { FrameLoader } from './frame-loader.mjs?v=audit-fixes-2';
import { presentationForStage, frameCrop, chapterCopy, connectorAtFrame, connectorCircle } from './presentation.mjs?v=progressive-1';

function removePageVersion() {
  const url = new URL(location.href);
  if (!url.searchParams.has('v')) return;
  url.searchParams.delete('v');
  history.replaceState(history.state, '', url);
}
removePageVersion();

const $ = selector => document.querySelector(selector);
const story = $('#story'), stage = $('#stage'), artwork = $('#artwork'), canvas = $('#assembly');
const context = canvas.getContext('2d', { alpha: false });
const fallback = $('.fallback'), masthead = $('.masthead'), instructions = $('#instructions');
const instructionsSummary = instructions.querySelector('summary');
const loadState = $('#load-state'), loadMessage = $('#load-message'), retry = $('#retry');
const loadAnnouncement = $('#load-announcement');
const progressFill = $('#progress-fill'), scrollHint = $('#scroll-hint');
const scrollIntro = $('#scroll-intro'), introEvents = new AbortController();
const stepSummary = $('#step-summary'), stepTitle = $('#step-title'), stepCaption = $('#step-caption');
const enlargeConnector = $('#enlarge-connector'), connectorDialog = $('#connector-dialog'), connectorImage = $('#connector-image');
const connectorContext = connectorImage.getContext('2d', { alpha: false });
const connectorTitle = $('#connector-title'), connectorInstruction = $('#connector-instruction');
const connectorNote = $('#connector-note'), connectorStatus = $('#connector-status'), connectorRetry = $('#connector-retry');
const announcement = $('#chapter-announcement'), navLinks = [...document.querySelectorAll('[data-chapter]')];
const motionOptions = $('#motion-options'), motionToggle = $('#motion-toggle'), motionDescription = $('#motion-description');
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
let manifest, loader, progress = 0, targetProgress = 0, lastIndex = 0, direction = 1;
let raf = 0, previousTick = 0, wakeTimer = 0, pendingSince = 0;
let displayedKey = '', currentChapter = '', variant = '', fittedStyle;
let resizePending = false, booting = false, enhanced = false, initialCap = Infinity, saveData = false;
let cachedScrollSpan = 1, previousProgress = -1, hintDismissed = false, stylePending = true;
let mode = reducedQuery.matches ? 'reduced' : 'animation';
let areaWidth = 0, areaHeight = 0;
let orientationTimer = 0;
let lastScrollTime = 0, scrollRate = 0;
let lastAdvanceAt = 0, chapterRequestedAt = 0;
let layout = 'full';
let inspection = null;
let openingAt = null, connectorKey = '', dormant = false;
let historyReady = false;
const quality = new QualityController();
const observedProbeFailures = new Set();
const backgroundEnabled = new URLSearchParams(location.search).get('background') !== 'off';
const data = (element, name, value) => { const text = String(value); if (element.dataset[name] !== text) element.dataset[name] = text; };
const stillMode = () => mode !== 'animation';
const schedule = () => { if (!raf && !document.hidden) raf = requestAnimationFrame(render); };

function chapterFromHash() {
  let hash;
  try { hash = decodeURIComponent(location.hash); } catch { return undefined; }
  return manifest.chapters.find(chapter => hash === `#step-${chapter.id}`);
}

function navigationProgress() {
  const saved = history.state?.assemblyScroll;
  if (saved?.hash === location.hash && Number.isFinite(saved.progress)) return clamp(saved.progress);
  const chapter = chapterFromHash();
  return chapter ? progressAtFrame(chapter.targetIndex, manifest.frames.length) : location.hash ? null : 0;
}

function rememberPosition(next = targetProgress, method = 'replaceState', hash = location.hash) {
  if (!historyReady || dormant) return;
  const saved = history.state?.assemblyScroll;
  if (method === 'replaceState' && saved?.hash === hash && saved.progress === next) return;
  const previous = history.state && typeof history.state === 'object' ? history.state : {};
  const url = new URL(location.href);
  url.hash = hash;
  history[method]({ ...previous, assemblyScroll: { hash: url.hash, progress: next } }, '', url);
}

function navigateProgress(next) {
  progress = targetProgress = clamp(next);
  previousTick = 0;
  chapterRequestedAt = lastScrollTime = performance.now();
  const top = targetProgress * Math.max(1, story.offsetHeight - stage.offsetHeight);
  if (inspection) {
    // The asynchronous dialog close handler must restore the new history pose.
    inspection.scrollY = top;
    connectorDialog.close();
  }
  window.scrollTo({ top, behavior: 'instant' });
  schedule();
}

function restoreNavigation() {
  removePageVersion();
  if (!manifest || dormant || !historyReady) return;
  const next = navigationProgress();
  if (next === null) return;
  instructions.open = false;
  navigateProgress(next);
  rememberPosition(next);
}

function connectionChanged() {
  const connection = navigator.connection || {};
  initialCap = initialResolutionCap({
    coarsePointer: matchMedia('(pointer: coarse)').matches,
    shortSide: Math.min(screen.width, screen.height),
    saveData: connection.saveData, effectiveType: connection.effectiveType, downlink: connection.downlink,
  });
  saveData = Boolean(connection.saveData);
  resizePending = true;
  if (manifest) schedule();
}
connectionChanged();
navigator.connection?.addEventListener('change', connectionChanged);

function showLoad(message, failed = false) {
  if (loadMessage.textContent !== message) loadMessage.textContent = message;
  retry.hidden = !failed;
  loadState.hidden = false;
  const announcement = failed ? message : '';
  if (loadAnnouncement.textContent !== announcement) loadAnnouncement.textContent = announcement;
}

function updateMotionOptions() {
  motionDescription.textContent = {
    animation: 'Scroll animation',
    manual: 'Chapter stills', reduced: 'Reduced motion: chapter stills',
  }[mode];
  motionToggle.textContent = stillMode() ? 'Enable full animation' : 'Use chapter stills';
  stage.dataset.mode = mode;
}

function dismissScrollIntro() {
  if (scrollIntro.hidden) return;
  scrollIntro.hidden = true;
  introEvents.abort();
}
// Dismiss on scroll intent, before native scrolling or frame loading catches up.
for (const type of ['wheel', 'touchmove', 'scroll']) {
  window.addEventListener(type, dismissScrollIntro, { passive: true, signal: introEvents.signal });
}
window.addEventListener('keydown', event => {
  if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) dismissScrollIntro();
}, { signal: introEvents.signal });
scrollIntro.addEventListener('animationend', event => {
  if (event.target === scrollIntro) dismissScrollIntro();
}, { signal: introEvents.signal });

function dismissHint() {
  dismissScrollIntro();
  if (hintDismissed) return;
  hintDismissed = true;
  scrollHint.hidden = true;
}

function setMode(next) {
  if (next === mode) return;
  mode = next;
  quality.lagSince = null;
  previousTick = 0;
  updateMotionOptions();
  resizePending = true;
  schedule();
}

function resizeStage() {
  // CSS viewport units avoid persisting Chrome's transient rotation dimensions.
  layout = presentationForStage(stage.clientWidth, stage.clientHeight);
  stage.dataset.layout = layout;
  const { width, height } = artwork.getBoundingClientRect();
  areaWidth = width; areaHeight = height;
  const nextVariant = variantForStage(width, height);
  const dimensions = manifest.variants[nextVariant];
  const crop = frameCrop(nextVariant, layout);
  const fit = fitFrame(width, height, crop.width, crop.height);
  const sourceFit = { width: fit.width * dimensions.width / crop.width, height: fit.height * dimensions.height / crop.height };
  const fitted = resolutionForFit(sourceFit, dimensions.resolutions, devicePixelRatio || 1);
  quality.configure(dimensions.resolutions, fitted, initialCap, saveData);
  const resolution = stillMode() ? dimensions.resolutions[0] : quality.motion;
  fittedStyle = { width: `${fit.width}px`, height: `${fit.height}px`, left: `${fit.left}px`, top: `${fit.top}px` };
  const shown = frameCrop(canvas.dataset.orientation || nextVariant, canvas.dataset.layout || layout);
  const oldFit = fitFrame(width, height, shown.width, shown.height);
  Object.assign(canvas.style, { width: `${oldFit.width}px`, height: `${oldFit.height}px`, left: `${oldFit.left}px`, top: `${oldFit.top}px` });
  variant = nextVariant;
  loader.selectVariant(variant, resolution);
  loader.warmStills();
  stage.dataset.orientation = variant;
  stage.dataset.resolution = resolution.id;
  displayedKey = '';
  stylePending = true;
  quality.lagSince = null;
  const nextSpan = Math.max(1, story.offsetHeight - stage.offsetHeight);
  const spanChanged = Math.abs(nextSpan - cachedScrollSpan) > 1;
  cachedScrollSpan = nextSpan;
  if (enhanced && spanChanged) window.scrollTo({ top: targetProgress * cachedScrollSpan, behavior: 'instant' });
}

function enhance() {
  enhanced = true;
  fallback.hidden = true;
  canvas.hidden = false;
  instructions.open = location.hash === '#instructions';
  masthead.append(instructions);
  $('#instructions-link').hidden = true;
  motionOptions.hidden = false;
  stepSummary.hidden = false;
  scrollHint.firstChild.textContent = matchMedia('(pointer: coarse)').matches ? 'Swipe up to assemble ' : 'Scroll to assemble ';
  scrollHint.hidden = hintDismissed;
  document.documentElement.classList.add('enhanced');
  resizePending = true;
}

function updateNavigation(index) {
  const chapter = chapterAtFrame(index, manifest.chapters);
  if (currentChapter === chapter.id) return;
  currentChapter = chapter.id;
  for (const link of navLinks) {
    if (link.dataset.chapter === chapter.id) link.setAttribute('aria-current', 'step');
    else link.removeAttribute('aria-current');
  }
  canvas.setAttribute('aria-label', chapter.description);
  announcement.textContent = chapter.description;
  stepTitle.textContent = chapterCopy[chapter.id].title;
  stepCaption.textContent = chapterCopy[chapter.id].instruction;
}

function positionConnector() {
  const connector = connectorAtFrame(Number(canvas.dataset.frame));
  enlargeConnector.hidden = !connector || !enhanced || typeof connectorDialog.showModal !== 'function';
  if (enlargeConnector.hidden) return;
  const key = `${connector.id}:${canvas.dataset.orientation}:${canvas.dataset.layout}:${canvas.style.cssText}`;
  if (key === connectorKey) return;
  connectorKey = key;
  const crop = frameCrop(canvas.dataset.orientation, canvas.dataset.layout);
  const circle = connectorCircle(canvas.dataset.orientation);
  const scale = parseFloat(canvas.style.width) / crop.width;
  Object.assign(enlargeConnector.style, {
    left: `${parseFloat(canvas.style.left) + (circle.x - circle.r - crop.x) * scale}px`,
    top: `${parseFloat(canvas.style.top) + (circle.y - circle.r - crop.y) * scale}px`,
    width: `${circle.r * 2 * scale}px`, height: `${circle.r * 2 * scale}px`,
  });
  enlargeConnector.setAttribute('aria-label', `Enlarge ${connector.label}`);
}

function drawConnector(source, scale, crop = { x: 0, y: 0 }) {
  const { x, y, r } = connectorCircle(inspection.variant), radius = r + 6;
  const size = Math.round(radius * 2 * scale);
  connectorImage.width = connectorImage.height = size;
  connectorContext.drawImage(source, (x - radius - crop.x) * scale, (y - radius - crop.y) * scale,
    radius * 2 * scale, radius * 2 * scale, 0, 0, size, size);
}

function updateLoaderMetrics() {
  const network = loader.networkSummary();
  for (const [name,value] of Object.entries({ decodedFrames: loader.allocatedImages, maxDecodedFrames: loader.maxDecoded,
    decodedBytes: loader.allocatedBytes, maxDecodedBytes: loader.maxDecodedBytes, maxRequests: loader.maxRequests,
    compressedBytes: loader.compressedBytes, maxCompressedBytes: loader.maxCompressedBytes,
    maxSpeculative: loader.maxSpeculative, backgroundFetched: loader.backgroundFetched, jobs: loader.jobs.size,
    preparedFrames: loader.preparedCount(quality.desired),
    networkSamples: network.count, networkMbps: network.mbps.toFixed(2),
    qualityDrops: quality.drops, qualityPromotions: quality.promotions, usefulResolution: quality.desired?.id,
    resolution: quality.motion?.id, qualityLagMs: Math.round(quality.lagDuration || 0) })) data(stage,name,value);
}

function renderInspection() {
  updateLoaderMetrics();
  const bitmap = loader.get(inspection.index);
  if (bitmap && !inspection.ready) {
    drawConnector(bitmap, bitmap.width / manifest.variants[inspection.variant].width);
    inspection.ready = true;
    connectorImage.dataset.resolution = loader.resolution.id;
    connectorStatus.textContent = '';
    connectorRetry.hidden = true;
  } else if (loader.error(inspection.index)) {
    connectorStatus.textContent = 'The sharper image could not load. The current view is still available.';
    connectorRetry.hidden = false;
  }
}

enlargeConnector.addEventListener('click', () => {
  const index = Number(canvas.dataset.frame), connector = connectorAtFrame(index);
  if (!connector || inspection) return;
  inspection = { index, variant: canvas.dataset.orientation, scrollY, ready: false };
  connectorTitle.textContent = connector.label;
  connectorInstruction.textContent = chapterCopy[connector.id].instruction;
  connectorNote.hidden = connector.id !== 'boards';
  connectorImage.setAttribute('aria-label', `${connector.label}, enlarged from the displayed assembly pose`);
  connectorImage.dataset.frame = String(index);
  connectorImage.dataset.resolution = canvas.dataset.resolution;
  connectorStatus.textContent = '';
  connectorRetry.hidden = true;
  const crop = frameCrop(inspection.variant, canvas.dataset.layout);
  drawConnector(canvas, canvas.width / crop.width, crop);
  document.documentElement.classList.add('inspecting');
  connectorDialog.showModal();
  const sharp = manifest.variants[inspection.variant].resolutions.at(-1);
  loader.setActivity({ visible: !document.hidden, sharp, warm: false });
  loader.selectVariant(inspection.variant, sharp);
  loader.request(index, direction, true);
  schedule();
});
$('#close-connector').addEventListener('click', () => connectorDialog.close());
connectorDialog.addEventListener('close', () => {
  if (!inspection) return;
  const saved = inspection;
  inspection = null;
  document.documentElement.classList.remove('inspecting');
  window.scrollTo({ top: saved.scrollY, behavior: 'instant' });
  previousTick = 0;
  resizePending = true;
  enlargeConnector.focus({ preventScroll: true });
  schedule();
});
connectorRetry.addEventListener('click', () => {
  connectorRetry.hidden = true;
  connectorStatus.textContent = 'Loading sharper image…';
  loader.retry(); schedule();
});

function render(now) {
  raf = 0;
  clearTimeout(wakeTimer);
  if (!manifest || document.hidden || dormant) return;
  if (inspection) { renderInspection(); return; }
  if (resizePending) { resizePending = false; resizeStage(); }
  openingAt ??= now;
  const deadlines = [];
  const elapsed = previousTick ? Math.min(64, now - previousTick) : 1000 / 60;
  progress = stillMode() ? targetProgress : easeProgress(progress, targetProgress, elapsed);
  previousTick = progress === targetProgress ? 0 : now;
  const logicalIndex = frameAtProgress(progress, manifest.frames.length);
  if (logicalIndex !== lastIndex) direction = logicalIndex > lastIndex ? 1 : -1;
  lastIndex = logicalIndex;
  const chapter = chapterAtFrame(logicalIndex, manifest.chapters);
  const index = stillMode() ? chapter.stillIndex : logicalIndex;
  const current = Number(canvas.dataset.frame);
  const lag = enhanced ? Math.abs(index - current) : 0;
  const idle = now - Math.max(lastScrollTime, openingAt);
  const rate = now - lastScrollTime < 300 ? scrollRate : 0;
  if (!stillMode() && quality.observe({ now, lag, failed: Boolean(loader.error(index)), rate,
    deliveryMs: loader.deliveryMs, samples: loader.deliverySamples })) {
    loader.selectVariant(variant, quality.motion);
  }
  let probe = !stillMode() ? quality.next(now) : null;
  if (probe) {
    const samples = quality.usableSamples(loader.tierSamples(probe), now);
    const failed = loader.probeIndices().some(i => {
      const key = loader.spec(i,probe).key;
      if (!loader.error(i,probe) || observedProbeFailures.has(key)) return false;
      observedProbeFailures.add(key); return true;
    });
    if (failed || (samples.length >= RECOVERY_SAMPLE_COUNT && !quality.hasHeadroom(samples, now))) {
      quality.probeFailed(now); probe = null;
    } else if (quality.promote(now, samples)) {
      loader.selectVariant(variant, quality.motion); probe = null;
    } else if (loader.probeBatchFinished(probe)) {
      // Aborted or expired samples can leave a batch short of three useful
      // measurements. Retry cached decodes after a cooldown instead of stalling.
      quality.probeFailed(now); probe = null;
    }
  }
  const sharp = stillMode() ? manifest.variants[variant].resolutions[0] : quality.desired;
  const sharpSamples = loader.tierSamples(sharp).slice(-3);
  const preferCached = cachedDecodeHasHeadroom(sharpSamples, rate);
  const healthy = enhanced && lag <= 1 && !loader.error(index);
  const preparationReady = stillMode() || canPrepareWhileScrolling(idle, loader.deliveryMs, Math.max(rate,quality.rate), loader.deliverySamples);
  const distant = backgroundEnabled && quality.distant(now, loader.networkSummary());
  loader.setActivity({ visible: true, enabled: backgroundEnabled && healthy && preparationReady && !saveData && !stillMode(),
    warm: healthy && preparationReady, sharp, probe, probeAfter: quality.sampleAfter, distant, preferCached: preferCached && !stillMode() });
  const opening = !enhanced && !stillMode();
  const refine = !stillMode() && enhanced && current === index && progress === targetProgress && idle >= 600;
  const detail = opening || refine ? sharp : null;
  const motion = !opening || now - openingAt >= 600 || loader.error(index, sharp);
  loader.request(index, direction, stillMode(), { detail, motion });
  if (opening && !motion) deadlines.push(openingAt + 600);
  if (!stillMode() && enhanced && idle < 600) deadlines.push(Math.max(lastScrollTime,openingAt) + 600);
  if (!stillMode() && enhanced && (Number(quality.motion.id) < Number(sharp.id) || backgroundEnabled)) {
    const deadline = quality.nextDeadline(now);
    if (Number.isFinite(deadline)) deadlines.push(deadline);
  }
  if (quality.lagSince !== null) deadlines.push(quality.lagSince + qualityLagDelay(loader.deliveryMs,rate,loader.deliverySamples));
  if (previousProgress !== progress) { progressFill.style.transform = `scaleX(${progress})`; previousProgress = progress; }
  data(stage,'requestedFrame',index);
  data(stage,'progress',progress.toFixed(6));
  data(stage,'targetProgress',targetProgress.toFixed(6));
  data(stage,'settled',progress === targetProgress);
  data(stage,'distantPrefetch',distant && healthy && preparationReady && !stillMode());
  updateLoaderMetrics();
  const drawnIndex = loader.frameFor(index, current, direction, stillMode());
  const entry = loader.best(drawnIndex, sharp);
  if (entry) {
    const { bitmap, resolution } = entry;
    const samePose = canvas.dataset.orientation === variant && current === drawnIndex;
    const sharperAlready = samePose && canvas.dataset.layout === layout && Number(canvas.dataset.resolution) > Number(resolution.id);
    const key = `${variant}:${layout}:${resolution.id}:${drawnIndex}`;
    if (displayedKey !== key && !sharperAlready) {
      if (stylePending) { Object.assign(canvas.style, fittedStyle); stylePending = false; }
      const crop = frameCrop(variant, layout), source = manifest.variants[variant];
      const scale = bitmap.width / source.width;
      const width = Math.round(crop.width * scale), height = Math.round(crop.height * scale);
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      context.drawImage(bitmap, crop.x * scale, crop.y * scale, crop.width * scale, crop.height * scale, 0, 0, width, height);
      if (!samePose) lastAdvanceAt = now;
      displayedKey = key;
      data(canvas,'frame',drawnIndex);
      data(canvas,'sourceFrame',manifest.frames[drawnIndex]);
      data(canvas,'orientation',variant);
      data(canvas,'resolution',resolution.id);
      data(canvas,'layout',layout);
      updateNavigation(drawnIndex);
      if (!enhanced) enhance();
    }
  }
  positionConnector();
  // Save after a pause, including in still mode where every scroll is already
  // "settled". Per-frame replaceState calls can hit browser navigation limits.
  if (enhanced && progress === targetProgress && !resizePending) {
    if (now - lastScrollTime >= 600) rememberPosition();
    else if (history.state?.assemblyScroll?.progress !== targetProgress) deadlines.push(lastScrollTime + 600);
  }
  const exact = canvas.dataset.orientation === variant && Number(canvas.dataset.frame) === index;
  if (exact) {
    if (!loadState.hidden) loadState.hidden = true;
    if (loadAnnouncement.textContent) loadAnnouncement.textContent = '';
    chapterRequestedAt = pendingSince = 0;
  } else {
    if (!pendingSince) pendingSince = now;
    const failed = loader.error(index);
    const feedbackDelay = chapterRequestedAt ? 350 : 600;
    const start = chapterRequestedAt || Math.max(pendingSince, lastAdvanceAt);
    if (failed && !enhanced && (!detail || loader.error(index,detail))) {
      dormant = true;
      loader.setActivity({ visible: false });
      document.documentElement.classList.remove('scroll-ready');
      showLoad('Animation unavailable. Read the assembly instructions below or try again.', true);
      return;
    }
    if (failed) showLoad('This image could not load. The previous view remains available.', true);
    else if (now - start >= feedbackDelay) showLoad('Loading…');
    else if (enhanced) loadState.hidden = true;
    if (!failed && now-start < feedbackDelay) deadlines.push(start + feedbackDelay);
  }
  const upcoming = deadlines.filter(time => time > now);
  if (upcoming.length) wakeTimer = setTimeout(schedule, Math.max(1,Math.min(...upcoming)-now));
  if (progress !== targetProgress || resizePending) schedule();
}

async function boot() {
  if (booting) return;
  booting = true;
  showLoad('Loading assembly…');
  try {
    if (!context || !window.createImageBitmap) throw new Error('Canvas image decoding is unavailable');
    performance.setResourceTimingBufferSize?.(4096);
    const response = await fetch('./assets/manifest.json', { cache: 'no-cache', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Could not load the frame manifest');
    const next = await response.json();
    if (next.frames?.length !== 421 || !next.chapters?.length ||
        !['landscape', 'portrait'].every(key => next.variants?.[key]?.resolutions?.length)) {
      throw new Error('The frame manifest is incomplete');
    }
    loader?.dispose();
    manifest = next;
    // Share the exact instruction wording with the accessible canvas descriptions.
    for (const chapter of manifest.chapters) {
      chapter.description = `${chapter.label}. ${$(`#step-${chapter.id} p`).textContent}`;
    }
    loader = new FrameLoader(manifest, schedule);
    document.documentElement.classList.add('scroll-ready');
    // Native restoration uses the short HTML fallback's geometry. Restore the
    // same position against the enhanced scroll span instead, including on reload.
    historyReady = true;
    history.scrollRestoration = 'manual';
    navigateProgress(navigationProgress() ?? 0);
    rememberPosition();
    updateMotionOptions();
    resizePending = true;
    schedule();
  } catch (error) {
    manifest = null;
    showLoad('Animation unavailable. Read the assembly instructions below or try again.', true);
  } finally { booting = false; }
}

window.addEventListener('scroll', () => {
  if (!manifest || inspection || dormant) return;
  if (resizePending) {
    if (!enhanced) {
      targetProgress = clamp(window.scrollY / Math.max(1,story.offsetHeight-stage.offsetHeight));
      lastScrollTime = performance.now();
      schedule();
      return;
    }
    // Preserve progress during a real viewport change, but do not lose normal
    // scrolling while an artwork-only layout refresh is queued.
    if (Math.abs(story.offsetHeight-stage.offsetHeight-cachedScrollSpan)>1) return;
  }
  const now = performance.now(), next = clamp(window.scrollY / cachedScrollSpan);
  const elapsed = now - lastScrollTime;
  const rate = Math.abs(next - targetProgress) * (manifest.frames.length - 1) * 1000 / Math.max(16, elapsed);
  scrollRate = elapsed < 300 ? scrollRate * .5 + rate * .5 : 0;
  lastScrollTime = now;
  targetProgress = next;
  if (targetProgress > 0) dismissHint();
  schedule();
}, { passive: true });
function viewportChanged() {
  // Pinch zoom changes the visual viewport, not the assembly's layout or timeline.
  if (manifest && (!window.visualViewport || Math.abs(visualViewport.scale - 1) < .01)) {
    resizePending = true;
    schedule();
  }
}
window.addEventListener('resize', viewportChanged, { passive: true });
window.visualViewport?.addEventListener('resize', viewportChanged, { passive: true });
screen.orientation?.addEventListener('change', () => {
  viewportChanged();
  clearTimeout(orientationTimer);
  orientationTimer = setTimeout(viewportChanged, 250);
});
new ResizeObserver(entries => {
  if (!manifest) return;
  const { width, height } = entries[0].contentRect;
  if (Math.abs(width - areaWidth) > 1 || Math.abs(height - areaHeight) > 1) {
    resizePending = true; schedule();
  }
}).observe(artwork);

for (const link of navLinks) {
  link.addEventListener('click', event => {
    if (!manifest || dormant || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    dismissHint();
    instructions.open = false;
    const chapter = manifest.chapters.find(item => item.id === link.dataset.chapter);
    const next = progressAtFrame(chapter.targetIndex, manifest.frames.length);
    rememberPosition();
    rememberPosition(next, location.hash === link.hash ? 'replaceState' : 'pushState', link.hash);
    navigateProgress(next);
  });
}
window.addEventListener('popstate', restoreNavigation);
window.addEventListener('hashchange', restoreNavigation);
retry.addEventListener('click', () => {
  if (!manifest) boot();
  else {
    if (dormant) {
      dormant = false; openingAt = null;
      document.documentElement.classList.add('scroll-ready'); resizePending = true;
      navigateProgress(navigationProgress() ?? 0);
    }
    loader.retry(); pendingSince = 0; quality.lagSince = null; schedule();
  }
});
motionToggle.addEventListener('click', () => setMode(stillMode() ? 'animation' : 'manual'));
document.addEventListener('focusin', event => {
  if (enhanced && instructions.open && !instructions.contains(event.target)) instructions.open = false;
});
document.addEventListener('keydown', event => {
  if (enhanced && instructions.open && !connectorDialog.open && event.key === 'Escape') {
    const returnFocus = instructions.contains(document.activeElement);
    instructions.open = false;
    if (returnFocus) instructionsSummary.focus({ preventScroll: true });
    event.preventDefault();
  }
});
document.addEventListener('pointerdown', event => {
  if (enhanced && instructions.open && !instructions.contains(event.target)) instructions.open = false;
});
document.addEventListener('visibilitychange', () => {
  if (!loader) return;
  clearTimeout(wakeTimer);
  if (document.hidden) {
    rememberPosition();
    cancelAnimationFrame(raf); raf = 0;
    loader.setActivity({ ...loader.activity, visible: false });
  } else {
    loader.setActivity({ ...loader.activity, visible: true });
    previousTick = 0; quality.healthySince = null; schedule();
  }
});
reducedQuery.addEventListener('change', () => setMode(reducedQuery.matches ? 'reduced' : 'animation'));
window.addEventListener('pagehide', event => {
  rememberPosition();
  if (!event.persisted) {
    clearTimeout(wakeTimer); clearTimeout(orientationTimer); loader?.dispose();
  }
});
boot();

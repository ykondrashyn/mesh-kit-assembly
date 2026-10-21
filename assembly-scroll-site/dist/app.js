import { clamp, easeProgress, frameAtProgress, progressAtFrame, chapterAtFrame, variantForStage, fitFrame, resolutionForFit, initialResolutionCap, qualityLagDelay } from './timeline.mjs';
import { FrameLoader } from './frame-loader.mjs?v=continuous-2';

const $ = selector => document.querySelector(selector);
const story = $('#story'), stage = $('#stage'), artwork = $('#artwork'), canvas = $('#assembly');
const context = canvas.getContext('2d', { alpha: false });
const fallback = $('.fallback'), masthead = $('.masthead'), instructions = $('#instructions');
const instructionsSummary = instructions.querySelector('summary');
const loadState = $('#load-state'), loadMessage = $('#load-message'), retry = $('#retry');
const loadAnnouncement = $('#load-announcement');
const progressFill = $('#progress-fill'), scrollHint = $('#scroll-hint');
const announcement = $('#chapter-announcement'), navLinks = [...document.querySelectorAll('[data-chapter]')];
const motionOptions = $('#motion-options'), motionToggle = $('#motion-toggle'), motionDescription = $('#motion-description');
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
let manifest, loader, progress = 0, targetProgress = 0, lastIndex = 0, direction = 1;
let raf = 0, previousTick = 0, wakeTimer = 0, pendingSince = 0, lagSince = null;
let displayedKey = '', currentChapter = '', variant = '', fittedStyle;
let resizePending = false, booting = false, enhanced = false, resolutionCap = Infinity;
let cachedScrollSpan = 1, previousProgress = -1, hintDismissed = false, stylePending = true;
let mode = reducedQuery.matches ? 'reduced' : 'animation';
let areaWidth = 0, areaHeight = 0;
let orientationTimer = 0;
let lastScrollTime = 0, scrollRate = 0;
let lastAdvanceAt = 0, chapterRequestedAt = 0;
const stillMode = () => mode !== 'animation';
const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };

function connectionChanged() {
  const connection = navigator.connection || {};
  const cap = initialResolutionCap({
    coarsePointer: matchMedia('(pointer: coarse)').matches,
    shortSide: Math.min(screen.width, screen.height),
    saveData: connection.saveData, effectiveType: connection.effectiveType, downlink: connection.downlink,
  });
  if (cap < resolutionCap) {
    resolutionCap = cap;
    resizePending = true;
    if (manifest) schedule();
  }
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

function dismissHint() {
  if (hintDismissed) return;
  hintDismissed = true;
  scrollHint.hidden = true;
}

function setMode(next) {
  if (next === mode) return;
  mode = next;
  lagSince = null;
  previousTick = 0;
  updateMotionOptions();
  resizePending = true;
  schedule();
}

function resizeStage() {
  // CSS viewport units avoid persisting Chrome's transient rotation dimensions.
  const { width, height } = artwork.getBoundingClientRect();
  areaWidth = width; areaHeight = height;
  const nextVariant = variantForStage(width, height);
  const dimensions = manifest.variants[nextVariant];
  const fit = fitFrame(width, height, dimensions.width, dimensions.height);
  const fitted = resolutionForFit(fit, dimensions.resolutions, devicePixelRatio || 1);
  const resolution = stillMode() ? dimensions.resolutions[0] :
    dimensions.resolutions.findLast(item => Number(item.id) <= Math.min(Number(fitted.id), resolutionCap));
  fittedStyle = { width: `${fit.width}px`, height: `${fit.height}px`, left: `${fit.left}px`, top: `${fit.top}px` };
  const shown = manifest.variants[canvas.dataset.orientation] || dimensions;
  const oldFit = fitFrame(width, height, shown.width, shown.height);
  Object.assign(canvas.style, { width: `${oldFit.width}px`, height: `${oldFit.height}px`, left: `${oldFit.left}px`, top: `${oldFit.top}px` });
  variant = nextVariant;
  loader.selectVariant(variant, resolution);
  loader.warmStills();
  stage.dataset.orientation = variant;
  stage.dataset.resolution = resolution.id;
  displayedKey = '';
  stylePending = true;
  lagSince = null;
  const nextSpan = Math.max(1, story.offsetHeight - stage.offsetHeight);
  const spanChanged = Math.abs(nextSpan - cachedScrollSpan) > 1;
  cachedScrollSpan = nextSpan;
  if (enhanced && spanChanged) window.scrollTo({ top: targetProgress * cachedScrollSpan, behavior: 'instant' });
}

function enhance() {
  enhanced = true;
  fallback.hidden = true;
  canvas.hidden = false;
  instructions.open = false;
  masthead.append(instructions);
  $('#instructions-link').hidden = true;
  motionOptions.hidden = false;
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
}

function render(now) {
  raf = 0;
  clearTimeout(wakeTimer);
  if (!manifest) return;
  if (resizePending) { resizePending = false; resizeStage(); }
  const elapsed = previousTick ? Math.min(64, now - previousTick) : 1000 / 60;
  progress = stillMode() ? targetProgress : easeProgress(progress, targetProgress, elapsed);
  previousTick = progress === targetProgress ? 0 : now;
  const logicalIndex = frameAtProgress(progress, manifest.frames.length);
  if (logicalIndex !== lastIndex) direction = logicalIndex > lastIndex ? 1 : -1;
  lastIndex = logicalIndex;
  const chapter = chapterAtFrame(logicalIndex, manifest.chapters);
  const index = stillMode() ? chapter.stillIndex : logicalIndex;
  if (previousProgress !== progress) { progressFill.style.transform = `scaleX(${progress})`; previousProgress = progress; }
  loader.request(index, direction, stillMode());
  stage.dataset.requestedFrame = String(index);
  stage.dataset.progress = progress.toFixed(6);
  stage.dataset.targetProgress = targetProgress.toFixed(6);
  stage.dataset.settled = String(progress === targetProgress);
  stage.dataset.decodedFrames = String(loader.allocatedImages);
  stage.dataset.maxDecodedFrames = String(loader.maxDecoded);
  stage.dataset.decodedBytes = String(loader.allocatedBytes);
  stage.dataset.maxDecodedBytes = String(loader.maxDecodedBytes);
  stage.dataset.maxRequests = String(loader.maxRequests);
  const drawnIndex = loader.frameFor(index, Number(canvas.dataset.frame), direction, stillMode());
  const key = `${variant}:${loader.resolution.id}:${drawnIndex}`;
  const bitmap = loader.get(drawnIndex);
  if (bitmap) {
    if (displayedKey !== key) {
      if (stylePending) { Object.assign(canvas.style, fittedStyle); stylePending = false; }
      if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
        canvas.width = bitmap.width; canvas.height = bitmap.height;
      }
      context.drawImage(bitmap, 0, 0);
      lastAdvanceAt = now;
      displayedKey = key;
      canvas.dataset.frame = String(drawnIndex);
      canvas.dataset.sourceFrame = String(manifest.frames[drawnIndex]);
      canvas.dataset.orientation = variant;
      canvas.dataset.resolution = loader.resolution.id;
      updateNavigation(drawnIndex);
      if (!enhanced) enhance();
    }
  }
  if (drawnIndex === index) {
    loadState.hidden = true;
    loadAnnouncement.textContent = '';
    chapterRequestedAt = 0;
    pendingSince = 0;
    lagSince = null;
  } else {
    if (!pendingSince) pendingSince = now;
    const failed = loader.error(index);
    const feedbackDelay = chapterRequestedAt ? 350 : 600;
    const stalledFor = now - (chapterRequestedAt || Math.max(pendingSince, lastAdvanceAt));
    if (failed) showLoad('This image could not load. The previous view remains available.', true);
    else if (stalledFor >= feedbackDelay) showLoad('Loading…');
    else if (enhanced) loadState.hidden = true;
    const resolutions = manifest.variants[variant].resolutions;
    const tier = resolutions.findIndex(item => item.id === loader.resolution.id);
    const behind = enhanced && !stillMode() && Math.abs(index - Number(canvas.dataset.frame)) >= 2;
    const lagDelay = qualityLagDelay(loader.deliveryMs, now - lastScrollTime < 300 ? scrollRate : 0, loader.deliverySamples);
    if (behind && tier > 0) {
      lagSince ??= now;
      if (now - lagSince >= lagDelay) {
        stage.dataset.qualityLagMs = String(Math.round(now - lagSince));
        stage.dataset.qualityDrops = String(Number(stage.dataset.qualityDrops || 0) + 1);
        resolutionCap = Number(resolutions[tier - 1].id);
        lagSince = null;
        resizePending = true;
      }
    } else lagSince = null;
    // Timers provide loading feedback and the lag deadline without an idle RAF loop.
    const deadlines = [];
    if (lagSince !== null) deadlines.push(Math.max(1, lagDelay - (now - lagSince)));
    if (!failed && stalledFor < feedbackDelay) deadlines.push(Math.max(1, feedbackDelay - stalledFor));
    if (deadlines.length) wakeTimer = setTimeout(schedule, Math.min(...deadlines));
  }
  if (progress !== targetProgress || resizePending) schedule();
}

async function boot() {
  if (booting) return;
  booting = true;
  showLoad('Loading assembly…');
  try {
    if (!context || !window.createImageBitmap) throw new Error('Canvas image decoding is unavailable');
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
    updateMotionOptions();
    resizePending = true;
    schedule();
  } catch (error) {
    manifest = null;
    showLoad('Animation unavailable. Read the assembly instructions below or try again.', true);
  } finally { booting = false; }
}

window.addEventListener('scroll', () => {
  if (!enhanced || resizePending) return;
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
    if (!enhanced || !manifest) return;
    event.preventDefault();
    dismissHint();
    instructions.open = false;
    const chapter = manifest.chapters.find(item => item.id === link.dataset.chapter);
    chapterRequestedAt = performance.now();
    progress = targetProgress = progressAtFrame(chapter.targetIndex, manifest.frames.length);
    previousTick = 0;
    window.scrollTo({ top: targetProgress * cachedScrollSpan, behavior: 'instant' });
    schedule();
  });
}
retry.addEventListener('click', () => {
  if (!manifest) boot();
  else { loader.retry(); pendingSince = 0; lagSince = null; schedule(); }
});
motionToggle.addEventListener('click', () => setMode(stillMode() ? 'animation' : 'manual'));
instructions.addEventListener('keydown', event => {
  if (enhanced && instructions.open && event.key === 'Escape') {
    instructions.open = false;
    instructionsSummary.focus();
    event.preventDefault();
  }
});
document.addEventListener('pointerdown', event => {
  if (enhanced && instructions.open && !instructions.contains(event.target)) instructions.open = false;
});
reducedQuery.addEventListener('change', () => setMode(reducedQuery.matches ? 'reduced' : 'animation'));
window.addEventListener('pagehide', event => { if (!event.persisted) {
  clearTimeout(wakeTimer); clearTimeout(orientationTimer); loader?.dispose();
} });
boot();

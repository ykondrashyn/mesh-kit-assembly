import { clamp, easeProgress, frameAtProgress, progressAtFrame, chapterAtFrame, variantForStage, fitFrame, resolutionForFit } from './timeline.mjs';
import { FrameLoader } from './frame-loader.mjs';

const $ = selector => document.querySelector(selector);
const story = $('#story'), stage = $('#stage'), artwork = $('#artwork'), canvas = $('#assembly');
const context = canvas.getContext('2d', { alpha: false });
const fallback = $('.fallback'), controls = $('.controls'), instructions = $('#instructions');
const loadState = $('#load-state'), loadMessage = $('#load-message'), retry = $('#retry');
const progressFill = $('#progress-fill'), scrollHint = $('#scroll-hint'), hintArrow = scrollHint.querySelector('span');
const announcement = $('#chapter-announcement'), navLinks = [...document.querySelectorAll('[data-chapter]')];
const motionOptions = $('#motion-options'), motionToggle = $('#motion-toggle'), motionDescription = $('#motion-description');
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
let manifest, loader, progress = 0, targetProgress = 0, lastIndex = 0, direction = 1;
let raf = 0, previousTick = 0, wakeTimer = 0, pendingSince = 0, lagSince = null;
let displayedKey = '', currentChapter = '', variant = '', fittedStyle;
let resizePending = false, booting = false, enhanced = false, forceSmall = false;
let cachedScrollSpan = 1, previousProgress = -1, hintAtEnd = null, stylePending = true;
let mode = reducedQuery.matches ? 'reduced' : 'animation';
let areaWidth = 0, areaHeight = 0;
const stillMode = () => mode !== 'animation';
const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };

function showLoad(message, failed = false) {
  if (loadMessage.textContent !== message) loadMessage.textContent = message;
  retry.hidden = !failed;
  loadState.hidden = false;
}

function updateMotionOptions() {
  motionDescription.textContent = {
    animation: 'Scroll at your own pace', manual: 'Chapter stills', reduced: 'Reduced motion: chapter stills',
    auto: 'Showing chapter stills because images are loading slowly.',
  }[mode];
  motionToggle.textContent = mode === 'auto' ? 'Try animation' : stillMode() ? 'Enable full animation' : 'Use chapter stills';
  stage.dataset.mode = mode;
}

function setMode(next) {
  if (next === mode) return;
  forceSmall = next === 'animation' && mode === 'auto';
  mode = next;
  lagSince = null;
  previousTick = 0;
  updateMotionOptions();
  resizePending = true;
  schedule();
}

function resizeStage() {
  document.documentElement.style.setProperty('--viewport-height', `${innerHeight}px`);
  const { width, height } = artwork.getBoundingClientRect();
  areaWidth = width; areaHeight = height;
  const nextVariant = variantForStage(width, height);
  const dimensions = manifest.variants[nextVariant];
  const fit = fitFrame(width, height, dimensions.width, dimensions.height);
  const resolution = stillMode() || forceSmall ? dimensions.resolutions[0] :
    resolutionForFit(fit, dimensions.resolutions, devicePixelRatio || 1);
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
  cachedScrollSpan = Math.max(1, story.offsetHeight - stage.offsetHeight);
  if (enhanced) window.scrollTo({ top: targetProgress * cachedScrollSpan, behavior: 'instant' });
}

function enhance() {
  enhanced = true;
  fallback.hidden = true;
  canvas.hidden = false;
  instructions.open = false;
  controls.append(instructions);
  $('#instructions-link').hidden = true;
  motionOptions.hidden = false;
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
  const atEnd = progress >= .999;
  if (enhanced && hintAtEnd !== atEnd) {
    hintAtEnd = atEnd;
    scrollHint.firstChild.textContent = atEnd ? 'Scroll back to disassemble ' : 'Scroll to assemble ';
    hintArrow.textContent = atEnd ? '↑' : '↓';
  }
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
  const key = `${variant}:${loader.resolution.id}:${index}`;
  const bitmap = loader.get(index);
  if (bitmap) {
    if (displayedKey !== key) {
      if (stylePending) { Object.assign(canvas.style, fittedStyle); stylePending = false; }
      if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
        canvas.width = bitmap.width; canvas.height = bitmap.height;
      }
      context.drawImage(bitmap, 0, 0);
      displayedKey = key;
      canvas.dataset.frame = String(index);
      canvas.dataset.sourceFrame = String(manifest.frames[index]);
      canvas.dataset.orientation = variant;
      canvas.dataset.resolution = loader.resolution.id;
      updateNavigation(index);
      if (!enhanced) enhance();
    }
    loadState.hidden = true;
    pendingSince = 0;
    lagSince = null;
  } else {
    if (!pendingSince) pendingSince = now;
    const failed = loader.error(index);
    if (failed) showLoad('This image could not load. The previous view remains available.', true);
    else if (now - pendingSince >= 160) showLoad('Loading assembly…');
    const shownIndex = Number(canvas.dataset.frame);
    const behind = enhanced && !stillMode() && Math.abs(index - shownIndex) >= 2;
    if (behind) {
      lagSince ??= now;
      if (now - lagSince >= 800) {
        stage.dataset.fallbackLagMs = String(Math.round(now - lagSince));
        setMode('auto');
      }
    } else lagSince = null;
    // Timers provide loading feedback and the lag deadline without an idle RAF loop.
    const nextWake = lagSince !== null ? Math.max(1, 800 - (now - lagSince)) : now - pendingSince < 160 ? 165 : 0;
    if (nextWake) wakeTimer = setTimeout(schedule, nextWake);
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
  targetProgress = clamp(window.scrollY / cachedScrollSpan);
  schedule();
}, { passive: true });
window.addEventListener('resize', () => { if (manifest) { resizePending = true; schedule(); } }, { passive: true });
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
    const chapter = manifest.chapters.find(item => item.id === link.dataset.chapter);
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
reducedQuery.addEventListener('change', () => setMode(reducedQuery.matches ? 'reduced' : 'animation'));
window.addEventListener('pagehide', event => { if (!event.persisted) { clearTimeout(wakeTimer); loader?.dispose(); } });
boot();

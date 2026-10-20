import { clamp, easeProgress, frameAtProgress, progressAtFrame, chapterAtFrame, variantForStage, fitFrame, resolutionForFit } from './timeline.mjs';
import { FrameLoader } from './frame-loader.mjs';

const story = document.querySelector('#story');
const stage = document.querySelector('#stage');
const artwork = document.querySelector('#artwork');
const canvas = document.querySelector('#assembly');
const context = canvas.getContext('2d', { alpha: false });
const loadState = document.querySelector('#load-state');
const loadMessage = document.querySelector('#load-message');
const retry = document.querySelector('#retry');
const progressFill = document.querySelector('#progress-fill');
const scrollHint = document.querySelector('#scroll-hint');
const announcement = document.querySelector('#chapter-announcement');
const navButtons = [...document.querySelectorAll('[data-chapter]')];
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
const motionOptions = document.querySelector('#motion-options');
const motionToggle = document.querySelector('#motion-toggle');
let manifest, loader, progress = 0, targetProgress = 0, lastIndex = 0, direction = 1;
let previousTick = 0;
let raf = 0, loadingTimer = 0, pendingSince = 0, pendingKey = '';
let displayedKey = '', currentChapter = '', variant = '', fitted, fittedStyle;
let fullMotionOverride = false, resizePending = false, booting = false;
let cachedScrollSpan = 1, hintAtEnd = false, previousProgress = -1, stylePending = true;

function reducedMotion() { return reducedQuery.matches && !fullMotionOverride; }
function scrollSpan() { return cachedScrollSpan; }
function schedule() { if (!raf) raf = requestAnimationFrame(render); }

function showLoad(message, failed = false) {
  loadMessage.textContent = message;
  retry.hidden = !failed;
  loadState.hidden = false;
}

function resizeStage() {
  const savedProgress = targetProgress;
  document.documentElement.style.setProperty('--viewport-height', `${window.innerHeight}px`);
  const { width, height } = artwork.getBoundingClientRect();
  const nextVariant = variantForStage(width, height);
  const dimensions = manifest.variants[nextVariant];
  const nextFit = fitFrame(width, height, dimensions.width, dimensions.height);
  const resolution = resolutionForFit(nextFit, dimensions.resolutions, window.devicePixelRatio || 1);
  fittedStyle = {
    width: `${nextFit.width}px`, height: `${nextFit.height}px`,
    left: `${nextFit.left}px`, top: `${nextFit.top}px`,
  };
  // Keep the previous image undistorted until its replacement has decoded.
  const shownDimensions = manifest.variants[canvas.dataset.orientation] || dimensions;
  const shownFit = fitFrame(width, height, shownDimensions.width, shownDimensions.height);
  Object.assign(canvas.style, {
    width: `${shownFit.width}px`, height: `${shownFit.height}px`,
    left: `${shownFit.left}px`, top: `${shownFit.top}px`,
  });
  fitted = {
    width: resolution.width,
    height: resolution.height,
  };
  variant = nextVariant;
  loader.selectVariant(variant, resolution);
  stage.dataset.resolution = resolution.id;
  stage.dataset.orientation = variant;
  displayedKey = '';
  stylePending = true;
  cachedScrollSpan = Math.max(1, story.offsetHeight - stage.offsetHeight);
  window.scrollTo({ top: savedProgress * scrollSpan(), behavior: 'instant' });
  targetProgress = savedProgress;
}

function updateNavigation(index) {
  const chapter = chapterAtFrame(index, manifest.chapters);
  if (currentChapter === chapter.id) return;
  currentChapter = chapter.id;
  for (const button of navButtons) {
    if (button.dataset.chapter === chapter.id) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  }
  canvas.setAttribute('aria-label', chapter.description);
  announcement.textContent = chapter.description;
}

function render(now) {
  raf = 0;
  if (!manifest) return;
  if (resizePending) {
    resizePending = false;
    resizeStage();
  }
  const elapsed = previousTick ? Math.min(64, now - previousTick) : 1000 / 60;
  progress = reducedMotion() ? targetProgress : easeProgress(progress, targetProgress, elapsed);
  previousTick = progress === targetProgress ? 0 : now;
  const logicalIndex = frameAtProgress(progress, manifest.frames.length);
  if (logicalIndex !== lastIndex) direction = logicalIndex > lastIndex ? 1 : -1;
  lastIndex = logicalIndex;
  const chapter = chapterAtFrame(logicalIndex, manifest.chapters);
  const index = reducedMotion() ? chapter.stillIndex : logicalIndex;
  if (progress !== previousProgress) {
    progressFill.style.transform = `scaleX(${progress})`;
    previousProgress = progress;
  }
  const atEnd = progress >= .999;
  if (atEnd !== hintAtEnd) {
    hintAtEnd = atEnd;
    scrollHint.firstChild.textContent = atEnd ? 'Scroll back to disassemble ' : 'Scroll to assemble ';
    scrollHint.querySelector('span').textContent = atEnd ? '↑' : '↓';
  }
  loader.request(index, direction, reducedMotion());
  stage.dataset.requestedFrame = String(index);
  stage.dataset.progress = progress.toFixed(6);
  stage.dataset.targetProgress = targetProgress.toFixed(6);
  stage.dataset.settled = String(progress === targetProgress);
  stage.dataset.decodedFrames = String(loader.cache.size);
  stage.dataset.maxDecodedFrames = String(loader.maxDecoded);
  stage.dataset.decodedBytes = String(loader.allocatedBytes);
  stage.dataset.maxDecodedBytes = String(loader.maxDecodedBytes);
  stage.dataset.maxRequests = String(loader.maxRequests);
  const key = `${variant}:${loader.resolution.id}:${index}`;
  const bitmap = loader.get(index);
  if (bitmap) {
    if (displayedKey !== key) {
      if (stylePending) {
        Object.assign(canvas.style, fittedStyle);
        stylePending = false;
      }
      if (canvas.width !== fitted.width || canvas.height !== fitted.height) {
        canvas.width = fitted.width;
        canvas.height = fitted.height;
      }
      context.drawImage(bitmap, 0, 0);
      displayedKey = key;
      canvas.dataset.frame = String(index);
      canvas.dataset.sourceFrame = String(manifest.frames[index]);
      canvas.dataset.orientation = variant;
      updateNavigation(index);
    }
    loadState.hidden = true;
    clearTimeout(loadingTimer);
    pendingKey = '';
  } else {
    if (key !== pendingKey) {
      pendingKey = key;
      // A fast series of requests should not postpone feedback forever.
      if (!pendingSince || loadState.hidden === false) pendingSince = performance.now();
    }
    const failed = loader.error(index);
    if (failed) showLoad('This frame could not load.', true);
    else if (!displayedKey || performance.now() - pendingSince > 160) showLoad('Loading assembly…');
    else {
      clearTimeout(loadingTimer);
      loadingTimer = setTimeout(schedule, 170);
    }
  }
  if (bitmap) pendingSince = 0;
  if (progress !== targetProgress) schedule();
}

function updateMotionOptions() {
  motionOptions.hidden = !reducedQuery.matches;
  motionToggle.setAttribute('aria-pressed', String(fullMotionOverride));
  motionToggle.textContent = fullMotionOverride ? 'Use chapter stills' : 'Enable full animation';
  document.querySelector('#motion-description').textContent =
    fullMotionOverride ? 'Full animation enabled' : 'Reduced motion: chapter stills';
  resizePending = true;
  schedule();
}

async function boot() {
  if (booting) return;
  booting = true;
  navButtons.forEach(button => button.disabled = true);
  showLoad('Loading assembly…');
  try {
    if (!context || !window.createImageBitmap) throw new Error('Canvas image decoding is unavailable');
    const response = await fetch('./assets/manifest.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Could not load the frame manifest');
    manifest = await response.json();
    loader = new FrameLoader(manifest, schedule);
    document.documentElement.classList.add('enhanced');
    motionOptions.hidden = !reducedQuery.matches;
    document.documentElement.style.setProperty('--viewport-height', `${window.innerHeight}px`);
    cachedScrollSpan = Math.max(1, story.offsetHeight - stage.offsetHeight);
    progress = targetProgress = clamp(window.scrollY / scrollSpan());
    resizeStage();
    navButtons.forEach(button => button.disabled = false);
    schedule();
  } catch (error) {
    manifest = null;
    showLoad('The assembly could not load. Please retry.', true);
    console.error(error.message);
  } finally {
    booting = false;
  }
}

window.addEventListener('scroll', () => {
  if (!manifest || resizePending) return;
  targetProgress = clamp(window.scrollY / scrollSpan());
  schedule();
}, { passive: true });
window.addEventListener('resize', () => {
  resizePending = true;
  schedule();
}, { passive: true });
new ResizeObserver(() => {
  if (!manifest) return;
  // Controls can grow when reduced-motion preferences or text size change.
  const bounds = artwork.getBoundingClientRect();
  const dimensions = manifest.variants[variant];
  const fit = fitFrame(bounds.width, bounds.height, dimensions.width, dimensions.height);
  if (Math.abs(parseFloat(canvas.style.width) - fit.width) > 1 ||
      Math.abs(parseFloat(canvas.style.height) - fit.height) > 1) {
    resizePending = true;
    schedule();
  }
}).observe(artwork);

for (const button of navButtons) {
  button.addEventListener('click', () => {
    const chapter = manifest.chapters.find(item => item.id === button.dataset.chapter);
    progress = targetProgress = progressAtFrame(chapter.targetIndex, manifest.frames.length);
    previousTick = 0;
    window.scrollTo({ top: targetProgress * scrollSpan(), behavior: 'instant' });
    schedule();
  });
}
retry.addEventListener('click', () => {
  if (!manifest) boot();
  else {
    loader.retry();
    showLoad('Loading assembly…');
    schedule();
  }
});
motionToggle.addEventListener('click', () => {
  fullMotionOverride = !fullMotionOverride;
  updateMotionOptions();
});
reducedQuery.addEventListener('change', () => {
  fullMotionOverride = false;
  updateMotionOptions();
});
window.addEventListener('pagehide', event => { if (!event.persisted) loader?.dispose(); });
boot();

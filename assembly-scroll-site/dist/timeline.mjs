export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function easeProgress(current, target, elapsedMs) {
  const destination = clamp(target);
  const next = current + (destination - current) * (1 - Math.exp(-Math.max(0, elapsedMs) / 100));
  return Math.abs(destination - next) < .00025 ? destination : clamp(next);
}

export function frameAtProgress(progress, count) {
  return Math.round(clamp(progress) * (count - 1));
}

export function progressAtFrame(index, count) {
  return clamp(index / (count - 1));
}

export function chapterAtFrame(index, chapters) {
  return chapters.findLast(chapter => index >= chapter.startIndex) || chapters[0];
}

export function variantForStage(width, height) {
  return width > height ? 'landscape' : 'portrait';
}

export function fitFrame(width, height, sourceWidth, sourceHeight) {
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const fittedWidth = sourceWidth * scale;
  const fittedHeight = sourceHeight * scale;
  return {
    width: fittedWidth,
    height: fittedHeight,
    left: Math.max(0, (width - fittedWidth) / 2),
    top: Math.max(0, (height - fittedHeight) / 2),
  };
}

export function nearbyFrames(target, direction, count) {
  const result = [target];
  for (let offset = 1; offset <= 8; offset++) {
    result.push(target + offset * direction);
    if (offset <= 3) result.push(target - offset * direction);
  }
  return [...new Set(result)].filter(index => index >= 0 && index < count);
}

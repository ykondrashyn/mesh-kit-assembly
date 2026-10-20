import { nearbyFrames } from './timeline.mjs';

export const MAX_IMAGES = 12;
export const MAX_DECODED_BYTES = 48 * 1024 * 1024;
export const MAX_REQUESTS = 4;

export class FrameLoader {
  constructor(manifest, notify, { fetchFrame = globalThis.fetch, decodeFrame = globalThis.createImageBitmap } = {}) {
    this.manifest = manifest;
    this.notify = notify;
    this.fetchFrame = fetchFrame.bind(globalThis);
    this.decodeFrame = decodeFrame.bind(globalThis);
    this.variant = null;
    this.epoch = 0;
    this.cache = new Map();
    this.jobs = new Map();
    this.errors = new Map();
    this.order = [];
    this.decodeChain = Promise.resolve();
    this.decodedBytes = 0;
    this.reservedBytes = 0;
    this.maxDecoded = 0;
    this.maxDecodedBytes = 0;
    this.maxRequests = 0;
    this.disposed = false;
    this.stillBlobs = new Map();
    this.stillErrors = new Map();
    this.warmOrder = [];
    this.direction = 1;
    this.motionEpoch = 0;
    this.stillsOnly = false;
  }

  selectVariant(variant, resolution = this.manifest.variants[variant].resolutions.at(-1)) {
    if (variant === this.variant && resolution.id === this.resolution?.id) return;
    this.epoch++;
    for (const job of this.jobs.values()) job.controller.abort();
    // Keep aborted jobs accounted for until their promises settle.
    for (const index of this.cache.keys()) this.evict(index);
    this.errors.clear();
    this.order = [];
    if (variant !== this.variant) {
      this.stillBlobs.clear();
      this.stillErrors.clear();
    }
    this.variant = variant;
    this.resolution = resolution;
  }

  warmStills() {
    this.warmOrder = this.manifest.chapters.map(chapter => chapter.stillIndex);
    this.pump();
  }

  get warmReady() {
    return this.warmOrder.every(index => this.stillBlobs.has(index) || this.stillErrors.has(index));
  }

  request(target, direction = 1, stillsOnly = false) {
    if (direction !== this.direction || stillsOnly !== this.stillsOnly) this.motionEpoch++;
    this.direction = direction;
    this.stillsOnly = stillsOnly;
    this.target = target;
    const capacity = Math.min(MAX_IMAGES, Math.floor(MAX_DECODED_BYTES / this.imageBytes));
    this.order = stillsOnly ? [target] : nearbyFrames(target, direction, this.manifest.frames.length, capacity);
    // Replace queued work, but let active downloads finish so scrolling cannot starve them.
    this.pump();
  }

  get imageBytes() { return this.resolution.width * this.resolution.height * 4; }
  get allocatedBytes() { return this.decodedBytes + this.reservedBytes; }
  get allocatedImages() { return this.cache.size + Number(this.reservedBytes > 0); }
  get(index) { return this.cache.get(index); }
  frameFor(target, displayed, direction, exactOnly = false) {
    if (this.cache.has(target)) return target;
    if (exactOnly || !Number.isFinite(displayed)) return undefined;
    // Advance only toward the current target, never beyond it or back to a late frame.
    const candidates = [...this.cache.keys()].filter(index =>
      (index - displayed) * direction >= 0 && (target - index) * direction >= 0);
    return candidates.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
  }
  error(index) { return this.errors.get(index); }

  retry() {
    this.errors.clear();
    this.stillErrors.clear();
    this.pump();
  }

  url(index, resolution = this.resolution) {
    const source = String(this.manifest.frames[index]).padStart(4, '0');
    return `${resolution.urlTemplate.replace('{frame}', source)}?v=${this.manifest.version}`;
  }

  evict(index) {
    const bitmap = this.cache.get(index);
    this.decodedBytes -= bitmap.width * bitmap.height * 4;
    bitmap.close();
    this.cache.delete(index);
  }

  reserve(bytes) {
    while (this.cache.size && (this.cache.size >= MAX_IMAGES || this.decodedBytes + bytes > MAX_DECODED_BYTES)) {
      const victim = [...this.cache.keys()].sort((a, b) =>
        Number(this.order.includes(a)) - Number(this.order.includes(b)) ||
        Math.abs(b - this.target) - Math.abs(a - this.target))[0];
      this.evict(victim);
    }
    this.reservedBytes = bytes;
    this.maxDecoded = Math.max(this.maxDecoded, this.allocatedImages);
    this.maxDecodedBytes = Math.max(this.maxDecodedBytes, this.allocatedBytes);
  }

  pump() {
    if (this.disposed) return;
    if (!this.warmReady) {
      for (const index of this.warmOrder) {
        if (this.jobs.size >= MAX_REQUESTS) break;
        const key = `still:${index}`;
        if (this.stillBlobs.has(index) || this.stillErrors.has(index) || this.jobs.has(key)) continue;
        const job = { controller: new AbortController(), epoch: this.epoch };
        this.jobs.set(key, job);
        this.maxRequests = Math.max(this.maxRequests, this.jobs.size);
        this.loadStill(index, key, job);
      }
      return;
    }
    for (const index of this.order) {
      if (this.jobs.size >= MAX_REQUESTS) break;
      if (this.cache.has(index) || this.jobs.has(index) || this.errors.has(index)) continue;
      const job = { controller: new AbortController(), epoch: this.epoch, motionEpoch: this.motionEpoch };
      this.jobs.set(index, job);
      this.maxRequests = Math.max(this.maxRequests, this.jobs.size);
      this.load(index, job);
    }
  }

  async loadStill(index, key, job) {
    const valid = () => !this.disposed && job.epoch === this.epoch;
    const timeout = setTimeout(() => job.controller.abort(), 8000);
    try {
      const small = this.manifest.variants[this.variant].resolutions[0];
      const response = await this.fetchFrame(this.url(index, small), { signal: job.controller.signal, cache: 'force-cache' });
      if (!response.ok) throw new Error(`Chapter request returned ${response.status}`);
      const blob = await response.blob();
      if (valid()) this.stillBlobs.set(index, blob);
    } catch (error) {
      if (valid()) this.stillErrors.set(index, error.message);
    } finally {
      clearTimeout(timeout);
      if (this.jobs.get(key) === job) this.jobs.delete(key);
      if (valid()) this.notify();
      this.pump();
    }
  }

  async load(index, job) {
    const { controller, epoch } = job;
    const valid = () => !this.disposed && epoch === this.epoch;
    // A completed frame can still advance the picture after the target has moved.
    // A reversal, mode change or new image selection makes old work obsolete.
    const wanted = () => valid() && job.motionEpoch === this.motionEpoch &&
      (!this.stillsOnly || this.order.includes(index));
    const expectedBytes = this.imageBytes;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 8000);
    try {
      let blob = this.resolution.id === '540' && this.stillBlobs.get(index);
      if (!blob) {
        const response = await this.fetchFrame(this.url(index), { signal: controller.signal, cache: 'force-cache' });
        if (!response.ok) throw new Error(`Frame request returned ${response.status}`);
        blob = await response.blob();
      }
      clearTimeout(timeout);
      const decode = this.decodeChain.then(async () => {
        if (!wanted()) return;
        this.reserve(expectedBytes);
        let bitmap;
        try {
          bitmap = await this.decodeFrame(blob);
          if (!wanted() || bitmap.width * bitmap.height * 4 !== expectedBytes) {
            bitmap.close();
            if (wanted()) throw new Error('Unexpected frame dimensions');
            return;
          }
          this.cache.set(index, bitmap);
          this.decodedBytes += expectedBytes;
        } finally {
          this.reservedBytes = 0;
        }
        this.notify();
      });
      this.decodeChain = decode.catch(() => {});
      await decode;
    } catch (error) {
      if (wanted() && (timedOut || error.name !== 'AbortError')) {
        this.errors.set(index, timedOut ? 'Frame request timed out' : error.message);
        this.notify();
      }
    } finally {
      clearTimeout(timeout);
      if (this.jobs.get(index) === job) this.jobs.delete(index);
      this.pump();
    }
  }

  dispose() {
    this.disposed = true;
    this.epoch++;
    for (const job of this.jobs.values()) job.controller.abort();
    for (const index of this.cache.keys()) this.evict(index);
    this.stillBlobs.clear();
  }
}

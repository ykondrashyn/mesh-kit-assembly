import { nearbyFrames } from './timeline.mjs';

export class FrameLoader {
  constructor(manifest, notify) {
    this.manifest = manifest;
    this.notify = notify;
    this.variant = null;
    this.epoch = 0;
    this.cache = new Map();
    this.jobs = new Map();
    this.errors = new Map();
    this.order = [];
    this.decodeChain = Promise.resolve();
    this.maxDecoded = 0;
    this.disposed = false;
  }

  selectVariant(variant, resolution = this.manifest.variants[variant].resolutions.at(-1)) {
    if (variant === this.variant && resolution.id === this.resolution?.id) return;
    this.epoch++;
    for (const controller of this.jobs.values()) controller.abort();
    this.jobs.clear();
    for (const bitmap of this.cache.values()) bitmap.close();
    this.cache.clear();
    this.errors.clear();
    this.order = [];
    this.variant = variant;
    this.resolution = resolution;
  }

  request(target, direction = 1, stillsOnly = false) {
    this.target = target;
    this.order = stillsOnly ? [target] : nearbyFrames(target, direction, this.manifest.frames.length);
    for (const [index, controller] of this.jobs) {
      if (!this.order.includes(index)) controller.abort();
    }
    this.pump();
  }

  retry() {
    this.errors.clear();
    this.pump();
  }

  get(index) { return this.cache.get(index); }
  error(index) { return this.errors.get(index); }

  url(index) {
    const source = String(this.manifest.frames[index]).padStart(4, '0');
    return `${this.resolution.urlTemplate.replace('{frame}', source)}?v=${this.manifest.version}`;
  }

  pump() {
    if (this.disposed) return;
    for (const index of this.order) {
      if (this.jobs.size >= 4) break;
      if (this.cache.has(index) || this.jobs.has(index) || this.errors.has(index)) continue;
      const controller = new AbortController();
      this.jobs.set(index, controller);
      this.load(index, controller, this.epoch);
    }
  }

  async load(index, controller, epoch) {
    const valid = () => !this.disposed && epoch === this.epoch &&
      !controller.signal.aborted && this.order.includes(index);
    try {
      const response = await fetch(this.url(index), { signal: controller.signal, cache: 'force-cache' });
      if (!response.ok) throw new Error(`Frame request returned ${response.status}`);
      const blob = await response.blob();
      const decode = this.decodeChain.then(async () => {
        if (!valid()) return;
        // Decode serially, releasing an image first so the total stays at 12.
        if (this.cache.size >= 12) {
          const victim = [...this.cache.keys()].sort((a, b) =>
            Number(this.order.includes(a)) - Number(this.order.includes(b)) ||
            Math.abs(b - this.target) - Math.abs(a - this.target))[0];
          this.cache.get(victim).close();
          this.cache.delete(victim);
        }
        const bitmap = await createImageBitmap(blob);
        if (!valid()) {
          bitmap.close();
          return;
        }
        this.cache.set(index, bitmap);
        this.maxDecoded = Math.max(this.maxDecoded, this.cache.size);
        this.notify();
      });
      this.decodeChain = decode.catch(() => {});
      await decode;
    } catch (error) {
      if (valid() && error.name !== 'AbortError') {
        this.errors.set(index, error.message);
        this.notify();
      }
    } finally {
      if (this.jobs.get(index) === controller) this.jobs.delete(index);
      this.pump();
    }
  }

  dispose() {
    this.disposed = true;
    this.epoch++;
    for (const controller of this.jobs.values()) controller.abort();
    for (const bitmap of this.cache.values()) bitmap.close();
    this.cache.clear();
  }
}

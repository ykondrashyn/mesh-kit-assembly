import { nearbyFrames } from './timeline.mjs?v=progressive-1';

export const MAX_IMAGES = 12;
export const MAX_DECODED_BYTES = 48 * 1024 * 1024;
export const MAX_COMPRESSED_BYTES = 24 * 1024 * 1024;
export const MAX_REQUESTS = 4;

export class FrameLoader {
  constructor(manifest, notify, { fetchFrame = globalThis.fetch, decodeFrame = globalThis.createImageBitmap,
    clock = () => performance.now(), resourceTiming = url => performance.getEntriesByName?.(url).at(-1) } = {}) {
    Object.assign(this, { manifest, notify, clock, resourceTiming });
    this.fetchFrame = fetchFrame.bind(globalThis);
    this.decodeFrame = decodeFrame.bind(globalThis);
    this.cache = new Map();
    this.blobs = new Map();
    this.jobs = new Map();
    this.errors = new Map();
    this.reload = new Set();
    this.attempted = new Set();
    this.probed = new Set();
    this.samples = new Map();
    this.transfers = [];
    this.decodeChain = Promise.resolve();
    this.decodedBytes = this.reservedBytes = this.compressedBytes = 0;
    this.maxDecoded = this.maxDecodedBytes = this.maxCompressedBytes = this.maxRequests = this.maxSpeculative = 0;
    this.epoch = this.motionEpoch = this.backgroundFetched = 0;
    this.direction = 1;
    this.order = [];
    this.visible = true;
    this.activity = {};
  }

  spec(index, resolution = this.resolution, kind = 'motion') {
    return { index, resolution, variant: this.variant, key: `${this.variant}/${resolution.id}/${index}`, kind };
  }
  selectVariant(variant, resolution = this.manifest.variants[variant].resolutions.at(-1)) {
    if (variant === this.variant && resolution.id === this.resolution?.id) return;
    this.epoch++;
    this.motionEpoch++;
    for (const job of this.jobs.values()) if (job.variant !== variant) job.controller.abort();
    this.variant = variant;
    this.resolution = resolution;
    this.order = [];
    this.detail = null;
    this.target = undefined;
  }
  warmStills() { this.warm = true; }
  get warmReady() { return this.manifest.chapters.every(c => this.blobs.has(this.spec(c.stillIndex, this.manifest.variants[this.variant].resolutions[0]).key)); }
  get stillBlobs() { return new Map(this.manifest.chapters.map(c => [c.stillIndex, this.blobs.get(this.spec(c.stillIndex, this.manifest.variants[this.variant].resolutions[0]).key)?.blob]).filter(([,v])=>v)); }
  get imageBytes() { return this.resolution.width * this.resolution.height * 4; }
  get allocatedBytes() { return this.decodedBytes + this.reservedBytes; }
  get allocatedImages() { return this.cache.size + Number(this.reservedBytes > 0); }
  get deliveryMs() { const rows = this.tierSamples(this.resolution).slice(-8); return rows.length ? rows.reduce((n,x)=>n+x.fetchMs,0)/rows.length : 0; }
  get deliverySamples() { return this.tierSamples(this.resolution).length; }
  preparedCount(resolution) { return [...this.blobs.values()].filter(x=>x.variant===this.variant && x.resolution.id===resolution.id).length; }
  probeIndices() {
    return [this.target,...Array.from({length:12},(_,i)=>this.target+(i+1)*this.direction),
      ...Array.from({length:12},(_,i)=>this.target-(i+1)*this.direction)].filter(i=>i>=0 && i<this.manifest.frames.length);
  }
  tierSamples(resolution) { return this.samples.get(`${this.variant}/${resolution.id}`) || []; }
  networkSummary() {
    const rows = this.transfers.filter(x=>this.clock()-x.end < 10000).sort((a,b)=>a.start-b.start);
    let duration = 0, end = -Infinity;
    for (const row of rows) { duration += Math.max(0,row.end-Math.max(end,row.start)); end=Math.max(end,row.end); }
    return { count: rows.length, mbps: duration ? rows.reduce((n,x)=>n+x.bytes,0)*8/duration/1000 : 0 };
  }
  url(index, resolution = this.resolution) {
    return `${resolution.urlTemplate.replace('{frame}', String(this.manifest.frames[index]).padStart(4,'0'))}?v=${this.manifest.version}`;
  }
  get(index, resolution = this.resolution) { return this.cache.get(this.spec(index,resolution).key)?.bitmap; }
  best(index, ceiling = this.activity.sharp || this.resolution) {
    return [...this.cache.values()].filter(x=>x.variant===this.variant && x.index===index && Number(x.resolution.id)<=Number(ceiling.id))
      .sort((a,b)=>Number(b.resolution.id)-Number(a.resolution.id))[0];
  }
  frameFor(target, displayed, direction, exactOnly = false) {
    if (this.best(target)) return target;
    if (exactOnly || !Number.isFinite(displayed)) return undefined;
    return [...new Set([...this.cache.values()].filter(x=>x.variant===this.variant && this.best(x.index)).map(x=>x.index))]
      .filter(index=>(index-displayed)*direction>=0 && (target-index)*direction>=0)
      .sort((a,b)=>Math.abs(a-target)-Math.abs(b-target))[0];
  }
  error(index, resolution = this.resolution) { return this.errors.get(this.spec(index,resolution).key); }
  retry() {
    for(const key of this.errors.keys()) {
      this.reload.add(key);
      const stored=this.blobs.get(key);
      if(stored){this.compressedBytes-=stored.bytes;this.blobs.delete(key)}
    }
    this.errors.clear();this.pump();
  }
  setActivity(activity) {
    this.activity = activity;
    this.visible = activity.visible !== false;
    for (const job of this.jobs.values()) if (job.speculative &&
      (!this.visible || (job.kind==='still' ? activity.warm===false : !activity.enabled))) job.controller.abort();
  }
  request(target, direction = 1, stillsOnly = false, { detail = null, motion = true } = {}) {
    if (direction !== this.direction || stillsOnly !== this.stillsOnly) this.motionEpoch++;
    Object.assign(this, { direction, stillsOnly, target });
    // Use a worst-case pixel capacity so a mixed-resolution window cannot churn forever.
    const largest = this.activity.sharp || this.resolution;
    const capacity = Math.min(MAX_IMAGES,Math.floor(MAX_DECODED_BYTES / Math.max(this.imageBytes,largest.width*largest.height*4)));
    const indices = stillsOnly ? [target] : nearbyFrames(target,direction,this.manifest.frames.length,capacity);
    this.order = motion ? indices.map(i=> {
      const sharp=this.activity.sharp;
      return this.spec(i,this.activity.preferCached && sharp && this.blobs.has(this.spec(i,sharp).key) ? sharp : this.resolution);
    }) : [];
    this.detail = detail ? this.spec(target,detail,'detail') : null;
    this.pump();
  }
  satisfies(spec) {
    if (this.cache.has(spec.key)) return true;
    return spec.kind === 'motion' && [...this.cache.values()].some(x=>x.variant===spec.variant && x.index===spec.index &&
      Number(x.resolution.id)>=Number(spec.resolution.id) && Number(x.resolution.id)<=Number((this.activity.sharp||this.resolution).id));
  }
  priority(entry) {
    if (entry.variant !== this.variant) return 0;
    if (entry.index === this.target) return 5;
    if (this.order.some(x=>x.index===entry.index)) return 4;
    return Number(entry.resolution.id) < Number((this.activity.sharp||this.resolution).id) ? 1 : 2;
  }
  evict(key) {
    const entry=this.cache.get(key);
    this.decodedBytes-=entry.bitmap.width*entry.bitmap.height*4;
    entry.bitmap.close(); this.cache.delete(key);
  }
  reserve(bytes) {
    while(this.cache.size && (this.cache.size>=MAX_IMAGES || this.decodedBytes+bytes>MAX_DECODED_BYTES)) {
      const victim=[...this.cache.values()].sort((a,b)=>this.priority(a)-this.priority(b) || Math.abs(b.index-this.target)-Math.abs(a.index-this.target))[0];
      this.evict(victim.key);
    }
    this.reservedBytes=bytes;
    this.maxDecoded=Math.max(this.maxDecoded,this.allocatedImages);
    this.maxDecodedBytes=Math.max(this.maxDecodedBytes,this.allocatedBytes);
  }
  remember(spec,blob) {
    const bytes=blob.size || 0;
    if (this.blobs.has(spec.key) || bytes>MAX_COMPRESSED_BYTES) return;
    while(this.blobs.size && this.compressedBytes+bytes>MAX_COMPRESSED_BYTES) {
      const victim=[...this.blobs.values()].sort((a,b)=>this.priority(a)-this.priority(b) || a.used-b.used)[0];
      this.compressedBytes-=victim.bytes; this.blobs.delete(victim.key);
    }
    this.blobs.set(spec.key,{...spec,blob,bytes,used:this.clock()});
    this.compressedBytes+=bytes;
    this.maxCompressedBytes=Math.max(this.maxCompressedBytes,this.compressedBytes);
  }
  background() {
    if (!this.visible || !this.best(this.target) || this.error(this.target)) return null;
    const a=this.activity, candidates=[];
    if(a.enabled && !this.stillsOnly) {
      if(a.probe) for(const index of this.probeIndices()) candidates.push(this.spec(index,a.probe,'probe'));
      if(a.sharp) {
        for(let offset=0;offset<=12;offset++) {
          candidates.push(this.spec(this.target+offset*this.direction,a.sharp,'near'));
          if(offset>0 && offset<=4)candidates.push(this.spec(this.target-offset*this.direction,a.sharp,'near'));
        }
      }
    }
    if(this.warm && a.warm!==false) for(const chapter of this.manifest.chapters)candidates.push(this.spec(chapter.stillIndex,this.manifest.variants[this.variant].resolutions[0],'still'));
    if(a.enabled && a.distant && !this.stillsOnly) {
      for(let offset=1;offset<this.manifest.frames.length;offset++) candidates.push(this.spec(this.target+offset*this.direction,a.sharp,'distant'));
      for(let offset=1;offset<this.manifest.frames.length;offset++) candidates.push(this.spec(this.target-offset*this.direction,a.sharp,'distant'));
    }
    return candidates.find(x=>x.index>=0 && x.index<this.manifest.frames.length &&
      (x.kind==='probe' ? !this.probed.has(x.key) && (this.blobs.has(x.key) || !this.attempted.has(x.key)) : !this.attempted.has(x.key)) &&
      !this.jobs.has(x.key) && (x.kind==='probe' ? !this.cache.has(x.key) : !this.blobs.has(x.key)));
  }
  pump() {
    if(this.disposed || !this.visible || this.target===undefined) return;
    const foreground=[...(this.detail?[this.detail]:[]),...this.order];
    const urgent=foreground.find(x=>x.index===this.target && !this.satisfies(x) && !this.jobs.has(x.key) && !this.errors.has(x.key));
    if(urgent && this.jobs.size>=MAX_REQUESTS) {
      const speculative=[...this.jobs.values()].find(x=>x.speculative);
      speculative?.controller.abort();
    }
    for(const spec of foreground) {
      if(this.jobs.size>=MAX_REQUESTS) break;
      if(this.satisfies(spec) || this.jobs.has(spec.key) || this.errors.has(spec.key))continue;
      this.start(spec,false);
    }
    if(this.jobs.size<MAX_REQUESTS && ![...this.jobs.values()].some(x=>x.speculative)) {
      const spec=this.background();
      if(spec){this.attempted.add(spec.key);if(spec.kind==='probe')this.probed.add(spec.key);this.start(spec,true)}
    }
  }
  start(spec,speculative) {
    const job={...spec,speculative,controller:new AbortController(),epoch:this.epoch,motionEpoch:this.motionEpoch};
    this.jobs.set(spec.key,job);
    this.maxRequests=Math.max(this.maxRequests,this.jobs.size);
    this.maxSpeculative=Math.max(this.maxSpeculative,[...this.jobs.values()].filter(x=>x.speculative).length);
    this.load(job);
  }
  async load(job) {
    const {controller,key,index,resolution}=job;
    const valid=()=>!this.disposed && !controller.signal.aborted && job.epoch===this.epoch && job.motionEpoch===this.motionEpoch;
    const wanted=()=>valid() && (job.kind==='detail' ? this.detail?.key===key : !this.stillsOnly || index===this.target);
    let timedOut=false, fetchMs=0, cached=true;
    const timeout=setTimeout(()=>{timedOut=true;controller.abort()},8000);
    try {
      let blob=this.blobs.get(key)?.blob;
      if(!blob){
        const start=this.clock(), url=this.url(index,resolution);
        const response=await this.fetchFrame(url,{signal:controller.signal,cache:this.reload.has(key)?'reload':'force-cache',priority:job.speculative?'low':index===this.target?'high':'auto'});
        if(!response.ok)throw new Error(`Frame request returned ${response.status}`);
        blob=await response.blob();
        this.reload.delete(key);
        fetchMs=this.clock()-start;
        const absolute=typeof location==='undefined'?url:new URL(url,location.href).href;
        const timing=this.resourceTiming(absolute);
        cached=Boolean(timing && timing.transferSize===0);
        if(timing?.transferSize>300){
          this.transfers.push({start,end:this.clock(),bytes:blob.size});
          this.transfers=this.transfers.slice(-64);
        }
      }
      clearTimeout(timeout);
      if(!this.disposed && !controller.signal.aborted)this.remember(job,blob);
      if(job.speculative)this.backgroundFetched++;
      if(job.speculative && job.kind!=='probe')return;
      const decode=this.decodeChain.then(async()=>{
        if(!wanted() || this.cache.has(key) || (job.kind==='motion' && this.satisfies(job)))return;
        const bytes=resolution.width*resolution.height*4;
        this.reserve(bytes);
        let bitmap;
        const start=this.clock();
        try{
          bitmap=await this.decodeFrame(blob);
          if(!wanted() || bitmap.width*bitmap.height*4!==bytes){
            bitmap.close();
            if(wanted())throw new Error('Unexpected frame dimensions');
            return;
          }
          // A probe may measure a smaller tier without displacing an already sharper pose.
          const sharper=[...this.cache.values()].some(x=>x.variant===job.variant && x.index===index && Number(x.resolution.id)>Number(resolution.id));
          if(sharper)bitmap.close();
          else {
            for(const other of [...this.cache.values()])if(other.variant===job.variant && other.index===index)this.evict(other.key);
            this.cache.set(key,{...job,bitmap});this.decodedBytes+=bytes;
          }
          const tier=`${job.variant}/${resolution.id}`, rows=this.samples.get(tier)||[];
          rows.push({index,fetchMs,decodeMs:this.clock()-start,cached,at:this.clock()});
          this.samples.set(tier,rows.slice(-24));
        }finally{this.reservedBytes=0}
      });
      this.decodeChain=decode.catch(()=>{});
      await decode;
    }catch(error){
      if(!this.disposed && job.epoch===this.epoch && (timedOut || error.name!=='AbortError'))this.errors.set(key,timedOut?'Frame request timed out':error.message);
    }finally{
      clearTimeout(timeout);
      this.jobs.delete(key);
      if(!this.disposed)this.notify();
      this.pump();
    }
  }
  dispose() {
    this.disposed=true;this.epoch++;
    for(const job of this.jobs.values())job.controller.abort();
    for(const key of this.cache.keys())this.evict(key);
    this.blobs.clear();this.compressedBytes=0;
  }
}

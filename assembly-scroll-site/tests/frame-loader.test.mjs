import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FrameLoader, MAX_DECODED_BYTES, MAX_IMAGES, MAX_REQUESTS, MAX_COMPRESSED_BYTES } from '../dist/frame-loader.mjs';
const manifest = JSON.parse(readFileSync(new URL('../dist/assets/manifest.json', import.meta.url)));
const pause = () => new Promise(resolve => setImmediate(resolve));
async function until(condition) {
  for (let i = 0; i < 1000; i++) { if (condition()) return; await pause(); }
  assert.fail('Loader did not reach the expected state');
}
const image = (width = 1920, height = 1080) => ({ width, height, closed: false, close() { this.closed = true; } });
const response = () => ({ ok: true, blob: async () => ({}) });

test('rapid scrolling retains active downloads and prioritizes the newest queued target', async () => {
  const requests = [];
  const loader = new FrameLoader(manifest, () => {}, {
    fetchFrame: (url, { signal }) => new Promise(resolve => requests.push({ url, signal, resolve })),
    decodeFrame: async () => image(),
  });
  try {
    loader.selectVariant('landscape');
    loader.request(0);
    loader.request(150);
    loader.request(300, -1);
    assert.equal(requests.length, MAX_REQUESTS);
    assert.ok(requests.every(item => !item.signal.aborted));
    for (const item of requests.slice()) item.resolve(response());
    await until(() => requests.length === 8);
    assert.ok(requests[4].url.includes(`frame-${String(manifest.frames[300]).padStart(4, '0')}`));
    for (const item of requests.slice(4)) item.resolve(response());
    await until(() => loader.get(300));
    assert.ok(loader.maxRequests <= MAX_REQUESTS);
  } finally {
    loader.dispose();
    for (const item of requests) item.resolve(response());
  }
});

test('decoded memory includes in-progress reservations and evicted bitmaps are closed', async () => {
  const images = [];
  let loader;
  loader = new FrameLoader(manifest, () => {}, {
    fetchFrame: async () => response(),
    decodeFrame: async () => {
      assert.ok(loader.allocatedBytes <= MAX_DECODED_BYTES);
      assert.ok(loader.allocatedImages <= MAX_IMAGES);
      await pause();
      const bitmap = image(); images.push(bitmap); return bitmap;
    },
  });
  try {
    loader.selectVariant('landscape');
    for (const target of [0, 10, 60, 200, 400, 1]) {
      loader.request(target);
      await until(() => loader.get(target));
      await until(() => loader.jobs.size === 0);
    }
    assert.ok(images.some(bitmap => bitmap.closed));
    assert.ok(loader.maxDecodedBytes <= MAX_DECODED_BYTES);
    assert.ok(loader.maxDecoded <= MAX_IMAGES);
    assert.ok(loader.maxRequests <= MAX_REQUESTS);
  } finally { loader.dispose(); }
  assert.ok(images.every(bitmap => bitmap.closed));
});

test('an orientation switch during decoding closes the obsolete result', async () => {
  let finish, started = false, calls = 0;
  const obsolete = image();
  const loader = new FrameLoader(manifest, () => {}, {
    fetchFrame: async () => response(),
    decodeFrame: async () => {
      if (calls++ === 0) { started = true; return new Promise(resolve => { finish = resolve; }); }
      return image(1080, 1920);
    },
  });
  try {
    loader.selectVariant('landscape'); loader.request(0, 1, true);
    await until(() => started);
    loader.selectVariant('portrait'); loader.request(0, 1, true);
    finish(obsolete);
    await until(() => loader.get(0));
    assert.ok(obsolete.closed);
    assert.equal(loader.get(0).width, 1080);
    assert.ok(loader.maxDecodedBytes <= MAX_DECODED_BYTES);
  } finally { loader.dispose(); }
});

test('failed targets expose an error and can be retried', async () => {
  let fail = true;
  const loader = new FrameLoader(manifest, () => {}, {
    fetchFrame: async () => { if (fail) throw new Error('Offline'); return response(); },
    decodeFrame: async () => image(),
  });
  try {
    loader.selectVariant('landscape'); loader.request(200, 1, true);
    await until(() => loader.error(200));
    assert.equal(loader.error(200), 'Offline');
    fail = false; loader.retry();
    await until(() => loader.get(200));
    assert.equal(loader.error(200), undefined);
  } finally { loader.dispose(); }
});

test('visible target loads before chapter stills, which remain available offline', async () => {
  const requests = [];
  let offline = false;
  const loader = new FrameLoader(manifest, () => {}, {
    fetchFrame: async url => {
      requests.push(url);
      if (offline) throw new Error('Offline');
      return response();
    },
    decodeFrame: async () => image(960, 540),
  });
  try {
    loader.selectVariant('landscape', manifest.variants.landscape.resolutions[0]);
    loader.warmStills();
    loader.request(0, 1, true);
    await until(() => loader.get(0));
    assert.equal(loader.stillBlobs.size, 5);
    assert.ok(requests[0].includes('frame-0001.webp'));
    assert.ok(requests.slice(1, 6).every(url => /frame-(0034|0190|0295|0424|0481)\.webp/.test(url)));
    const before = requests.length;
    offline = true;
    loader.request(363, 1, true);
    await until(() => loader.get(363));
    assert.equal(requests.length, before);
    assert.ok(loader.maxRequests <= MAX_REQUESTS);
  } finally { loader.dispose(); }
});

function sizedResponse(url, size = 100) {
  const short = url.includes('/540/') ? 540 : url.includes('/720/') ? 720 : 1080;
  const portrait = url.includes('/portrait/');
  return { ok: true, blob: async () => ({ size, width: portrait ? short : short*16/9, height:portrait ? short*16/9 : short }) };
}

test('resolution changes retain compressed and decoded frames and refinement stays within shared limits', async () => {
  const requests = [], bitmaps = [];
  const loader = new FrameLoader(manifest, () => {}, {
    fetchFrame: async url => { requests.push(url); return sizedResponse(url); },
    decodeFrame: async blob => { const b = image(blob.width,blob.height);bitmaps.push(b);return b; },
  });
  try {
    const [small,,sharp]=manifest.variants.landscape.resolutions;
    loader.selectVariant('landscape',small);
    loader.setActivity({visible:true,sharp});
    loader.request(0);
    await until(()=>loader.jobs.size===0);
    const count=requests.length;
    loader.request(0,1,false,{detail:sharp});
    await until(()=>loader.get(0,sharp));
    loader.request(0);
    await until(()=>loader.jobs.size===0);
    assert.equal(requests.length,count+1);
    assert.equal(loader.best(0).resolution.id,'1080');
    loader.selectVariant('landscape',sharp);
    loader.request(0,1,true);
    await until(()=>loader.jobs.size===0);
    assert.equal(requests.length,count+1);
    assert.ok(loader.maxDecodedBytes<=MAX_DECODED_BYTES && loader.maxDecoded<=MAX_IMAGES);
    assert.ok(loader.maxCompressedBytes<=MAX_COMPRESSED_BYTES);
  }finally{loader.dispose()}
  assert.ok(bitmaps.every(b=>b.closed));
});

test('full background preparation is compressed, bounded, single-job and never refetches evicted assets', async () => {
  const requests=[];
  let decodes=0;
  const loader=new FrameLoader(manifest,()=>{}, {
    fetchFrame:async url=>{requests.push(url);return sizedResponse(url,1024*1024)},
    decodeFrame:async blob=>{decodes++;return image(blob.width,blob.height)},
  });
  try{
    const [small,,sharp]=manifest.variants.landscape.resolutions;
    loader.selectVariant('landscape',small);
    loader.setActivity({visible:true,enabled:true,distant:true,sharp});
    loader.request(0);
    await until(()=>loader.backgroundFetched===421 && loader.jobs.size===0);
    assert.equal(new Set(requests).size,requests.length);
    assert.ok(decodes<=12,'Distant frames must not be decoded');
    assert.equal(loader.maxSpeculative,1);
    assert.ok(loader.maxRequests<=4 && loader.maxCompressedBytes<=MAX_COMPRESSED_BYTES);
    const before=requests.length;
    loader.request(0);
    await pause();
    assert.equal(requests.length,before);
    assert.ok(requests.every(url=>!url.includes('/portrait/')));
  }finally{loader.dispose()}
});

test('a hidden page starts no jobs and unknown or cached timing never qualifies as network throughput', async () => {
  let requests=0;
  const loader=new FrameLoader(manifest,()=>{}, {
    fetchFrame:async url=>{requests++;return sizedResponse(url)},
    decodeFrame:async blob=>image(blob.width,blob.height),
    resourceTiming:()=>({transferSize:0}),
  });
  try{
    loader.selectVariant('portrait');
    loader.setActivity({visible:false});loader.request(0);
    await pause();assert.equal(requests,0);
    loader.setActivity({visible:true});loader.request(0);
    await until(()=>loader.jobs.size===0);
    assert.equal(loader.networkSummary().count,0);
    assert.ok(loader.tierSamples(loader.resolution).every(x=>x.cached));
  }finally{loader.dispose()}
});

test('completed downloads advance continuous scrolling even after leaving the prefetch window', async () => {
  const requests = [];
  const loader = new FrameLoader(manifest, () => {}, {
    fetchFrame: (url, { signal }) => new Promise(resolve => requests.push({ url, signal, resolve })),
    decodeFrame: async () => image(),
  });
  try {
    loader.selectVariant('landscape');
    loader.request(20);
    loader.request(60);
    for (const request of requests.slice()) request.resolve(response());
    await until(() => loader.get(20));
    const frame = loader.frameFor(60, 10, 1);
    assert.ok(frame >= 20 && frame < 60);
    assert.equal(loader.frameFor(60, 30, 1), undefined, 'Late frames must not move the picture backward');
    assert.equal(loader.frameFor(60, 10, 1, true), undefined, 'Still mode must show the requested chapter only');
    const reverse = loader.frameFor(10, 30, -1);
    assert.ok(reverse >= 19 && reverse <= 20, 'Reverse motion chooses a frame toward its target');
    assert.equal(loader.frameFor(10, 15, -1), undefined, 'Reverse motion must not move forward');
  } finally {
    loader.dispose();
    for (const request of requests) request.resolve(response());
  }
});

test('a direction reversal during decoding closes the obsolete result', async () => {
  let finish, started = false, calls = 0;
  const obsolete = image();
  const loader = new FrameLoader(manifest, () => {}, {
    fetchFrame: async () => response(),
    decodeFrame: async () => {
      if (calls++ === 0) { started = true; return new Promise(resolve => { finish = resolve; }); }
      return image();
    },
  });
  try {
    loader.selectVariant('landscape');
    loader.request(200);
    await until(() => started);
    loader.request(100, -1);
    finish(obsolete);
    await until(() => loader.get(100));
    assert.ok(obsolete.closed);
    assert.equal(loader.get(200), undefined);
    assert.equal(loader.frameFor(100, 150, -1), 100);
  } finally { loader.dispose(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {FOREGROUND_INPUT_SIZE, hasNativeForegroundAlpha, createForegroundExtractor} from '../summon-foreground.js';
import {summonMaskSourceKey} from '../summon-mask.js';

const base = 'https://www.beast-king.com/';
const rgba = (width, height, values) => ({width, height, data: new Uint8ClampedArray(values)});
const gray = values => rgba(values.length, 1, values.flatMap(value => [value, value, value, 255]));
const source = () => rgba(3, 1, [11, 22, 33, 255, 44, 55, 66, 128, 77, 88, 99, 255]);
const art = (cardId = 'B0001') => ({cardId, src: 'assets/design-v2/cards/example.webp?v=abcdef', sourceWidth: 1024, sourceHeight: 1024, crop: {x: 4, y: 4, width: 248, height: 248}});
const record = (approved, filename = 'mask') => ({sourceKey: summonMaskSourceKey(approved, base), src: 'assets/foreground/' + filename + '.png', sourceWidth: 2, sourceHeight: 1, crop: null});
const canvas = pixels => ({width: pixels.width, height: pixels.height, getContext: () => ({getImageData: () => pixels})});

function fixture({mask = gray([0, 255]), loadImage, win = {}, registry} = {}) {
  const original = source(), approved = art(), requests = [];
  const doc = {baseURI: base, createElement(tag) {
    assert.equal(tag, 'canvas');
    return {width: 0, height: 0, getContext: () => ({drawImage() {}, getImageData: () => mask})};
  }};
  const loader = async src => { requests.push(src); return loadImage ? loadImage(src) : {naturalWidth: mask.width, naturalHeight: mask.height}; };
  const extractor = createForegroundExtractor({window: win, document: doc, loadImage: loader, maskRegistry: registry ?? {B0001: record(approved)}});
  return {original, approved, requests, doc, extractor, canvas: canvas(original)};
}

test('native alpha bypasses all public mask lookup and network, including private artwork', async () => {
  const pixels = rgba(2, 1, [100, 50, 20, 0, 44, 55, 66, 180]);
  assert.equal(hasNativeForegroundAlpha(pixels), true);
  assert.equal(hasNativeForegroundAlpha(rgba(1, 1, [0, 0, 0, 0])), false);
  let requests = 0, workers = 0;
  const extractor = createForegroundExtractor({window: {Worker: class { constructor() { workers++; } }}, loadImage() { requests++; throw Error(); }});
  const result = await extractor.extract(canvas(pixels), {art: {cardId: 'B0512', src: 'data:image/webp;base64,private'}, baseUrl: base});
  assert.deepEqual(result, pixels); assert.notEqual(result.data, pixels.data);
  assert.equal(requests, 0); assert.equal(workers, 0);
  extractor.destroy();
});

test('prepare and warmup are no-ops, and QA metadata describes 256px cached tiles', async () => {
  const f = fixture();
  await Promise.all([f.extractor.prepare(), f.extractor.warmup()]);
  assert.equal(FOREGROUND_INPUT_SIZE, 256);
  assert.equal(f.requests.length, 0);
  f.extractor.destroy();
  await assert.rejects(f.extractor.prepare(), /Foreground extraction unavailable/);
});

test('a registered public mask preserves every RGB byte and does not mutate the floor artwork', async () => {
  const f = fixture(), before = [...f.original.data];
  const pixels = await f.extractor.extract(f.canvas, {art: f.approved, baseUrl: base});
  assert.deepEqual([...pixels.data], [11, 22, 33, 0, 44, 55, 66, 64, 77, 88, 99, 255]);
  assert.deepEqual([...f.original.data], before);
  assert.notEqual(pixels.data, f.original.data);
  assert.deepEqual(f.requests, ['https://www.beast-king.com/assets/foreground/mask.png']);
  f.extractor.destroy();
});

test('changed queries/crops, private opaque sources and absent identities make no mask request', async () => {
  const f = fixture(), before = [...f.original.data];
  const sources = [
    {...f.approved, src: f.approved.src + '&changed=1'},
    {...f.approved, crop: {...f.approved.crop, x: 5}},
    {...f.approved, src: 'data:image/webp;base64,private', crop: null},
    {...f.approved, src: '/api/operator-art', crop: null},
    undefined,
  ];
  for (const approved of sources) await assert.rejects(f.extractor.extract(f.canvas, {art: approved, baseUrl: base}), error => error.code === 'FOREGROUND_UNAVAILABLE' && error.message === 'Foreground extraction unavailable');
  assert.equal(f.requests.length, 0);
  assert.deepEqual([...f.original.data], before);
  f.extractor.destroy();
});

test('destroy during an outstanding mask load rejects and ignores its eventual result', async () => {
  let complete;
  const loaded = new Promise(resolve => { complete = resolve; });
  const f = fixture({loadImage: () => loaded});
  const pending = f.extractor.extract(f.canvas, {art: f.approved, baseUrl: base});
  const rejected = assert.rejects(pending, /Foreground extraction unavailable/);
  await Promise.resolve(); assert.equal(f.requests.length, 1);
  f.extractor.destroy(); await rejected;
  complete({naturalWidth: 2, naturalHeight: 1});
  await Promise.resolve(); await Promise.resolve();
  await assert.rejects(f.extractor.extract(f.canvas, {art: f.approved, baseUrl: base}), /Foreground extraction unavailable/);
});

test('load failure leaves floor pixels intact and can be retried without a background fallback', async () => {
  let attempt = 0;
  const f = fixture({loadImage: () => { if (++attempt === 1) throw Error('https://private.invalid/secret'); return {naturalWidth: 2, naturalHeight: 1}; }});
  const before = [...f.original.data];
  await assert.rejects(f.extractor.extract(f.canvas, {art: f.approved, baseUrl: base}), error => error.message === 'Foreground extraction unavailable');
  assert.deepEqual([...f.original.data], before, 'the scene floor canvas remains intact after a mask failure');
  const recovered = await f.extractor.extract(f.canvas, {art: f.approved, baseUrl: base});
  assert.equal(recovered.data[3], 0);
  assert.equal(attempt, 2);
  f.extractor.destroy();
});

test('empty, opaque and uniform translucent masks fail closed', async () => {
  for (const coverage of [0, 128, 255]) {
    const f = fixture({mask: gray([coverage, coverage])});
    await assert.rejects(f.extractor.extract(f.canvas, {art: f.approved, baseUrl: base}), /Foreground extraction unavailable/);
    assert.deepEqual([...f.original.data], [...source().data]);
    f.extractor.destroy();
  }
});

test('standalone atlas image cache reuses images but retains at most six URLs', async () => {
  const requests = [], approved = art(), registry = {};
  const f = fixture();
  class FakeImage {
    naturalWidth = 2; naturalHeight = 1;
    set src(value) { requests.push(value); queueMicrotask(() => this.onload?.()); }
  }
  for (let i = 1; i <= 7; i++) {
    const id = 'B' + String(i).padStart(4, '0');
    registry[id] = record({...approved, cardId: id}, 'mask-' + i);
  }
  const extractor = createForegroundExtractor({window: {Image: FakeImage}, document: f.doc, maskRegistry: registry});
  const run = id => extractor.extract(f.canvas, {art: {...approved, cardId: 'B' + String(id).padStart(4, '0')}, baseUrl: base});
  await run(1); await run(1); assert.equal(requests.length, 1);
  for (let i = 2; i <= 7; i++) await run(i);
  assert.equal(requests.length, 7);
  await run(1); assert.equal(requests.length, 8, 'the seventh atlas evicted the least recently used first atlas');
  extractor.destroy(); f.extractor.destroy();
});

test('destroy cancels owned image timers and releases callbacks', async () => {
  const timers = new Map(), images = []; let timerId = 0;
  class PendingImage { constructor() { images.push(this); } set src(value) { this.url = value; } }
  const win = {Image: PendingImage, setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); }};
  const f = fixture(), extractor = createForegroundExtractor({window: win, document: f.doc, maskRegistry: {B0001: record(f.approved)}});
  const rejected = assert.rejects(extractor.extract(f.canvas, {art: f.approved, baseUrl: base}), /Foreground extraction unavailable/);
  assert.equal(images.length, 1); assert.equal(timers.size, 1);
  extractor.destroy(); await rejected;
  assert.equal(timers.size, 0);
  assert.equal(images[0].onload, null); assert.equal(images[0].onerror, null);
  f.extractor.destroy();
});

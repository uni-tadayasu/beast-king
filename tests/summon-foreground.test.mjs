import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOREGROUND_INPUT_SIZE,
  normalizeForegroundInput, normalizeForegroundMask,
  applyForegroundMask, hasNativeForegroundAlpha, createForegroundExtractor,
} from '../summon-foreground.js';

const image = (width, height, pixels) => ({width, height, data: new Uint8ClampedArray(pixels)});
const opaque = (width, height) => image(width, height, Array.from({length: width * height}, () => [48, 96, 160, 255]).flat());

test('U²-Net-P input uses resized RGB maximum, RGB channel order and CHW layout', () => {
  const source = image(2, 1, [128, 64, 32, 255, 32, 128, 64, 255]);
  const input = normalizeForegroundInput(source);
  const expected = [(1 - .485) / .229, (.25 - .485) / .229, (.5 - .456) / .224, (1 - .456) / .224, (.25 - .406) / .225, (.5 - .406) / .225];
  assert.equal(input.length, 6);
  expected.forEach((value, i) => assert.ok(Math.abs(input[i] - value) < 1e-6));
  assert.deepEqual([...source.data], [128, 64, 32, 255, 32, 128, 64, 255]);
  assert.ok([...normalizeForegroundInput(image(1, 1, [0, 0, 0, 255]))].every(Number.isFinite));
});

test('mask normalization keeps real probability edges and rejects broken predictions', () => {
  const values = Float32Array.from([.1, .3, .7, .9, .1, .3, .7, .9]);
  const mask = normalizeForegroundMask(values, 4, 2);
  assert.deepEqual([...mask], [0, 64, 191, 255, 0, 64, 191, 255]);
  for (const bad of [new Float32Array(16), new Float32Array(16).fill(.8), new Float32Array(16).fill(NaN)]) {
    assert.throws(() => normalizeForegroundMask(bad, 4, 4), /Foreground extraction unavailable/);
  }
  assert.throws(() => normalizeForegroundMask(Float32Array.from([.0001, .0002, .0001, .0002]), 2, 2));
  const nearFull = new Float32Array(10000).fill(1); nearFull[0] = 0;
  assert.throws(() => normalizeForegroundMask(nearFull, 100, 100));
  const closeUp = new Float32Array(10000).fill(1); closeUp.fill(0, 0, 300);
  assert.equal(normalizeForegroundMask(closeUp, 100, 100).length, 10000);
  assert.throws(() => normalizeForegroundMask(new Float32Array(3), 2, 2));
});

test('alpha resampling preserves every original RGB byte and original semitransparency', () => {
  const source = image(3, 1, [11, 22, 33, 255, 44, 55, 66, 128, 77, 88, 99, 64]);
  const result = applyForegroundMask(source, {width: 2, height: 1, data: new Uint8ClampedArray([0, 255])});
  assert.deepEqual([...result.data], [11, 22, 33, 0, 44, 55, 66, 64, 77, 88, 99, 64]);
  assert.deepEqual([...source.data], [11, 22, 33, 255, 44, 55, 66, 128, 77, 88, 99, 64]);
  assert.notEqual(result.data, source.data);
  assert.throws(() => applyForegroundMask(source, {width: 2, height: 1, data: [0]}));
});

test('native alpha is preserved without starting a worker or model request', async () => {
  const source = image(2, 1, [100, 50, 20, 0, 44, 55, 66, 180]);
  assert.equal(hasNativeForegroundAlpha(source), true);
  assert.equal(hasNativeForegroundAlpha(opaque(2, 1)), false);
  assert.equal(hasNativeForegroundAlpha(image(1, 1, [0, 0, 0, 0])), false);
  let created = 0;
  const extractor = createForegroundExtractor({window: {Worker: class { constructor() { created++; } }}});
  const result = await extractor.extract({width: 2, height: 1, getContext: () => ({getImageData: () => source})}, {persistent: false});
  assert.deepEqual(result, source);
  assert.notEqual(result.data, source.data);
  assert.equal(created, 0);
  extractor.destroy();
  await assert.rejects(extractor.extract({}), /Foreground extraction unavailable/);
});

function harness() {
  const workers = [], timers = new Map(); let timerId = 0;
  class FakeWorker {
    constructor(url, options) { this.url = String(url); this.options = options; this.handlers = new Map(); this.sent = []; workers.push(this); }
    addEventListener(type, fn) { this.handlers.set(type, fn); }
    postMessage(message) { this.sent.push(message); }
    emit(data) { this.handlers.get('message')?.({data}); }
    terminate() { this.terminated = true; }
  }
  const win = {Worker: FakeWorker, setTimeout(fn, delay) { const id = ++timerId; timers.set(id, {fn() { timers.delete(id); fn(); }, delay}); return id; }, clearTimeout(id) { timers.delete(id); }};
  const input = opaque(FOREGROUND_INPUT_SIZE, FOREGROUND_INPUT_SIZE);
  const doc = {createElement() { return {width: 0, height: 0, getContext: () => ({drawImage() {}, getImageData: () => input})}; }};
  const source = opaque(2, 2), canvas = {width: 2, height: 2, getContext: () => ({getImageData: () => source})};
  return {workers, timers, canvas, source, extractor: createForegroundExtractor({window: win, document: doc})};
}

test('battle preparation initializes once without sending an image or starting extraction timers', async () => {
  const h = harness(), first = h.extractor.prepare(), second = h.extractor.warmup();
  assert.equal(h.workers.length, 1);
  assert.equal(h.workers[0].sent.length, 0);
  assert.deepEqual([...h.timers.values()].map(v => v.delay), [120000]);
  h.workers[0].emit({type: 'ready'});
  await Promise.all([first, second]);
  assert.deepEqual([...h.timers.values()].map(v => v.delay), [12000]);
  await h.extractor.prepare();
  assert.equal(h.workers.length, 1);
  h.extractor.destroy();
});

test('idle release frees the worker and a later extraction starts a new worker', async () => {
  const h = harness(), prepared = h.extractor.prepare();
  const firstWorker = h.workers[0];
  firstWorker.emit({type: 'ready'}); await prepared;
  const idle = [...h.timers.values()][0];
  assert.equal(idle.delay, 12000);
  idle.fn();
  assert.equal(firstWorker.terminated, true);
  assert.equal(h.timers.size, 0);
  const pending = h.extractor.extract(h.canvas, {persistent: false});
  const rejected = assert.rejects(pending, /Foreground extraction unavailable/);
  assert.equal(h.workers.length, 2);
  assert.deepEqual([...h.timers.values()].map(v => v.delay), [120000]);
  // A message from the terminated worker must not ready the replacement.
  firstWorker.emit({type: 'ready'});
  assert.equal(h.workers[1].sent.length, 0);
  h.workers[1].emit({type: 'ready'});
  assert.equal(h.workers[1].sent.length, 1);
  h.extractor.destroy(); await rejected;
});

test('new extraction cancels idle release and completed pixel data survives worker release', async () => {
  const h = harness(), prepared = h.extractor.prepare();
  const worker = h.workers[0];
  worker.emit({type: 'ready'}); await prepared;
  const expiredIdle = [...h.timers.values()][0];
  const pending = h.extractor.extract(h.canvas, {persistent: false});
  assert.deepEqual([...h.timers.values()].map(v => v.delay), [90000]);
  expiredIdle.fn();
  assert.notEqual(worker.terminated, true);
  assert.equal(worker.sent.length, 1);
  const mask = new Uint8ClampedArray(FOREGROUND_INPUT_SIZE ** 2); mask.fill(255, mask.length / 2);
  worker.emit({type: 'result', id: worker.sent[0].id, width: FOREGROUND_INPUT_SIZE, height: FOREGROUND_INPUT_SIZE, mask: mask.buffer});
  const result = await pending, retained = [...result.data];
  assert.deepEqual([...h.timers.values()].map(v => v.delay), [12000]);
  [...h.timers.values()][0].fn();
  assert.equal(worker.terminated, true);
  assert.deepEqual([...result.data], retained);
  assert.equal(h.timers.size, 0);
  h.extractor.destroy();
});

test('coordinator runs FIFO and starts a timeout only when each extraction starts', async () => {
  const h = harness();
  const first = h.extractor.extract(h.canvas, {cacheKey: 'private://must-not-be-sent', persistent: false});
  const second = h.extractor.extract(h.canvas, {persistent: false});
  const secondRejected = assert.rejects(second, /Foreground extraction unavailable/);
  assert.equal(h.workers.length, 1);
  assert.deepEqual([...h.timers.values()].map(v => v.delay), [120000]);
  const worker = h.workers[0];
  worker.emit({type: 'ready'});
  assert.equal(worker.sent.length, 1);
  assert.deepEqual([...h.timers.values()].map(v => v.delay), [90000]);
  assert.deepEqual(Object.keys(worker.sent[0]).sort(), ['height', 'id', 'pixels', 'type', 'width']);
  assert.equal(worker.sent[0].width, 192);
  assert.equal(worker.sent[0].height, 192);
  assert.equal(worker.sent[0].pixels.byteLength, 192 * 192 * 4);
  const mask = new Uint8ClampedArray(FOREGROUND_INPUT_SIZE ** 2); mask.fill(255, mask.length / 2);
  worker.emit({type: 'result', id: worker.sent[0].id, width: FOREGROUND_INPUT_SIZE, height: FOREGROUND_INPUT_SIZE, mask: mask.buffer});
  const result = await first;
  for (let p = 0; p < result.data.length; p++) if (p % 4 !== 3) assert.equal(result.data[p], h.source.data[p]);
  assert.equal(worker.sent.length, 2);
  assert.deepEqual([...h.timers.values()].map(v => v.delay), [90000]);
  h.extractor.destroy();
  await secondRejected;
  assert.equal(h.timers.size, 0);
  assert.equal(worker.terminated, true);
});

test('worker startup or active-job timeout fails safely without leaking source identifiers', async () => {
  for (const ready of [false, true]) {
    const h = harness(), pending = h.extractor.extract(h.canvas, {cacheKey: 'https://private.invalid/art', persistent: true});
    const rejected = assert.rejects(pending, error => error.message === 'Foreground extraction unavailable' && error.code === 'FOREGROUND_UNAVAILABLE');
    if (ready) h.workers[0].emit({type: 'ready'});
    const timer = [...h.timers.values()][0];
    assert.equal(timer.delay, ready ? 90000 : 120000);
    timer.fn(); await rejected;
    assert.equal(h.workers[0].terminated, true);
    assert.equal(h.timers.size, 0);
    h.extractor.destroy();
  }
});

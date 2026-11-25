import test from 'node:test';
import assert from 'node:assert/strict';
import {summonMaskSourceKey, resolveSummonMask, computeSummonMaskCrop, applySummonMask, loadSummonMask} from '../summon-mask.js';

const base = 'https://www.beast-king.com/';
const art = () => ({cardId: 'B0001', src: 'assets/design-v2/cards/example.webp?v=0123456789ab', sourceWidth: 1024, sourceHeight: 1024, crop: {x: 4, y: 260, width: 248, height: 248}});
const row = source => ({sourceKey: summonMaskSourceKey(source, base), src: 'assets/foreground/abcdef.png', sourceWidth: 2048, sourceHeight: 2048, crop: {x: 256, y: 512, width: 256, height: 256}});
const rgba = (width, height, values) => ({width, height, data: new Uint8ClampedArray(values)});
const gray = (width, height, values) => rgba(width, height, values.flatMap(value => [value, value, value, 255]));

test('source identity preserves exact query/crop while normalizing deployment origin', () => {
  const source = art(), key = summonMaskSourceKey(source, base);
  assert.equal(key, '["mask-source-v1","assets/design-v2/cards/example.webp?v=0123456789ab",1024,1024,[4,260,248,248]]');
  assert.equal(summonMaskSourceKey({...source, src: new URL(source.src, base).href}, base), key);
  const preview = 'https://preview.invalid/game/';
  assert.equal(summonMaskSourceKey({...source, src: new URL(source.src, preview).href}, preview), key);
  assert.notEqual(summonMaskSourceKey({...source, src: source.src + '&extra=1'}, base), key);
  assert.notEqual(summonMaskSourceKey({...source, crop: {...source.crop, x: 5}}, base), key);
  assert.notEqual(summonMaskSourceKey({...source, sourceWidth: 2048}, base), key);
});

test('private, data, blob, remote and out-of-project sources have no public source identity', () => {
  for (const src of ['data:image/webp;base64,AAAA', 'blob:https://www.beast-king.com/private', '/api/operator-art', 'https://other.invalid/assets/king.png', 'https://www.beast-king.com/private/art.png', 'assets/king.png#private']) {
    assert.equal(summonMaskSourceKey({...art(), src}, base), null, src);
  }
  assert.equal(summonMaskSourceKey({...art(), src: '/assets/king.png'}, 'https://www.beast-king.com/game/'), null);
  assert.equal(summonMaskSourceKey({...art(), cardId: 'G0001'}, base), null);
  assert.equal(summonMaskSourceKey({...art(), crop: {x: 1000, y: 0, width: 100, height: 100}}, base), null);
});

test('resolver returns a mask only for the exact registered source and copies crop metadata', () => {
  const source = art(), record = row(source), registry = {B0001: record};
  const resolved = resolveSummonMask(source, base, registry);
  assert.equal(resolved.src, 'https://www.beast-king.com/assets/foreground/abcdef.png');
  assert.equal(resolved.cardId, 'B0001');
  assert.deepEqual(resolved.crop, record.crop);
  resolved.crop.x = 0; assert.equal(record.crop.x, 256);
  for (const changed of [
    {...source, src: source.src.replace('0123456789ab', 'aaaaaaaaaaaa')},
    {...source, src: 'data:image/webp;base64,private'},
    {...source, src: '/api/operator-art', crop: null},
    {...source, crop: {...source.crop, y: 4}},
    {...source, cardId: 'B0002'},
  ]) assert.equal(resolveSummonMask(changed, base, registry), null);
});

test('individual mask files and direct illustrations use the same descriptor schema', () => {
  const source = {cardId: 'B0512', src: 'assets/design-v2/cards/individual/king.webp', sourceWidth: null, sourceHeight: null, crop: null};
  const record = {sourceKey: summonMaskSourceKey(source, base), src: 'assets/foreground/B0512.png', sourceWidth: 128, sourceHeight: 128, crop: null};
  const result = resolveSummonMask(source, base, {B0512: record});
  assert.ok(result);
  assert.deepEqual(computeSummonMaskCrop(result, 128, 128), {x: 0, y: 0, width: 128, height: 128});
});

test('resolver rejects malformed, remote or out-of-bounds mask records', () => {
  const source = art(), valid = row(source);
  for (const record of [
    {...valid, src: 'https://remote.invalid/mask.png'},
    {...valid, src: '/api/private-mask.png'},
    {...valid, src: 'assets/foreground/wrong.webp'},
    {...valid, src: 'assets/private/mask.png'},
    {...valid, sourceWidth: 0},
    {...valid, crop: {...valid.crop, x: 2040}},
    {...valid, crop: {...valid.crop, x: -.1}},
    {...valid, crop: {...valid.crop, width: 127.5}},
  ]) assert.equal(resolveSummonMask(source, base, {B0001: record}), null);
});

test('mask crop rejects stale decoded dimensions and never includes a neighboring tile', () => {
  const descriptor = row(art());
  assert.deepEqual(computeSummonMaskCrop(descriptor, 2048, 2048), {x: 256, y: 512, width: 256, height: 256});
  assert.equal(computeSummonMaskCrop(descriptor, 1024, 1024), null);
  assert.equal(computeSummonMaskCrop({...descriptor, crop: {x: 2040, y: 256, width: 128, height: 128}}, 2048, 2048), null);
});

test('grayscale red controls alpha with bilinear sampling and exact source RGB preservation', () => {
  const source = rgba(3, 1, [11, 22, 33, 255, 44, 55, 66, 128, 77, 88, 99, 64]);
  const before = [...source.data], mask = gray(2, 1, [0, 255]);
  const result = applySummonMask(source, mask);
  assert.deepEqual([...result.data], [11, 22, 33, 0, 44, 55, 66, 64, 77, 88, 99, 64]);
  assert.deepEqual([...source.data], before);
  assert.notEqual(result.data, source.data);
  assert.deepEqual([...mask.data], [0, 0, 0, 255, 255, 255, 255, 255]);
});

test('unexpected colored/translucent masks are rejected instead of being treated as valid alpha', () => {
  const source = rgba(1, 1, [11, 22, 33, 255]);
  assert.throws(() => applySummonMask(source, rgba(1, 1, [128, 0, 0, 255])), /Summon mask unavailable/);
  assert.throws(() => applySummonMask(source, rgba(1, 1, [128, 128, 128, 0])), /Summon mask unavailable/);
  assert.throws(() => applySummonMask(source, {width: 2, height: 1, data: new Uint8Array(4)}), /Summon mask unavailable/);
});

test('loader uses the existing image loader and reads only the registered grayscale tile', async () => {
  const source = art(), descriptor = resolveSummonMask(source, base, {B0001: row(source)});
  const pixels = gray(256, 256, new Array(256 * 256).fill(127)), calls = [], image = {naturalWidth: 2048, naturalHeight: 2048};
  let canvas;
  const doc = {baseURI: base, createElement(tag) {
    assert.equal(tag, 'canvas');
    canvas = {width: 0, height: 0, getContext: () => ({drawImage(...args) { calls.push(args); }, getImageData(x, y, w, h) { assert.deepEqual([x, y, w, h], [0, 0, 256, 256]); return pixels; }})};
    return canvas;
  }};
  const loaded = [];
  const result = await loadSummonMask(descriptor, {document: doc, loadImage: async src => { loaded.push(src); return image; }});
  assert.deepEqual(loaded, [descriptor.src]);
  assert.deepEqual(calls[0], [image, 256, 512, 256, 256, 0, 0, 256, 256]);
  assert.deepEqual(result, pixels);
  assert.notEqual(result.data, pixels.data);
  assert.equal(canvas.width, 0); assert.equal(canvas.height, 0);
});

test('loader refuses remote paths and reports failures without source URLs', async () => {
  const descriptor = row(art()), doc = {baseURI: base, createElement() { throw Error('should not decode'); }};
  let loads = 0;
  await assert.rejects(loadSummonMask({...descriptor, src: 'https://private.invalid/mask.png'}, {document: doc, loadImage: async () => { loads++; }}), error => error.message === 'Summon mask unavailable' && error.code === 'SUMMON_MASK_UNAVAILABLE');
  assert.equal(loads, 0);
  await assert.rejects(loadSummonMask(descriptor, {document: doc, loadImage: async () => { throw Error('https://private.invalid/token'); }}), error => error.message === 'Summon mask unavailable');
});

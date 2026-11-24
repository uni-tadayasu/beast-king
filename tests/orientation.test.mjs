import test from 'node:test';
import assert from 'node:assert/strict';
import { isMobileScreen, requestLandscape, landscapeViewport, toLayoutPoint, toLayoutRect, getLayoutViewport } from '../orientation.js';

test('mobile detection includes iPad desktop identity but excludes ordinary desktop', () => {
  assert.equal(isMobileScreen({ userAgent: 'iPhone', maxTouchPoints: 5 }), true);
  assert.equal(isMobileScreen({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(isMobileScreen({ userAgent: 'Linux desktop', maxTouchPoints: 0 }), false);
});
test('fullscreen precedes orientation lock on a supported browser', async () => {
  const calls = [];
  const doc = { documentElement: { requestFullscreen: async () => calls.push('fullscreen') } };
  const screen = { orientation: { lock: async value => calls.push(value) } };
  assert.deepEqual(await requestLandscape({ doc, screen }), { locked: true, fullscreen: true });
  assert.deepEqual(calls, ['fullscreen', 'landscape']);
});
test('unsupported and rejected browser permissions leave the live canvas fallback available', async () => {
  assert.deepEqual(await requestLandscape({ doc: {}, screen: {} }), { locked: false, fullscreen: false });
  const doc = { documentElement: { requestFullscreen: async () => { throw new Error('NotAllowedError'); } } };
  const screen = { orientation: { lock: async () => { throw new Error('NotSupportedError'); } } };
  assert.deepEqual(await requestLandscape({ doc, screen }), { locked: false, fullscreen: false });
});

test('an automatic orientation attempt never requests fullscreen without a gesture', async () => {
  const calls = [];
  const doc = {documentElement: {requestFullscreen: async () => calls.push('fullscreen')}};
  const screen = {orientation: {lock: async value => calls.push(value)}};
  assert.deepEqual(await requestLandscape({doc, screen, allowFullscreen: false}), {locked: true, fullscreen: false});
  assert.deepEqual(calls, ['landscape']);
  calls.length = 0;
  assert.deepEqual(await requestLandscape({doc, screen: {}}), {locked: false, fullscreen: false});
  assert.deepEqual(calls, [], 'unsupported orientation does not unexpectedly enter fullscreen');
});

test('a portrait phone swaps logical axes while a physical landscape phone and desktop do not rotate', () => {
  const portrait = landscapeViewport({physicalWidth: 390, physicalHeight: 844, mobile: true});
  assert.deepEqual([portrait.width, portrait.height, portrait.rotated], [844, 390, true]);
  const landscape = landscapeViewport({physicalWidth: 844, physicalHeight: 390, mobile: true});
  assert.deepEqual([landscape.width, landscape.height, landscape.rotated], [844, 390, false]);
  const desktop = landscapeViewport({physicalWidth: 600, physicalHeight: 900});
  assert.deepEqual([desktop.width, desktop.height, desktop.rotated], [600, 900, false]);
});

test('portrait stage coordinates map all four corners without a second rotation or scale', () => {
  const viewport = landscapeViewport({physicalWidth: 390, physicalHeight: 844, mobile: true});
  assert.deepEqual(toLayoutPoint({x: 390, y: 0}, viewport), {x: 0, y: 0});
  assert.deepEqual(toLayoutPoint({x: 390, y: 844}, viewport), {x: 844, y: 0});
  assert.deepEqual(toLayoutPoint({x: 0, y: 844}, viewport), {x: 844, y: 390});
  assert.deepEqual(toLayoutPoint({x: 0, y: 0}, viewport), {x: 0, y: 390});
  assert.deepEqual(toLayoutPoint({clientX: 195, clientY: 422}, viewport), {x: 422, y: 195});
});

test('logical card rectangles and pointer offsets remain correct with browser viewport panning', () => {
  const viewport = landscapeViewport({physicalWidth: 390, physicalHeight: 600, offsetLeft: 7, offsetTop: 42, mobile: true});
  assert.deepEqual(toLayoutRect({left: 267, top: 142, right: 347, bottom: 262, width: 80, height: 120}, viewport),
    {x: 100, y: 50, left: 100, top: 50, right: 220, bottom: 130, width: 120, height: 80});
  const plain = landscapeViewport({physicalWidth: 1200, physicalHeight: 700, offsetLeft: 5, offsetTop: 8});
  assert.deepEqual(toLayoutRect({x: 25, y: 38, width: 160, height: 220}, plain),
    {x: 20, y: 30, left: 20, top: 30, right: 180, bottom: 250, width: 160, height: 220});
});

test('an opened mobile keyboard can reduce the visible area without flipping the canvas', () => {
  const viewport = landscapeViewport({physicalWidth: 390, physicalHeight: 300, mobile: true, portrait: true});
  assert.equal(viewport.rotated, true);
  assert.deepEqual([viewport.width, viewport.height], [300, 390]);
  assert.deepEqual(toLayoutPoint({x: 390, y: 0}, viewport), {x: 0, y: 0});
});

test('layout metrics use the visual viewport and handle unavailable browser values', () => {
  const win = {innerWidth: 390, innerHeight: 844, navigator: {userAgent: 'iPhone', maxTouchPoints: 5}, visualViewport: {width: 390, height: 640, offsetLeft: 0, offsetTop: 15}};
  const viewport = getLayoutViewport(win);
  assert.deepEqual([viewport.width, viewport.height, viewport.offsetTop], [640, 390, 15]);
  assert.deepEqual([landscapeViewport({}).width, landscapeViewport({}).height], [1, 1]);
});

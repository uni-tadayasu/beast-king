import test from 'node:test';
import assert from 'node:assert/strict';
import { isMobileScreen, requestLandscape } from '../orientation.js';

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
test('unsupported and rejected browser permissions return a usable manual-rotation fallback', async () => {
  assert.deepEqual(await requestLandscape({ doc: {}, screen: {} }), { locked: false, fullscreen: false });
  const doc = { documentElement: { requestFullscreen: async () => { throw new Error('NotAllowedError'); } } };
  const screen = { orientation: { lock: async () => { throw new Error('NotSupportedError'); } } };
  assert.deepEqual(await requestLandscape({ doc, screen }), { locked: false, fullscreen: false });
});

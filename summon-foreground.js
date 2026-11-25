/** Foreground presentation uses reviewed public mask assets or the original
 * image's native alpha. No browser inference, image upload, or persistence.
 */
import {resolveSummonMask, loadSummonMask, applySummonMask} from './summon-mask.js?v=20261125-38';

// Kept for the application's QA metadata: this is the cached mask tile size.
export const FOREGROUND_INPUT_SIZE = 256;
const MAX_PIXELS = 4096 * 4096, MAX_ATLASES = 6;

function unavailable() {
  const error = new Error('Foreground extraction unavailable');
  error.code = 'FOREGROUND_UNAVAILABLE';
  return error;
}

function rgbaImage(image) {
  const {width, height, data} = image || {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS || !data || data.length !== width * height * 4) throw unavailable();
  return width * height;
}

/** Native transparent artwork is authoritative, including authorized private
 * artwork. It must never request or inherit a public illustration's mask. */
export function hasNativeForegroundAlpha(image) {
  const count = rgbaImage(image);
  let clear = false, visible = false;
  for (let i = 0; i < count; i++) {
    const alpha = image.data[i * 4 + 3];
    if (alpha <= 8) clear = true;
    if (alpha >= 32) visible = true;
    if (clear && visible) return true;
  }
  return false;
}

function maskHasShape(mask) {
  const count = rgbaImage(mask);
  let clear = false, visible = false;
  for (let i = 0; i < count; i++) {
    const coverage = mask.data[i * 4];
    if (coverage <= 8) clear = true;
    if (coverage >= 32) visible = true;
    if (clear && visible) return true;
  }
  return false;
}

/** The scene normally supplies its six-image loader. Standalone QA callers
 * get a six-atlas LRU instead. Only registered public mask URLs reach either
 * loader; source art and source keys are never stored in these image caches.
 * `maskRegistry` permits isolated fixture testing of the same strict resolver.
 */
export function createForegroundExtractor(options = {}) {
  const win = options.window ?? globalThis.window;
  const doc = options.document ?? win?.document ?? globalThis.document;
  const setTimer = win?.setTimeout ? win.setTimeout.bind(win) : globalThis.setTimeout.bind(globalThis);
  const clearTimer = win?.clearTimeout ? win.clearTimeout.bind(win) : globalThis.clearTimeout.bind(globalThis);
  const atlasCache = new Map(), ownLoads = new Set(), pending = new Set();
  let destroyed = false;

  function loadImage(src) {
    if (destroyed) return Promise.reject(unavailable());
    if (typeof options.loadImage === 'function') {
      return Promise.resolve().then(() => {
        if (destroyed) throw unavailable();
        return options.loadImage(src);
      });
    }
    if (atlasCache.has(src)) {
      const cached = atlasCache.get(src);
      atlasCache.delete(src); atlasCache.set(src, cached);
      return cached;
    }
    let entry;
    const promise = new Promise((resolve, reject) => {
      if (!win?.Image) { reject(unavailable()); return; }
      const image = new win.Image();
      let settled = false, timeout = null;
      const finish = success => {
        if (settled) return;
        settled = true;
        if (timeout !== null) clearTimer(timeout);
        image.onload = image.onerror = null;
        ownLoads.delete(entry);
        if (success && !destroyed) resolve(image); else reject(unavailable());
      };
      entry = {cancel: () => finish(false)};
      ownLoads.add(entry);
      image.decoding = 'async';
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      timeout = setTimer(() => finish(false), 12000);
      image.src = src;
    });
    atlasCache.set(src, promise);
    promise.catch(() => { if (atlasCache.get(src) === promise) atlasCache.delete(src); });
    while (atlasCache.size > MAX_ATLASES) atlasCache.delete(atlasCache.keys().next().value);
    return promise;
  }

  function finish(job, pixels) {
    if (!pending.delete(job)) return;
    const settle = pixels && !destroyed ? job.resolve : job.reject;
    job.original = null; job.resolve = null; job.reject = null;
    settle(pixels && !destroyed ? pixels : unavailable());
  }

  function extract(sourceCanvas, settings = {}) {
    if (destroyed) return Promise.reject(unavailable());
    let original, descriptor;
    try {
      const width = sourceCanvas?.width, height = sourceCanvas?.height;
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) throw unavailable();
      const context = sourceCanvas.getContext('2d');
      if (!context) throw unavailable();
      const source = context.getImageData(0, 0, width, height);
      rgbaImage(source);
      original = {data: new Uint8ClampedArray(source.data), width, height};
      if (hasNativeForegroundAlpha(original)) return Promise.resolve(original);
      descriptor = resolveSummonMask(settings.art, settings.baseUrl ?? doc?.baseURI, options.maskRegistry);
      if (!descriptor || !doc?.createElement) throw unavailable();
    } catch { return Promise.reject(unavailable()); }
    return new Promise((resolve, reject) => {
      const job = {original, resolve, reject};
      pending.add(job);
      loadSummonMask(descriptor, {document: doc, loadImage}).then(mask => {
        if (destroyed || !pending.has(job)) return;
        try {
          if (!maskHasShape(mask)) throw unavailable();
          const pixels = applySummonMask(job.original, mask);
          if (!hasNativeForegroundAlpha(pixels)) throw unavailable();
          finish(job, pixels);
        } catch { finish(job); }
      }, () => finish(job));
    });
  }

  // Compatibility with previous callers; cached PNG masks need no warmup.
  function prepare() { return destroyed ? Promise.reject(unavailable()) : Promise.resolve(); }

  return {extract, prepare, warmup: prepare, destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const job of [...pending]) finish(job);
    for (const entry of [...ownLoads]) entry.cancel();
    ownLoads.clear(); atlasCache.clear();
  }};
}

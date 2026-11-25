/** Public foreground masks are bound to the exact published illustration.
 * An authorized private/custom source never falls back to a public mask.
 * Native source alpha should be handled before this public-only resolver.
 */
import {CARD_FOREGROUND_MASKS} from './card-foreground-masks.js?v=20261125-38';

const DEFAULT_BASE = 'https://beast-king.invalid/';
const MAX_IMAGE_EDGE = 8192;

function unavailable() {
  const error = new Error('Summon mask unavailable');
  error.code = 'SUMMON_MASK_UNAVAILABLE';
  return error;
}

function publicAssetURL(value, baseUrl) {
  if (typeof value !== 'string' || !value || value.trim() !== value) return null;
  try {
    const base = new URL(baseUrl || DEFAULT_BASE);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) return null;
    const url = new URL(value, base), assets = new URL('./assets/', base);
    if (url.origin !== base.origin || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) return null;
    if (!url.pathname.startsWith(assets.pathname) || url.pathname === assets.pathname) return null;
    return {url, relative: 'assets/' + url.pathname.slice(assets.pathname.length) + url.search};
  } catch { return null; }
}

function positive(value) { return Number.isFinite(value) && value > 0; }
function publicMaskURL(value, baseUrl) {
  const asset = publicAssetURL(value, baseUrl);
  return asset && asset.relative.startsWith('assets/foreground/') && /\.png$/i.test(asset.url.pathname) ? asset : null;
}
function imageSize(width, height) {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width <= MAX_IMAGE_EDGE && height <= MAX_IMAGE_EDGE;
}
function validCrop(crop, width, height, integer = false) {
  if (!crop || !Number.isFinite(crop.x) || !Number.isFinite(crop.y) || crop.x < 0 || crop.y < 0 || !positive(crop.width) || !positive(crop.height)) return false;
  if (crop.x + crop.width > width || crop.y + crop.height > height) return false;
  return !integer || [crop.x, crop.y, crop.width, crop.height].every(Number.isInteger);
}

/** Stable across preview/production origins, but preserves the exact query,
 * source dimensions, and atlas crop. No URL token is discarded or guessed.
 * Build-time generation and runtime resolution must call this same helper.
 */
export function summonMaskSourceKey(art, baseUrl = DEFAULT_BASE) {
  if (!art || !/^[BF]\d{4}$/.test(art.cardId || '')) return null;
  const asset = publicAssetURL(art.src, baseUrl);
  if (!asset) return null;
  const width = art.sourceWidth ?? null, height = art.sourceHeight ?? null;
  if ((width !== null || height !== null) && (!positive(width) || !positive(height))) return null;
  let crop = null;
  if (art.crop !== null && art.crop !== undefined) {
    if (!positive(width) || !positive(height) || !validCrop(art.crop, width, height)) return null;
    crop = [art.crop.x, art.crop.y, art.crop.width, art.crop.height];
  }
  return JSON.stringify(['mask-source-v1', asset.relative, width, height, crop]);
}

/** Registry rows share the existing artwork descriptor shape:
 * {sourceKey, src, sourceWidth, sourceHeight, crop:null|{x,y,width,height}}.
 * The optional registry parameter supports isolated source-binding tests.
 */
export function resolveSummonMask(art, baseUrl = DEFAULT_BASE, registry = CARD_FOREGROUND_MASKS) {
  const sourceKey = summonMaskSourceKey(art, baseUrl);
  if (!sourceKey || !registry || !Object.prototype.hasOwnProperty.call(registry, art.cardId)) return null;
  const record = registry[art.cardId];
  if (!record || record.sourceKey !== sourceKey || !imageSize(record.sourceWidth, record.sourceHeight)) return null;
  const asset = publicMaskURL(record.src, baseUrl);
  if (!asset) return null;
  let crop = null;
  if (record.crop !== null && record.crop !== undefined) {
    if (!validCrop(record.crop, record.sourceWidth, record.sourceHeight, true)) return null;
    crop = {x: record.crop.x, y: record.crop.y, width: record.crop.width, height: record.crop.height};
  }
  return {cardId: art.cardId, sourceKey, src: asset.url.href, sourceWidth: record.sourceWidth, sourceHeight: record.sourceHeight, crop};
}

/** Mask atlases are not silently scaled: a different decoded size may put
 * this card on a neighboring tile. Reject it instead of sampling bad data. */
export function computeSummonMaskCrop(descriptor, imageWidth, imageHeight) {
  if (!descriptor || !imageSize(imageWidth, imageHeight) || imageWidth !== descriptor.sourceWidth || imageHeight !== descriptor.sourceHeight) return null;
  if (descriptor.crop === null || descriptor.crop === undefined) return {x: 0, y: 0, width: imageWidth, height: imageHeight};
  if (!validCrop(descriptor.crop, imageWidth, imageHeight, true)) return null;
  const {x, y, width, height} = descriptor.crop;
  return {x, y, width, height};
}

function rgbaImage(image) {
  if (!image || !imageSize(image.width, image.height) || !image.data || image.data.length !== image.width * image.height * 4) throw unavailable();
}

/** The decoded PNG's RGB channels carry grayscale coverage. PNG alpha is
 * normally opaque and must not be mistaken for the foreground mask. */
export function applySummonMask(source, grayscale) {
  rgbaImage(source); rgbaImage(grayscale);
  for (let p = 0; p < grayscale.data.length; p += 4) {
    if (grayscale.data[p] !== grayscale.data[p + 1] || grayscale.data[p] !== grayscale.data[p + 2] || grayscale.data[p + 3] !== 255) throw unavailable();
  }
  const {width, height} = source, mw = grayscale.width, mh = grayscale.height;
  const data = new Uint8ClampedArray(source.data), mask = grayscale.data;
  for (let y = 0; y < height; y++) {
    const sy = Math.max(0, Math.min(mh - 1, (y + .5) * mh / height - .5));
    const y0 = Math.floor(sy), y1 = Math.min(mh - 1, y0 + 1), fy = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = Math.max(0, Math.min(mw - 1, (x + .5) * mw / width - .5));
      const x0 = Math.floor(sx), x1 = Math.min(mw - 1, x0 + 1), fx = sx - x0;
      const top = mask[(y0 * mw + x0) * 4] * (1 - fx) + mask[(y0 * mw + x1) * 4] * fx;
      const bottom = mask[(y1 * mw + x0) * 4] * (1 - fx) + mask[(y1 * mw + x1) * 4] * fx;
      const coverage = top * (1 - fy) + bottom * fy, p = (y * width + x) * 4 + 3;
      if (!Number.isFinite(coverage)) throw unavailable();
      data[p] = Math.round(source.data[p] * Math.max(0, Math.min(255, coverage)) / 255);
    }
  }
  return {data, width, height};
}

/** Decode only one atlas tile using the scene's existing image loader/cache.
 * No full-atlas pixel readback, image inference, upload, or persistent cache.
 */
export async function loadSummonMask(descriptor, options = {}) {
  const doc = options.document ?? globalThis.document;
  try {
    if (!doc?.createElement || typeof options.loadImage !== 'function' || !publicMaskURL(descriptor?.src, doc.baseURI || DEFAULT_BASE)) throw unavailable();
    const image = await options.loadImage(descriptor.src);
    const width = typeof image?.naturalWidth === 'number' ? image.naturalWidth : image?.width;
    const height = typeof image?.naturalHeight === 'number' ? image.naturalHeight : image?.height;
    const crop = computeSummonMaskCrop(descriptor, width, height);
    if (!crop) throw unavailable();
    const canvas = doc.createElement('canvas');
    canvas.width = crop.width; canvas.height = crop.height;
    try {
      const ctx = canvas.getContext('2d', {willReadFrequently: true});
      if (!ctx) throw unavailable();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
      const pixels = ctx.getImageData(0, 0, crop.width, crop.height);
      rgbaImage(pixels);
      return {data: new Uint8ClampedArray(pixels.data), width: pixels.width, height: pixels.height};
    } finally { canvas.width = 0; canvas.height = 0; }
  } catch { throw unavailable(); }
}

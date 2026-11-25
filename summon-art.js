/** Exact illustration sources for battlefield summons. No private artwork is
 * looked up here: an override must come from the card's already-approved DOM.
 * Atlas coordinates retain the reviewed painting, without another character
 * interpretation or a crop that can include a neighbouring card. */
import {CARD_ART_CROPS} from './card-art-layouts.js?v=20261125-37';
import {CARD_ART_EXPANSIONS} from './card-art-expansion.js?v=20261125-37';
import {CARD_ART_FIFTH} from './card-art-fifth.js?v=20261125-37';
import {CARD_ART_OVERRIDES} from './card-art-overrides.js?v=20261125-37';
import {CARD_ART_USER_OVERRIDES} from './card-art-user.js?v=20261125-37';
import {PREMIUM_CARD_ART} from './card-art-premium.js?v=20261125-37';

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const positive = value => Number.isFinite(value) && value > 0;
const atlas = (cardId, source, crop) => ({cardId, src: source, kind: 'atlas',
  sourceWidth: crop.width, sourceHeight: crop.height,
  crop: {x: crop.x, y: crop.y, width: crop.size, height: crop.size},
  fit: 'contain', position: 'center'});
const image = (cardId, src, art = {}) => ({cardId, src, kind: 'image',
  sourceWidth: art.width || null, sourceHeight: art.height || null, crop: null,
  fit: art.fit || 'contain', position: art.position || 'center'});

function publishedArt(card) {
  if (!card || !['beast', 'fusion'].includes(card.type) || !/^[BF]\d{4}$/.test(card.id || '')) return null;
  if (card.id === 'B0512') return image(card.id, 'assets/design-v2/cards/individual/king.webp', {fit: 'cover'});
  const original = CARD_ART_USER_OVERRIDES[card.id] || PREMIUM_CARD_ART[card.id];
  if (original) return image(card.id, original.src + '?v=' + original.sha256.slice(0, 12), original);
  const replacement = CARD_ART_FIFTH[card.id] || CARD_ART_EXPANSIONS[card.id] || CARD_ART_OVERRIDES[card.id];
  if (replacement) return atlas(card.id, replacement.src + '?v=' + replacement.sha256.slice(0, 12), replacement);
  const crop = CARD_ART_CROPS[card.id];
  if (!crop) return null;
  const batch = String(Math.floor((Number(card.id.slice(1)) - 1) / 16) + 1).padStart(2, '0');
  return atlas(card.id, `assets/design-v2/cards/individual/${card.type}-${batch}.webp?art=20261124`, crop);
}

function sameSource(a, b, baseUrl) {
  try {
    const base = baseUrl || 'https://beast-king.invalid/';
    const x = new URL(a, base), y = new URL(b, base);
    return x.origin === y.origin && x.pathname === y.pathname;
  } catch { return a === b; }
}

/** `sourceOverride` is the URL in the visible card's computed background-image.
 * Omit it for a public catalog lookup. Pass null when the visible card is still
 * waiting for authorized art; do not substitute a public or previous painting.
 * Pass document.baseURI as baseUrl when computed styles contain absolute URLs.
 */
export function resolveSummonArt(card, options = {}) {
  const art = publishedArt(card);
  if (!art) return null;
  if (!own(options, 'sourceOverride')) return art;
  const approved = options.sourceOverride;
  if (typeof approved !== 'string' || !approved.trim()) return null;
  if (sameSource(approved, art.src, options.baseUrl)) return {...art, src: approved};
  // A non-atlas approved replacement, such as the authenticated Regalia skin,
  // is displayed in full. Its URL is never copied to saves, logs or manifests.
  return image(card.id, approved);
}

/** Resolve reviewed source coordinates against the actual decoded image size.
 * Returns null for malformed images/crops; never samples outside that image.
 * Full-image replacements keep their original aspect ratio and every pixel.
 */
export function computeSummonArtCrop(art, imageWidth, imageHeight) {
  if (!art || !positive(imageWidth) || !positive(imageHeight)) return null;
  if (!art.crop) return {x: 0, y: 0, width: imageWidth, height: imageHeight};
  const c = art.crop;
  if (!positive(art.sourceWidth) || !positive(art.sourceHeight) ||
      !Number.isFinite(c.x) || !Number.isFinite(c.y) || c.x < 0 || c.y < 0 ||
      !positive(c.width) || !positive(c.height) ||
      c.x + c.width > art.sourceWidth || c.y + c.height > art.sourceHeight) return null;
  const sx = imageWidth / art.sourceWidth, sy = imageHeight / art.sourceHeight;
  return {x: c.x * sx, y: c.y * sy, width: c.width * sx, height: c.height * sy};
}

/** Parse one CSS image URL. Gradients/none represent no approved painting. */
export function summonArtSourceFromBackground(backgroundImage) {
  const value = String(backgroundImage || '').trim();
  const match = value.match(/^url\(\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^\s'"()]+))\s*\)$/i);
  return match ? (match[1] ?? match[2] ?? match[3]).replace(/\\(["'\\])/g, '$1') : null;
}

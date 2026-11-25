/** Illustration-preserving embossed finish for the strongest GGR creatures.
 * The visible, adjacent card-art is the sole artwork authority. In particular,
 * this module never resolves a private illustration or reads account state.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const FILTER_ID = 'bk-card-relief-etch';
const HIDDEN_CARD = '.hidden-gimmick, .hidden-special, [data-face-down="true"]';
const sources = new WeakMap();

export function isApexReliefCard(card) {
  return !!card && card.rarity === 'GGR'
    && (card.type === 'fusion' || (card.type === 'beast' && Number(card.cost) >= 6));
}

/** Shared, static filters: opposing light/dark ridges follow the actual ink.
 * Keeping the original picture below these transparent ridges retains its
 * palette and silhouette; an unrelated mask is never substituted for it.
 */
export function installCardReliefFilters(doc = globalThis.document) {
  if (!doc?.body || doc.getElementById(FILTER_ID)) return false;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'card-relief-filter-definitions');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.innerHTML = `<defs>
    <filter id="${FILTER_ID}" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feColorMatrix in="SourceGraphic" type="saturate" values="0" result="ink"/>
      <feGaussianBlur in="ink" stdDeviation=".38" result="surface"/>
      <feConvolveMatrix in="surface" order="3" kernelMatrix="-2 -1 0 -1 0 1 0 1 2" divisor="3" preserveAlpha="true" edgeMode="duplicate" result="raised"/>
      <feColorMatrix in="raised" type="luminanceToAlpha" result="ridgeAlpha"/>
      <feComponentTransfer in="ridgeAlpha" result="ridgeMask"><feFuncA type="linear" slope="1.7" intercept="-.018"/></feComponentTransfer>
      <feFlood flood-color="#fff1c5" result="metal"/>
      <feComposite in="metal" in2="ridgeMask" operator="in" result="ridge"/>
      <feConvolveMatrix in="surface" order="3" kernelMatrix="2 1 0 1 0 -1 0 -1 -2" divisor="3" preserveAlpha="true" edgeMode="duplicate" result="recessed"/>
      <feColorMatrix in="recessed" type="luminanceToAlpha" result="grooveAlpha"/>
      <feComponentTransfer in="grooveAlpha" result="grooveMask"><feFuncA type="linear" slope="1.25" intercept="-.018"/></feComponentTransfer>
      <feFlood flood-color="#1b1227" result="shadow"/>
      <feComposite in="shadow" in2="grooveMask" operator="in" result="groove"/>
      <feMerge><feMergeNode in="groove"/><feMergeNode in="ridge"/></feMerge>
    </filter>
    <filter id="bk-card-relief-polish" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feColorMatrix in="SourceGraphic" type="saturate" values="0" result="ink"/>
      <feConvolveMatrix in="ink" order="3" kernelMatrix="-1 -1 -1 -1 8 -1 -1 -1 -1" divisor="3" preserveAlpha="true" edgeMode="duplicate" result="edges"/>
      <feColorMatrix in="edges" type="luminanceToAlpha" result="edgeAlpha"/>
      <feComponentTransfer in="edgeAlpha" result="edgeMask"><feFuncA type="linear" slope="2.3" intercept="-.02"/></feComponentTransfer>
      <feFlood flood-color="#fff9e5" result="shine"/>
      <feComposite in="shine" in2="edgeMask" operator="in"/>
    </filter>
  </defs>`;
  doc.body.prepend(svg);
  return true;
}

/** Read only the authorized art immediately before this finish, including its
 * atlas crop. A pending Regalia gradient is deliberately not a source.
 */
export function reliefArtworkForHost(host) {
  if (host?.dataset?.cardRelief !== 'apex' || host.closest(HIDDEN_CARD)) return null;
  const art = host.previousElementSibling;
  if (!art?.classList.contains('card-art') || art.dataset.regaliaStatus === 'pending') return null;
  const style = art.style.backgroundImage ? art.style : art.ownerDocument.defaultView?.getComputedStyle(art);
  if (!style || !/^\s*url\(/i.test(style.backgroundImage)) return null;
  return {
    backgroundImage: style.backgroundImage,
    backgroundPosition: style.backgroundPosition || 'center',
    backgroundSize: style.backgroundSize || 'cover',
    backgroundRepeat: style.backgroundRepeat || 'no-repeat',
  };
}

export function clearCardRelief(host, fx) {
  fx?.querySelector('.bk-relief')?.remove();
  if (host?.dataset) delete host.dataset.reliefReady;
  sources.delete(host);
}

/** Called by the existing rarity observer, so there is no additional animation
 * loop, document scan, or image download. All artwork copies live inside that
 * observer's paused / clipped / aria-hidden effects container.
 */
export function syncCardRelief(host, fx, doc = host.ownerDocument) {
  const source = reliefArtworkForHost(host);
  if (!source || !fx) {
    clearCardRelief(host, fx);
    return false;
  }
  const previous = sources.get(host);
  let relief = fx.querySelector('.bk-relief');
  if (relief && previous && Object.keys(source).every(key => source[key] === previous[key])) return true;
  installCardReliefFilters(doc);
  if (!relief) {
    relief = doc.createElement('span');
    relief.className = 'bk-relief';
    for (const name of ['contour', 'polish', 'grain', 'rim']) {
      const layer = doc.createElement('span');
      layer.className = `bk-relief-${name}`;
      relief.appendChild(layer);
    }
    // The embossed material belongs below the existing fine rarity sparkles.
    fx.prepend(relief);
  }
  for (const layer of relief.querySelectorAll('.bk-relief-contour, .bk-relief-polish')) {
    for (const [key, value] of Object.entries(source)) layer.style[key] = value;
  }
  sources.set(host, source);
  host.dataset.reliefReady = 'true';
  return true;
}

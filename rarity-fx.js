/** BEAST KING — illustration-only animated card finishes.
 * Works with the original .card-finish and rebuild .card .art-well > .art.
 * No game state, save data, card definitions or input handlers are changed.
 */

import { syncCardRelief, clearCardRelief } from './card-relief.js?v=20261125-38';

export const RARITY_FX_LAYERS = Object.freeze({
  N: Object.freeze(['foil', 'glints']),
  R: Object.freeze(['foil', 'glints', 'dust']),
  KR: Object.freeze(['foil', 'glints', 'dust', 'prism', 'comet']),
  KKR: Object.freeze(['foil', 'glints', 'dust', 'prism', 'comet', 'orbit']),
  GR: Object.freeze(['foil', 'glints', 'dust', 'prism', 'comet', 'orbit', 'shards', 'halo']),
  GGR: Object.freeze(['foil', 'glints', 'dust', 'prism', 'comet', 'orbit', 'shards', 'halo', 'constellation', 'rays', 'crown']),
});

const HOST_SELECTOR = '.card-finish, .card .art-well > .art';
const OWNER_SELECTOR = '.game-card, .card, .field-unit, .arcana-card, .material-art, .duel-selected-art';

function rarityOf(host) {
  const owner = host.closest(OWNER_SELECTOR);
  for (const node of [host, owner]) {
    if (!node) continue;
    for (const code of Object.keys(RARITY_FX_LAYERS)) {
      if (node.classList.contains(`rarity-${code}`) || node.classList.contains(code) || node.dataset.rarity === code) return code;
    }
  }
  return null;
}

function phaseOf(host, index) {
  const owner = host.closest(OWNER_SELECTOR);
  const seed = owner?.dataset.id || owner?.dataset.card || owner?.getAttribute('aria-label') || `card-${index}`;
  let value = 0;
  for (let i = 0; i < seed.length; i += 1) value = (value * 31 + seed.charCodeAt(i)) >>> 0;
  return -((value % 8000) / 1000);
}

/**
 * Starts one observer pair for a document. New renders are decorated once;
 * detached cards are released. All effects pause outside the viewport, while
 * the document is hidden, and when the existing reduced-motion setting is on.
 * Returns an explicit cleanup function for embedders and browser tests.
 */
export function initRarityEffects(doc = document) {
  const win = doc.defaultView;
  if (!win || !doc.body) return () => {};
  const previous = doc.__beastKingRarityEffects;
  if (previous) return previous;

  const attached = new Set();
  const pending = new Set();
  let frame = 0;
  let counter = 0;
  const intersection = typeof win.IntersectionObserver === 'function'
    ? new win.IntersectionObserver(entries => {
      for (const entry of entries) {
        entry.target.dataset.fxVisible = entry.isIntersecting ? 'true' : 'false';
      }
    }, { root: null, rootMargin: '0px', threshold: 0 })
    : null;

  const attach = host => {
    if (!host.isConnected) return;
    if (attached.has(host)) {
      syncCardRelief(host, host.querySelector('.bk-fx'), doc);
      return;
    }
    const rarity = rarityOf(host);
    if (!rarity) return;
    // Opponent face-down zones must not reveal rarity or card identity.
    if (host.closest('.hidden-gimmick, .hidden-special, [data-face-down="true"]')) return;
    const fx = doc.createElement('span');
    fx.className = 'bk-fx';
    fx.dataset.rarity = rarity;
    fx.setAttribute('aria-hidden', 'true');
    fx.style.setProperty('--fx-phase', `${phaseOf(host, counter++)}s`);
    for (const layer of RARITY_FX_LAYERS[rarity]) {
      const element = doc.createElement('i');
      element.className = `bk-fx-${layer}`;
      fx.appendChild(element);
    }
    host.classList.add('bk-fx-ready');
    host.dataset.fxRarity = rarity;
    host.dataset.fxVisible = intersection ? 'false' : 'true';
    host.appendChild(fx);
    syncCardRelief(host, fx, doc);
    attached.add(host);
    intersection?.observe(host);
  };

  const discover = root => {
    if (root.nodeType !== 1 || root.closest('.bk-fx')) return;
    if (root.matches(HOST_SELECTOR)) attach(root);
    for (const host of root.querySelectorAll(HOST_SELECTOR)) attach(host);
  };

  const flush = () => {
    frame = 0;
    for (const root of pending) if (root.isConnected) discover(root);
    pending.clear();
    for (const host of attached) {
      if (!host.isConnected) {
        intersection?.unobserve(host);
        attached.delete(host);
      }
    }
  };

  const mutation = new win.MutationObserver(records => {
    let changed = false;
    for (const record of records) {
      if (record.target.nodeType === 1 && record.target.closest('.bk-fx')) continue;
      if (record.type === 'attributes') {
        const target = record.target;
        const host = target.matches('.card-art') ? target.nextElementSibling : target;
        if (host?.matches('.card-finish') && attached.has(host)) {
          // Synchronize in this microtask: a revoked/pending private image must
          // never survive in a copied relief until a later animation frame.
          syncCardRelief(host, host.querySelector('.bk-fx'), doc);
        }
        continue;
      }
      if (record.removedNodes.length) changed = true;
      // Replacing only an illustration also invalidates its adjacent finish.
      if (record.target.nodeType === 1 && [...record.removedNodes, ...record.addedNodes].some(node => node.nodeType === 1 && node.matches('.card-art'))) {
        for (const host of record.target.querySelectorAll('.card-finish')) {
          if (attached.has(host)) syncCardRelief(host, host.querySelector('.bk-fx'), doc);
        }
      }
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1 || node.classList.contains('bk-fx') || node.closest('.bk-fx')) continue;
        pending.add(node);
        changed = true;
      }
    }
    if (changed && !frame) frame = win.requestAnimationFrame(flush);
  });

  const visibility = () => {
    doc.documentElement.toggleAttribute('data-bk-fx-hidden', doc.visibilityState === 'hidden');
  };
  visibility();
  discover(doc.body);
  mutation.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'data-regalia-status', 'data-card-relief'] });
  doc.addEventListener('visibilitychange', visibility);

  const cleanup = () => {
    mutation.disconnect();
    intersection?.disconnect();
    doc.removeEventListener('visibilitychange', visibility);
    if (frame) win.cancelAnimationFrame(frame);
    pending.clear();
    for (const host of attached) {
      clearCardRelief(host, host.querySelector('.bk-fx'));
      for (const child of host.children) if (child.classList.contains('bk-fx')) child.remove();
      host.classList.remove('bk-fx-ready');
      delete host.dataset.fxRarity;
      delete host.dataset.fxVisible;
    }
    attached.clear();
    doc.documentElement.removeAttribute('data-bk-fx-hidden');
    delete doc.__beastKingRarityEffects;
  };
  doc.__beastKingRarityEffects = cleanup;
  return cleanup;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initRarityEffects(), { once: true });
  } else initRarityEffects();
}

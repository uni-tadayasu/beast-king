/** Discourage native artwork saving and accidental page gestures without cancelling game clicks. */
const mountedDocuments = new WeakMap();
const protectedArt = [
  'img', 'picture', 'svg', 'canvas', '[data-protect-art]',
  '.game-card', '.card-art', '.field-unit', '.entry-scene', '.arena',
  '.throne-scenery', '.pack-art', '.pack-display', '.deck-summary-art',
  '.fusion-choice-art', '.material-art', '.profile-avatar', '.duelist-avatar',
].join(',');

function eventElement(event) {
  // composedPath also covers an artwork or editable control inside an open shadow root.
  const fromPath = event.composedPath?.().find(node => node?.nodeType === 1);
  const target = fromPath || event.target;
  return target?.nodeType === 1 ? target : target?.parentElement || null;
}

function editable(element) {
  if (!element) return false;
  if (element.closest?.('input,textarea,select,[role="textbox"]')) return true;
  if (element.isContentEditable) return true;
  const host = element.closest?.('[contenteditable]');
  if (!host) return false;
  const value = host.getAttribute('contenteditable')?.toLowerCase();
  return value === '' || value === 'true' || value === 'plaintext-only';
}

/** Import once in a page; the exported mount is idempotent and accepts a test document. */
export function mountInteractionGuard(options = {}) {
  const doc = options.document ?? globalThis.document;
  if (!doc?.addEventListener) return null;
  if (mountedDocuments.has(doc)) return mountedDocuments.get(doc);
  const Observer = options.MutationObserver === undefined
    ? doc.defaultView?.MutationObserver ?? globalThis.MutationObserver
    : options.MutationObserver;
  const listeners = [];
  let observer = null;
  let destroyed = false;

  function listen(type, listener, settings = { capture: true }) {
    doc.addEventListener(type, listener, settings);
    listeners.push([type, listener, settings]);
  }

  function protectImage(image) {
    if (image?.nodeType === 1 && image.matches?.('img') && image.getAttribute('draggable') !== 'false') {
      image.setAttribute('draggable', 'false');
    }
  }

  function refreshImages(root = doc) {
    if (destroyed) return;
    protectImage(root);
    root?.querySelectorAll?.('img').forEach(protectImage);
  }

  function connectImages() {
    if (destroyed || observer) return;
    const root = doc.documentElement;
    if (!root) return;
    refreshImages(root);
    if (typeof Observer !== 'function') return;
    observer = new Observer(records => {
      if (destroyed) return;
      for (const record of records) {
        if (record.type === 'attributes') {
          protectImage(record.target);
        } else {
          // Inspect only newly inserted subtrees, never rescan the entire game on render.
          for (const node of record.addedNodes || []) {
            if (node.nodeType === 1) refreshImages(node);
          }
        }
      }
    });
    observer.observe(root, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['draggable'],
    });
  }

  listen('selectstart', event => {
    if (!editable(eventElement(event))) event.preventDefault();
  });

  const stopArtDefault = event => {
    const element = eventElement(event);
    if (!editable(element) && element?.closest?.(protectedArt)) event.preventDefault();
  };
  listen('contextmenu', stopArtDefault);
  listen('dragstart', stopArtDefault);

  listen('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
    const zoomKey = ['+', '=', '-', '_', '0'].includes(event.key);
    const zoomCode = ['Equal', 'Minus', 'Digit0', 'NumpadAdd', 'NumpadSubtract', 'Numpad0'].includes(event.code);
    if (zoomKey || zoomCode) event.preventDefault();
  });

  const cancellable = { capture: true, passive: false };
  listen('wheel', event => {
    if (event.ctrlKey) event.preventDefault();
  }, cancellable);
  const stopPinch = event => {
    if (event.touches?.length > 1) event.preventDefault();
  };
  listen('touchstart', stopPinch, cancellable);
  listen('touchmove', stopPinch, cancellable);
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    listen(type, event => event.preventDefault(), cancellable);
  }
  // No click, pointerdown, dblclick or touchend cancellation: repeated logo taps,
  // buttons, keyboard focus and ordinary single-finger scrolling remain available.

  const controller = {
    refreshImages,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
      for (const [type, listener, settings] of listeners) doc.removeEventListener(type, listener, settings);
      mountedDocuments.delete(doc);
    },
  };
  mountedDocuments.set(doc, controller);
  if (doc.documentElement) connectImages();
  else listen('DOMContentLoaded', connectImages, { once: true });
  return controller;
}

if (typeof document !== 'undefined') mountInteractionGuard();

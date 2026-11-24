/** One landscape canvas. Native orientation permissions remain authoritative.
 * Portrait touch browsers use a 90-degree layout, never a scaled screenshot. */
const mounted = new WeakMap();
const positive = (value, fallback = 1) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
const editing = node => !!node?.matches?.('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=range]),textarea,[contenteditable="true"]');

export function isMobileScreen(nav = globalThis.navigator, screen = globalThis.screen, win = globalThis.window) {
  if (!nav) return false;
  return nav.userAgentData?.mobile === true || /Android|iPhone|iPad|iPod/i.test(nav.userAgent || '') ||
    (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1) ||
    (nav.maxTouchPoints > 0 && win?.matchMedia?.('(pointer: coarse)')?.matches && Math.max(screen?.width || 0, screen?.height || 0) <= 1440);
}

export async function requestLandscape({doc = globalThis.document, screen = globalThis.screen, allowFullscreen = true} = {}) {
  let fullscreen = !!doc?.fullscreenElement;
  if (typeof screen?.orientation?.lock !== 'function') return {locked: false, fullscreen};
  if (allowFullscreen && !fullscreen && typeof doc?.documentElement?.requestFullscreen === 'function') {
    try { await doc.documentElement.requestFullscreen({navigationUI: 'hide'}); fullscreen = true; } catch {}
  }
  try { await screen.orientation.lock('landscape'); return {locked: true, fullscreen}; }
  catch { return {locked: false, fullscreen}; }
}

/** Pure geometry also used by pointer/drag/effect adapters and tests. */
export function landscapeViewport({physicalWidth, physicalHeight, offsetLeft = 0, offsetTop = 0, mobile = false, portrait} = {}) {
  const w = positive(physicalWidth), h = positive(physicalHeight);
  const rotated = !!mobile && (portrait ?? h > w);
  return {width: rotated ? h : w, height: rotated ? w : h, physicalWidth: w, physicalHeight: h,
    offsetLeft: Number(offsetLeft) || 0, offsetTop: Number(offsetTop) || 0, rotated};
}

function measure(win, portrait) {
  const visual = win?.visualViewport;
  return landscapeViewport({physicalWidth: positive(visual?.width, positive(win?.innerWidth)),
    physicalHeight: positive(visual?.height, positive(win?.innerHeight)), offsetLeft: visual?.offsetLeft,
    offsetTop: visual?.offsetTop, mobile: isMobileScreen(win?.navigator, win?.screen, win), portrait});
}

export function getLayoutViewport(win = globalThis.window) {
  return {...(win && mounted.get(win)?.metrics || measure(win))};
}

export function toLayoutPoint(point, viewport = getLayoutViewport()) {
  const x = (Number(point?.x ?? point?.clientX) || 0) - viewport.offsetLeft;
  const y = (Number(point?.y ?? point?.clientY) || 0) - viewport.offsetTop;
  return viewport.rotated ? {x: y, y: viewport.physicalWidth - x} : {x, y};
}

export function toLayoutRect(rect, viewport = getLayoutViewport()) {
  if (!rect) return null;
  const left = Number(rect.left ?? rect.x) || 0, top = Number(rect.top ?? rect.y) || 0;
  const right = Number(rect.right ?? left + (Number(rect.width) || 0));
  const bottom = Number(rect.bottom ?? top + (Number(rect.height) || 0));
  const a = toLayoutPoint({x: left, y: top}, viewport), b = toLayoutPoint({x: right, y: bottom}, viewport);
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), width = Math.abs(b.x - a.x), height = Math.abs(b.y - a.y);
  return {x, y, left: x, top: y, right: x + width, bottom: y + height, width, height};
}

export function mountLandscapeGate({doc = globalThis.document, win = globalThis.window} = {}) {
  if (!doc?.body || !win) return null;
  if (mounted.has(win)) return win.BeastKingViewport;
  const stage = doc.getElementById('orientation-stage') || doc.createElement('div');
  stage.id = 'orientation-stage'; stage.className = 'orientation-stage';
  const mobile = isMobileScreen(win.navigator, win.screen, win);
  const state = {metrics: null, portrait: win.innerHeight > win.innerWidth, orientation: win.screen?.orientation?.type,
    busy: false, locked: false, attempts: 0, lastAttempt: -Infinity, frame: null};
  const listeners = [];
  const on = (target, type, callback, options) => {
    target?.addEventListener?.(type, callback, options);
    listeners.push(() => target?.removeEventListener?.(type, callback, options));
  };
  const isTopLayer = node => { try { return node?.matches?.('dialog:modal'); } catch { return node?.tagName === 'DIALOG' && node.open; } };
  const moveIntoStage = node => {
    if (node === stage || node.nodeType !== 1 || node.parentNode !== doc.body || /^(SCRIPT|STYLE|LINK|META|NOSCRIPT)$/.test(node.tagName) || isTopLayer(node)) return;
    const focused = node.contains(doc.activeElement) ? doc.activeElement : null;
    stage.appendChild(node);
    focused?.focus?.({preventScroll: true});
  };
  const oldChildren = [...doc.body.children];
  if (!stage.isConnected) doc.body.appendChild(stage);
  oldChildren.forEach(moveIntoStage);
  const apply = () => {
    state.frame = null;
    const orientation = win.screen?.orientation?.type;
    // Opening an OS keyboard must not change the game's orientation mid-entry.
    if (!editing(doc.activeElement) || orientation !== state.orientation) state.portrait = win.innerHeight > win.innerWidth;
    state.orientation = orientation;
    const next = measure(win, state.portrait);
    const changed = JSON.stringify(next) !== JSON.stringify(state.metrics);
    state.metrics = next;
    doc.documentElement.classList.add('bk-landscape-canvas');
    const vars = {'--app-viewport-width': next.width, '--app-viewport-height': next.height,
      '--physical-viewport-width': next.physicalWidth, '--physical-viewport-height': next.physicalHeight,
      '--physical-viewport-left': next.offsetLeft, '--physical-viewport-top': next.offsetTop};
    for (const [key, value] of Object.entries(vars)) doc.documentElement.style.setProperty(key, `${value}px`);
    doc.body.dataset.virtualLandscape = String(next.rotated);
    doc.body.dataset.layoutSize = next.height < 650 || next.width < 1000 ? 'compact' : 'wide';
    doc.body.dataset.layoutShort = String(next.height <= 540);
    doc.body.dataset.layoutWidth = next.width >= 1100 ? 'wide' : next.width >= 800 ? 'medium' : 'small';
    doc.body.classList.remove('needs-landscape');
    if (changed) win.dispatchEvent(new win.CustomEvent('beastking:viewport', {detail: {...next}}));
  };
  const schedule = () => { if (state.frame === null) state.frame = win.requestAnimationFrame(apply); };
  const api = {get: () => getLayoutViewport(win), toLocalPoint: point => toLayoutPoint(point, getLayoutViewport(win)),
    toLocalRect: rect => toLayoutRect(rect, getLayoutViewport(win)), stage};
  mounted.set(win, state); win.BeastKingViewport = api;
  apply();

  const observer = typeof win.MutationObserver === 'function' ? new win.MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes || []) moveIntoStage(node);
  }) : null;
  // Newly created loaders, toast hosts and pack rituals share the same coordinates.
  // An already-open native dialog stays in its top layer and gets its own CSS rotation.
  observer?.observe(doc.body, {childList: true});
  const request = async allowFullscreen => {
    if (!mobile || state.busy || state.locked || editing(doc.activeElement)) return;
    state.busy = true;
    const result = await requestLandscape({doc, screen: win.screen, allowFullscreen});
    state.locked = result.locked; state.busy = false; schedule();
  };
  const gesture = event => {
    if (!event.isTrusted || editing(event.target) || state.attempts >= 2 || !mobile || !win.screen?.orientation?.lock) return;
    const now = win.performance?.now?.() ?? Date.now();
    if (now - state.lastAttempt < 1500) return;
    state.lastAttempt = now; state.attempts++; void request(true);
  };
  on(win, 'resize', schedule, {passive: true});
  on(win.visualViewport, 'resize', schedule, {passive: true});
  on(win.visualViewport, 'scroll', schedule, {passive: true});
  on(win.screen?.orientation, 'change', () => {state.locked = false; schedule();});
  on(doc, 'fullscreenchange', schedule);
  on(doc, 'pointerup', gesture, {capture: true, passive: true});
  on(doc, 'keydown', event => {if (['Enter', ' '].includes(event.key)) gesture(event);}, {capture: true});
  on(doc, 'focusout', schedule);
  on(doc, 'visibilitychange', () => {if (!doc.hidden) {schedule(); void request(false);}});
  // Installed apps may allow locking at load. Browser tabs safely fall back to
  // the landscape canvas immediately, then retry with real user activation.
  void request(false);
  api.destroy = () => {
    observer?.disconnect(); listeners.forEach(remove => remove());
    if (state.frame !== null) win.cancelAnimationFrame(state.frame);
    mounted.delete(win); delete win.BeastKingViewport;
  };
  return api;
}

if (typeof document !== 'undefined') {
  if (document.body) mountLandscapeGate();
  else document.addEventListener('DOMContentLoaded', () => mountLandscapeGate(), {once: true});
}

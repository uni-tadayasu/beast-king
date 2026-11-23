/** Mobile landscape gate. Browser orientation/fullscreen permissions remain authoritative. */
export function isMobileScreen(nav = globalThis.navigator, screen = globalThis.screen, win = globalThis.window) {
  if (!nav) return false;
  return nav.userAgentData?.mobile === true || /Android|iPhone|iPad|iPod/i.test(nav.userAgent || '') ||
    (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1) ||
    (nav.maxTouchPoints > 0 && win?.matchMedia?.('(pointer: coarse)').matches && Math.max(screen?.width || 0, screen?.height || 0) <= 1440);
}

export async function requestLandscape({ doc = globalThis.document, screen = globalThis.screen } = {}) {
  let fullscreen = !!doc?.fullscreenElement;
  if (!fullscreen && typeof doc?.documentElement?.requestFullscreen === 'function') {
    try { await doc.documentElement.requestFullscreen({ navigationUI: 'hide' }); fullscreen = true; } catch {}
  }
  if (typeof screen?.orientation?.lock !== 'function') return { locked: false, fullscreen };
  try { await screen.orientation.lock('landscape'); return { locked: true, fullscreen }; }
  catch { return { locked: false, fullscreen }; }
}

export function mountLandscapeGate() {
  if (typeof document === 'undefined' || !isMobileScreen()) return;
  const gate = document.createElement('section');
  gate.className = 'orientation-gate';
  gate.setAttribute('aria-labelledby', 'orientation-title');
  gate.innerHTML = `<div class="orientation-content"><img src="assets/icon.svg" width="52" height="52" alt=""><p class="orientation-brand">BEAST KING</p><svg class="orientation-device" viewBox="0 0 120 100" aria-hidden="true"><rect x="20" y="26" width="80" height="48" rx="8"/><path d="M90 12a49 49 0 0 0-70 3m0-12v13h13M30 88a49 49 0 0 0 70-3m0 12V84H87"/><circle cx="91" cy="50" r="2"/></svg><h1 id="orientation-title">端末を横向きにしてください</h1><p>スマホ・タブレットは横画面で遊べます。<br>端末を回転すると、自動でゲーム画面に戻ります。</p><button type="button" class="orientation-start">横画面で開く</button><p class="orientation-help" role="status">自動で切り替わらない場合は、端末の回転ロックを解除して横に向けてください。</p></div>`;
  document.body.append(gate);
  const app = document.getElementById('app'), modalRoot = document.getElementById('modal-root');
  let busy = false, blocked = false, returnFocus;
  const update = () => {
    const next = window.innerHeight > window.innerWidth;
    gate.hidden = !next;
    document.body.classList.toggle('needs-landscape', next);
    if (app) app.inert = next;
    if (modalRoot) modalRoot.inert = next;
    if (next && !blocked) { returnFocus = document.activeElement; gate.querySelector('button').focus({ preventScroll: true }); }
    if (!next && blocked && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    blocked = next;
  };
  const request = async () => {
    if (busy) return;
    busy = true;
    const result = await requestLandscape();
    if (!result.locked) gate.querySelector('.orientation-help').textContent = 'このブラウザでは自動固定できません。端末の回転ロックを解除して、横に向けてください。';
    busy = false;
    update();
  };
  gate.querySelector('button').addEventListener('click', request);
  // A start click provides the user activation required by fullscreen browsers.
  document.addEventListener('click', event => { if (event.target.closest?.('[data-action="name-start"]')) void request(); });
  window.addEventListener('resize', update);
  screen.orientation?.addEventListener?.('change', update);
  document.addEventListener('fullscreenchange', update);
  update();
}

if (typeof document !== 'undefined') mountLandscapeGate();

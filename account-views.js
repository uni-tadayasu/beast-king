import {operatorConsoleView,pagedInboxView} from './operator-console.js?v=20261124-31';
/** Pure modal contents. Authentication, authorization, requests and confirmations belong to the caller. */
const escapeDefault = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ORIGINS = Object.freeze({ mountain: '山', river: '川', seed: '種', grass: '草', flower: '花', tree: '木', king: '王' });
const TYPE_STATUS = Object.freeze({ draft: '下書き', published: '公開中', ended: '終了' });
const SYNC_STATUS = Object.freeze({
  idle: ['同期前', 'この端末の進行をクラウドに保存すると、連携した端末でも続きから遊べます。'],
  loading: ['読み込み中', 'アカウントの保存内容を確認しています。'],
  connecting: ['接続中', 'アカウントに接続しています。'],
  connected: ['接続済み', '連携する端末で同じアカウントを利用できます。'],
  synced: ['同期済み', 'この端末とクラウドの保存内容は同期されています。'],
  saving: ['保存中', 'この端末の変更をクラウドに保存しています。'],
  syncing: ['同期中', 'アカウントの保存内容を同期しています。'],
  dirty: ['同期待ち', 'この端末に、まだクラウドへ保存されていない変更があります。'],
  pending: ['同期待ち', 'この端末に、まだクラウドへ保存されていない変更があります。'],
  offline: ['オフライン', '接続が戻ると、保存内容を確認して同期します。'],
  paused: ['同期を一時停止中', '同期の再開後に、保存内容を確認します。'],
  'auth-required': ['連携の確認が必要', '接続を更新するか、連携コードでアカウントに接続してください。'],
  disconnected: ['未接続', '接続を更新すると、アカウントの保存内容を確認できます。'],
  conflict: ['更新の確認が必要', '別の端末でも保存内容が変わっています。使用するデータを選んでください。'],
  error: ['同期できませんでした', '表示された内容を確認し、接続を更新してください。']
});

function helpers(esc, icon) {
  return { e: typeof esc === 'function' ? esc : escapeDefault, i: name => typeof icon === 'function' ? icon(name) : '' };
}
function timestamp(value) {
  if (value === null || value === undefined || value === '') return NaN;
  const n = typeof value === 'number' ? value : /^\d{10,13}$/.test(String(value)) ? Number(value) : Date.parse(value);
  return Number.isFinite(n) && Math.abs(n) <= 8640000000000000 ? n : NaN;
}
function dateTime(value) {
  const n = timestamp(value);
  return Number.isFinite(n) ? new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(n)) : '—';
}
function localJst(value) {
  const n = timestamp(value);
  const date = new Date(n + 9 * 60 * 60 * 1000);
  return Number.isFinite(n) && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 16) : '';
}
function formatNumber(value, fallback = '—') { return Number.isFinite(value) ? value.toLocaleString('ja-JP') : fallback; }
function shortId(value) { const s = String(value ?? ''); return s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s || '未接続'; }
function errorMessage(value) { return typeof value === 'string' ? value : value?.message || ''; }
function feedback(value, e) { const message = errorMessage(value); return message ? `<p class="account-feedback" role="alert">${e(message)}</p>` : ''; }
function knownOrigin(value) { return Object.hasOwn(ORIGINS, value) ? ORIGINS[value] : '未設定'; }
function originImage(value) { return Object.hasOwn(ORIGINS, value) ? `<img src="assets/profiles/${value}.svg" alt="" width="36" height="36">` : ''; }
function disabled(busy) { return busy ? ' disabled' : ''; }
function newest(rows, limit = 8) { return (Array.isArray(rows) ? rows : []).filter(row => row && typeof row === 'object').sort((a, b) => (timestamp(b.createdAt) || 0) - (timestamp(a.createdAt) || 0)).slice(0, limit); }

export function accountDevicePageSize(height = globalThis.window?.BeastKingViewport?.get?.().height ?? globalThis.window?.innerHeight ?? 760) {
  return height <= 350 ? 1 : height <= 540 ? 2 : 4;
}

export function accountSyncView({ state = {}, profile = {}, link = null, devices = [], tab = 'sync', devicePage = 0, viewportHeight, esc, icon } = {}) {
  const { e, i } = helpers(esc, icon);
  const conflict = Boolean(state.conflict) || state.phase === 'conflict' || state.status === 'conflict';
  const phase = conflict ? 'conflict' : state.phase || state.status || 'idle';
  const [statusLabel, statusText] = Object.hasOwn(SYNC_STATUS, phase) ? SYNC_STATUS[phase] : SYNC_STATUS.idle;
  const busy = Boolean(state.busy);
  const accountId = state.playerId || state.accountId || profile?.id;
  const pending = Boolean(state.dirty || state.pendingChanges || phase === 'dirty' || phase === 'pending');
  const lastSync = state.lastSyncedAt ?? state.lastSyncAt;
  const expires = timestamp(link?.expiresAt);
  const expired = Boolean(link?.expired) || (Number.isFinite(expires) && expires <= Date.now());
  const tabs = [['sync', '同期'], ['send', 'コードを発行'], ['receive', 'コードを入力'], ['devices', '連携端末']];
  const selectedTab = tabs.some(([value]) => value === tab) ? tab : 'sync';
  const sessionRows = Array.isArray(devices) ? devices.filter(device => device && typeof device === 'object') : [];
  const pageSize = accountDevicePageSize(viewportHeight), pageCount = Math.max(1, Math.ceil(sessionRows.length / pageSize));
  const currentPage = Math.min(pageCount - 1, Math.max(0, Math.trunc(Number(devicePage) || 0)));
  const panel = name => `class="account-task-panel account-${name}-panel" data-account-panel="${name}" role="tabpanel" id="account-panel-${name}" aria-labelledby="account-tab-${name}"${selectedTab === name ? '' : ' hidden'}`;
  const codeBlock = link?.code ? `<div class="account-link-result${expired ? ' is-expired' : ''}"><span class="account-small-label">連携先の端末に入力するコード</span><div class="account-code-row"><output class="account-link-code" aria-label="端末連携コード">${e(link.code)}</output><button type="button" class="account-button compact" data-action="cloud-link-copy"${disabled(busy || expired)}>コピー</button></div><p>${expired ? '有効期限が終了しました。新しいコードを発行してください。' : `有効期限：${e(dateTime(link.expiresAt))}（日本時間）`}</p></div>` : '<div class="account-code-placeholder"><span aria-hidden="true">'+i('globe')+'</span><h3>ここに連携コードが表示されます</h3><p>発行後、連携先の端末で「コードを入力」を開いてください。</p></div>';
  const deviceList = sessionRows.length ? `<ul class="account-device-list" data-account-paged>${sessionRows.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((device, offset) => {
    const current = Boolean(device.isCurrent || device.current), revoked = Boolean(device.revokedAt), id = device.id;
    return `<li data-device-id="${e(id || 'device-' + (currentPage * pageSize + offset))}"><span class="account-device-mark" aria-hidden="true">${i('globe')}</span><div class="account-device-copy"><strong>${e(device.label || (current ? 'この端末' : '連携した端末'))}${current ? '<span class="account-inline-badge">この端末</span>' : ''}${revoked ? '<span class="account-inline-badge muted">解除済み</span>' : ''}</strong><small>最終利用 ${e(dateTime(device.lastSeenAt || device.createdAt))}</small></div>${id && !revoked && !current ? `<button type="button" class="account-button quiet compact" data-action="cloud-revoke-session" data-session-id="${e(id)}" data-index="${currentPage * pageSize + offset}"${disabled(busy)}>連携を解除</button>` : ''}</li>`;
  }).join('')}</ul>` : '<p class="account-empty-inline">端末の一覧は、接続の更新後に表示されます。</p>';
  return `<div class="account-view account-workspace" data-account-tab="${selectedTab}" data-account-conflict="${conflict}"${busy ? ' aria-busy="true"' : ''}>
    <header class="account-workspace-header"><div class="account-workspace-heading"><div class="eyebrow">ACCOUNT LINK</div><h2>端末を連携</h2><p class="account-intro">別のPC・スマホ・タブレットでも、同じ続きから。</p></div><section class="account-summary" aria-label="連携アカウント"><div class="account-avatar">${originImage(profile?.origin) || i('globe')}</div><div class="account-summary-copy"><span class="account-small-label">連携アカウント</span><strong>${e(profile?.nickname || profile?.name || '接続を確認してください')}</strong><code>${e(shortId(accountId))}</code></div><span id="cloud-sync-badge" class="account-status status-${Object.hasOwn(SYNC_STATUS, phase) ? phase : 'idle'}">${statusLabel}</span></section></header>
    <nav class="account-task-tabs" role="tablist" aria-label="端末連携の操作">${tabs.map(([value, label]) => `<button type="button" role="tab" id="account-tab-${value}" aria-controls="account-panel-${value}" aria-selected="${selectedTab === value}" data-action="cloud-account-tab" data-tab="${value}">${label}${value === 'sync' && conflict ? '<span class="account-tab-attention" aria-label="保存内容の確認が必要">!</span>' : ''}</button>`).join('')}</nav>
    <div id="cloud-sync-error" class="account-workspace-feedback">${feedback(state.error, e)}</div>
    <main class="account-task-stage">
      <section ${panel('sync')}><div class="account-overview"><div class="account-sync-status"><div id="cloud-sync-status" role="status" aria-live="polite" aria-atomic="true"><h3>保存状態</h3><p>${statusText}</p><div class="account-sync-meta"><span>最終同期 <b>${e(dateTime(lastSync))}</b></span><span>${pending ? '<b class="account-pending">未同期の変更があります</b>' : '未同期の変更なし'}</span></div></div><button type="button" class="account-button" data-action="cloud-refresh"${disabled(busy)}>${i('globe')}接続・同期を更新</button></div><div class="account-scope"><span aria-hidden="true">${i('cards')}</span><p>カード・秘宝・デッキ・ソロ進行・プロフィール・ランクを共有します。<small>バックアップファイルの保存・読み込みは別の機能です。</small></p></div></div>
      ${conflict ? `<section class="account-conflict" aria-labelledby="account-conflict-title"><h3 id="account-conflict-title">どちらの保存内容を使いますか？</h3><p>2つの保存内容は自動では統合されません。</p><div class="account-conflict-options"><div><button type="button" class="account-button" data-action="cloud-conflict-remote"${disabled(busy)}>クラウドのデータを使う</button><small>この端末の未同期の変更を置き換えます。</small></div><div><button type="button" class="account-button" data-action="cloud-conflict-local"${disabled(busy)}>この端末のデータを使う</button><small>確認後、この端末の内容でクラウドを更新します。</small></div></div></section>` : `<section class="account-next-step"><span class="account-task-symbol" aria-hidden="true">${i('globe')}</span><h3>別の端末でも続きから</h3><p>いまのデータを使い続ける端末でコードを発行し、新しい端末で入力します。</p><button type="button" class="account-button primary" data-action="cloud-account-tab" data-tab="send">連携コードの発行へ</button></section>`}</section>
      <section ${panel('send')}><div class="account-link-step"><h3>いまのアカウントを使い続ける</h3><p>この端末でコードを発行して、連携先の端末へ入力してください。有効期間は10分です。</p><button type="button" class="account-button primary" data-action="cloud-link-create"${disabled(busy)}>${link?.code ? '新しい連携コードを発行' : '連携コードを発行'}</button></div><div class="account-code-card">${codeBlock}</div></section>
      <section ${panel('receive')}><div class="account-link-step account-receive-intro"><h3>この端末を連携先にする</h3><p class="account-receive-help">連携元の端末で発行したコードを入力してください。</p><p id="account-replace-note" class="account-replace-note">この端末のデータは、コードを発行したアカウントのデータに置き換わります。2つのアカウントのデータは統合されません。</p></div><div class="account-link-step account-receive-form"><label for="device-link-code" class="account-label">連携元で発行したコード</label><input id="device-link-code" class="account-input account-code-input" type="text" maxlength="128" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="連携コードを入力" aria-describedby="account-replace-note"${disabled(busy)}><button type="button" class="account-button primary" data-action="cloud-link-claim"${disabled(busy)}>この端末を連携する</button></div></section>
      <section ${panel('devices')}><div class="account-section-heading"><h3>連携中の端末 <span>${sessionRows.length}</span></h3><span>日時は日本時間</span></div>${deviceList}<nav class="account-device-pagination" aria-label="連携端末のページ"><button type="button" class="account-button quiet" data-action="cloud-device-prev"${disabled(busy || currentPage === 0)}>前のページ</button><span>${currentPage + 1} / ${pageCount}</span><button type="button" class="account-button quiet" data-action="cloud-device-next"${disabled(busy || currentPage + 1 >= pageCount)}>次のページ</button></nav></section>
    </main>
  </div>`;
}

export function operatorGateView({ esc, icon, error = '', busy = false, purpose = 'activation', regaliaClaimed = false } = {}) {
  const { e, i } = helpers(esc, icon);
  const regalia = purpose === 'regalia';
  return `<div class="operator-gate"${busy ? ' aria-busy="true"' : ''}><span class="operator-gate-mark" aria-hidden="true">${i('shield')}</span><h2>${regalia ? '特別コードの確認' : 'アクセス確認'}</h2><p class="account-intro">${regalia ? regaliaClaimed ? '受取済みのレガリアを使う「プレミアムデッキ」を開放します。同じ特別コードを入力してください。' : '王冠竜 レガリア ×2と、専用の「プレミアムデッキ」をこの運営アカウントで開放します。特別コードを入力してください。' : 'アクセスコードを入力してください。'}</p><label class="account-label" for="operator-code">${regalia ? '特別コード' : 'アクセスコード'}</label><input id="operator-code" class="account-input" type="password" maxlength="256" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-describedby="operator-gate-feedback"${disabled(busy)}>${regalia ? `<p class="account-field-help">通常32枚＋特殊4枚。必要なカードの不足分も受け取り、ソロ・ルーム対戦・ランクマッチのすべてで使えます。${regaliaClaimed ? '受取済みのレガリア2枚は重複配布しません。' : '受取は一度だけです。レガリアの所持上限の3枚を超える分は、1枚につき5秘宝に変わります。'}</p>` : ''}<p id="operator-gate-status" class="account-response-status" role="status" aria-live="polite">${busy ? '確認しています…' : ''}</p><div id="operator-gate-feedback">${feedback(error, e)}</div><button type="button" class="account-button primary operator-gate-submit" data-action="${regalia ? 'operator-regalia-claim' : 'operator-activate'}"${disabled(busy)}>${busy ? '確認しています…' : regalia ? '確認して開放する' : '確認する'}</button>${regalia ? `<button type="button" class="account-button quiet operator-gate-submit" data-action="operator-regalia-back"${disabled(busy)}>運営管理に戻る</button>` : ''}</div>`;
}

export function operatorDashboardView(options={}){return operatorConsoleView(options);}
export function playerInboxView(options={}){return pagedInboxView(options);}

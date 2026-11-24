import {operatorConsoleView,pagedInboxView} from './operator-console.js?v=20261124-28';
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

export function accountSyncView({ state = {}, profile = {}, link = null, devices = [], esc, icon } = {}) {
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
  const sessionRows = Array.isArray(devices) ? devices.filter(device => device && typeof device === 'object') : [];
  const codeBlock = link?.code ? `<div class="account-link-result${expired ? ' is-expired' : ''}"><span class="account-small-label">このコードを、連携先の端末に入力</span><div class="account-code-row"><output class="account-link-code" aria-label="端末連携コード">${e(link.code)}</output><button type="button" class="account-button compact" data-action="cloud-link-copy"${disabled(busy || expired)}>コピー</button></div><p>${expired ? 'このコードの有効期限は終了しました。新しいコードを発行してください。' : `有効期限：${e(dateTime(link.expiresAt))}（日本時間）`}</p></div>` : '';
  const deviceList = sessionRows.length ? `<ul class="account-device-list">${sessionRows.map((device, index) => {
    const current = Boolean(device.isCurrent || device.current), revoked = Boolean(device.revokedAt), id = device.id;
    return `<li><span class="account-device-mark" aria-hidden="true">${i('globe')}</span><div class="account-device-copy"><strong>${e(device.label || (current ? 'この端末' : '連携した端末'))}${current ? '<span class="account-inline-badge">この端末</span>' : ''}${revoked ? '<span class="account-inline-badge muted">解除済み</span>' : ''}</strong><small>最終利用 ${e(dateTime(device.lastSeenAt || device.createdAt))}</small></div>${id && !revoked && !current ? `<button type="button" class="account-button quiet compact" data-action="cloud-revoke-session" data-session-id="${e(id)}" data-index="${index}"${disabled(busy)}>連携を解除</button>` : ''}</li>`;
  }).join('')}</ul>` : '<p class="account-empty-inline">端末の一覧は、接続の更新後に表示されます。</p>';
  return `<div class="account-view"${busy ? ' aria-busy="true"' : ''}>
    <div class="eyebrow">ACCOUNT LINK</div><h2>端末を連携</h2><p class="account-intro">同じアカウントを、別のPC・スマホ・タブレットでも。</p>
    <section class="account-summary"><div class="account-avatar">${originImage(profile?.origin) || i('globe')}</div><div class="account-summary-copy"><span class="account-small-label">連携アカウント</span><strong>${e(profile?.nickname || profile?.name || '接続を確認してください')}</strong><code>${e(shortId(accountId))}</code></div><span id="cloud-sync-badge" class="account-status status-${Object.hasOwn(SYNC_STATUS, phase) ? phase : 'idle'}">${statusLabel}</span></section>
    <div class="account-sync-status"><div id="cloud-sync-status" role="status" aria-live="polite" aria-atomic="true"><p>${statusText}</p><div class="account-sync-meta"><span>最終同期 <b>${e(dateTime(lastSync))}</b></span><span>${pending ? '<b class="account-pending">未同期の変更があります</b>' : '未同期の変更なし'}</span></div></div><button type="button" class="account-button" data-action="cloud-refresh"${disabled(busy)}>${i('globe')}接続・同期を更新</button></div>
    <div id="cloud-sync-error">${feedback(state.error, e)}</div>
    ${conflict ? `<section class="account-conflict" aria-labelledby="account-conflict-title"><h3 id="account-conflict-title">どちらの保存内容を使いますか？</h3><p>2つの保存内容は自動では統合されません。</p><div class="account-conflict-options"><div><button type="button" class="account-button" data-action="cloud-conflict-remote"${disabled(busy)}>クラウドのデータを使う</button><small>この端末の未同期の変更を置き換えます。</small></div><div><button type="button" class="account-button" data-action="cloud-conflict-local"${disabled(busy)}>この端末のデータを使う</button><small>確認後、この端末の内容でクラウドを更新します。</small></div></div></section>` : ''}
    <div class="account-link-grid"><section class="account-link-step"><span class="account-step-number">01</span><h3>いまのアカウントを使い続ける</h3><p>連携元の端末でコードを発行し、連携先の端末へ入力してください。有効期間は10分です。</p><button type="button" class="account-button primary" data-action="cloud-link-create"${disabled(busy)}>${link?.code ? '新しい連携コードを発行' : '連携コードを発行'}</button>${codeBlock}</section>
    <section class="account-link-step"><span class="account-step-number">02</span><h3>この端末を連携先にする</h3><label for="device-link-code" class="account-label">連携元で発行したコード</label><input id="device-link-code" class="account-input account-code-input" type="text" maxlength="128" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="連携コードを入力" aria-describedby="account-replace-note"${disabled(busy)}><p id="account-replace-note" class="account-replace-note">この端末のデータは、コードを発行したアカウントのデータに置き換わります。2つのアカウントのデータは統合されません。</p><button type="button" class="account-button" data-action="cloud-link-claim"${disabled(busy)}>この端末を連携する</button></section></div>
    <section class="account-devices"><div class="account-section-heading"><h3>連携中の端末</h3><span>日時は日本時間</span></div>${deviceList}</section>
    <div class="account-scope"><span aria-hidden="true">${i('cards')}</span><p>所持カード・秘宝・デッキ・ソロ進行・プロフィール・ランクを、同じアカウントで利用できます。<small>バックアップファイルの保存・読み込みは、端末連携とは別の機能です。</small></p></div>
  </div>`;
}

export function operatorGateView({ esc, icon, error = '', busy = false, purpose = 'activation', regaliaClaimed = false } = {}) {
  const { e, i } = helpers(esc, icon);
  const regalia = purpose === 'regalia';
  return `<div class="operator-gate"${busy ? ' aria-busy="true"' : ''}><span class="operator-gate-mark" aria-hidden="true">${i('shield')}</span><h2>${regalia ? '特別コードの確認' : 'アクセス確認'}</h2><p class="account-intro">${regalia ? regaliaClaimed ? '受取済みのレガリアを使う「𠮷良原デッキ」を開放します。同じ特別コードを入力してください。' : '王冠竜 レガリア ×2と、専用の「𠮷良原デッキ」をこの運営アカウントで開放します。特別コードを入力してください。' : 'アクセスコードを入力してください。'}</p><label class="account-label" for="operator-code">${regalia ? '特別コード' : 'アクセスコード'}</label><input id="operator-code" class="account-input" type="password" maxlength="256" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-describedby="operator-gate-feedback"${disabled(busy)}>${regalia ? `<p class="account-field-help">通常32枚＋特殊4枚。必要なカードの不足分も受け取り、ソロ・ルーム対戦・ランクマッチのすべてで使えます。${regaliaClaimed ? '受取済みのレガリア2枚は重複配布しません。' : '受取は一度だけです。レガリアの所持上限の3枚を超える分は、1枚につき5秘宝に変わります。'}</p>` : ''}<p id="operator-gate-status" class="account-response-status" role="status" aria-live="polite">${busy ? '確認しています…' : ''}</p><div id="operator-gate-feedback">${feedback(error, e)}</div><button type="button" class="account-button primary operator-gate-submit" data-action="${regalia ? 'operator-regalia-claim' : 'operator-activate'}"${disabled(busy)}>${busy ? '確認しています…' : regalia ? '確認して開放する' : '確認する'}</button>${regalia ? `<button type="button" class="account-button quiet operator-gate-submit" data-action="operator-regalia-back"${disabled(busy)}>運営管理に戻る</button>` : ''}</div>`;
}

export function operatorDashboardView(options={}){return operatorConsoleView(options);}
export function playerInboxView(options={}){return pagedInboxView(options);}

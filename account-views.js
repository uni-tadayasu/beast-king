/** Pure modal contents. Authentication, authorization, requests and confirmations belong to the caller. */
const escapeDefault = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ORIGINS = Object.freeze({ mountain: '山', river: '川', seed: '種', grass: '草', flower: '花', tree: '木' });
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

export function operatorGateView({ esc, icon, error = '', busy = false } = {}) {
  const { e, i } = helpers(esc, icon);
  return `<div class="operator-gate"${busy ? ' aria-busy="true"' : ''}><span class="operator-gate-mark" aria-hidden="true">${i('shield')}</span><h2>アクセス確認</h2><p class="account-intro">アクセスコードを入力してください。</p><label class="account-label" for="operator-code">アクセスコード</label><input id="operator-code" class="account-input" type="password" maxlength="256" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-describedby="operator-gate-feedback"${disabled(busy)}><p id="operator-gate-status" class="account-response-status" role="status" aria-live="polite">${busy ? '確認しています…' : ''}</p><div id="operator-gate-feedback">${feedback(error, e)}</div><button type="button" class="account-button primary operator-gate-submit" data-action="operator-activate"${disabled(busy)}>${busy ? '確認しています…' : '確認する'}</button></div>`;
}

function audienceFields(prefix, e, busy) {
  return `<div class="operator-recipient-grid"><div><label class="account-label" for="${prefix}-audience">送信先</label><select id="${prefix}-audience" class="account-input"${disabled(busy)}><option value="all">全プレイヤー</option><option value="player">指定したプレイヤー</option></select></div><div><label class="account-label" for="${prefix}-player">プレイヤーID <span>個別の場合</span></label><input id="${prefix}-player" class="account-input" type="text" maxlength="128" autocomplete="off" spellcheck="false" placeholder="対象のプレイヤーID"${disabled(busy)}></div></div>`;
}
function rewardFields(prefix, draft, e, busy) {
  const first = Array.isArray(draft?.cards) ? draft.cards[0] : null;
  return `<div class="operator-reward-grid"><div><label class="account-label" for="${prefix}-treasure">秘宝</label><input id="${prefix}-treasure" class="account-input" type="number" min="0" max="100000" step="1" value="${e(Number.isFinite(draft?.treasure) ? draft.treasure : 0)}" inputmode="numeric"${disabled(busy)}></div><div><label class="account-label" for="${prefix}-card-id">カードID <span>任意</span></label><input id="${prefix}-card-id" class="account-input" type="text" maxlength="5" pattern="[BMGF][0-9]{4}" autocomplete="off" autocapitalize="off" spellcheck="false" value="${e(first?.cardId || '')}" placeholder="例：B0001"${disabled(busy)}></div><div><label class="account-label" for="${prefix}-card-count">枚数</label><input id="${prefix}-card-count" class="account-input" type="number" min="1" max="3" step="1" inputmode="numeric" value="${e(Number.isInteger(first?.count) ? first.count : 1)}"${disabled(busy)}></div></div><p class="account-field-help">カードIDは図鑑で確認できます。カードなしの場合は空欄にしてください。秘宝は0〜100,000、カードは1〜3枚です。</p>`;
}
function rewards(item, e, getCard) {
  const rows = [];
  if (Number.isFinite(item?.treasure) && item.treasure > 0) rows.push(`<span class="inbox-reward treasure">${formatNumber(item.treasure)} 秘宝</span>`);
  for (const card of Array.isArray(item?.cards) ? item.cards.slice(0, 12) : []) {
    if (!card?.cardId) continue;
    const record = typeof getCard === 'function' ? getCard(card.cardId) : null;
    rows.push(`<span class="inbox-reward">${e(record?.name || card.cardId)} × ${e(Number.isInteger(card.count) ? card.count : 1)}</span>`);
  }
  return rows.length ? rows.join('') : '<span class="inbox-no-reward">報酬なし</span>';
}
function deliveryHistory(rows, e) {
  const items = newest(rows, 5);
  return items.length ? `<div class="operator-delivery-history"><h4>最近の配信</h4>${items.map(row => `<div><strong>${e(row.title || 'タイトルなし')}</strong><small>${e(dateTime(row.createdAt))} · ${row.target === 'all' ? '全プレイヤー' : `個別 ${e(shortId(row.target))}`}</small></div>`).join('')}</div>` : '';
}
function presenceSection({ rows, total, onlineOnly, e, i }) {
  const available = Array.isArray(rows);
  const players = available ? rows.filter(row => row && typeof row === 'object' && !Array.isArray(row)).slice(0, 100) : [];
  const id = onlineOnly ? 'operator-online-players' : 'operator-recent-logins';
  const title = onlineOnly ? '現在オンラインのプレイヤー' : '過去24時間のログイン';
  const empty = !available ? '一覧をまだ取得できていません。' : onlineOnly ? '現在オンラインのプレイヤーはいません。' : '過去24時間のログインはありません。';
  const list = players.length ? `<ul class="operator-player-list operator-presence-list" tabindex="0" aria-label="${title}">${players.map(player => {
    const online = onlineOnly || player.online === true;
    const lastLogin = Number.isFinite(timestamp(player.lastLoginAt)) ? dateTime(player.lastLoginAt) : '未記録';
    return `<li><div class="operator-player-origin">${originImage(player.origin)}</div><div class="operator-player-copy"><div class="operator-presence-name"><strong>${e(player.nickname || player.name || 'プレイヤー')}</strong><span class="operator-presence-state${online ? ' is-online' : ''}">${online ? 'オンライン' : 'オフライン'}</span></div><code aria-label="プレイヤーID">${e(player.id || '')}</code><small>${e(knownOrigin(player.origin))}のオリジン</small><div class="operator-presence-times"><span>最終通信 <time>${e(dateTime(player.lastSeenAt))}</time></span><span>最終ログイン <time>${e(lastLogin)}</time></span></div></div><span class="operator-player-rating"><b>${formatNumber(player.rating)}</b><small>レート</small></span></li>`;
  }).join('')}</ul>` : `<p class="account-empty-inline">${empty}</p>`;
  return `<details id="${id}" class="operator-section operator-presence-section"${onlineOnly ? ' open' : ''}><summary>${i('globe')}<span>${title}</span><b>${formatNumber(total)}</b></summary><div class="operator-section-body"><p class="operator-presence-note">${onlineOnly ? '30秒ごとに更新 · 接続切れは最大90秒で反映' : '30秒ごとに更新 · 過去24時間にログインしたプレイヤー'}</p>${list}<p class="operator-presence-help">日時は日本時間です。IDは選択してコピーし、個別送信先に使えます。一覧は100件まで表示します。</p></div></details>`;
}

export function operatorDashboardView({ snapshot = {}, esc, icon, busy = false, error = '', status = '', eventDraft = null } = {}) {
  const { e, i } = helpers(esc, icon);
  const stats = snapshot.stats || {}, settings = snapshot.settings || {}, draft = eventDraft || {};
  const players = Array.isArray(snapshot.recentPlayers) ? snapshot.recentPlayers.filter(Boolean).slice(0, 12) : [];
  const events = Array.isArray(snapshot.events) ? snapshot.events.filter(Boolean).slice(0, 20) : [];
  const audit = newest(snapshot.audit, 6);
  const eventStatus = Object.hasOwn(TYPE_STATUS, draft.status) ? draft.status : 'draft';
  return `<div class="operator-view"${busy ? ' aria-busy="true"' : ''}><div class="eyebrow">OPERATIONS</div><h2>運営管理</h2><p class="account-intro">配信内容と公開状態を確認してから保存してください。</p><p id="operator-status" class="account-response-status" role="status" aria-live="polite">${e(status || (busy ? '処理しています…' : ''))}</p><div id="operator-feedback">${feedback(error, e)}</div>
    <div id="operator-stats" class="operator-stats"><div><span>登録プレイヤー</span><strong>${formatNumber(stats.totalPlayers)}</strong></div><div><span>進行中の対戦</span><strong>${formatNumber(stats.activeBattles)}</strong></div><div><span>現在オンライン</span><strong id="operator-online-count">${formatNumber(stats.onlinePlayers)}</strong></div><div><span>過去24時間のログイン</span><strong id="operator-recent-login-count">${formatNumber(stats.recentLogins24h)}</strong></div></div>
    ${presenceSection({ rows: snapshot.onlinePlayers, total: stats.onlinePlayers, onlineOnly: true, e, i })}
    ${presenceSection({ rows: snapshot.recentLogins, total: stats.recentLogins24h, onlineOnly: false, e, i })}
    <details class="operator-section" open><summary>${i('book')}<span>お知らせ・メンテナンス</span></summary><div class="operator-section-body"><label class="account-label" for="operator-notice">サイトのお知らせ <span>200文字まで</span></label><textarea id="operator-notice" class="account-input" maxlength="200" rows="3" placeholder="公開するお知らせを入力"${disabled(busy)}>${e(settings.notice || '')}</textarea><label class="operator-maintenance" for="operator-maintenance"><input id="operator-maintenance" type="checkbox"${settings.maintenance ? ' checked' : ''}${disabled(busy)}><span><strong>メンテナンス中として公開する</strong><small>切り替えは保存ボタンで反映されます。</small></span></label><button type="button" class="account-button primary" data-action="operator-save"${disabled(busy)}>設定を保存</button></div></details>
    <details class="operator-section"><summary>${i('book')}<span>システムメッセージを送る</span></summary><div class="operator-section-body"><label class="account-label" for="operator-message-title">タイトル <span>80文字まで</span></label><input id="operator-message-title" class="account-input" type="text" maxlength="80" autocomplete="off"${disabled(busy)}><label class="account-label" for="operator-message-body">本文 <span>1,000文字まで</span></label><textarea id="operator-message-body" class="account-input" rows="4" maxlength="1000"${disabled(busy)}></textarea>${audienceFields('operator-message', e, busy)}<button type="button" class="account-button primary" data-action="operator-message-send"${disabled(busy)}>システムメッセージを送信</button>${deliveryHistory(snapshot.messages, e)}</div></details>
    <details class="operator-section"><summary>${i('treasure')}<span>プレゼントを配布する</span></summary><div class="operator-section-body"><label class="account-label" for="operator-gift-title">タイトル <span>80文字まで</span></label><input id="operator-gift-title" class="account-input" type="text" maxlength="80" autocomplete="off"${disabled(busy)}><label class="account-label" for="operator-gift-body">メッセージ <span>1,000文字まで</span></label><textarea id="operator-gift-body" class="account-input" rows="3" maxlength="1000"${disabled(busy)}></textarea>${audienceFields('operator-gift', e, busy)}${rewardFields('operator-gift', null, e, busy)}<p class="account-field-help">プレイヤーは「お知らせ・プレゼント」から受け取れます。</p><button type="button" class="account-button primary" data-action="operator-gift-send"${disabled(busy)}>プレゼントを配布</button>${deliveryHistory(snapshot.gifts, e)}</div></details>
    <details class="operator-section"${eventDraft ? ' open' : ''}><summary>${i('spark')}<span>イベントを作成・公開する</span></summary><div class="operator-section-body"><div class="operator-event-form"><h3>${draft.id ? 'イベントを編集' : '新しいイベント'}</h3><input id="operator-event-id" type="hidden" value="${e(draft.id || '')}"><label class="account-label" for="operator-event-title">タイトル <span>80文字まで</span></label><input id="operator-event-title" class="account-input" type="text" maxlength="80" value="${e(draft.title || '')}" autocomplete="off"${disabled(busy)}><label class="account-label" for="operator-event-body">説明 <span>1,000文字まで</span></label><textarea id="operator-event-body" class="account-input" rows="3" maxlength="1000"${disabled(busy)}>${e(draft.body || '')}</textarea><div class="operator-date-grid"><div><label class="account-label" for="operator-event-start">開始日時 <span>日本時間</span></label><input id="operator-event-start" class="account-input" type="datetime-local" value="${localJst(draft.startAt)}"${disabled(busy)}></div><div><label class="account-label" for="operator-event-end">終了日時 <span>日本時間</span></label><input id="operator-event-end" class="account-input" type="datetime-local" value="${localJst(draft.endAt)}"${disabled(busy)}></div></div><label class="account-label" for="operator-event-status">公開状態</label><select id="operator-event-status" class="account-input"${disabled(busy)}>${Object.entries(TYPE_STATUS).map(([key, label]) => `<option value="${key}"${eventStatus === key ? ' selected' : ''}>${label}</option>`).join('')}</select><p class="account-field-help">公開中のイベントは開催期間に受取できます。終了する場合は「終了」を選んで保存してください。日時はすべて日本時間です。</p>${rewardFields('operator-event', draft, e, busy)}<button type="button" class="account-button primary" data-action="operator-event-save"${disabled(busy)}>${draft.id ? 'イベントを更新' : 'イベントを作成'}</button></div>${events.length ? `<div class="operator-event-list"><h4>登録済みイベント</h4>${events.map(event => `<article><div><span class="operator-state-tag">${e(TYPE_STATUS[event.status] || '状態確認中')}</span><h5>${e(event.title || 'タイトルなし')}</h5><p>${e(dateTime(event.startAt))} 〜 ${e(dateTime(event.endAt))}</p></div><button type="button" class="account-button compact" data-action="operator-event-edit" data-id="${e(event.id)}"${disabled(busy)}>編集する</button></article>`).join('')}</div>` : ''}</div></details>
    <details class="operator-section"><summary>${i('globe')}<span>最近のプレイヤー</span><b>${players.length}</b></summary><div class="operator-section-body">${players.length ? `<ul class="operator-player-list">${players.map(player => `<li><div class="operator-player-origin">${originImage(player.origin)}</div><div class="operator-player-copy"><strong>${e(player.nickname || player.name || 'プレイヤー')}</strong><code>${e(player.id || '')}</code><small>${e(knownOrigin(player.origin))}のオリジン</small></div><span class="operator-player-rating"><b>${formatNumber(player.rating)}</b><small>レート</small></span></li>`).join('')}</ul>` : '<p class="account-empty-inline">プレイヤーはまだ表示されていません。</p>'}</div></details>
    ${audit.length ? `<details class="operator-section"><summary>${i('book')}<span>最近の操作記録</span></summary><div class="operator-section-body"><ul class="operator-audit">${audit.map(row => `<li><strong>${e(row.action || '操作')}</strong><time>${e(dateTime(row.createdAt))}</time></li>`).join('')}</ul></div></details>` : ''}
  </div>`;
}

function eventPhase(event, now) {
  if (event?.status === 'ended' || (Number.isFinite(timestamp(event?.endAt)) && timestamp(event.endAt) <= now)) return ['ended', '終了'];
  if (Number.isFinite(timestamp(event?.startAt)) && timestamp(event.startAt) > now) return ['upcoming', '開催予定'];
  return event?.status === 'published' ? ['active', '開催中'] : ['unknown', '確認中'];
}

export function playerInboxView({ messages = [], gifts = [], events = [], esc, icon, busy = false, error = '', status = '', getCard } = {}) {
  const { e, i } = helpers(esc, icon), now = Date.now();
  const notices = newest(messages, 100), presents = newest(gifts, 100);
  const publicEvents = (Array.isArray(events) ? events : []).filter(event => event && event.status !== 'draft').slice(0, 50);
  const giftCards = presents.map(gift => {
    const claimed = Boolean(gift.claimedAt), expired = Number.isFinite(timestamp(gift.expiresAt)) && timestamp(gift.expiresAt) <= now;
    const canClaim = gift.claimable === true && !claimed && !expired;
    return `<article class="inbox-card${claimed ? ' is-claimed' : ''}"><div class="inbox-card-heading"><span class="inbox-item-kind">${i('treasure')}プレゼント</span><time>${e(dateTime(gift.createdAt))}</time></div><h4>${e(gift.title || 'プレゼント')}</h4><p class="inbox-body">${e(gift.body || '')}</p><div class="inbox-rewards">${rewards(gift, e, getCard)}</div><div class="inbox-card-footer"><small>${gift.expiresAt ? `受取期限 ${e(dateTime(gift.expiresAt))}` : '受取期限の指定なし'}</small><button type="button" class="account-button${canClaim ? ' primary' : ' quiet'}" data-action="inbox-claim" data-id="${e(gift.id)}"${disabled(busy || !canClaim)}>${claimed ? '受取済み' : expired ? '受取期間終了' : canClaim ? '受け取る' : '受取を確認中'}</button></div></article>`;
  }).join('');
  const eventCards = publicEvents.map(event => {
    const [phase, label] = eventPhase(event, now), claimed = Boolean(event.claimedAt);
    const canClaim = phase === 'active' && event.claimable === true && !claimed;
    return `<article class="inbox-card inbox-event${claimed ? ' is-claimed' : ''}"><div class="inbox-card-heading"><span class="inbox-event-phase phase-${phase}">${label}</span>${claimed ? '<span class="inbox-inline-status">受取済み</span>' : ''}</div><h4>${e(event.title || 'イベント')}</h4><p class="inbox-body">${e(event.body || '')}</p><p class="inbox-event-window">${e(dateTime(event.startAt))}<span>〜</span>${e(dateTime(event.endAt))}</p><div class="inbox-rewards">${rewards(event, e, getCard)}</div><div class="inbox-card-footer"><small>開催期間内に受取できます</small><button type="button" class="account-button${canClaim ? ' primary' : ' quiet'}" data-action="event-claim" data-id="${e(event.id)}"${disabled(busy || !canClaim)}>${claimed ? '受取済み' : phase === 'upcoming' ? '開催をお待ちください' : phase === 'ended' ? 'イベント終了' : canClaim ? '報酬を受け取る' : '受取を確認中'}</button></div></article>`;
  }).join('');
  const messageCards = notices.map(message => `<article class="inbox-card inbox-message"><div class="inbox-card-heading"><span class="inbox-item-kind">${i('book')}システムメッセージ</span><time>${e(dateTime(message.createdAt))}</time></div><h4>${e(message.title || 'お知らせ')}${!message.readAt ? '<span class="inbox-new">NEW</span>' : ''}</h4><p class="inbox-body">${e(message.body || '')}</p></article>`).join('');
  return `<div class="player-inbox"${busy ? ' aria-busy="true"' : ''}><div class="eyebrow">INBOX</div><h2>お知らせ・プレゼント</h2><p class="account-intro">運営からのメッセージと、あなたへのプレゼント。日時は日本時間です。</p><p id="inbox-status" class="account-response-status" role="status" aria-live="polite">${e(status || (busy ? '受信内容を確認しています…' : ''))}</p><div id="inbox-feedback">${feedback(error, e)}</div><section class="inbox-section"><div class="account-section-heading"><h3>プレゼント</h3><span>${presents.length}件</span></div>${giftCards || '<p class="inbox-empty">いま受け取れるプレゼントはありません。</p>'}</section><section class="inbox-section"><div class="account-section-heading"><h3>イベント</h3><span>${publicEvents.length}件</span></div>${eventCards || '<p class="inbox-empty">公開中のイベントはありません。</p>'}</section><section class="inbox-section"><div class="account-section-heading"><h3>お知らせ</h3><span>${notices.length}件</span></div>${messageCards || '<p class="inbox-empty">新しいメッセージはありません。</p>'}</section><p class="inbox-conversion-note">受取時に同じカードの所持数が3枚を超える分は、1枚につき5秘宝に変わります。</p></div>`;
}

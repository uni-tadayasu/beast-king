/**
 * Public battle history. The caller owns open state, focus, Escape and scroll restoration.
 * Render mode=panel in the desktop sidebar and mode=drawer after the duel's main element.
 * The drawer stays outside modalRoot and does not lock or resize the board.
 */
const HISTORY_LIMIT = 1000;
const EVENT_STYLES = Object.freeze({
  start: ['対戦開始', 'turn'],
  turn: ['ターン', 'turn'],
  summon: ['召喚', 'summon'],
  miracle: ['ミラクル', 'miracle'],
  fusion: ['合成', 'miracle'],
  gimmick: ['ギミック', 'gimmick'],
  set: ['設置', 'gimmick'],
  attack: ['攻撃', 'damage'],
  damage: ['ダメージ', 'damage'],
  heal: ['回復', 'heal'],
  buff: ['強化', 'heal'],
  shield: ['結界', 'heal'],
  defend: ['防御', 'heal'],
  destroy: ['消滅', 'damage'],
  cancel: ['無効', 'gimmick'],
  draw: ['手札補充', 'summon'],
  fatigue: ['デッキ切れ', 'damage'],
  result: ['対戦結果', 'result'],
  info: ['記録', 'info']
});
const defaultEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function battleLogView({ game, esc = defaultEscape, icon, open = false, mode = 'panel' } = {}) {
  const escape = typeof esc === 'function' ? esc : defaultEscape;
  const glyph = name => typeof icon === 'function' ? icon(name) : '';
  const drawer = mode === 'drawer';
  // A closed drawer has no duplicate records or focusable descendants.
  if (drawer && !open) return '<section id="battle-log-drawer" class="battle-log battle-log-drawer" hidden></section>';
  const raw = Array.isArray(game?.log) ? game.log : [];
  const entries = raw.slice(-HISTORY_LIMIT).filter(entry => typeof entry === 'string' || (entry && typeof entry.text === 'string'));
  const count = entries.length.toLocaleString('ja-JP');
  const id = drawer ? 'battle-log-drawer' : 'battle-log-panel';
  const records = entries.slice().reverse().map((entry, index) => {
    const event = typeof entry === 'string' ? { text: entry, type: 'info' } : entry;
    const [label, tone] = Object.hasOwn(EVENT_STYLES, event.type) ? EVENT_STYLES[event.type] : EVENT_STYLES.info;
    const turn = Number.isSafeInteger(event.turn) && event.turn > 0 ? `<span class="battle-log-turn">TURN ${event.turn}</span>` : '';
    return `<li class="battle-log-event battle-log-tone-${tone}${index === 0 ? ' is-latest' : ''}"><div class="battle-log-meta"><span class="battle-log-kind">${label}</span>${turn}${index === 0 ? '<span class="battle-log-latest">最新</span>' : ''}</div><p>${escape(event.text)}</p></li>`;
  }).join('');
  const empty = `<div class="battle-log-empty"><span aria-hidden="true">${glyph('book')}</span><strong>まだ履歴がありません</strong><p>カードの発動や効果、<br>ターンの進行をここに記録します。</p></div>`;
  return `<section id="${id}" class="battle-log ${drawer ? 'battle-log-drawer' : 'battle-log-panel'}" aria-labelledby="${id}-title"${drawer ? ' role="dialog" aria-modal="false" tabindex="-1"' : ''}>
    <header class="battle-log-header"><div class="battle-log-title-group"><span class="battle-log-mark" aria-hidden="true">${glyph('book')}</span><div><h2 id="${id}-title">効果ログ <span class="battle-log-count">${count}</span></h2><p>この対戦の履歴 · 新しい順</p></div></div>${drawer ? `<button type="button" class="battle-log-close" data-action="toggle-battle-log" data-open="false" aria-label="効果ログを閉じる"><span aria-hidden="true">${glyph('close')}</span><span>閉じる</span></button>` : ''}</header>
    <div id="${id}-scroll" class="battle-log-scroll" data-battle-log-scroll="${drawer ? 'drawer' : 'panel'}" tabindex="0" aria-label="対戦履歴、新しい順">${records ? `<ol class="battle-log-entries">${records}</ol>` : empty}</div>
    <footer class="battle-log-footer"><span>直近1,000件までの履歴</span>${drawer ? '<button type="button" class="battle-log-return" data-action="toggle-battle-log" data-open="false">対戦に戻る</button>' : '<span class="battle-log-scroll-hint">ページ送りで確認</span>'}</footer>
  </section>`;
}

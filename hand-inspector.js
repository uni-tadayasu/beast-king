/**
 * Local hand reference only. Insert once, before .arena in .duel-layout.
 * The caller owns inspection selection, drawer state, focus and game actions.
 * This renderer reads player 0's hand; it never reads an opponent's cards.
 */
const defaultEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ORIGIN_IDS = new Set(['mountain', 'river', 'seed', 'grass', 'flower', 'tree', 'king']);
const FALLBACK_TYPES = Object.freeze({ beast: '魔獣', fusion: '合成魔獣', miracle: 'ミラクル', gimmick: 'ギミック' });

export function handInspectorView({ game, selected, esc = defaultEscape, icon, getCard, elementMap = {}, TYPE_LABELS = {}, MODEL_LABELS = {}, open = false } = {}) {
  const escape = typeof esc === 'function' ? esc : defaultEscape;
  const glyph = name => typeof icon === 'function' ? icon(name) : '';
  const ownHand = game?.players?.[0]?.hand;
  const hand = Array.isArray(ownHand) ? ownHand.slice(0, 4) : [];
  const cards = hand.map(id => typeof getCard === 'function' ? getCard(id) : null);
  const selectedIndex = selected?.kind === 'play' && Number.isInteger(selected.index) && selected.index >= 0 && selected.index < hand.length ? selected.index : 0;
  const card = cards[selectedIndex];
  const number = value => Number.isFinite(value) ? value.toLocaleString('ja-JP') : '—';
  const choices = cards.map((c, index) => `<button type="button" class="hand-inspector-choice${index === selectedIndex ? ' active' : ''}" data-action="hand" data-index="${index}" data-hand-inspection="true" aria-pressed="${index === selectedIndex}" aria-controls="hand-effects-scroll" aria-label="${escape(`手札${index + 1}、${c?.name || 'カード'}の効果を見る`)}"${!c ? ' disabled' : ''}><span class="hand-inspector-number">${index + 1}</span><span class="hand-inspector-choice-cost">${glyph('energy')}<span>${number(c?.cost)}</span></span></button>`).join('');
  let content;
  if (card) {
    const origin = elementMap?.[card.element] || {};
    const originId = ORIGIN_IDS.has(card.element) ? card.element : '';
    const originColour = /^#[\da-f]{6}$/i.test(origin.color || '') ? origin.color : '#c6b1ef';
    const beast = card.type === 'beast' || card.type === 'fusion';
    const type = TYPE_LABELS?.[card.type] || FALLBACK_TYPES[card.type] || 'カード';
    const typeIcon = beast ? 'beast' : card.type === 'miracle' ? 'spark' : 'trap';
    const model = MODEL_LABELS?.[card.model] || '';
    content = `<article class="hand-inspector-card" data-inspected-card="${escape(card.id || hand[selectedIndex])}">
      <p class="hand-inspector-card-position">手札 ${selectedIndex + 1} / ${hand.length}</p>
      <h3>${escape(card.name || 'カード')}</h3>
      <div class="hand-inspector-meta"><span class="hand-inspector-origin" style="--hand-origin:${originColour}">${originId ? `<img src="assets/profiles/${originId}.svg" alt="" width="24" height="24">` : ''}<span>${escape(origin.name || card.element || 'オリジン未設定')}</span></span><span class="hand-inspector-type">${glyph(typeIcon)}${escape(type)}</span></div>
      ${model ? `<p class="hand-inspector-model">${escape(model)}</p>` : ''}
      <dl class="hand-inspector-stats${beast ? ' has-combat' : ''}"><div><dt>${glyph('energy')}コスト</dt><dd>${number(card.cost)}</dd></div>${beast ? `<div><dt>${glyph('sword')}攻撃力</dt><dd>${number(card.attack)}</dd></div><div><dt>${glyph('shield')}守備力</dt><dd>${number(card.hp)}</dd></div>` : ''}</dl>
      <section class="hand-inspector-effect" aria-labelledby="hand-effect-title"><h4 id="hand-effect-title">カード効果</h4><p>${escape(card.text || 'このカードには追加の効果がありません。')}</p></section>
    </article>`;
  } else {
    content = `<div class="hand-inspector-empty"><span aria-hidden="true">${glyph('cards')}</span><strong>${hand.length ? 'カード情報を確認できません' : '手札がありません'}</strong><p>${hand.length ? '別の手札を選んでください。' : '手札が補充されると、<br>ここで効果を確認できます。'}</p></div>`;
  }
  return `<aside id="hand-effects-panel" class="hand-inspector" data-open="${Boolean(open)}" aria-labelledby="hand-inspector-title" tabindex="-1">
    <header class="hand-inspector-header"><div class="hand-inspector-heading"><span class="hand-inspector-mark" aria-hidden="true">${glyph('cards')}</span><div><h2 id="hand-inspector-title">手札の効果</h2><span class="hand-inspector-private">自分だけに表示</span></div></div><button type="button" class="hand-inspector-close" data-action="toggle-hand-effects" data-open="false" aria-label="手札の効果を閉じる"><span aria-hidden="true">${glyph('close')}</span><span>閉じる</span></button></header>
    ${choices ? `<div class="hand-inspector-switcher" role="group" aria-label="効果を確認する自分の手札">${choices}</div>` : ''}
    <div id="hand-effects-scroll" class="hand-inspector-scroll" data-hand-inspector-scroll tabindex="0" aria-label="選んだ手札のカード効果">${content}</div>
    <footer class="hand-inspector-footer">自分だけに表示 · 相手ターン中も確認できます。</footer>
  </aside>`;
}

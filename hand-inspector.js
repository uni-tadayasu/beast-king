/** Read-only battle reference. Own private cards and public battlefield /
 * graveyard cards only. Never resolve an opponent's hand or face-down traps. */
const defaultEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ORIGIN_IDS = new Set(['mountain', 'river', 'seed', 'grass', 'flower', 'tree', 'king']);
const FALLBACK_TYPES = Object.freeze({ beast: '魔獣', fusion: '合成魔獣', miracle: 'ミラクル', gimmick: 'ギミック' });

const ZONES=Object.freeze([['hand','手札'],['field','魔獣'],['gimmick','ギミック'],['miracle','ミラクル']]);
const ownName=i=>i===0?'自分':'相手';
function referenceEntries(game,zone,getCard){
  const out=[];
  const add=(id,key,label,unit=null)=>{
    if(typeof id!=='string'||!id)return;
    const card=typeof getCard==='function'?getCard(id):null;
    if(card)out.push({card,key,label,unit});
  };
  for(const i of [0,1]){
    const player=game?.players?.[i];if(!player)continue;
    if(zone==='field'){
      for(const u of player.field||[])if(u?.cardId)add(u.cardId,i+':'+String(u.uid),ownName(i)+'・召喚中',u);
      continue;
    }
    if(zone==='gimmick'&&i===0){
      for(const t of player.traps||[])if(t?.cardId)add(t.cardId,'0:trap:'+String(t.uid),'自分・設置中');
    }
    if(zone==='miracle'&&player.lastMiracle)add(player.lastMiracle,i+':last',ownName(i)+'・直前の発動');
    // The grave is public for both seats; a used spell remains there.
    // Omit the single duplicate of the most recently played miracle.
    let skipLast=zone==='miracle';
    const grave=Array.isArray(player.grave)?player.grave:[];
    for(let n=grave.length-1;n>=0;n--){
      const id=grave[n];
      if(typeof id!=='string'||!id)continue;
      const card=typeof getCard==='function'?getCard(id):null;
      if(!card||card.type!==zone)continue;
      if(skipLast&&id===player.lastMiracle){skipLast=false;continue;}
      out.push({card,key:i+':grave:'+n+':'+id,label:ownName(i)+'・使用済み',unit:null});
    }
  }
  return out;
}

export function handInspectorView({ game, selected, esc = defaultEscape, icon, getCard, getCardCost, elementMap = {}, TYPE_LABELS = {}, MODEL_LABELS = {}, open = false } = {}) {
  const escape = typeof esc === 'function' ? esc : defaultEscape;
  const glyph = name => typeof icon === 'function' ? icon(name) : '';
  const zone=selected?.kind==='reference'&&ZONES.some(([id])=>id===selected.zone)?selected.zone:'hand';
  const ownHand = game?.players?.[0]?.hand;
  const hand = zone==='hand'&&Array.isArray(ownHand) ? ownHand.slice(0, 4) : [];
  const cards = hand.map(id => typeof getCard === 'function' ? getCard(id) : null);
  const selectedIndex = selected?.kind === 'play' && Number.isInteger(selected.index) && selected.index >= 0 && selected.index < hand.length ? selected.index : 0;
  const entries=zone==='hand'?[]:referenceEntries(game,zone,getCard);
  const entry=entries.find(e=>e.key===selected?.key)||entries[0];
  const card=zone==='hand'?cards[selectedIndex]:entry?.card;
  const currentUnit=entry?.unit;
  const tabs=ZONES.map(([id,label])=>`<button type="button" class="battle-effect-tab" data-action="inspect-effect-zone" data-zone="${id}" aria-pressed="${zone===id}">${label}</button>`).join('');
  const referencePicker=entries.length?`<label class="battle-effect-picker"><span>確認するカード · ${entries.length}枚</span><select data-change="inspect-battle-card" aria-label="効果を確認するカード">${entries.map(e=>`<option value="${escape(e.key)}"${entry?.key===e.key?' selected':''}>${escape(e.label+'｜'+e.card.name)}</option>`).join('')}</select></label>`:'';
  const emptyLabels={field:'召喚中の魔獣はいません',gimmick:'確認できるギミックはありません',miracle:'発動済みのミラクルはありません'};
  const number = value => Number.isFinite(value) ? value.toLocaleString('ja-JP') : '—';
  const cost = c => zone==='hand'&&c&&typeof getCardCost==='function'?getCardCost(game,c,0):c?.cost;
  const choices = cards.map((c, index) => `<button type="button" class="hand-inspector-choice${index === selectedIndex ? ' active' : ''}" data-action="hand" data-index="${index}" data-hand-inspection="true" aria-pressed="${index === selectedIndex}" aria-controls="hand-effects-scroll" aria-label="${escape(`手札${index + 1}、${c?.name || 'カード'}の効果を見る`)}"${!c ? ' disabled' : ''}><span class="hand-inspector-number">${index + 1}</span><span class="hand-inspector-choice-cost">${glyph('energy')}<span>${number(cost(c))}</span></span></button>`).join('');
  let content;
  if (card) {
    const origin = elementMap?.[card.element] || {};
    const originId = ORIGIN_IDS.has(card.element) ? card.element : '';
    const originColour = /^#[\da-f]{6}$/i.test(origin.color || '') ? origin.color : '#c6b1ef';
    const beast = card.type === 'beast' || card.type === 'fusion';
    const type = TYPE_LABELS?.[card.type] || FALLBACK_TYPES[card.type] || 'カード';
    const typeIcon = beast ? 'beast' : card.type === 'miracle' ? 'spark' : 'trap';
    const model = MODEL_LABELS?.[card.model] || '';
    content = `<article class="hand-inspector-card" data-inspected-card="${escape(card.id || hand[selectedIndex])}" data-inspected-zone="${zone}">
      <p class="hand-inspector-card-position">${zone==='hand'?`手札 ${selectedIndex + 1} / ${hand.length}`:escape(entry.label)}</p>
      <h3>${escape(card.name || 'カード')}</h3>
      <div class="hand-inspector-meta"><span class="hand-inspector-origin" style="--hand-origin:${originColour}">${originId ? `<img src="assets/profiles/${originId}.svg" alt="" width="24" height="24">` : ''}<span>${escape(origin.name || card.element || 'オリジン未設定')}</span></span><span class="hand-inspector-type">${glyph(typeIcon)}${escape(type)}</span></div>
      ${model ? `<p class="hand-inspector-model">${escape(model)}</p>` : ''}
      <dl class="hand-inspector-stats${beast ? ' has-combat' : ''}"><div><dt>${glyph('energy')}コスト</dt><dd>${number(cost(card))}</dd></div>${beast ? `<div><dt>${glyph('sword')}攻撃力</dt><dd>${number(currentUnit?.attack??card.attack)}</dd></div><div><dt>${glyph('shield')}守備力</dt><dd>${number(currentUnit?.hp??card.hp)}</dd></div>` : ''}</dl>
      <section class="hand-inspector-effect" aria-labelledby="hand-effect-title"><h4 id="hand-effect-title">カード効果</h4><p>${escape(card.text || 'このカードには追加の効果がありません。')}</p></section>
    </article>`;
  } else {
    content = `<div class="hand-inspector-empty"><span aria-hidden="true">${glyph('cards')}</span><strong>${zone==='hand'?(hand.length?'カード情報を確認できません':'手札がありません'):emptyLabels[zone]}</strong><p>${zone==='hand'?(hand.length?'別の手札を選んでください。':'手札が補充されると、<br>ここで効果を確認できます。'):'他の分類のカード効果も確認できます。'}</p></div>`;
  }
  return `<aside id="hand-effects-panel" class="hand-inspector" data-open="${Boolean(open)}" aria-labelledby="hand-inspector-title" tabindex="-1">
    <header class="hand-inspector-header"><div class="hand-inspector-heading"><span class="hand-inspector-mark" aria-hidden="true">${glyph('cards')}</span><div><h2 id="hand-inspector-title">カード効果</h2><span class="hand-inspector-private">自分だけに表示</span></div></div><button type="button" class="hand-inspector-close" data-action="toggle-hand-effects" data-open="false" aria-label="カード効果を閉じる"><span aria-hidden="true">${glyph('close')}</span><span>閉じる</span></button></header>
    <div class="battle-effect-controls"><nav class="battle-effect-tabs" aria-label="カード効果の分類">${tabs}</nav>
    ${zone==='hand'?(choices?`<div class="hand-inspector-switcher" role="group" aria-label="効果を確認する自分の手札">${choices}</div>`:''):referencePicker}</div>
    <div id="hand-effects-scroll" class="hand-inspector-scroll" data-hand-inspector-scroll tabindex="0" aria-label="選んだカードの効果">${content}</div>
    <footer class="hand-inspector-footer">自分だけに表示 · 相手の未公開カードは表示しません。</footer>
  </aside>`;
}

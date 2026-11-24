import {getDeckPreset} from './catalog.js?v=20261124-31';
import { CAMPAIGN_CHAPTERS, CAMPAIGN_BATTLES, CAMPAIGN_TOTAL_BATTLES, normalizeCampaignProgress, getCampaignBattle, getNextCampaignBattle, isCampaignBattleUnlocked } from './campaign.js?v=20261124-31';

/** Dedicated mode screens. State and actions remain in app.js. */
export function soloView({ section='campaign', mapPage=null, data = {}, game, difficulty = 'normal', cpuDeckId = 'random', campaignProgress, campaignBattleId, LEVELS = {}, STARTER_DECKS = [], elementMap = {}, icon, esc, title } = {}) {
  const escape = typeof esc === 'function' ? esc : value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const glyph = name => typeof icon === 'function' ? icon(name) : '';
  const levels = Object.keys(LEVELS).length ? LEVELS : {
    easy: { name: '見習い', caption: 'ゆっくり覚える' },
    normal: { name: '策士', caption: '読み合いを楽しむ' },
    hard: { name: '覇王', caption: '腕を試す' },
  };
  const selectedLevel = Object.hasOwn(levels, difficulty) ? difficulty : 'normal';
  const level = levels[selectedLevel] || Object.values(levels)[0];
  const mainCount = Array.isArray(data.deckIds) ? data.deckIds.length : 0;
  const specialCount = Array.isArray(data.specialIds) ? data.specialIds.length : 0;
  const ready = mainCount === 32 && specialCount === 4;
  const resumable = game && game.winner === null;
  const progress = normalizeCampaignProgress(campaignProgress ?? data.campaignProgress);
  const cleared = new Set(progress.clearedBattleIds);
  const nextBattle = getNextCampaignBattle(progress);
  const requestedBattle = getCampaignBattle(campaignBattleId);
  const selectedBattle = requestedBattle && isCampaignBattleUnlocked(progress, requestedBattle.id)
    ? requestedBattle : nextBattle || CAMPAIGN_BATTLES.at(-1);
  const selectedDeck = getDeckPreset(selectedBattle.cpuDeckId);
  const selectedOrigin = elementMap[selectedDeck?.element];
  const chapterPage = mapPage===0||mapPage===1?mapPage:Math.floor((selectedBattle.chapter-1)/5);
  const selectedCleared = cleared.has(selectedBattle.id);
  const resumedBattle = getCampaignBattle(game?.campaignBattleId);
  const playerDeck = `<section class="solo-player-deck" aria-label="使用するデッキ"><span class="solo-deck-symbol" aria-hidden="true">${glyph('cards')}</span><div class="solo-deck-copy"><small>YOUR DECK</small><strong>${escape(data.deckName || '使用するデッキ')}</strong><p><span class="${mainCount === 32 ? 'ready' : 'incomplete'}">通常 <b>${mainCount}</b>/32枚</span><span class="${specialCount === 4 ? 'ready' : 'incomplete'}">特殊 <b>${specialCount}</b>/4枚</span></p></div><button class="text-button" data-nav="deck" aria-label="使用デッキを編集">編集</button></section>`;
  const heading = typeof title === 'function'
    ? title('SOLO CHRONICLE', 'ソロモード', '全10章、各章2回戦。あなたの36枚で、二十の試練へ。', `${cleared.size} / 20 クリア`)
    : '<div class="page-title"><div><div class="page-label">SOLO CHRONICLE</div><h1>ソロモード</h1><p>全10章、各章2回戦。あなたの36枚で、二十の試練へ。</p></div></div>';

  return `<div id="solo" class="solo-mode">
    ${heading}
    <div class="product-section-tabs"><button data-action="solo-section" data-section="campaign" class="${section==='campaign'?'active':''}" aria-pressed="${section==='campaign'}">${glyph('crown')}王冠への旅</button><button data-action="solo-section" data-section="practice" class="${section==='practice'?'active':''}" aria-pressed="${section==='practice'}">${glyph('sword')}練習対戦</button></div>
    ${resumable ? `<section class="solo-resume" aria-label="中断しているソロ対戦">
      <span class="solo-resume-icon" aria-hidden="true">${glyph('pause')}</span>
      <div><strong>続きから、もう一手。</strong><p>${resumedBattle ? `第${resumedBattle.chapter}章・第${resumedBattle.round}回戦 · ` : '練習戦 · '}${escape(game.playerDeckName || data.deckName || '使用中のデッキ')} · ${escape(game.turn || 1)}ターン目</p></div>
      <button class="btn" data-action="resume">${glyph('sword')}対戦を再開</button>
    </section>` : ''}
    <div class="solo-campaign-sheet" ${section==='campaign'?'':'hidden'}><section class="campaign-overview" aria-label="ソロモードの進行">
      <div class="campaign-emblem" aria-hidden="true">${glyph(cleared.size === CAMPAIGN_TOTAL_BATTLES ? 'trophy' : 'crown')}</div>
      <div class="campaign-overview-copy"><span>THE ROAD TO THE CROWN</span><h2>${cleared.size === CAMPAIGN_TOTAL_BATTLES ? '二十の試練を、その手に。' : '六源を巡る、王冠への旅。'}</h2><p>${cleared.size === CAMPAIGN_TOTAL_BATTLES ? '全10章をクリアしました。どの戦にも、もう一度挑めます。' : '勝利するたびに、次の一戦が開かれる。クリアした戦は、何度でも。'}</p></div>
      <div class="campaign-progress"><div><span>クリアした戦</span><strong>${cleared.size}<small> / ${CAMPAIGN_TOTAL_BATTLES}</small></strong></div><div class="campaign-progress-track" role="progressbar" aria-label="ソロ全20戦の進行" aria-valuemin="0" aria-valuemax="20" aria-valuenow="${cleared.size}"><i style="width:${cleared.size / CAMPAIGN_TOTAL_BATTLES * 100}%"></i></div><small>${Math.floor(cleared.size / 2)} / 10章をクリア</small></div>
    </section>
    <div class="campaign-layout">
      <section class="campaign-map" aria-labelledby="campaign-map-heading"><div class="campaign-map-heading"><h2 id="campaign-map-heading">十章の道標</h2><div class="campaign-map-pages" aria-label="章を切り替える">${[0,1].map(n=>`<button data-action="campaign-map-page" data-page="${n}" class="${chapterPage===n?'active':''}" aria-pressed="${chapterPage===n}">第${n*5+1}〜${n*5+5}章</button>`).join('')}</div></div><ol class="campaign-chapters">${CAMPAIGN_CHAPTERS.map(chapter => {
        const chapterClears = chapter.battles.filter(battle => cleared.has(battle.id)).length;
        const current = chapter.number === selectedBattle.chapter;
        const unlocked = isCampaignBattleUnlocked(progress, chapter.battles[0].id);
        return `<li ${Math.floor((chapter.number-1)/5)===chapterPage?'':'hidden'} class="campaign-chapter${current ? ' current' : ''}${chapterClears === 2 ? ' cleared' : ''}${!unlocked ? ' locked' : ''}"><div class="campaign-chapter-heading"><span class="campaign-chapter-number">${String(chapter.number).padStart(2, '0')}</span><div><small>第${chapter.number}章</small><h3>${escape(chapter.title)}</h3></div><span class="campaign-chapter-score" aria-label="${chapterClears}勝、全2戦">${chapterClears === 2 ? glyph('check') : `${chapterClears}<small>/2</small>`}</span></div><div class="campaign-rounds">${chapter.battles.map(battle => {
          const battleCleared = cleared.has(battle.id), battleUnlocked = isCampaignBattleUnlocked(progress, battle.id), selected = selectedBattle.id === battle.id;
          return `<button type="button" class="campaign-round${selected ? ' selected' : ''}${battleCleared ? ' cleared' : ''}" data-action="campaign-select" data-battle="${battle.id}" aria-pressed="${selected}" aria-label="第${chapter.number}章 第${battle.round}回戦 ${escape(battle.title)} ${battleCleared ? 'クリア済み・再戦可能' : battleUnlocked ? '挑戦できます' : '前の戦に勝つと解放'}"${battleUnlocked ? '' : ' disabled'}><span>第${battle.round}回戦 <i>${battleCleared ? glyph('check') : battleUnlocked ? '挑戦可' : '未解放'}</i></span><strong>${escape(battle.title)}</strong></button>`;
        }).join('')}</div></li>`;
      }).join('')}</ol></section>
      <aside class="campaign-focus" aria-labelledby="campaign-battle-title">
        <div class="campaign-focus-art" aria-hidden="true"><span>${glyph(selectedCleared ? 'trophy' : 'sword')}</span></div>
        <div class="campaign-focus-content"><div class="campaign-focus-label"><span>第${selectedBattle.chapter}章 · 第${selectedBattle.round}回戦</span><b>${selectedCleared ? 'クリア済み' : '次の挑戦'}</b></div><p class="campaign-focus-chapter">${escape(selectedBattle.chapterTitle)}</p><h2 id="campaign-battle-title">${escape(selectedBattle.title)}</h2><p class="campaign-battle-description">${escape(selectedBattle.description)}</p>
          <div class="campaign-opponent"><span class="campaign-opponent-avatar" aria-hidden="true">${glyph('beast')}</span><div><small>対戦相手</small><strong>${escape(selectedBattle.opponentName)}</strong></div><span class="campaign-level ${selectedBattle.difficulty}">${escape(levels[selectedBattle.difficulty]?.name || selectedBattle.difficulty)}</span></div>
          <dl class="campaign-battle-details"><div><dt>相手のデッキ</dt><dd>${escape(selectedDeck?.name || selectedBattle.cpuDeckId)}</dd></div><div><dt>オリジン</dt><dd>${escape(selectedOrigin?.name || '—')}</dd></div></dl>
          ${playerDeck}
          <button type="button" class="btn primary campaign-start" data-action="campaign-start" data-battle="${selectedBattle.id}"${ready ? '' : ' disabled'}>${glyph('sword')}<span>${selectedCleared ? 'もう一度、挑戦する' : 'この戦に挑戦する'}</span></button>
          <p class="campaign-start-note">${!ready ? '通常32枚・特殊4枚に整えてから挑戦できます。' : resumable ? '開始すると、中断中のソロ対戦は置き換わります。' : selectedCleared ? '再戦しても、クリアした進行はそのままです。' : '勝利で次の戦へ。敗北・引き分け・投了は再挑戦。'}</p>
        </div>
      </aside>
    </div>
    </div><section class="solo-practice" ${section==='practice'?'':'hidden'} aria-labelledby="solo-practice-title">
      <div class="solo-practice-heading"><span class="solo-practice-symbol" aria-hidden="true">${glyph('book')}</span><div><span class="eyebrow">FREE PRACTICE</span><h2 id="solo-practice-title">自由な一戦で、腕を磨く。</h2><p>相手と強さを選べる練習戦。章の進行には影響しません。</p></div></div>
      <div class="solo-preparation">
        <fieldset class="solo-difficulty">
          <legend>CPUの強さ</legend>
          <div class="solo-level-grid">${Object.entries(levels).map(([id, item], index) => `<button type="button" class="solo-level${selectedLevel === id ? ' selected' : ''}" data-action="difficulty" data-level="${escape(id)}" aria-pressed="${selectedLevel === id}"><span class="solo-level-symbol" aria-hidden="true">${glyph(['book', 'sword', 'crown'][index] || 'sword')}</span><strong>${escape(item.name)}</strong><small>${escape(item.caption)}</small><span class="solo-level-check" aria-hidden="true">${glyph('check')}</span></button>`).join('')}</div>
        </fieldset>
        <div class="solo-opponent-choice"><label for="cpu-deck">対戦相手のデッキ</label><select id="cpu-deck" data-change="cpu-deck"><option value="random"${cpuDeckId === 'random' ? ' selected' : ''}>おまかせ — 4つの戦略から</option>${STARTER_DECKS.map(deck => `<option value="${escape(deck.id)}"${cpuDeckId === deck.id ? ' selected' : ''}>${escape(deck.name)}${elementMap[deck.element]?.name ? ` — ${escape(elementMap[deck.element].name)}` : ''}</option>`).join('')}</select></div>
        <div class="solo-practice-actions"><button type="button" class="btn solo-start" data-action="start-game"${ready ? '' : ' disabled'}>${glyph('sword')}<span>${escape(level.name)}と練習する</span></button><p class="solo-start-note">${!ready ? '通常32枚・特殊4枚に整えてから開始できます。' : '練習戦も中断して、あとから再開できます。'}</p></div>
      </div>
    </section>
    <div class="solo-bottom-note"><span>${glyph('book')}カードの一手を、じっくり確かめる場所。</span><button class="text-button" data-nav="rules">遊び方を見る</button></div>
  </div>`;
}

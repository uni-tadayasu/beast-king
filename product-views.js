import {STARTER_DECKS,getDeckPreset,getCard,ELEMENTS,CARDS} from './catalog.js';
import {PACKS,getPack,EXTRA_COPY_TREASURE,RARITY_ODDS,GUARANTEED_RARITY_ODDS} from './shop.js';

export function homeDashboard({data,game,icon,esc,fmt,cardMarkup,counts}={}) {
  const expansion=getPack('BK02'),stat=counts(data.deckIds),preset=getDeckPreset(data.starter);
  const originCounts=data.deckIds.reduce((totals,id)=>{const origin=getCard(id)?.origin;if(origin)totals[origin]=(totals[origin]||0)+1;return totals;},{});
  const originId=preset?.element||(data.deckIds.includes('B0512')?'king':Object.keys(originCounts).sort((a,b)=>originCounts[b]-originCounts[a])[0]);
  const origin=ELEMENTS.find(e=>e.id===originId)||ELEMENTS[0];
  return `<div class="product-home">
      <div class="home-mode-rail" role="group" aria-label="対戦モードを選択">${[['solo','sword','SOLO CHRONICLE','ソロモード','全10章・20の試練'],['multi','users','FRIEND MATCH','ルーム対戦','合言葉でつながる決闘'],['rank','crown','RANKED MATCH','ランクマッチ','磨いた戦略で王座へ']].map(([id,ic,en,jp,caption])=>`<button class="home-mode home-mode-${id}" data-action="${id}-mode"><i>${icon(ic)}</i><span><small>${en}</small><strong>${jp}</strong><em>${caption}</em></span></button>`).join('')}</div>
    <section class="home-showcase" aria-labelledby="court-title">
      <div class="home-scenery" aria-hidden="true"></div>
      <div class="home-intro"><p class="court-kicker">THE SEVEN ORIGINS</p><h1 id="court-title">七つの源。<br><em>君だけの王道。</em></h1><p>魔獣を集め、36枚に想いを込める。<br>ようこそ、${esc(data.playerName)}。</p><div class="home-edition"><span>第二弾</span><strong>${expansion.name}</strong><small>NEW 1,152 CARDS</small></div></div>
      <div class="home-card-fan" aria-label="注目のカード">${['B0001','B0512','F0001'].map(id=>cardMarkup(getCard(id),{classes:'home-featured-card',artContext:id==='B0512'&&data.activeDeckId==='operator-kirahara-v1'&&data.deckIds.includes(id)?'active':'public'})).join('')}</div>
    </section>
    <aside class="home-command">
      <section class="home-deckbox" style="--deck-accent:${origin.color}" aria-label="使用中のデッキ"><div class="home-deck-top"><span>YOUR BATTLE DECK</span>${icon('origin-'+origin.id)}</div><h2>${esc(data.deckName)}</h2><div class="home-deck-count"><span><b>${data.deckIds.length}</b>通常</span><i>＋</i><span><b>${data.specialIds.length}</b>特殊</span></div><p>魔獣 ${stat.beast} · ミラクル ${stat.miracle} · ギミック ${stat.gimmick}</p><button class="btn" data-nav="deck">${icon('cards')}デッキを編成</button></section>
      ${game&&game.winner===null?`<button class="home-resume" data-action="resume">${icon('pause')}<span>中断した対戦を再開<small>${game.turn}ターン目から</small></span></button>`:''}
      <div class="home-shortcuts"><button data-nav="collection">${icon('book')}<span>カード図鑑<small>全${CARDS.length.toLocaleString('ja-JP')}枚の出会い</small></span></button><button data-action="starter-packs">${icon('cards')}<span>4つのスターター<small>好きな戦略から始める</small></span></button><button data-nav="shop">${icon('treasure')}<span>秘宝ショップ<small>12枚入りパックを開封</small></span></button></div>
      <div class="home-record"><span>対戦<b>${fmt(data.stats.played)}</b></span><span>勝利<b>${fmt(data.stats.won)}</b></span><button data-nav="rules">${icon('info')}遊び方</button></div>
    </aside>
    <section class="home-originbar" aria-label="オリジン別のカード図鑑"><div><small>SEVEN ORIGINS</small><strong>君を呼ぶ、七つの源。</strong></div><nav>${ELEMENTS.map(e=>`<button style="--origin-color:${e.color}" data-action="home-origin" data-origin="${e.id}" aria-label="${e.name}のカード図鑑を見る">${icon('origin-'+e.id)}<strong>${e.name}</strong></button>`).join('')}</nav></section>
  </div>`;
}

const starterNotes={
  'star-crown':['守り、癒し、反撃する。','結界と回復で戦線を支える、星の守護者たち。'],
  'azure-memory':['潮のように、流れをつかむ。','手札と守備を整え、好機を待つ蒼海の魔獣たち。'],
  'crimson-pulse':['攻めるほど、熱くなる。','力強い魔獣とミラクルで、勝機を切り開く。'],
  'sky-promise':['風のように、先手を打つ。','軽やかな展開と一手の工夫で、盤面を駆ける。']
};

export function treasureShop({data,section='boosters',packId='BK02',title,icon,esc,fmt,artStyle,collected}={}){
  const starters=section==='starters',pack=getPack(packId)||PACKS[0];
  return `<div class="product-shop">${title('TREASURE VAULT','秘宝ショップ','新しい一枚から、次の戦略が始まる。')}<div class="product-section-tabs" aria-label="ショップの種類">${PACKS.map(p=>`<button data-action="pack-select" data-pack="${p.id}" class="${!starters&&pack.id===p.id?'active':''}" aria-pressed="${!starters&&pack.id===p.id}">${icon(p.edition===2?'crown':'treasure')}<span>${p.editionLabel}<em>${p.name}</em></span></button>`).join('')}<button data-action="shop-section" data-section="starters" class="${starters?'active':''}" aria-pressed="${starters}">${icon('cards')}スターターパック <b>4</b></button></div>
  ${starters?`<div class="starter-shelf">${STARTER_DECKS.map((deck,i)=>{const card=getCard(deck.ids[14]),origin=ELEMENTS.find(e=>e.id===deck.element),note=starterNotes[deck.id];return `<article class="starter-offer" style="--starter-accent:${origin?.color||'#d4b67b'}"><div class="starter-box starter-box-${i}" aria-hidden="true"><div class="starter-box-art" style="${artStyle(card)}"></div><div class="starter-box-brand">BEAST KING<small>STARTER DECK</small></div><span class="starter-box-seal">${icon('origin-'+deck.element)}</span><strong>${esc(deck.name)}</strong><em>32 MAIN + 4 SPECIAL</em></div><div class="starter-offer-copy"><p class="eyebrow">${esc(note[0])}</p><h2>${esc(deck.name)}</h2><p>${esc(note[1])}</p><div class="starter-contents"><span>通常32枚</span><span>特殊4枚</span><b>所持済み</b></div><button class="btn" data-action="starter-load" data-id="${deck.id}">${icon('cards')}デッキに読み込む</button></div></article>`;}).join('')}</div><p class="shop-footer-note">4種類とも必要なカードは最初から所持しています。読み込んだあと、デッキ編成で保存して使用できます。</p>`:
  `<div class="booster-layout"><section class="shop-stage"><div class="pack-display" aria-hidden="true"><div class="pack-foil pack-${pack.id}"><div class="pack-illustration" style="${artStyle(getCard(pack.coverId))}"></div><div class="pack-crest">${icon('crown')}</div><span>BEAST KING</span><small>${pack.edition===2?'SECOND':'FIRST'} EXPANSION · ${pack.id}</small><strong>${pack.name}</strong><em>12 CARDS</em><i>山 · 川 · 種 · 草 · 花 · 木${pack.edition===2?' · 王':''}</i></div></div><div class="pack-offer"><span class="eyebrow">${pack.editionLabel} 拡張パック</span><h2>${pack.name}</h2><p class="pack-reading">${pack.reading}</p><p>${pack.description}</p><div class="pack-balance">${icon('treasure')}<span>所持秘宝<strong>${fmt(data.treasure)}</strong></span></div><button class="btn primary pack-buy" data-action="pack-open" data-pack="${pack.id}" ${data.treasure<pack.cost?'disabled':''}>${icon('treasure')}${pack.cost}秘宝で${pack.size}枚を開封</button><p class="pack-assurance">レア以上を1枚保証 · 同じカードは3枚まで所持<br>4枚目以降は1枚につき${EXTRA_COPY_TREASURE}秘宝に変わります。</p><div class="pack-collection">${pack.editionLabel}コレクション <b>${collected} / ${pack.cardCount.toLocaleString('ja-JP')}種類</b><i><span style="width:${collected/pack.cardCount*100}%"></span></i></div><button class="text-button" data-action="pack-odds" data-pack="${pack.id}">収録内容と排出率</button></div></section><aside class="shop-side"><article><span>${icon('sword')}</span><h3>戦うたび、次の出会いへ。</h3><p>勝利で60、敗北で20、引き分けで30秘宝。降参には報酬がありません。初回は100秘宝を受け取れます。</p><button class="btn" data-action="solo-mode">ソロモードへ</button></article><article><span>${icon('cards')}</span><h3>最初の36枚を選ぶ。</h3><p>4種類のスターターは、いつでも読み込みできます。自分だけのデッキへの第一歩に。</p><button class="text-button" data-action="shop-section" data-section="starters">スターターを見る</button></article>${data.lastPack?`<button class="last-pack-link" data-action="pack-results">${icon('book')}直前の12枚を見る</button>`:''}</aside></div>`}</div>`;
}

export function packOddsView({RARITY_LABELS,packId='BK02'}={}){
  const pack=getPack(packId)||PACKS[0];
  return `<div class="eyebrow">${pack.id} · ${pack.editionLabel}</div><h2>収録内容と排出率</h2><p class="modal-intro">「${pack.name}」は通常魔獣512枚、合成魔獣128枚、ミラクル256枚、ギミック256枚の合計1,152枚。同じレア度のカードは等確率です。</p><table class="product-odds-table"><thead><tr><th>レア度</th><th>通常11枠</th><th>確定1枠</th></tr></thead><tbody>${Object.entries(RARITY_ODDS).map(([r,p])=>`<tr><td>${RARITY_LABELS[r]}</td><td>${p}%</td><td>${GUARANTEED_RARITY_ODDS[r]?GUARANTEED_RARITY_ODDS[r].toFixed(2)+'%':'—'}</td></tr>`).join('')}</tbody></table><p class="keyword-help">1パック12枚。うち1枚はレア以上が確定しています。</p>`;
}

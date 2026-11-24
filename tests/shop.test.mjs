import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, CARD_MAP, CARD_SETS, STARTER_DECKS, EXPANSION_DECKS, RARITY_LABELS, getCardsForSet, FUSION_CARD_ID } from '../catalog.js';
import {PREMIUM_CARD_IDS,PREMIUM_SET_ADDITIONS} from '../premium-cards.js';
import {PREMIUM_DECK,PREMIUM_DECK_ID} from '../premium-deck.js';
import {treasureShop,packOddsView} from '../product-views.js';
import {
  PACKS, PACK_ID, PACK_NAME, PACK_DESCRIPTION, PACK_CARD_IDS, PACK_CARD_COUNT,
  PACK_COST, PACK_SIZE, STARTING_TREASURE, EXTRA_COPY_TREASURE,
  RARITY_ODDS, GUARANTEED_RARITY_ODDS,
  normalizeCollection, grantDeckCollection, createStarterCollection, hasStarterCards, quoteDeckRecipe, hasDeckRecipeCards, openPack, getBattleReward, STARTER_PRICE,quoteStarterPurchase,purchaseStarter,
} from '../shop.js';

const expectedTypes={
 BK01:{beast:516,fusion:128,miracle:257,gimmick:256},
 BK02:{beast:513,fusion:130,miracle:257,gimmick:256},
 BK03:{beast:513,fusion:128,miracle:258,gimmick:257},
 BK04:{beast:513,fusion:128,miracle:258,gimmick:257},
 BK05:{beast:48,fusion:8,miracle:24,gimmick:16},
};

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}

test('pack prices, guarantees, and advertised percentages are consistent', () => {
  assert.equal(PACK_ID, 'BK01');
  assert.equal(PACK_NAME, '六源の覚醒');
  assert.ok(PACK_DESCRIPTION.includes('1,157'));
  assert.ok(PACK_DESCRIPTION.includes('レガリア専用GGR5種追加'));
  assert.equal(PACK_CARD_COUNT, 1157);
  assert.equal(new Set(PACK_CARD_IDS).size, 1157);
  assert.equal(PACK_CARD_IDS.filter(id => CARD_MAP.get(id).type === 'fusion').length, 128);
  assert.equal(PACK_COST, 100);
  assert.equal(PACK_SIZE, 12);
  assert.equal(STARTING_TREASURE, 100);
  assert.equal(EXTRA_COPY_TREASURE, 5);
  assert.deepEqual(RARITY_ODDS, { N: 58, R: 25, KR: 10, KKR: 5, GR: 1.5, GGR: 0.5 });
  assert.equal(Object.values(RARITY_ODDS).reduce((a, b) => a + b, 0), 100);
  assert.equal(GUARANTEED_RARITY_ODDS.N, undefined);
  assert.ok(Math.abs(Object.values(GUARANTEED_RARITY_ODDS).reduce((a, b) => a + b, 0) - 100) < 1e-10);
  assert.ok(Math.abs(GUARANTEED_RARITY_ODDS.R - 25 / 42 * 100) < 1e-10);
});

test('all five products and odds views show their real pools and additional GGR counts',()=>{
 assert.equal(PACKS.length,5);
 for(const pack of PACKS){
  const cards=getCardsForSet(pack.id),types=expectedTypes[pack.id],expected=Object.values(types).reduce((sum,n)=>sum+n,0);
  assert.equal(pack.cardCount,expected);
  assert.equal(CARD_SETS.find(set=>set.id===pack.id).cardCount,expected);
  assert.deepEqual(pack.typeCounts,types);
  assert.equal(pack.cardIds.length,cards.length);
  assert.equal(pack.premiumGgrCount,PREMIUM_SET_ADDITIONS[pack.id]??0);
  assert.equal(pack.premiumGgrCount,cards.filter(card=>PREMIUM_CARD_IDS.includes(card.id)&&card.rarity==='GGR').length);
  assert.equal(pack.cost,100);assert.equal(pack.size,12);
  const view=packOddsView({packId:pack.id,RARITY_LABELS});
  for(const text of [expected.toLocaleString('ja-JP'),`通常魔獣${types.beast}枚`,`合成魔獣${types.fusion}枚`,`ミラクル${types.miracle}枚`,`ギミック${types.gimmick}枚`,...(pack.premiumGgrCount?[`レガリア専用GGR${pack.premiumGgrCount}種追加`]:[])]){
   assert.ok(pack.description.includes(text),pack.id+' description '+text);
   assert.ok(view.includes(text),pack.id+' odds '+text);
  }
  assert.ok(!view.includes('1,152'));
  if(pack.id==='BK05'){assert.ok(!view.includes('レガリア専用GGR'));assert.ok(!pack.description.includes('レガリア専用GGR'));}
 }
 assert.equal(PACKS.reduce((sum,pack)=>sum+pack.premiumGgrCount,0),PREMIUM_CARD_IDS.length);
});

test('every pack exposes the public premium recipe while retaining existing expansion launchers',()=>{
 for(const pack of PACKS){
  const html=treasureShop({data:{treasure:100,collection:{}},packId:pack.id,title:()=>'',icon:()=>'',esc:String,fmt:n=>n.toLocaleString('ja-JP'),artStyle:()=>'',collected:0});
  const launchers=[...html.matchAll(/data-action="expansion-recipe" data-id="([^"]+)"/g)].map(match=>match[1]);
  const existing=EXPANSION_DECKS.filter(deck=>deck.setId===pack.id).map(deck=>deck.id);
  assert.deepEqual(launchers,[...existing,PREMIUM_DECK_ID]);
  assert.ok(html.includes('王冠竜プレミアム構築例'));
  assert.equal(existing.length,pack.edition>=3?4:0);
  const grid=html.match(/<div class="recipe-launchers">([\s\S]*?)<\/div>/)?.[1];
  if(existing.length)assert.equal([...grid.matchAll(/<button /g)].length,4);
  assert.ok(html.includes('data-action="shop-section" data-section="starters"'));
 }
});

test('the premium recipe requires all 36 owned copies and never grants or mutates inventory',()=>{
 const empty=Object.freeze({}),quote=quoteDeckRecipe(empty,PREMIUM_DECK_ID);
 assert.deepEqual(quote.deck,PREMIUM_DECK);assert.equal(quote.owned,false);
 assert.equal(quote.missingCopies,36);assert.equal(quote.missing.length,18);
 assert.deepEqual(empty,{});assert.equal(hasDeckRecipeCards(empty,PREMIUM_DECK_ID),false);
 const required={};for(const id of [...PREMIUM_DECK.ids,...PREMIUM_DECK.specialIds])required[id]=(required[id]||0)+1;
 const owned=Object.freeze(required),before=JSON.stringify(owned);
 assert.equal(quoteDeckRecipe(owned,PREMIUM_DECK_ID).owned,true);
 assert.equal(hasDeckRecipeCards(owned,PREMIUM_DECK_ID),true);
 assert.equal(JSON.stringify(owned),before);
 for(const id of Object.keys(required)){
  const partial=Object.freeze({...required,[id]:required[id]-1}),missing=quoteDeckRecipe(partial,PREMIUM_DECK_ID);
  assert.equal(missing.owned,false);assert.equal(missing.missingCopies,1);
  assert.deepEqual(missing.missing,[{cardId:id,required:2,owned:1,missing:1}]);
  assert.equal(partial[id],1);
 }
 for(const starter of STARTER_DECKS){
  const collection=createStarterCollection({},starter.id),snapshot=JSON.stringify(collection);
  assert.ok(PREMIUM_CARD_IDS.every(id=>!collection[id]));
  assert.equal(quoteDeckRecipe(collection,PREMIUM_DECK_ID).owned,false);
  assert.equal(JSON.stringify(collection),snapshot);
 }
 assert.equal(quoteDeckRecipe(owned,'operator-kirahara-v1').deck,null);
 assert.equal(quoteDeckRecipe(owned,'regalia-premium-unknown').owned,false);
});

test('normalization rejects unknown IDs and invalid counts without mutating input', () => {
  const raw = Object.freeze({ B0001: 7, B0002: 2.9, B0003: -2, B0004: 0, B0005: NaN,
    B0006: Infinity, B0007: '2', B0008: true, F0001: 1, unknown: 3 });
  assert.deepEqual(normalizeCollection(raw), { B0001: 3, B0002: 2, F0001: 1 });
  for (const invalid of [null, undefined, [], 1, 'inventory']) assert.deepEqual(normalizeCollection(invalid), {});
  assert.equal(raw.B0001, 7);
});

test('each initial choice grants only its own 36 cards',()=>{
 assert.equal(STARTER_DECKS.length,4);
 for(const deck of STARTER_DECKS){
  const collection=createStarterCollection({},deck.id);
  assert.equal(Object.values(collection).reduce((sum,n)=>sum+n,0),36);
  assert.deepEqual(collection,grantDeckCollection({},[...deck.ids,...deck.specialIds]));
  assert.equal(hasStarterCards(collection,deck.id),true);
  for(const other of STARTER_DECKS.filter(d=>d.id!==deck.id))assert.equal(hasStarterCards(collection,other.id),false);
  assert.equal(collection[FUSION_CARD_ID],2);
  assert.deepEqual(createStarterCollection(collection,deck.id),collection);
 }
});

test('grantDeckCollection preserves custom deck copies and never adds repeated grants', () => {
  const original = Object.freeze({ B0001: 1, F0001: 2 });
  const granted = grantDeckCollection(original, ['B0001', 'B0001', 'B0001', 'B0001', 'B0002', 'missing']);
  assert.deepEqual(granted, { B0001: 3, B0002: 1, F0001: 2 });
  assert.deepEqual(grantDeckCollection(granted, ['B0001', 'B0001']), granted);
  assert.deepEqual(original, { B0001: 1, F0001: 2 });
  assert.deepEqual(grantDeckCollection(original, null), original);
});

test('a pack has twelve known cards with a final R-or-better guaranteed slot', () => {
  for (let seed = 1; seed <= 64; seed++) {
    const result = openPack({ treasure: 100, collection: {} }, seededRandom(seed));
    assert.equal(result.ok, true);
    assert.equal(result.pulls.length, 12);
    assert.ok(result.pulls.every(p => CARD_MAP.has(p.cardId)));
    assert.ok(result.pulls.every(p => PACK_CARD_IDS.includes(p.cardId)));
    assert.notEqual(CARD_MAP.get(result.pulls[11].cardId).rarity, 'N');
    assert.deepEqual(result.pulls.map(p => p.guaranteed), [...Array(11).fill(false), true]);
    assert.equal(result.bonusTreasure, result.pulls.filter(p => p.converted).length * 5);
    assert.equal(result.treasure, result.bonusTreasure);
    assert.ok(Object.values(result.collection).every(n => n >= 1 && n <= 3));
  }
});

test('insufficient funds are atomic and do not call the RNG or spend anticipated refunds', () => {
  const collection = Object.freeze(Object.fromEntries(CARDS.map(c => [c.id, 3])));
  const input = Object.freeze({ treasure: 99, collection });
  const result = openPack(input, () => { assert.fail('RNG must not run without funds'); });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'INSUFFICIENT_TREASURE');
  assert.equal(result.treasure, input.treasure);
  assert.equal(result.collection, input.collection);
  assert.deepEqual(result.pulls, []);
  assert.equal(result.bonusTreasure, 0);
});

test('invalid balances fail without debit', () => {
  for (const treasure of [-1, NaN, Infinity, 100.5, '100', Number.MAX_SAFE_INTEGER + 1]) {
    const input = { treasure, collection: { B0001: 2 } };
    const result = openPack(input, () => { assert.fail('invalid balance must not draw'); });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'INVALID_BALANCE');
    assert.ok(Object.is(result.treasure, treasure));
    assert.equal(result.collection, input.collection);
  }
});

test('copies beyond three convert within the same pack and isNew tracks first ownership', () => {
  const firstN = CARDS.find(c => c.rarity === 'N');
  const firstR = CARDS.find(c => c.rarity === 'R');
  const result = openPack({ treasure: 100, collection: {} }, () => 0);
  assert.equal(result.ok, true);
  assert.ok(result.pulls.slice(0, 11).every(p => p.cardId === firstN.id));
  assert.equal(result.pulls[11].cardId, firstR.id);
  assert.equal(result.collection[firstN.id], 3);
  assert.equal(result.collection[firstR.id], 1);
  assert.deepEqual(result.pulls.slice(0, 11).map(p => p.isNew), [true, ...Array(10).fill(false)]);
  assert.deepEqual(result.pulls.slice(0, 11).map(p => p.converted), [false, false, false, ...Array(8).fill(true)]);
  assert.equal(result.pulls[11].isNew, true);
  assert.equal(result.bonusTreasure, 40);
  assert.equal(result.treasure, 40);
});

test('a fully owned collection converts all twelve cards to exactly sixty treasure', () => {
  const collection = Object.freeze(Object.fromEntries(CARDS.map(c => [c.id, 3])));
  const input = Object.freeze({ treasure: 250, collection });
  const result = openPack(input, seededRandom(318));
  assert.equal(result.ok, true);
  assert.ok(result.pulls.every(p => p.converted && !p.isNew));
  assert.equal(result.bonusTreasure, 60);
  assert.equal(result.treasure, 210);
  assert.deepEqual(result.collection, collection);
  assert.notEqual(result.collection, collection);
  assert.equal(input.treasure, 250);
});

test('success is deterministic with injected RNG and never mutates its input', () => {
  const input = Object.freeze({ treasure: 777, collection: Object.freeze(createStarterCollection()) });
  const before = JSON.stringify(input);
  const a = openPack(input, seededRandom(8921));
  const b = openPack(input, seededRandom(8921));
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(input), before);
  assert.notEqual(a.collection, input.collection);
});

test('each advertised rarity range reaches that rarity in a regular slot', () => {
  for (const [roll, expected] of [[0, 'N'], [0.57999, 'N'], [0.58, 'R'], [0.82999, 'R'],
    [0.83, 'KR'], [0.92999, 'KR'], [0.93, 'KKR'], [0.97999, 'KKR'],
    [0.98, 'GR'], [0.99499, 'GR'], [0.995, 'GGR'], [0.99999, 'GGR']]) {
    let calls = 0;
    const result = openPack({ treasure: 100, collection: {} }, () => (++calls % 2 ? roll : 0));
    assert.equal(result.ok, true);
    assert.equal(CARD_MAP.get(result.pulls[0].cardId).rarity, expected, `roll ${roll}`);
  }
});

for(const packId of ['BK01','BK02','BK03','BK04','BK05']) test(packId+' reaches every card in its complete published pool', () => {
  const mainCards = getCardsForSet(packId);
  const reached = new Set();
  const midpoints = {};
  let cumulative = 0;
  for (const [rarity, weight] of Object.entries(RARITY_ODDS)) {
    midpoints[rarity] = (cumulative + weight / 2) / 100;
    cumulative += weight;
  }
  for (const rarity of Object.keys(RARITY_ODDS)) {
    const cards = mainCards.filter(c => c.rarity === rarity);
    for (let index = 0; index < cards.length; index++) {
      const rolls = [midpoints[rarity], (index + 0.5) / cards.length];
      const result = openPack({ treasure: 100, collection: {} }, {packId,randomFn:() => rolls.length ? rolls.shift() : 0});
      assert.equal(result.ok, true);
      assert.equal(result.pulls[0].cardId, cards[index].id);
      reached.add(result.pulls[0].cardId);
    }
  }
  const expected=Object.values(expectedTypes[packId]).reduce((sum,n)=>sum+n,0);
  assert.equal(mainCards.length, expected);
  assert.equal(mainCards.filter(c => c.type === 'fusion').length, expectedTypes[packId].fusion);
  assert.equal(reached.size, expected);
  assert.deepEqual([...reached].sort(), mainCards.map(c=>c.id).sort());
  assert.deepEqual(mainCards.reduce((counts, card) => {
    counts[card.type] = (counts[card.type] || 0) + 1;
    return counts;
  }, {}), expectedTypes[packId]);
  const added=mainCards.filter(card=>PREMIUM_CARD_IDS.includes(card.id));
  assert.equal(added.length,PREMIUM_SET_ADDITIONS[packId]??0);
  assert.ok(added.every(card=>card.rarity==='GGR'&&reached.has(card.id)));
  const ggr=mainCards.filter(card=>card.rarity==='GGR');
  for(const card of added){
   const rolls=[...Array(22).fill(0),0.99999,(ggr.findIndex(c=>c.id===card.id)+0.5)/ggr.length];
   const result=openPack({treasure:100,collection:{}},{packId,randomFn:()=>rolls.shift()});
   assert.equal(result.ok,true);assert.equal(result.pulls[11].cardId,card.id);
   assert.equal(result.pulls[11].guaranteed,true);
  }
});

test('bad or throwing RNG rolls back even when some slots have been drawn', () => {
  for (const invalid of [NaN, Infinity, -0.1, 1, '0.5', undefined]) {
    const input = { treasure: 100, collection: { B0001: 2 } };
    let calls = 0;
    const result = openPack(input, () => ++calls === 9 ? invalid : 0);
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'INVALID_RANDOM');
    assert.equal(result.treasure, 100);
    assert.equal(result.collection, input.collection);
    assert.deepEqual(result.pulls, []);
    assert.equal(result.bonusTreasure, 0);
  }
  const input = { treasure: 100, collection: {} };
  let calls = 0;
  const result = openPack(input, () => { if (++calls === 12) throw new Error('entropy unavailable'); return 0; });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'DRAW_FAILED');
  assert.equal(result.collection, input.collection);
  assert.equal(result.treasure, input.treasure);
  assert.equal(openPack(input, null).errorCode, 'INVALID_RANDOM');
});

test('completed battle rewards use player zero perspective and exclude surrender', () => {
  assert.equal(getBattleReward({ winner: 0 }), 60);
  assert.equal(getBattleReward({ winner: 1 }), 20);
  assert.equal(getBattleReward({ winner: 'draw' }), 30);
  for (const winner of [0, 1, 'draw', null, undefined]) assert.equal(getBattleReward({ winner, forfeited: true }), 0);
  for (const winner of [null, undefined, '0', '1', 2]) assert.equal(getBattleReward({ winner }), 0);
  assert.equal(getBattleReward(), 0);
});

test('each of the four starter products supplies the exact fixed 36 cards',()=>{
 assert.equal(STARTER_PRICE,300);
 for(const deck of STARTER_DECKS){
  const before={treasure:300,collection:{}},r=purchaseStarter(before,deck.id);
  assert.ok(r.ok);assert.equal(r.received,36);assert.equal(r.bonusTreasure,0);assert.equal(r.treasure,0);
  assert.deepEqual(r.pulls.map(p=>p.cardId),[...deck.ids,...deck.specialIds]);assert.deepEqual(r.collection,grantDeckCollection({},[...deck.ids,...deck.specialIds]));
  assert.deepEqual(before,{treasure:300,collection:{}});
 }
});
test('starter repurchases convert only excess copies and never charge on failure',()=>{
 const deck=STARTER_DECKS[0],state={treasure:1000,collection:createStarterCollection()};
 const q=quoteStarterPurchase(state,deck.id),r=purchaseStarter(state,deck.id);
 assert.ok(r.ok);assert.equal(q.received,r.received);assert.equal(q.received+q.converted,36);
 assert.equal(r.treasure,state.treasure-STARTER_PRICE+r.bonusTreasure);assert.equal(r.bonusTreasure,r.converted*EXTRA_COPY_TREASURE);
 assert.ok(Object.values(r.collection).every(n=>n<=3));assert.ok(r.treasure<state.treasure);
 assert.equal(purchaseStarter({treasure:299,collection:{}},deck.id).ok,false);
 assert.equal(purchaseStarter(state,'operator-kirahara-v1').ok,false);
 const full={treasure:1000,collection:Object.fromEntries([...deck.ids,...deck.specialIds].map(id=>[id,3]))};
 const blocked=purchaseStarter(full,deck.id);assert.equal(blocked.ok,false);assert.equal(blocked.errorCode,'ALREADY_COMPLETE');assert.equal(blocked.treasure,1000);assert.deepEqual(blocked.collection,full.collection);
});


test('legacy free four-starter baseline is recalled once; chosen cards and excess copies survive',async()=>{
 const {migrateLegacyStarters,createStarterCollection,hasStarterCards}=await import('../shop.js');
 const chosen=STARTER_DECKS[1],other=STARTER_DECKS[0];
 const old=STARTER_DECKS.reduce((c,d)=>createStarterCollection(c,d.id),{});
 const extra=other.specialIds[0],unrelated=CARDS.find(c=>!old[c.id]).id;
 old[extra]=3;old[unrelated]=2;
 const next=migrateLegacyStarters({starter:chosen.id,collection:old});
 assert.ok(next.removed>0);assert.equal(next.freeStarterId,chosen.id);assert.equal(hasStarterCards(next.collection,chosen.id),true);
 assert.equal(hasStarterCards(next.collection,other.id),false);assert.equal(next.collection[extra],2);assert.equal(next.collection[unrelated],2);
 assert.deepEqual(migrateLegacyStarters({...next}).collection,next.collection);
 const partial=createStarterCollection({},chosen.id);
 assert.deepEqual(migrateLegacyStarters({starter:chosen.id,collection:partial}).collection,partial);
 const purchased={...next,collection:old};assert.deepEqual(migrateLegacyStarters(purchased).collection,old);
});

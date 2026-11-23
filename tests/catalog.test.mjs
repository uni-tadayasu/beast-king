import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, CARD_MAP, ELEMENTS, STARTER_DECKS, DECK_MIN, DECK_MAX, RARITY_ORDER, RARITY_LABELS, getCard, validateDeck } from '../catalog.js';

test('core set contains exactly 1024 uniquely identified and named cards', () => {
  assert.equal(CARDS.length, 1024);
  assert.equal(new Set(CARDS.map(c => c.id)).size, 1024);
  assert.equal(new Set(CARDS.map(c => c.name)).size, 1024);
  assert.equal(CARD_MAP.size, 1024);
  for (const [type, expected] of [['beast',512],['miracle',256],['gimmick',256]]) assert.equal(CARDS.filter(c => c.type === type).length, expected);
  assert.deepEqual(CARDS.map(c => c.index), Array.from({length:1024}, (_,i) => i+1));
});

test('all cards have supported effects, costs, art keys and usable rules text', () => {
  const supported = {
    beast: ['none','draw','heal','damage_core','buff_all','shield'],
    miracle: ['damage_enemy','heal','draw','buff','sweep','shield','drain','renew'],
    gimmick: ['ambush','barrier','spring','fountain'],
  };
  for (const c of CARDS) {
    assert.ok(ELEMENTS.some(e => e.id === c.element), c.id);
    assert.ok(supported[c.type].includes(c.effect.kind), c.id);
    assert.ok(Number.isInteger(c.cost) && c.cost >=1 && c.cost <=8, c.id);
    assert.ok(Number.isInteger(c.effect.value) && c.effect.value >=0, c.id);
    assert.ok(RARITY_ORDER.includes(c.rarity), c.id);
    assert.ok(c.text.length>8 && !c.text.includes('undefined'), c.id);
    assert.ok(c.flavor.length>5, c.id);
    assert.ok(c.art>=0 && c.art<24, c.id);
    assert.ok(c.keywords.every(k => ['guard','rush','drain'].includes(k)), c.id);
    if(c.type === 'beast') assert.ok(c.attack>0 && c.hp>0 && c.art<16,c.id);
    if(c.type === 'miracle') assert.ok(c.art>=16 && c.art<20,c.id);
    if(c.type === 'gimmick') assert.ok(c.art>=20 && c.art<24,c.id);
  }
});

test('each element has 64 beasts, 32 miracles and 32 gimmicks', () => {
  for (const e of ELEMENTS) {
    for (const [type,n] of [['beast',64],['miracle',32],['gimmick',32]]) assert.equal(CARDS.filter(c=>c.element===e.id&&c.type===type).length,n);
  }
});

test('eight starter decks are legal, distinct and have playable mana curves', () => {
  assert.equal(STARTER_DECKS.length,8);
  for(const deck of STARTER_DECKS) {
    assert.deepEqual(validateDeck(deck.ids),{valid:true,errors:[]});
    assert.equal(deck.ids.length,DECK_MIN);
    assert.equal(deck.ids.filter(id=>getCard(id).type==='beast').length,16);
    assert.equal(deck.ids.filter(id=>getCard(id).type==='miracle').length,8);
    assert.equal(deck.ids.filter(id=>getCard(id).type==='gimmick').length,8);
    assert.ok(deck.ids.every(id=>getCard(id).element===deck.element));
    assert.ok(deck.ids.filter(id=>getCard(id).cost<=2).length>=12);
    assert.ok(deck.ids.some(id=>getCard(id).rarity==='GGR'));
  }
});

test('deck validation rejects invalid saves and illegal duplicates without mutation', () => {
  assert.equal(validateDeck(null).valid,false);
  assert.equal(validateDeck([]).valid,false);
  const bad = STARTER_DECKS[0].ids.slice();
  bad[0]='UNKNOWN';
  assert.equal(validateDeck(bad).valid,false);
  const dup = Array(DECK_MIN).fill('B0001');
  assert.equal(validateDeck(dup).valid,false);
  assert.deepEqual(dup,Array(DECK_MIN).fill('B0001'));
});

test('signature card has the agreed original identity and mechanics', () => {
  const c=getCard('B0001');
  assert.equal(c.name,'星冠竜 アストレイア');
  assert.equal(c.element,'dawn');
  assert.equal(c.cost,6);
  assert.equal(c.attack,6);
  assert.equal(c.hp,7);
  assert.deepEqual(c.effect,{kind:'shield',value:2});
  assert.deepEqual(c.keywords,['guard']);
});


test('32 is a minimum: legal 32, 33, and 45 card decks are accepted; 31 is rejected', () => {
  assert.equal(DECK_MIN,32);
  assert.equal(DECK_MAX,CARDS.length*3);
  const base=STARTER_DECKS[0].ids.slice();
  const more=CARDS.filter(c=>!base.includes(c.id)).slice(0,13).map(c=>c.id);
  assert.equal(validateDeck(base.slice(0,31)).valid,false);
  assert.equal(validateDeck(base).valid,true);
  assert.equal(validateDeck([...base,more[0]]).valid,true);
  assert.equal(validateDeck([...base,...more]).valid,true);
  assert.equal(validateDeck(CARDS.flatMap(c=>[c.id,c.id,c.id])).valid,true);
});


test('draw rules state the four-card cap and delayed shield gimmicks have matching text', () => {
  for (const card of CARDS.filter(c=>c.effect.kind==='draw')) {
    assert.match(card.text,/手札が4枚/);
    assert.ok(!card.text.includes('墓地へ送る'));
  }
  const shields=CARDS.filter(c=>c.type==='gimmick'&&c.effect.kind==='spring');
  assert.equal(shields.length,64);
  for (const card of shields) {
    assert.ok(card.effect.value>=2&&card.effect.value<=16&&card.effect.value%2===0);
    assert.ok(card.text.includes(`結界${card.effect.value}`));
    assert.ok(!card.text.includes('枚引く'));
  }
});


test('all six requested rarity levels are present in exact ascending order', () => {
  assert.deepEqual(RARITY_ORDER,['N','R','KR','KKR','GR','GGR']);
  assert.deepEqual(RARITY_ORDER.map(r=>RARITY_LABELS[r]),['ノーマル','レア','キラレア','キラキラレア','ギラレア','ギラギラレア']);
  for (const type of ['beast','miracle','gimmick']) {
    for (const rarity of RARITY_ORDER) assert.ok(CARDS.some(c=>c.type===type&&c.rarity===rarity),`${type}/${rarity}`);
  }
  for (const element of ELEMENTS) assert.ok(CARDS.some(c=>c.type==='beast'&&c.element===element.id&&c.rarity==='GGR'));
  assert.equal(getCard('B0001').rarity,'GGR');
});

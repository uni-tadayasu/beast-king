import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, CARD_MAP, STARTER_DECKS, getCardsForSet, FUSION_CARD_ID } from '../catalog.js';
import {
  PACK_ID, PACK_NAME, PACK_DESCRIPTION, PACK_CARD_IDS, PACK_CARD_COUNT,
  PACK_COST, PACK_SIZE, STARTING_TREASURE, EXTRA_COPY_TREASURE,
  RARITY_ODDS, GUARANTEED_RARITY_ODDS,
  normalizeCollection, grantDeckCollection, createStarterCollection, openPack, getBattleReward,
} from '../shop.js';

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}

test('pack prices, guarantees, and advertised percentages are consistent', () => {
  assert.equal(PACK_ID, 'BK01');
  assert.equal(PACK_NAME, '六源の覚醒');
  assert.ok(PACK_DESCRIPTION.includes('1,152'));
  assert.equal(PACK_CARD_COUNT, 1152);
  assert.equal(new Set(PACK_CARD_IDS).size, 1152);
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

test('normalization rejects unknown IDs and invalid counts without mutating input', () => {
  const raw = Object.freeze({ B0001: 7, B0002: 2.9, B0003: -2, B0004: 0, B0005: NaN,
    B0006: Infinity, B0007: '2', B0008: true, F0001: 1, unknown: 3 });
  assert.deepEqual(normalizeCollection(raw), { B0001: 3, B0002: 2, F0001: 1 });
  for (const invalid of [null, undefined, [], 1, 'inventory']) assert.deepEqual(normalizeCollection(invalid), {});
  assert.equal(raw.B0001, 7);
});

test('starter ownership supports all four main and special decks using maxima', () => {
  const collection = createStarterCollection();
  assert.equal(STARTER_DECKS.length, 4);
  for (const deck of STARTER_DECKS) {
    const required = new Map();
    for (const id of [...deck.ids, ...deck.specialIds]) required.set(id, (required.get(id) || 0) + 1);
    for (const [id, count] of required) assert.ok(collection[id] >= count, `${deck.id}: ${id}`);
  }
  assert.equal(collection[FUSION_CARD_ID], 2, 'shared fusion spell is not summed across eight starters');
  assert.ok(Object.keys(collection).some(id => id.startsWith('F')));
  assert.ok(Object.values(collection).every(count => Number.isInteger(count) && count > 0 && count <= 3));
  assert.deepEqual(createStarterCollection(), collection);
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

for(const packId of ['BK01','BK02']) test(packId+' draws every one of its 1152 cards including all 128 fusion beasts', () => {
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
  assert.equal(mainCards.length, 1152);
  assert.equal(mainCards.filter(c => c.type === 'fusion').length, 128);
  assert.equal(reached.size, 1152);
  assert.deepEqual([...reached].sort(), mainCards.map(c=>c.id).sort());
  assert.deepEqual(mainCards.reduce((counts, card) => {
    counts[card.type] = (counts[card.type] || 0) + 1;
    return counts;
  }, {}), { beast: 512, miracle: 256, gimmick: 256, fusion: 128 });
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

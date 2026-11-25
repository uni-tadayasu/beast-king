import { CARDS, CARD_MAP, STARTER_DECKS, PACKS, cardsInPack } from './catalog.js?v=20261125-36';

// Pure economy rules shared by the browser and an authoritative server.
// A server should inject its own secure random function into openPack.
export const PACK_ID = 'BK01';
export const PACK_NAME = '六源の覚醒';
export const PACK_DESCRIPTION = '通常魔獣512枚・合成魔獣128枚・ミラクル256枚・ギミック256枚、全1,152枚を収録した第一弾パック。12枚入り、1枚はレア以上確定。';
export const PACK_COST = 100;
export const PACK_SIZE = 12;
export const STARTING_TREASURE = 100;
export const EXTRA_COPY_TREASURE = 5;
export const MAX_CARD_COPIES = 3;
export const RARITY_ODDS = Object.freeze({ N: 58, R: 25, KR: 10, KKR: 5, GR: 1.5, GGR: 0.5 });
export const BATTLE_REWARDS = Object.freeze({ win: 60, loss: 20, draw: 30, forfeit: 0 });

// The first expansion includes all regular and fusion beasts, miracles, and gimmicks.
const packCards = cardsInPack('BK01');
export const PACK_CARD_IDS_BY_SET=Object.freeze(Object.fromEntries(PACKS.map(p=>[p.id,Object.freeze(cardsInPack(p.id).map(c=>c.id))])));
export const PACK_CARD_IDS = Object.freeze(packCards.map(card => card.id));
export const PACK_CARD_COUNT = PACK_CARD_IDS.length;

const rarityEntries = Object.entries(RARITY_ODDS);
const guaranteedEntries = rarityEntries.filter(([rarity]) => rarity !== 'N');
const guaranteedWeight = guaranteedEntries.reduce((sum, [, weight]) => sum + weight, 0);
export const GUARANTEED_RARITY_ODDS = Object.freeze(Object.fromEntries(
  guaranteedEntries.map(([rarity, weight]) => [rarity, weight / guaranteedWeight * 100]),
));

const poolFor = id=>new Map(rarityEntries.map(([rarity])=>[rarity,Object.freeze(cardsInPack(id).filter(c=>c.rarity===rarity).map(c=>c.id))]));
const poolsBySet=new Map(PACKS.map(p=>[p.id,poolFor(p.id)]));

/** Return a new known-card inventory. Zero counts are omitted; valid counts are integers 1–3. */
export function normalizeCollection(raw) {
  const collection = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return collection;
  for (const [id, value] of Object.entries(raw)) {
    if (!CARD_MAP.has(id) || typeof value !== 'number' || !Number.isFinite(value)) continue;
    const count = Math.max(0, Math.min(MAX_CARD_COPIES, Math.trunc(value)));
    if (count > 0) collection[id] = count;
  }
  return collection;
}

/** Preserve a deck's required copies, taking the maximum rather than summing previous grants. */
export function grantDeckCollection(raw, ids) {
  const collection = normalizeCollection(raw);
  if (!Array.isArray(ids)) return collection;
  const required = new Map();
  for (const id of ids) {
    if (typeof id === 'string' && CARD_MAP.has(id)) {
      required.set(id, Math.min(MAX_CARD_COPIES, (required.get(id) || 0) + 1));
    }
  }
  for (const [id, count] of required) collection[id] = Math.max(collection[id] || 0, count);
  return collection;
}

/** Grant only the chosen starting deck. */
export function createStarterCollection(starterId=STARTER_DECKS[0].id) {
  const starter=STARTER_DECKS.find(d=>d.id===starterId);if(!starter)throw Error('Unknown starter');
  return grantDeckCollection({},[...starter.ids,...starter.specialIds]);
}

function randomUnit(randomFn) {
  const value = randomFn();
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError('Random values must be in [0, 1).');
  }
  return value;
}

function pickCard(randomFn, guaranteed, cardPools) {
  const entries = guaranteed ? guaranteedEntries : rarityEntries;
  const total = guaranteed ? guaranteedWeight : 100;
  const roll = randomUnit(randomFn);
  let cumulative = 0;
  let chosenRarity = entries[entries.length - 1][0];
  for (const [rarity, weight] of entries) {
    cumulative += weight;
    if (roll < cumulative / total) {
      chosenRarity = rarity;
      break;
    }
  }
  const pool = cardPools.get(chosenRarity);
  if (!pool?.length) throw new Error('The selected rarity has no cards.');
  return pool[Math.floor(randomUnit(randomFn) * pool.length)];
}

function failure(state, errorCode, error) {
  return {
    ok: false,
    treasure: state?.treasure ?? 0,
    collection: state?.collection ?? {},
    pulls: [],
    bonusTreasure: 0,
    errorCode,
    error,
  };
}

/**
 * Purchase one pack atomically without mutating state or state.collection.
 * The first 11 slots use RARITY_ODDS; the final slot excludes N and renormalizes.
 * All cards of the chosen rarity in the selected set are equally likely, including fusion beasts.
 * isNew means the player owned zero copies immediately before that pull.
 * converted means the player already owned three copies, including earlier pulls.
 * On failure, the original balance and collection are returned unchanged.
 */
export function openPack(state, randomFn = Math.random, packId='BK01') {
  if(!poolsBySet.has(packId))return failure(state,'INVALID_PACK','パックが存在しません。');
  const cardPools=poolsBySet.get(packId);
  if (!state || !Number.isSafeInteger(state.treasure) || state.treasure < 0) {
    return failure(state, 'INVALID_BALANCE', '秘宝の所持数が正しくありません。');
  }
  if (state.treasure < PACK_COST) {
    return failure(state, 'INSUFFICIENT_TREASURE', `パックを開くには秘宝が${PACK_COST}個必要です。`);
  }
  if (typeof randomFn !== 'function') {
    return failure(state, 'INVALID_RANDOM', '抽選を開始できませんでした。秘宝は消費されていません。');
  }

  try {
    const collection = normalizeCollection(state.collection);
    const pulls = [];
    let bonusTreasure = 0;
    for (let index = 0; index < PACK_SIZE; index++) {
      const guaranteed = index === PACK_SIZE - 1;
      const cardId = pickCard(randomFn, guaranteed, cardPools);
      const owned = collection[cardId] || 0;
      const converted = owned >= MAX_CARD_COPIES;
      if (converted) bonusTreasure += EXTRA_COPY_TREASURE;
      else collection[cardId] = owned + 1;
      pulls.push({ cardId, isNew: owned === 0, converted, guaranteed });
    }
    return {
      ok: true,
      treasure: state.treasure - PACK_COST + bonusTreasure,
      collection,
      pulls,
      bonusTreasure,
    };
  } catch (error) {
    return failure(
      state,
      error instanceof RangeError ? 'INVALID_RANDOM' : 'DRAW_FAILED',
      'カードの抽選に失敗しました。秘宝は消費されていません。',
    );
  }
}

/** Completed battle payout from player 0's perspective; unfinished games pay nothing. */
export function getBattleReward({ winner, forfeited = false } = {}) {
  if (forfeited) return BATTLE_REWARDS.forfeit;
  if (winner === 0) return BATTLE_REWARDS.win;
  if (winner === 1) return BATTLE_REWARDS.loss;
  if (winner === 'draw') return BATTLE_REWARDS.draw;
  return 0;
}

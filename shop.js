import { CARD_SETS, CARD_MAP, STARTER_DECKS, getCardsForSet } from './catalog.js';

// Pure economy rules shared by the browser and an authoritative server.
// A server should inject its own secure random function into openPack.
export const PACK_COST = 100;
export const PACK_SIZE = 12;
export const STARTING_TREASURE = 100;
export const EXTRA_COPY_TREASURE = 5;
export const MAX_CARD_COPIES = 3;
export const RARITY_ODDS = Object.freeze({ N: 58, R: 25, KR: 10, KKR: 5, GR: 1.5, GGR: 0.5 });
export const BATTLE_REWARDS = Object.freeze({ win: 60, loss: 20, draw: 30, forfeit: 0 });

// Both expansions have separate complete pools; existing aliases select BK01.
export const PACKS = Object.freeze(CARD_SETS.map(set => Object.freeze({
  ...set,
  description: `通常魔獣512枚・合成魔獣128枚・ミラクル256枚・ギミック256枚、全1,152枚を収録した${set.editionLabel}パック。12枚入り、1枚はレア以上確定。`,
  cardIds: Object.freeze(getCardsForSet(set.id).map(card => card.id)),
  cost: PACK_COST, size: PACK_SIZE,
})));
const packsById = new Map(PACKS.map(pack => [pack.id, pack]));
export const getPack = id => packsById.get(id);
export const PACK_ID = PACKS[0].id;
export const PACK_NAME = PACKS[0].name;
export const PACK_DESCRIPTION = PACKS[0].description;
export const PACK_CARD_IDS = PACKS[0].cardIds;
export const PACK_CARD_COUNT = PACKS[0].cardCount;

const rarityEntries = Object.entries(RARITY_ODDS);
const guaranteedEntries = rarityEntries.filter(([rarity]) => rarity !== 'N');
const guaranteedWeight = guaranteedEntries.reduce((sum, [, weight]) => sum + weight, 0);
export const GUARANTEED_RARITY_ODDS = Object.freeze(Object.fromEntries(
  guaranteedEntries.map(([rarity, weight]) => [rarity, weight / guaranteedWeight * 100]),
));

const cardPools = new Map(PACKS.map(pack => [pack.id, new Map(rarityEntries.map(([rarity]) => [
  rarity,
  Object.freeze(getCardsForSet(pack.id).filter(card => card.rarity === rarity).map(card => card.id)),
]))]));

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

/** Grant the four current starters without removing cards from an existing collection. */
export function createStarterCollection(raw = {}) {
  let collection = normalizeCollection(raw);
  for (const starter of STARTER_DECKS) {
    collection = grantDeckCollection(collection, [...starter.ids, ...(starter.specialIds || [])]);
  }
  return collection;
}

function randomUnit(randomFn) {
  const value = randomFn();
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError('Random values must be in [0, 1).');
  }
  return value;
}

function pickCard(packId, randomFn, guaranteed) {
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
  const pool = cardPools.get(packId)?.get(chosenRarity);
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
 * All cards of the selected set and chosen rarity are equally likely, including fusions.
 * Legacy openPack(state, randomFn) selects BK01; options may select either pack.
 * isNew means the player owned zero copies immediately before that pull.
 * converted means the player already owned three copies, including earlier pulls.
 * On failure, the original balance and collection are returned unchanged.
 */
export function openPack(state, options = Math.random) {
  const config = options && typeof options === 'object' && !Array.isArray(options) ? options : null;
  const packId = config?.packId === undefined ? PACK_ID : config.packId;
  const pack = getPack(packId);
  const randomFn = config ? (config.randomFn === undefined ? Math.random : config.randomFn) : options;
  if (!pack) return failure(state, 'INVALID_PACK', '開封するパックを選び直してください。秘宝は消費されていません。');
  if (!state || !Number.isSafeInteger(state.treasure) || state.treasure < 0) {
    return failure(state, 'INVALID_BALANCE', '秘宝の所持数が正しくありません。');
  }
  if (state.treasure < pack.cost) {
    return failure(state, 'INSUFFICIENT_TREASURE', `パックを開くには秘宝が${pack.cost}個必要です。`);
  }
  if (typeof randomFn !== 'function') {
    return failure(state, 'INVALID_RANDOM', '抽選を開始できませんでした。秘宝は消費されていません。');
  }

  try {
    const collection = normalizeCollection(state.collection);
    const pulls = [];
    let bonusTreasure = 0;
    for (let index = 0; index < pack.size; index++) {
      const guaranteed = index === pack.size - 1;
      const cardId = pickCard(pack.id, randomFn, guaranteed);
      const owned = collection[cardId] || 0;
      const converted = owned >= MAX_CARD_COPIES;
      if (converted) bonusTreasure += EXTRA_COPY_TREASURE;
      else collection[cardId] = owned + 1;
      pulls.push({ cardId, isNew: owned === 0, converted, guaranteed });
    }
    return {
      ok: true,
      packId: pack.id,
      treasure: state.treasure - pack.cost + bonusTreasure,
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

/** A fixed starter product, not a randomized pack. Existing free starter
 * ownership is preserved. Purchase supplies additional copies up to 3. */
export const STARTER_PRICE=300;
export function quoteStarterPurchase(state,starterId){
 const starter=STARTER_DECKS.find(d=>d.id===starterId);
 if(!starter)return {ok:false,errorCode:'INVALID_STARTER',error:'スターターデッキを選んでください。'};
 const collection=normalizeCollection(state?.collection),items=[...starter.ids,...starter.specialIds];
 const pulls=[];
 for(const cardId of items){
  const owned=collection[cardId]||0,converted=owned>=MAX_CARD_COPIES;
  if(!converted)collection[cardId]=owned+1;
  pulls.push({cardId,isNew:owned===0,converted});
 }
 const received=pulls.filter(p=>!p.converted).length,converted=items.length-received,bonusTreasure=converted*EXTRA_COPY_TREASURE;
 const validBalance=Number.isSafeInteger(state?.treasure)&&state.treasure>=0;
 const errorCode=!validBalance?'INVALID_BALANCE':received===0?'ALREADY_COMPLETE':state.treasure<STARTER_PRICE?'INSUFFICIENT_TREASURE':null;
 const error=errorCode==='INVALID_BALANCE'?'秘宝の所持数を確認してください。':errorCode==='ALREADY_COMPLETE'?'収録カードはすべて所持上限です。':errorCode==='INSUFFICIENT_TREASURE'?'購入には300秘宝が必要です。':null;
 return {ok:!errorCode,errorCode,error,starterId,starter,cost:STARTER_PRICE,size:items.length,received,converted,bonusTreasure,netCost:STARTER_PRICE-bonusTreasure,collection,pulls,treasure:validBalance?state.treasure-STARTER_PRICE+bonusTreasure:0};
}
export function purchaseStarter(state,starterId){
 const quote=quoteStarterPurchase(state,starterId);
 if(!quote.ok)return {...failure(state,quote.errorCode,quote.error),starterId};
 return {...quote};
}

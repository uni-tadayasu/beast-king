import {PREMIUM_DECK} from './premium-deck.js';
// A recipe is not an entitlement. Only the authenticated server reward ledger
// unlocks this preset; the four public starter choices remain unchanged.
const pairs=ids=>Object.freeze(ids.flatMap(id=>[id,id]));

export const OPERATOR_DECK_ID='operator-kirahara-v1';
export const LEGACY_OPERATOR_DECK_V3=Object.freeze({
  id:OPERATOR_DECK_ID,revision:3,
  name:'𠮷良原デッキ',
  subtitle:'四弾統合・王冠竜を支える守護と再生',
  description:'第一弾から第四弾のカードを採用。低コストの守護・回復・除去で王冠竜レガリア2枚につなぎ、継承強化と星巡の合成で支える運営専用構築。',
  origin:'king',element:'king',aceId:'B0512',
  ids:pairs([
    'M0193','G0294','B0066','B0835','B0002','M0476','B0007','B0512',
    'M0084','B0713','M0256','M0512','B0257','B0583','B0743','B1039',
  ]),
  specialIds:pairs(['F0408','F0385']),
});

export const OPERATOR_DECK=Object.freeze({...PREMIUM_DECK,id:OPERATOR_DECK_ID,revision:4,name:'プレミアムデッキ',description:PREMIUM_DECK.description+' 運営は完成構築として開放できます。全カードは既存4パックから同じ性能で入手できます。'});

export const OPERATOR_DECK_REQUIRED=Object.freeze(Object.fromEntries(
  [...OPERATOR_DECK.ids,...OPERATOR_DECK.specialIds].reduce((counts,id)=>counts.set(id,(counts.get(id)||0)+1),new Map()),
));

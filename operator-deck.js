// A recipe is not an entitlement. Only the authenticated server reward ledger
// unlocks this preset; the four public starter choices remain unchanged.
const pairs=ids=>Object.freeze(ids.flatMap(id=>[id,id]));

export const OPERATOR_DECK_ID='operator-kirahara-v1';
export const OPERATOR_DECK=Object.freeze({
  id:OPERATOR_DECK_ID,
  name:'𠮷良原デッキ',
  subtitle:'二つの収録弾を結ぶ、レガリアと継承の専用構築',
  description:'第一弾・第二弾から選んだ軽量の守護とドローで序盤を支え、二つの合成と回復・除去で王冠竜 レガリアへつなぐ。',
  origin:'king',element:'king',aceId:'B0512',
  ids:pairs([
    'B0005','B0263','B0647','B0015','B0079','B0535','B0480','B0512',
    'M0065','M0294','M0256','M0512',
    'G0481','G0002','G0227','G0260',
  ]),
  specialIds:pairs(['F0128','F0174']),
});

export const OPERATOR_DECK_REQUIRED=Object.freeze(Object.fromEntries(
  [...OPERATOR_DECK.ids,...OPERATOR_DECK.specialIds].reduce((counts,id)=>counts.set(id,(counts.get(id)||0)+1),new Map()),
));

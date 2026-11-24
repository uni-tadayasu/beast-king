// A recipe is not an entitlement. Only the authenticated server reward ledger
// unlocks this preset; the four public starter choices remain unchanged.
const pairs=ids=>Object.freeze(ids.flatMap(id=>[id,id]));

export const OPERATOR_DECK_ID='operator-kirahara-v1';
export const OPERATOR_DECK=Object.freeze({
  id:OPERATOR_DECK_ID,revision:2,
  name:'𠮷良原デッキ',
  subtitle:'王源の覇道・低コスト連鎖と合成の完成構築',
  description:'低コスト魔獣の連鎖、全体強化、ドローと守護、合成4枚、回復結界で制圧する第一弾・第二弾混成構築。レガリアを切り札に採用。',
  origin:'king',element:'king',aceId:'B0512',
  ids:pairs([
    'B0005','B0399','B0647','B0199','B0324','M0166','B0263','B0512',
    'M0065','B0079','M0256','M0512','B0791','B0769','G0227','G0260',
  ]),
  specialIds:pairs(['F0128','F0174']),
});

export const OPERATOR_DECK_REQUIRED=Object.freeze(Object.fromEntries(
  [...OPERATOR_DECK.ids,...OPERATOR_DECK.specialIds].reduce((counts,id)=>counts.set(id,(counts.get(id)||0)+1),new Map()),
));

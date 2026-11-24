/** A public recipe. Owning the cards is still required; this file grants none. */
const pairs=ids=>Object.freeze(ids.flatMap(id=>[id,id]));
export const PREMIUM_DECK_ID='regalia-premium-v1';
export const PREMIUM_DECK=Object.freeze({
 id:PREMIUM_DECK_ID,revision:1,name:'王冠竜レガリア・プレミアム',
 subtitle:'王冠竜と17種の専用カードが結ぶ神冠の王道',
 description:'王冠竜レガリア2枚と専用カードだけの32枚＋特殊4枚構築。サーチ、召喚軽減、守護、再展開、専用合成で王冠竜を支える。すべてのカードは既存4パックから通常入手でき、性能と使用条件は全プレイヤー共通。',
 origin:'king',element:'king',aceId:'B0512',
 ids:pairs(['B0512','B2049','B2050','B2051','B2052','B2053','B2054','B2055','M1025','M1026','M1027','M1028','M1029','M1030','G1025','G1026']),
 specialIds:pairs(['F0513','F0514']),
});
export const PREMIUM_DECK_REQUIRED=Object.freeze(Object.fromEntries(
 [...PREMIUM_DECK.ids,...PREMIUM_DECK.specialIds].reduce((counts,id)=>counts.set(id,(counts.get(id)||0)+1),new Map()),
));

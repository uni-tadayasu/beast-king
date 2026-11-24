/** Public Regalia support cards. Pack membership is fixed by a reproducible
 * shuffle; ownership, account role and runtime randomness never alter a card. */
export const REGALIA_CARD_ID='B0512';
export const PREMIUM_CARD_IDS=Object.freeze([
 'B2049','B2050','B2051','B2052','B2053','B2054','B2055',
 'M1025','M1026','M1027','M1028','M1029','M1030','G1025','G1026','F0513','F0514',
]);
export const PREMIUM_SET_SEED=0x72656761;
const packIds=['BK01','BK02','BK03','BK04'];
const shuffled=[...PREMIUM_CARD_IDS];let packSeed=PREMIUM_SET_SEED;
for(let i=shuffled.length-1;i>0;i--){
 packSeed^=packSeed<<13;packSeed^=packSeed>>>17;packSeed^=packSeed<<5;packSeed>>>=0;
 const j=Math.floor(packSeed/4294967296*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
}
export const PREMIUM_CARD_SET_ASSIGNMENTS=Object.freeze(Object.fromEntries(shuffled.map((id,i)=>[id,packIds[i%4]])));
export const PREMIUM_SET_ADDITIONS=Object.freeze(Object.fromEntries(packIds.map(id=>[id,Object.values(PREMIUM_CARD_SET_ASSIGNMENTS).filter(set=>set===id).length])));
export const PREMIUM_EFFECT_KINDS=Object.freeze([
 'regalia_sovereign','regalia_search','regalia_prayer','regalia_guard','regalia_conduit','regalia_seek_support',
 'regalia_recall','regalia_rally','regalia_advent','regalia_armament','regalia_revive','regalia_sanctuary','regalia_judgment',
 'regalia_barrier','regalia_coronation','regalia_dawn','regalia_eternity',
]);
const keywords={guard:'守護：相手は守護を持つ魔獣を先に攻撃しなければならない。',rush:'速攻：召喚したターンから攻撃できる。',drain:'吸収：戦闘で相手のハートポイントを実際に減らした分、自分のハートポイントを回復する。'};
const royal='「王冠竜 レガリア」またはレガリア専用合成魔獣';
const fusionPrefix='特殊デッキから「合成」で召喚。素材2枚目以降、1枚につき攻撃力・守備力+100。';
const supportText={
 regalia_search:'自分の山札にある「王冠竜 レガリア」1枚を公開して手札へ加える。手札が4枚なら加えない。',
 regalia_advent:'自分の手札の「王冠竜 レガリア」1枚を場に召喚する。手札になければ山札の「王冠竜 レガリア」1枚を公開して場に召喚する。召喚時効果を発動する。場が4体なら召喚しない。追加エーテルは不要。',
 regalia_prayer:`自分のハートポイントを600回復する。場に自分の${royal}がいれば追加で600回復する。回復上限は5000。`,
 regalia_guard:`召喚時、自分のハートポイントに結界600を得る。この魔獣が場にいる間、自分の${royal}の召喚時、その現在守備力・最大守備力を600上げる。`,
 regalia_conduit:'この魔獣が場にいる間、自分が手札から召喚する「王冠竜 レガリア」の必要エーテルを3減らす。同じ能力は重複し、必要エーテルは2未満にならない。',
 regalia_seek_support:'自分の山札の一番上にあるレガリア専用ミラクル1枚を公開して手札へ加える。手札が4枚なら加えない。',
 regalia_recall:'自分のお墓の「王冠竜 レガリア」1枚を手札へ戻す。お墓になければ山札の「王冠竜 レガリア」1枚を公開して手札へ加える。手札が4枚なら加えない。',
 regalia_rally:`場にある自分の${royal}すべての攻撃力・現在守備力・最大守備力を600上げる。`,
 regalia_armament:`場にある自分の${royal}1体を選び、攻撃力・現在守備力・最大守備力を1000上げる。`,
 regalia_revive:'自分のお墓の「王冠竜 レガリア」1枚を場に召喚し、召喚時効果を発動する。場が4体なら召喚しない。追加エーテルは不要。',
 regalia_sanctuary:`自分のハートポイントを1200回復する。場に自分の${royal}がいれば、さらに結界600を得る。回復上限は5000。`,
 regalia_judgment:`相手の魔獣すべての守備力に800ダメージ。場に自分の${royal}がいれば、相手のハートポイントにも800ダメージ。`,
 fusion:'自分の手持ち・出場ゾーン・お墓ゾーンから「王冠竜 レガリア」かレガリア専用の魔獣（合成魔獣を含む）を1枚以上選び、すべて異世界ゾーンへ送る。1つのゾーンだけでも、混合でもよい。特殊ゾーンのレガリア専用合成魔獣1体を選び、追加エーテルは不要で召喚する。',
 regalia_barrier:`場に自分の${royal}がいる時、相手の魔獣の攻撃に反応し、攻撃者の守備力に800ダメージを与えて自分に結界800を得る。攻撃者が消滅すれば攻撃を止める。結界は魔獣との戦闘で持ち主が受けるダメージには使われない。`,
 regalia_coronation:`次の自分のターン開始時、場にある自分の${royal}すべての攻撃力・現在守備力・最大守備力を500上げる。対象がいなければ、山札の「王冠竜 レガリア」1枚を公開して手札へ加える。手札が4枚なら加えない。`,
 regalia_dawn:'召喚時、相手の魔獣すべての守備力に800ダメージを与え、自分のハートポイントを800回復する。回復上限は5000。',
 regalia_eternity:'召喚時、自分のハートポイントを1000回復し、結界1000を得る。さらに自分のお墓の「王冠竜 レガリア」1枚を手札へ戻す。手札が4枚なら戻さない。回復上限は5000。',
};
const specs=[
 ['B2049','王冠の先導竜 アウレリス','beast',1,'GGR',300,400,'regalia_search',1,['guard'],'defense'],
 ['B2050','王冠の祈祷竜 セレイア','beast',1,'GGR',200,400,'regalia_prayer',600,['guard'],'defense'],
 ['B2051','王冠の近衛竜 ヴァルギス','beast',2,'GGR',500,800,'regalia_guard',600,['guard'],'defense'],
 ['B2052','王冠の召導竜 エーテリオ','beast',2,'GGR',400,600,'regalia_conduit',3,[],'defense'],
 ['B2053','王冠の伝令竜 ルミナーク','beast',2,'GGR',500,500,'regalia_seek_support',1,['rush'],'defense'],
 ['B2054','王冠の再誓竜 リヴァリス','beast',3,'GGR',700,900,'regalia_recall',1,['guard'],'defense'],
 ['B2055','王冠の昂翼竜 ソルディア','beast',3,'GGR',800,700,'regalia_rally',600,['rush'],'defense'],
 ['M1025','王冠竜の招来','miracle',3,'GGR',0,0,'regalia_advent',1,[],null,'regeneration'],
 ['M1026','王冠竜の神装','miracle',2,'GGR',0,0,'regalia_armament',1000,[],null,'power'],
 ['M1027','王冠竜の帰還','miracle',3,'GGR',0,0,'regalia_revive',1,[],null,'regeneration'],
 ['M1028','王冠竜の聖域','miracle',1,'GGR',0,0,'regalia_sanctuary',1200,[],null,'regeneration'],
 ['M1029','王冠竜の裁光','miracle',2,'GGR',0,0,'regalia_judgment',800,[],null,'power'],
 ['M1030','王冠竜の神合','miracle',2,'GGR',0,0,'fusion',0,[],null,'regeneration'],
 ['G1025','王冠竜の守護陣','gimmick',1,'GGR',0,0,'regalia_barrier',800,[],null,'reflection'],
 ['G1026','王冠竜の戴冠式','gimmick',1,'GGR',0,0,'regalia_coronation',500,[],null,'support'],
 ['F0513','神冠竜 レガリア・ソル','fusion',0,'GGR',1600,1800,'regalia_dawn',800,['guard','rush','drain'],'hybrid'],
 ['F0514','永冠竜 レガリア・エテルナ','fusion',0,'GGR',1400,2200,'regalia_eternity',1000,['guard','drain'],'hybrid'],
];
export function makePremiumCards({modelDescriptions}={}){
 return specs.map(([id,name,type,cost,rarity,attack,hp,kind,value,keys,model,subtype],i)=>{
  const creature=['beast','fusion'].includes(type);
  const text=(type==='fusion'?fusionPrefix+'素材は「王冠竜 レガリア」かレガリア専用魔獣だけ。':'')
   +(type==='beast'&&!['regalia_guard','regalia_conduit'].includes(kind)?'召喚時、':'')+supportText[kind]
   +(keys.length?' '+keys.map(k=>keywords[k]).join(' '):'')+(model?' '+modelDescriptions[model]:'');
  return Object.freeze({id,index:4609+i,name,type,category:creature?'beast':type,cost,rarity,attack,hp,
   effect:Object.freeze({kind,value}),keywords:Object.freeze([...keys]),...(model?{model}:{}),...(subtype?{subtype}:{}),
   element:'king',origin:'king',series:'regalia',family:'regalia',regaliaSupport:true,setId:PREMIUM_CARD_SET_ASSIGNMENTS[id],
   text,flavor:'黄金の王冠に結んだ誓い。レガリアとともに、新しい王道を切り拓く。',
   art:type==='beast'?i%16:type==='miracle'?16+i%4:type==='gimmick'?20+i%4:24+i%16,
   ...(kind==='regalia_armament'?{targetType:'regalia-ace'}:{}),
   ...(kind==='regalia_coronation'?{trigger:'turn_start'}:{}),
   ...(kind==='fusion'?{fusionFamily:'regalia',materialFamily:'regalia'}:{}),
   ...(type==='fusion'?{materialFamily:'regalia'}:{}),
  });
 });
}
export function upgradeRegalia(card,{modelDescriptions}){
 const keys=['guard','rush','drain'];
 return Object.freeze({...card,cost:8,attack:2400,hp:2600,model:'defense',family:'regalia',
  effect:Object.freeze({kind:'regalia_sovereign',value:1000}),keywords:Object.freeze(keys),
  text:'召喚時、相手の魔獣すべての守備力に1000ダメージを与え、自分のハートポイントを1500回復する。回復上限は5000。 '+keys.map(k=>keywords[k]).join(' ')+' '+modelDescriptions.defense,
 });
}

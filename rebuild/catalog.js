import {getCard as getPublishedCard} from '../catalog.js?v=20261125-38';
// Independent catalog boundary for the rebuilt game. Legacy main IDs stay intact.
import {CARDS as LEGACY} from './legacy-catalog.js?v=20261125-38';
import {ORIGINS as legacy_ORIGINS,ELEMENTS as legacy_ELEMENTS,TYPE_LABELS as legacy_TYPE_LABELS,RARITY_LABELS as legacy_RARITY_LABELS,KEYWORD_LABELS as legacy_KEYWORD_LABELS,MODEL_LABELS as legacy_MODEL_LABELS,SUBTYPE_LABELS as legacy_SUBTYPE_LABELS,MODEL_DESCRIPTIONS as legacy_MODEL_DESCRIPTIONS,POINT_SCALE as legacy_POINT_SCALE,FUSION_MATERIAL_BONUS as legacy_FUSION_MATERIAL_BONUS,DECK_SIZE as legacy_DECK_SIZE,DECK_MIN as legacy_DECK_MIN,DECK_MAX as legacy_DECK_MAX,SPECIAL_DECK_SIZE as legacy_SPECIAL_DECK_SIZE,DECK_COPY_LIMIT as legacy_DECK_COPY_LIMIT,STARTER_DECKS as legacy_STARTER_DECKS,RARITY_ORDER as legacy_RARITY_ORDER,FUSION_CARD_ID as legacy_FUSION_CARD_ID} from './legacy-catalog.js?v=20261125-38';
export const ORIGINS=legacy_ORIGINS;
export const ELEMENTS=legacy_ELEMENTS;
export const TYPE_LABELS=legacy_TYPE_LABELS;
export const RARITY_LABELS=legacy_RARITY_LABELS;
export const KEYWORD_LABELS=legacy_KEYWORD_LABELS;
export const MODEL_LABELS=legacy_MODEL_LABELS;
export const SUBTYPE_LABELS=legacy_SUBTYPE_LABELS;
export const MODEL_DESCRIPTIONS=legacy_MODEL_DESCRIPTIONS;
export const POINT_SCALE=legacy_POINT_SCALE;
export const FUSION_MATERIAL_BONUS=legacy_FUSION_MATERIAL_BONUS;
export const DECK_SIZE=legacy_DECK_SIZE;
export const DECK_MIN=legacy_DECK_MIN;
export const DECK_MAX=legacy_DECK_MAX;
export const SPECIAL_DECK_SIZE=legacy_SPECIAL_DECK_SIZE;
export const DECK_COPY_LIMIT=legacy_DECK_COPY_LIMIT;
export const STARTER_DECKS=legacy_STARTER_DECKS;
export const RARITY_ORDER=legacy_RARITY_ORDER;
export const FUSION_CARD_ID=legacy_FUSION_CARD_ID;
export const PACKS=Object.freeze([
 Object.freeze({id:'BK01',name:'六源の覚醒',number:1}),
 Object.freeze({id:'BK02',name:'王源の継承',number:2})
]);
const domains=[
 ['極光','雪嶺','氷海','霜原','白暁','氷晶','凍月','銀界'],
 ['潮境','水晶','珊海','深溝','雲雨','水葬','海峡','蒼淵'],
 ['灯種','熾砂','黒火','赤彗','火山','朱焔','熔星','紅境'],
 ['野風','青稲','空庭','雷樹','曙雲','風穴','天瀑','雲境'],
 ['露花','花霧','薫香','夜咲','翡翠','霞園','夢花','百華'],
 ['樹根','苔原','古森','樹海','白樺','葉影','森灯','世界樹'],
 ['石窟','赤壁','隕石','鉄砂','石柱','黒曜','鉱海','重岩'],
 ['幽月','星砂','忘都','時界','虚空','星霊','王廟','王域']
];
const creatures=[
 ['白鼬','氷鰐','雪梟','海豹','鱗鹿','霜蝶','白鯱','氷甲獣'],
 ['鰭狐','深海蛸','珊瑚蟹','潮馬','水母','泡鱗魚','海牛','潮鰻'],
 ['火蜥蜴','焔猪','砂蠍','赤猿','火鼠','炭牙獣','赤蜂','火山鳥'],
 ['雲燕','嵐鳩','風蛇','雷蝉','翼兎','空魚','雲角馬','暴風鷲'],
 ['花蜂','蘭螳螂','花虎','藤蛇','薔薇狐','花鯉','花鶴','香鹿'],
 ['樹猿','苔犀','根蜘蛛','樹梟','茸亀','葉豹','幹牛','森鰐'],
 ['岩犀','砂亀','石象','晶蟹','鉱甲虫','砂鯨','鉄山羊','晶百足'],
 ['星狼','月蛾','影鶴','時計獅','鏡竜','星海獣','天冠麒麟','冥王竜']
];
const names=[
 ['ユキネ','ヴァイラ','シノル','フリゼ','リュッカ','ネヴェ','オルカン','グレイス'],
 ['ミナロ','オクトア','コラル','リュウナ','メルーナ','パルシア','ドゥゴン','ナミル'],
 ['ラゼル','グランヴ','サンドラ','ヴァルカ','ヒノネ','カーボル','アカリス','フェルカ'],
 ['ツバメル','エアル','ソラネ','ライカ','ウルフェ','エアフィ','キルア','ガルヴァ'],
 ['ハナリ','オルキス','フローラ','ヴィネル','ロゼル','カノコ','クラネ','アロマ'],
 ['モルノ','コケル','ルータ','フォルム','キノル','ネブラ','バルク','グロウ'],
 ['ガンゼル','サブル','グラント','クリスカ','メタルン','タルク','アイゼン','ザクロス'],
 ['ステル','ルナヴァ','カゲリ','クロメル','ミラグ','コスモル','セイガ','ヴェルザード']
];
const miracleNouns=['断光','息吹','導標','結束','流星','聖壁','魂環','生命泉'];
const gimmickNouns=['逆刃陣','鏡壁陣','軍旗陣','湧命陣'];
const fusionNouns=['双冠獣','極翼獣','天環獣','万象獣'];
export const REGALIA_ART_ASSET='assets/design-v2/cards/individual/king.webp';
// Freeze the original mechanics for existing rebuild saves; published names/art
// are shared with the new catalogue while card IDs, costs and effects stay stable.
// The saved rebuild IDs stay valid: its historical BK01 slot B0512 is
// restored as the mechanical spirit, while B1024 is the sole Regalia.
const first=LEGACY.map(c=>{
 const visual=getPublishedCard(c.id==='B0512'?'B1024':c.id);
 return Object.freeze({...c,pack:'BK01',origin:visual.origin,element:visual.origin,artStatus:'existing',...(c.id==='B0512'?{name:visual.name,flavor:visual.flavor,origin:visual.origin,element:visual.origin,artSourceId:'B1024'}:{})});
});
const byKind={beast:512,miracle:256,gimmick:256,fusion:128};
const prefixes={beast:'B',miracle:'M',gimmick:'G',fusion:'F'};
const second=[];
for(const [type,count] of Object.entries(byKind)){
 const source=first.filter(c=>c.type===type);
 for(let n=0;n<count;n++){
  // Rotate compatible effect/stat templates. The model, text and numbers always agree.
  const width=type==='beast'?64:type==='fusion'?16:32;
  const realm=Math.floor(n/width),local=n%width,rank=Math.floor(local/(type==='beast'||type==='miracle'?8:4)),variant=local%(type==='beast'||type==='miracle'?8:4);
  let template=source[realm*width+((local+width/2)%width)];
  // Preserve the original Regalia's stats and illustration in the second printing.
  if(type==='beast'&&(n===479||n===511))template=source[n];
  // Keep one synthesis spell in each expansion.
  if(type==='miracle'&&(n===239||n===255))template=source[n];
  const id=prefixes[type]+String(count+n+1).padStart(4,'0');
  let name=type==='beast'?domains[realm][rank]+creatures[realm][variant]+' '+names[realm][variant]:
   type==='fusion'?domains[realm][rank]+fusionNouns[variant]+' '+names[realm][variant]+'ル':
   domains[realm][rank]+'の'+(type==='miracle'?miracleNouns[variant]:gimmickNouns[variant]);
  const visual=getPublishedCard(id==='B1024'?'B0512':id);
  if(visual)name=visual.name;
  if(type==='beast'&&n===511)name='王冠竜 レガリア';
  if(type==='miracle'&&n===255)name='合成';
  const origin=visual.origin;
  second.push(Object.freeze({...template,id,index:1153+second.length,name,origin,element:origin,pack:'BK02',
   flavor:visual?.flavor||'王源の継承 — '+domains[realm][rank]+'に伝わる新たな契約。',
   artStatus:'existing',art:null,...(id==='B1024'?{artAsset:REGALIA_ART_ASSET}:{})}));
 }
}
export const FIRST_CARDS=Object.freeze(first);
export const SECOND_CARDS=Object.freeze(second);
export const CARDS=Object.freeze([...first,...second]);
export const SECOND_REGALIA_ID='B1024';
// Only B1024 is Regalia. The alternate illustration is an authenticated skin, not a card.
export const CARD_MAP=new Map(CARDS.map(c=>[c.id,c]));
export const getCard=id=>CARD_MAP.get(id);
export const SECOND_FUSION_CARD_ID='M0512';
export function cardsInPack(id){
 if(id==='BK01')return FIRST_CARDS;
 if(id==='BK02')return SECOND_CARDS;
 throw new Error('存在しないパックです。');
}
function validate(ids,size,types,label){
 const errors=[];
 if(!Array.isArray(ids))return {valid:false,errors:[label+'の形式が正しくありません。']};
 if(ids.length!==size)errors.push(label+'は'+size+'枚ちょうど必要です。');
 const names=new Map();
 for(const id of ids){
  const c=getCard(id);
  if(!c||!types.includes(c.type)){errors.push('このデッキに入れられないカードが含まれています。');continue;}
  names.set(c.name,(names.get(c.name)||0)+1);
 }
 for(const [name,n] of names)if(n>DECK_COPY_LIMIT)errors.push(name+'は収録弾を問わず同名2枚までです。');
 return {valid:errors.length===0,errors:[...new Set(errors)]};
}
export const validateDeck=ids=>validate(ids,DECK_SIZE,['beast','miracle','gimmick'],'メインデッキ');
export const validateSpecialDeck=ids=>validate(ids,SPECIAL_DECK_SIZE,['fusion'],'特殊デッキ');

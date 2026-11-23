// Independent catalog boundary for the rebuilt game. Legacy main IDs stay intact.
import {CARDS as LEGACY,ORIGINS,DECK_SIZE,SPECIAL_DECK_SIZE,DECK_COPY_LIMIT,MODEL_DESCRIPTIONS} from '../catalog.js';
export {ORIGINS, ELEMENTS, TYPE_LABELS, RARITY_LABELS, KEYWORD_LABELS, MODEL_LABELS, SUBTYPE_LABELS, MODEL_DESCRIPTIONS, POINT_SCALE, FUSION_MATERIAL_BONUS, DECK_SIZE, DECK_MIN, DECK_MAX, SPECIAL_DECK_SIZE, DECK_COPY_LIMIT, STARTER_DECKS, RARITY_ORDER, FUSION_CARD_ID} from '../catalog.js';
export const PACKS=Object.freeze([
 Object.freeze({id:'BK01',name:'六源の覚醒',number:1}),
 Object.freeze({id:'BK02',name:'第二弾・王域の黎明（仮）',number:2})
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
 ['ステル','ルナヴァ','カゲリ','クロメル','ミラグ','コスモル','セイガ','レガリア']
];
const miracleNouns=['断光','息吹','導標','結束','流星','聖壁','魂環','生命泉'];
const gimmickNouns=['逆刃陣','鏡壁陣','軍旗陣','湧命陣'];
const fusionNouns=['双冠獣','極翼獣','天環獣','万象獣'];
const first=LEGACY.map(c=>Object.freeze({...c,pack:'BK01',artStatus:'existing'}));
const byKind={beast:512,miracle:256,gimmick:256,fusion:128};
const prefixes={beast:'B',miracle:'M',gimmick:'G',fusion:'F'};
const newOrigins=['mountain','river','seed','grass','flower','tree','mountain','king'];
const second=[];
for(const [type,count] of Object.entries(byKind)){
 const source=first.filter(c=>c.type===type);
 for(let n=0;n<count;n++){
  // Rotate compatible effect/stat templates. The model, text and numbers always agree.
  const width=type==='beast'?64:type==='fusion'?16:32;
  const realm=Math.floor(n/width),local=n%width,rank=Math.floor(local/(type==='beast'||type==='miracle'?8:4)),variant=local%(type==='beast'||type==='miracle'?8:4);
  let template=source[realm*width+((local+width/2)%width)];
  // Reserve alternate print of the original Regalia at the end of the set.
  if(type==='beast'&&n===511)template=source.find(c=>c.id==='B0512');
  // Keep one synthesis spell in each expansion.
  if(type==='miracle'&&n===255)template=source.find(c=>c.id==='M0256');
  else if(type==='miracle'&&template.effect.kind==='fusion')template=source[realm*width+((local+width/2-1)%width+width)%width];
  const id=prefixes[type]+String(count+n+1).padStart(4,'0');
  let name=type==='beast'?domains[realm][rank]+creatures[realm][variant]+' '+names[realm][variant]:
   type==='fusion'?domains[realm][rank]+fusionNouns[variant]+' '+names[realm][variant]+'ル':
   domains[realm][rank]+'の'+(type==='miracle'?miracleNouns[variant]:gimmickNouns[variant]);
  if(type==='beast'&&n===511)name='王冠竜 レガリア';
  if(type==='miracle'&&n===255)name='合成';
  const origin=newOrigins[realm];
  second.push(Object.freeze({...template,id,index:1153+second.length,name,origin,element:origin,pack:'BK02',
   flavor:'王域の黎明 — '+domains[realm][rank]+'に伝わる新たな契約。',
   artStatus:'pending',art:null}));
 }
}
export const FIRST_CARDS=Object.freeze(first);
export const SECOND_CARDS=Object.freeze(second);
export const CARDS=Object.freeze([...first,...second]);
export const CARD_MAP=new Map(CARDS.map(c=>[c.id,c]));
export const getCard=id=>CARD_MAP.get(id);
export const SECOND_REGALIA_ID='B1024';
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

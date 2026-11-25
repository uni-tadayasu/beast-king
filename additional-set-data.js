/** Authored expansion families. Printed values are final battle points.
 * New effects use only existing public zones; old saved games need no counters.
 */
import {balancedExpansionCreature} from './catalog-balance.js?v=20261125-36';

export const ADDITIONAL_CARD_SETS=Object.freeze([
 {id:'BK03',edition:3,editionLabel:'第三弾',name:'継承の共鳴',reading:'けいしょうのきょうめい',coverId:'B1025',cardCount:1152,theme:'第一弾・第二弾の魔獣を支え、受け継いだデッキを育てる。'},
 {id:'BK04',edition:4,editionLabel:'第四弾',name:'星界の創世',reading:'せいかいのそうせい',coverId:'B1537',cardCount:1152,theme:'星巡・残響・命誓・封機。第四弾だけで組み上がる4つの戦略。'},
].map(Object.freeze));
export const EXPANSION_FAMILIES=Object.freeze([
 {id:'orbit',name:'星巡',color:'#70dcef',description:'星巡の魔獣の異なるオリジンを揃える。参照は最大3種類。',breeds:['星鹿','軌道鯨','星梟','環蛇','星狐','衛星亀','光翼獣','天球竜'],names:['アステル','オルビア','ルキノ','セレス','リスティ','サテラ','フィルナ','ソラリス']},
 {id:'echo',name:'残響',color:'#bba5f1',description:'お墓にある残響のミラクルの記憶を重ねる。参照は最大3枚。',breeds:['響狼','記憶蛾','鏡鶴','音叉豹','夢鯨','音晶狐','銀声獣','残響竜'],names:['リフレン','メモリア','カノーネ','オスティ','レミニア','ノイア','ヴェルソ','エコリス']},
 {id:'vow',name:'命誓',color:'#ef998e',description:'ハートポイント200を支払い、命誓の魔獣を育てる。残り200以下では支払わない。',breeds:['誓鹿','血晶虎','紅鷹','契約兎','脈動犀','誓羽狐','命環獣','盟誓竜'],names:['セリア','ルベル','アヴィス','ラピア','グランセ','フェディ','アニマ','コルディア']},
 {id:'forge',name:'封機',color:'#87c6b7',description:'お墓の封機の魔獣を1枚だけ異世界へ送り、仕掛けを増幅する。',breeds:['封印蟹','銅環牛','鍵翼鳥','炉心蜥蜴','機紋狼','歯車亀','封函獣','創機竜'],names:['クレヴィ','ブロント','キリス','フォルナ','ギルド','クロシェ','アルケ','テクノア']},
].map(f=>Object.freeze({...f,breeds:Object.freeze(f.breeds),names:Object.freeze(f.names)})));
const LEGACY_CLANS=[
 ['星継','白鹿','アウレア'],['潮継','水狐','マレディ'],['火継','朱狼','イグニア'],['風継','翼馬','ゼファル'],
 ['花継','花鶴','フロレア'],['樹継','森熊','アルシア'],['晶継','岩犀','ペトリア'],['月継','銀豹','ノクレア'],
];
const ORIGINS=['mountain','river','seed','grass','flower','tree'];
const TYPES=[['beast','B',512,8],['miracle','M',256,8],['gimmick','G',256,4],['fusion','F',128,4]];
const TIERS=['初灯','旅路','導標','環紋','遠境','天脈','極環','永約'];
const RARITIES=['N','N','R','KR','KR','KKR','GR','GGR'];
const ROLE_NAMES=['先導','護衛','調律','追憶','交誓','補修','伝令','終奏'];
const MIRACLE_NAMES=['閃光','結束','返歌','天幕','銘文','再起','流転','祈環'];
const GIMMICK_NAMES=['迎撃陣','反照門','共鳴旗','再生炉','伏牙陣','返光壁','星儀壇','帰環庭'];
const PREFIX='特殊デッキから「合成」で召喚。素材2枚目以降、1枚につき攻撃力・守備力+100。';
const KW={guard:'守護：相手は守護を持つ魔獣を先に攻撃する。',rush:'速攻：召喚したターンから攻撃できる。',drain:'吸収：戦闘で相手のハートポイントを実際に減らした分、自分を回復する。'};
export const EXPANSION_EFFECT_KINDS=Object.freeze([
 'legacy_rally','legacy_mend','legacy_recall','legacy_aegis','legacy_bless','legacy_bond',
 'orbit_rally','orbit_aegis','orbit_focus','orbit_pulse',
 'echo_bolt','echo_aegis','echo_recall','echo_chorus',
 'vow_rally','vow_aegis','vow_focus','vow_bolt',
 'forge_rally','forge_aegis','forge_bolt','forge_restore',
 'family_ambush','family_barrier',
]);
const FAMILY_ROLES={
 legacy:{beast:['legacy_aegis','legacy_rally','legacy_mend','legacy_bond','legacy_recall','none','legacy_rally','legacy_aegis'],miracle:['legacy_bless','legacy_bond','legacy_rally','legacy_aegis','legacy_mend','legacy_recall','damage_enemy','shield_heal'],gimmick:['family_ambush','family_barrier','legacy_rally','legacy_mend'],fusion:['legacy_rally','legacy_aegis','legacy_bond','legacy_recall']},
 orbit:{beast:['orbit_aegis','orbit_rally','orbit_aegis','orbit_pulse','none','orbit_rally','orbit_pulse','orbit_aegis'],miracle:['orbit_pulse','orbit_focus','orbit_rally','orbit_focus','orbit_aegis','shield_heal','orbit_aegis','heal'],gimmick:['family_ambush','family_barrier','orbit_rally','orbit_aegis','family_ambush','family_barrier','orbit_pulse','orbit_aegis'],fusion:['orbit_rally','orbit_aegis','orbit_pulse','none']},
 echo:{beast:['echo_aegis','echo_chorus','echo_recall','echo_bolt','none','echo_aegis','echo_bolt','echo_chorus'],miracle:['echo_bolt','damage_enemy','echo_chorus','echo_bolt','echo_aegis','echo_recall','shield_heal','heal'],gimmick:['family_ambush','family_barrier','echo_aegis','echo_chorus','family_ambush','family_barrier','echo_bolt','echo_recall'],fusion:['echo_chorus','echo_aegis','echo_bolt','echo_recall']},
 vow:{beast:['vow_aegis','vow_rally','vow_aegis','vow_bolt','none','vow_rally','vow_bolt','vow_aegis'],miracle:['vow_bolt','vow_focus','vow_rally','vow_focus','vow_aegis','heal','shield_heal','heal'],gimmick:['family_ambush','family_barrier','vow_rally','vow_aegis','family_ambush','family_barrier','vow_bolt','vow_aegis'],fusion:['vow_rally','vow_aegis','vow_bolt','none']},
 forge:{beast:['forge_aegis','forge_rally','forge_restore','forge_bolt','none','forge_rally','forge_bolt','forge_aegis'],miracle:['forge_bolt','forge_rally','damage_enemy','forge_bolt','forge_aegis','forge_restore','shield_heal','heal'],gimmick:['family_ambush','family_barrier','forge_rally','forge_restore','family_ambush','family_barrier','forge_bolt','forge_aegis'],fusion:['forge_rally','forge_aegis','forge_bolt','forge_restore']},
};
const isRally=kind=>['legacy_rally','orbit_rally','echo_chorus','vow_rally','forge_rally'].includes(kind);
function effectStats(kind,tier,type){
 const rank=type==='fusion'?1:Math.floor(tier/2);
 if(kind==='none')return {value:0,cost:1};
 if(kind.endsWith('_recall'))return {value:0,cost:3,limit:4};
 if(isRally(kind)){const value=100+(rank>=3?100:0);return {value,cost:value===100?3:5};}
 if(['legacy_bless','orbit_focus','vow_focus'].includes(kind)){const value=100*(2+rank);return {value,cost:rank+2};}
 if(kind==='family_ambush'||kind==='family_barrier'){const value=(2+tier)*100;return {value,cost:Math.min(8,Math.ceil(value/200))};}
 if(kind==='legacy_mend'||kind==='forge_restore'){const value=(2+rank)*100;return {value,cost:rank+1};}
 if(kind==='heal')return {value:(4+2*rank)*100,cost:rank+1};
 if(kind==='shield_heal')return {value:(3+rank)*100,cost:rank+2};
 if(kind==='legacy_aegis'||kind==='orbit_aegis')return {value:(1+Math.floor(rank/2))*100,cost:2+2*Math.floor(rank/2)};
 if(kind==='echo_aegis'||kind==='forge_aegis'||kind==='vow_aegis')return {value:(2+rank)*100,cost:rank+2};
 if(kind==='legacy_bond')return {value:(1+rank)*100,cost:rank+2};
 return {value:(2+rank)*100,cost:rank+2};
}
function effectText(kind,value,family){
 const f=family==='legacy'?'第一弾・第二弾':EXPANSION_FAMILIES.find(f=>f.id===family)?.name;
 const texts={
  none:'召喚時の効果はない。',
  legacy_rally:`場の第一弾・第二弾の味方魔獣すべての攻撃力・現在守備力・最大守備力を${value}上げる。第三弾以降は対象外。`,
  legacy_mend:`場の第一弾・第二弾の味方魔獣すべての守備力を${value}回復する。各魔獣の最大守備力を超えない。`,
  legacy_recall:'自分のお墓の第一弾・第二弾のコスト4以下の通常魔獣を、古い順に1枚手札へ戻す。手札が4枚なら戻さない。合成魔獣は対象外。',
  legacy_aegis:`場の第一弾・第二弾の味方魔獣1体につき結界${value}を得る。最大3体を参照。`,
  legacy_bless:`場の第一弾・第二弾の味方魔獣1体を選び、攻撃力・現在守備力・最大守備力を${value}上げる。`,
  legacy_bond:`相手のハートポイントに${value}ダメージ。自分の場に第一弾と第二弾の魔獣が両方いれば、さらに100ダメージ。`,
  orbit_rally:`場の星巡の味方魔獣すべての攻撃力を${value}×星巡の異なるオリジン数だけ上げる。最大3種類を参照。`,
  orbit_aegis:`場の星巡の異なるオリジン1種類につき結界${value}を得る。最大3種類を参照。`,
  orbit_focus:`場の星巡の味方魔獣1体の攻撃力・現在守備力・最大守備力を${value}上げる。星巡の異なるオリジンが3種類以上なら追加で100上げる。`,
  orbit_pulse:`相手に${value}ダメージ。場の星巡の異なるオリジンが3種類以上なら追加で100ダメージ。`,
  echo_bolt:`相手に${value}ダメージ。自分のお墓の残響ミラクル1枚につき100追加。最大3枚、このカード自身は数えない。`,
  echo_aegis:`結界${value}を得る。自分のお墓の残響ミラクル1枚につき100追加。最大3枚、このカード自身は数えない。`,
  echo_recall:'自分のお墓の残響のコスト4以下の通常魔獣を、古い順に1枚手札へ戻す。手札が4枚なら戻さない。合成魔獣は対象外。',
  echo_chorus:`場の残響の味方魔獣すべての攻撃力を${value}上げる。自分のお墓に残響ミラクルが3枚以上あれば追加で100。このカード自身は数えない。`,
  vow_rally:`自分のハートポイント200を支払い、場の命誓の味方魔獣すべての攻撃力・現在守備力・最大守備力を${value}上げる。`,
  vow_aegis:`自分のハートポイント200を支払い、結界${value+200}を得る（基本値${value}）。`,
  vow_focus:`自分のハートポイント200を支払い、場の命誓の味方魔獣1体の攻撃力・現在守備力・最大守備力を${value+100}上げる（基本値${value}）。`,
  vow_bolt:`自分のハートポイント200を支払い、相手に${value+100}ダメージ（基本値${value}）。`,
  forge_rally:`場の封機の味方魔獣すべての攻撃力・現在守備力・最大守備力を${value}上げる。自分のお墓の封機の魔獣（合成魔獣を含む）1枚を古い順に異世界へ送れたら追加で100上げる。`,
  forge_aegis:`結界${value}を得る。自分のお墓の封機の魔獣（合成魔獣を含む）1枚を古い順に異世界へ送れたら追加で200。`,
  forge_bolt:`相手に${value}ダメージ。自分のお墓の封機の魔獣（合成魔獣を含む）1枚を古い順に異世界へ送れたら追加で200ダメージ。`,
  forge_restore:`場の封機の味方魔獣すべての守備力を${value}回復。自分のお墓の封機の魔獣（合成魔獣を含む）1枚を古い順に異世界へ送れたら追加で200回復。最大守備力を超えない。`,
  family_ambush:`場に${f}の味方魔獣がいる時、相手の魔獣の攻撃に反応し、その攻撃者の守備力に${value}ダメージ。消滅すれば攻撃を止める。`,
  family_barrier:`場に${f}の味方魔獣がいる時、自分への直接攻撃を最大${value}軽減し、軽減分を攻撃者の守備力へ反射する。`,
  damage_enemy:`相手の魔獣1体かハートポイントを選び、${value}ダメージ。`,
  shield_heal:`自分のハートポイントを${value}回復し、結界${value}を得る。回復上限は5000。`,
  heal:`自分のハートポイントを${value}回復する。回復上限は5000。`,
 };
 let text=texts[kind];
 if(kind.startsWith('vow_'))text+=' 残り200以下では支払わず効果なし。支払いは結界で防げない。';
 if(kind.startsWith('forge_'))text+=' このカード自身は異世界へ送らない。対象がない回復・強化では素材を消費しない。';
 return text;
}
export function makeAdditionalCards({modelDescriptions,fusionText}){
 const cards=[];
 for(const [setIndex,set] of ADDITIONAL_CARD_SETS.entries())for(const [type,prefix,count] of TYPES){
  for(let n=0;n<count;n++){
   const familyIndex=setIndex?Math.floor(n/(count/4)):Math.floor(n/(count/8));
   const family=setIndex?EXPANSION_FAMILIES[familyIndex].id:'legacy';
   const familyData=setIndex?EXPANSION_FAMILIES[familyIndex]:null,clan=LEGACY_CLANS[familyIndex];
   const width=count/(setIndex?4:8),local=n%width;
   const roles=FAMILY_ROLES[family][type],role=local%roles.length,tier=Math.floor(local/roles.length)%8;
   const id=prefix+String(count*(setIndex+2)+n+1).padStart(4,'0');
   const fusionSpell=type==='miracle'&&(setIndex?local===width-1:n===count-1);
   const kind=fusionSpell?'fusion':roles[role];
   const stats=fusionSpell?{value:0,cost:3}:effectStats(kind,tier,type);
   const model=type==='fusion'?'hybrid':type==='beast'?(local%2?'attack':'defense'):null;
   const keywords=[];
   if(type==='beast'||type==='fusion'){
    if(role===0||role===6)keywords.push('guard');
    else if(role===3||role===7)keywords.push(tier%2?'drain':'rush');
   }
   const body=balancedExpansionCreature({type,model,tier,role,kind,keywords,value:stats.value});
   const cost=type==='fusion'?0:type==='beast'?body.cost:stats.cost;
   const typeOffset={beast:0,miracle:512,gimmick:768,fusion:1024}[type];
   const originOffset=(setIndex?{beast:2,fusion:4,miracle:4,gimmick:0}:{beast:4,fusion:4,miracle:0,gimmick:0})[type];
   const origin=ORIGINS[(n+originOffset)%6];
   const groupName=familyData?.name||clan[0],breed=familyData?.breeds[role%8]||clan[1],personal=familyData?.names[role%8]||clan[2];
   // The second half of a BK04 beast/fusion family is a separate authored role.
   const cycle=setIndex&&type==='beast'?Math.floor(local/64):setIndex&&type==='fusion'?Math.floor(local/16):0;
   let name=type==='beast'?`${groupName}${TIERS[tier]}${cycle?'遊撃':'守航'}${ROLE_NAMES[role]}${breed} ${personal}`:
    type==='fusion'?`${groupName}${TIERS[tier]}${cycle?'双環':'大環'}${ROLE_NAMES[role]}獣 ${personal}`:
    `${groupName}・${TIERS[tier]}の${type==='miracle'?MIRACLE_NAMES[role]:GIMMICK_NAMES[role]}`;
   if(fusionSpell)name=groupName+'の合成';
   const enemyKinds=['damage_enemy','orbit_pulse','echo_bolt','vow_bolt','forge_bolt'];
   const targetType=type==='miracle'?(enemyKinds.includes(kind)?'enemy':kind==='legacy_bless'?'legacy':kind==='orbit_focus'?'orbit':kind==='vow_focus'?'vow':null):null;
   const trigger=type==='gimmick'?(kind.startsWith('family_')?'attack':'turn_start'):null;
   let text=fusionSpell?fusionText:effectText(kind,stats.value,family);
   if(enemyKinds.includes(kind)&&kind!=='damage_enemy')text+=' '+(type==='miracle'?'相手の魔獣1体かハートポイントを選ぶ。':'対象は相手のハートポイント。');
   if(type==='beast')text='召喚時、'+text;
   if(type==='fusion')text=PREFIX+'召喚時、'+text;
   if(trigger==='turn_start')text='次の自分のターン開始時に発動し、お墓へ移る。'+text;
   if(model)text+=' '+keywords.map(k=>KW[k]).join(' ')+' '+modelDescriptions[model];
   const subtype=type==='miracle'?(fusionSpell||(setIndex?role>=4:![0,1,2,6].includes(role))?'regeneration':'power'):type==='gimmick'?(trigger==='attack'?'reflection':'support'):null;
   const art=type==='beast'?(familyIndex*2+role%2)%16:type==='miracle'?16+role%4:type==='gimmick'?20+role%4:24+(familyIndex*2+role%2)%16;
   cards.push(Object.freeze({id,index:2305+setIndex*1152+typeOffset+n,setId:set.id,name,type,category:model?'beast':type,origin,element:origin,series:setIndex?family:'legacy-'+familyIndex,family,role:ROLE_NAMES[role],cost,rarity:fusionSpell?'R':type==='fusion'?['N','N','R','R','KR','KR','KR','KKR','KKR','KKR','GR','GR','GGR','GGR','GGR','GGR'][local%16]:type==='miracle'&&!setIndex?(tier===3&&role>=6?(role===6?'GR':'GGR'):['N','R','KR','KKR'][tier]):RARITIES[tier],attack:body.attack,hp:body.hp,...(model?{model}:{}),...(subtype?{subtype}:{}),...(targetType?{targetType}:{}),...(trigger?{trigger}:{}),effect:Object.freeze({kind,value:stats.value,...(stats.limit?{limit:stats.limit}:{})}),keywords:Object.freeze(keywords),text,flavor:familyData?`${familyData.name}の${personal}は、${ROLE_NAMES[role]}の役目を新しい星界に刻む。`:`${clan[0]}の契約者は、過去の魔獣と明日の王庭を結ぶ。`,art}));
  }
 }
 return cards;
}

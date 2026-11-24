/** Public challenge opponents, built only from collectible cards.
 * These lists grant no ownership, operator entitlement or special artwork.
 * "Environment" is the game's authored challenge roster, not a measured usage ranking.
 */
import {CARDS,ORIGINS,EXPANSION_FAMILIES,getCard,validateDeck,validateSpecialDeck} from './catalog.js?v=20261124-31';

const older=card=>card.setId==='BK01'||card.setId==='BK02';
const pairs=cards=>cards.flatMap(card=>[card.id,card.id]);
const ranked=(cards,score)=>[...cards].sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id));
function pick(cards,count,score,used=new Set()){
 const chosen=ranked(cards.filter(card=>!used.has(card.id)),score).slice(0,count);
 if(chosen.length!==count)throw new Error('Incomplete event recipe.');
 for(const card of chosen)used.add(card.id);
 return chosen;
}
function bodyScore(card,style='tempo'){
 const kind=card.effect.kind,value=card.effect.value||0,defensive=card.model!=='attack';
 const effect=kind==='draw'?210:kind==='buff_all'?170:kind.includes('rally')||kind==='echo_chorus'?150:kind.includes('bond')||kind.includes('bolt')||kind.includes('pulse')||kind==='damage_core'?value*.8:kind.includes('aegis')||kind==='shield'?value*.4:kind.includes('recall')?40:kind==='heal'?value*.3:0;
 return (card.attack*(style==='tempo'?1.3:.85)+card.hp*(defensive?(style==='tempo'?.8:1.35):.15)+effect+(card.keywords.includes('rush')?240:0)+(card.keywords.includes('guard')?(style==='tempo'?120:180):0)+(card.keywords.includes('drain')?70:0))/(card.type==='fusion'?1:card.cost+1.8);
}
const spellScore=card=>(card.effect.kind==='draw'?380:card.effect.kind==='fusion'?450:card.effect.kind.includes('rally')||card.effect.kind==='echo_chorus'?320:card.effect.kind.includes('focus')||card.effect.kind==='legacy_bless'?card.effect.value*1.4:card.effect.value)/(card.cost+.8);
const trapScore=card=>(card.effect.kind==='spring'?420:card.effect.value||150)/(card.cost+.7);

function creatureCurve(pool,style,used=new Set(),count=10){
 const result=[];
 const take=(filter,n)=>result.push(...pick(pool.filter(filter),n,c=>bodyScore(c,style),used));
 take(c=>c.cost<=2,Math.min(style==='tempo'?5:4,count));
 take(c=>c.cost>=3&&c.cost<=4,Math.min(3,count-result.length));
 if(result.length<count)take(c=>c.cost<=7,count-result.length);
 return result;
}
function support(pool,{style='tempo',family=null,legacy=false}={}){
 const used=new Set(),cards=[];
 const choose=filter=>{const card=pick(pool.filter(c=>c.type==='miracle'&&filter(c)),1,spellScore,used)[0];cards.push(card);};
 choose(c=>c.effect.kind==='fusion');
 if(legacy){choose(c=>c.effect.kind==='legacy_bless');choose(c=>c.effect.kind==='legacy_bond');choose(c=>c.effect.kind==='draw');}
 else if(family){
  choose(c=>['orbit_focus','echo_chorus','vow_focus','forge_rally'].includes(c.effect.kind));
  choose(c=>['orbit_pulse','echo_bolt','vow_bolt','forge_bolt'].includes(c.effect.kind));
  choose(c=>style==='tempo'?['orbit_rally','echo_bolt','vow_rally','forge_bolt'].includes(c.effect.kind):['shield_heal','heal',family+'_aegis'].includes(c.effect.kind));
 }else{
  choose(c=>c.effect.kind==='draw');
  choose(c=>style==='tempo'?['buff','damage_enemy','drain'].includes(c.effect.kind):['shield_heal','heal'].includes(c.effect.kind));
  choose(c=>style==='tempo'?['damage_enemy','sweep','drain'].includes(c.effect.kind):['damage_enemy','sweep'].includes(c.effect.kind));
 }
 const traps=pick(pool.filter(c=>c.type==='gimmick'&&(family?c.family===family:legacy?c.family==='legacy'||older(c):older(c))),2,trapScore);
 return [...cards,...traps];
}
const definitions=[];
function add(definition,beasts,spells,specialPool){
 const special=pick(specialPool.filter(c=>c.type==='fusion'),2,c=>bodyScore(c,definition.style));
 const ids=pairs([...beasts,...spells]),specialIds=pairs(special);
 if(!validateDeck(ids).valid||!validateSpecialDeck(specialIds).valid)throw new Error('Illegal event deck: '+definition.id);
 const ace=definition.aceId||ranked([...beasts,...special],c=>c.attack+c.hp)[0].id;
 definitions.push({...definition,revision:1,difficulty:'hard',element:definition.origin,aceId:ace,ids:Object.freeze(ids),specialIds:Object.freeze(specialIds)});
}
const originNames={mountain:['山岳連陣','不動の岩城'],river:['蒼流連撃','水鏡の護陣'],seed:['紅種速攻','夜種吸収'],grass:['疾草連鎖','草機の調律'],flower:['星花強襲','花冠守護'],tree:['翠樹展開','古樹再生']};
for(const origin of ORIGINS.filter(o=>o.id!=='king'))for(const [index,style] of ['tempo','control'].entries()){
 const pool=CARDS.filter(c=>older(c)&&(c.origin===origin.id||c.effect.kind==='fusion'));
 const beasts=creatureCurve(pool.filter(c=>c.type==='beast'),style),spells=support(pool,{style});
 // The seed control list needs a way past a filled guard line. Replace one
 // uneventful early body with an inherited permanent attack/defence boost.
 if(origin.id==='seed'&&style==='control'){
  const slot=beasts.findIndex(c=>c.effect.kind==='none'&&c.cost<=2);
  beasts.splice(slot,1);spells.push(pick(CARDS.filter(c=>c.setId==='BK03'&&c.origin==='seed'&&c.effect.kind==='legacy_bless'&&c.cost===3),1,spellScore)[0]);
 }
 add({id:'event-'+origin.id+'-'+style,name:originNames[origin.id][index],group:'origins',origin:origin.id,style,subtitle:style==='tempo'?'低コスト展開と一斉攻撃':'守備と回復から切り返す',description:style==='tempo'?`${origin.name}の魔獣を軽いコストから並べ、補給と合成で攻勢を続ける。`:`${origin.name}の守備を軸に攻撃を受け止め、回復と合成で勝機を作る。`},beasts,spells,pool);
}
const legacyThemes=[['dawn','flower','星冠継承'],['tide','river','蒼海継承'],['ember','seed','紅炎継承'],['gale','grass','風嵐継承'],['grove','tree','翠樹継承'],['stone','mountain','地晶継承'],['dusk','seed','宵闇継承'],['aether','grass','霊機継承']];
for(const [index,[series,origin,name]] of legacyThemes.entries()){
 const oldPool=CARDS.filter(c=>older(c)&&(c.series===series||c.setId==='BK02'&&c.origin===origin)),newPool=CARDS.filter(c=>c.setId==='BK03'&&c.series==='legacy-'+index);
 const used=new Set(),beasts=[...pick(oldPool.filter(c=>c.type==='beast'&&c.setId==='BK01'&&c.cost<=3),4,c=>bodyScore(c),used),...pick(oldPool.filter(c=>c.type==='beast'&&c.setId==='BK02'&&c.cost<=5),3,c=>bodyScore(c),used),...pick(newPool.filter(c=>c.type==='beast'&&['legacy_rally','legacy_bond','legacy_aegis'].includes(c.effect.kind)),3,c=>bodyScore(c),used)];
 add({id:'event-inheritance-'+series,name,group:'inheritance',origin,style:'tempo',subtitle:'第一弾・第二弾を第三弾で強化',description:'二つの時代の魔獣を揃え、継承の強化と直接ダメージを重ねる。'},beasts,support([...oldPool,...newPool,getCard('M0256')],{legacy:true}),[...oldPool,...newPool]);
}
for(const family of EXPANSION_FAMILIES.filter(family=>family.setId==='BK04'))for(const style of ['tempo','control']){
 const pool=CARDS.filter(c=>c.family===family.id);
 add({id:'event-'+family.id+'-'+style,name:family.name+(style==='tempo'?'連環':'深奥'),group:'genesis',family:family.id,origin:pool.find(c=>c.type==='beast').origin,style,subtitle:style==='tempo'?'第四弾・展開と連携':'第四弾・防御と切り返し',description:family.description},creatureCurve(pool.filter(c=>c.type==='beast'),style),support(pool,{style,family:family.id}),pool);
}
const oldBeasts=CARDS.filter(c=>older(c)&&c.type==='beast'),publicSupport=CARDS.filter(older);
for(const spec of [
 {id:'royal',name:'王冠竜の覇道',origin:'king',style:'control',aceId:'B0512',subtitle:'レガリアを支える多源構築',description:'守護と補給で時間を作り、通常版レガリアの一撃を狙う。'},
 {id:'rush',name:'六源速攻連鎖',origin:'grass',style:'tempo',subtitle:'速攻・守護・ドローを横断',description:'オリジンを越えた低コストの連鎖で、盤面を素早く押し広げる。'},
 {id:'fusion',name:'異源合成連盟',origin:'seed',style:'tempo',subtitle:'軽い魔獣から合成へ',description:'低コストの魔獣を素材に、異なるオリジンの合成魔獣を繰り出す。'},
 {id:'aegis',name:'継承守護連盟',origin:'flower',style:'control',subtitle:'旧弾の守護と第三弾の強化',description:'守護の壁を継承の祝福で育て、継続的な補給から反撃する。'},
]){
 const used=new Set(),beasts=[];
 if(spec.id==='royal'){beasts.push(getCard('B0512'));used.add('B0512');}
 if(spec.id==='aegis')beasts.push(...pick(CARDS.filter(c=>c.setId==='BK03'&&c.type==='beast'&&c.effect.kind==='legacy_rally'),2,c=>bodyScore(c,'control'),used));
 const selected=spec.id==='rush'?oldBeasts.filter(c=>c.keywords.includes('rush')||c.keywords.includes('guard')||c.effect.kind==='draw'):oldBeasts;
 beasts.push(...creatureCurve(selected,spec.style,used,10-beasts.length));
 const spells=support(spec.id==='aegis'?[...publicSupport,...CARDS.filter(c=>c.setId==='BK03')]:publicSupport,{style:spec.style,legacy:spec.id==='aegis'});
 if(spec.id==='fusion'){const swap=spells.findIndex(c=>c.effect.kind==='damage_enemy'||c.effect.kind==='sweep'||c.effect.kind==='drain');if(swap>=0)spells[swap]=getCard('M0512');}
 add({...spec,id:'event-mixed-'+spec.id,group:'mixed'},beasts,spells,CARDS.filter(c=>c.type==='fusion'&&older(c)));
}

const fingerprints=new Set();
for(const deck of definitions){const key=[...deck.ids].sort().join(',')+'|'+[...deck.specialIds].sort().join(',');if(fingerprints.has(key))throw new Error('Duplicate event recipe: '+deck.id);fingerprints.add(key);}
export const EVENT_DECKS=Object.freeze(definitions.map(Object.freeze));
export const EVENT_DECK_GROUPS=Object.freeze([{id:'all',name:'すべて'},{id:'origins',name:'六源'},{id:'inheritance',name:'継承'},{id:'genesis',name:'星界'},{id:'mixed',name:'混成'}].map(Object.freeze));
const byId=new Map(EVENT_DECKS.map(deck=>[deck.id,deck]));
export const getEventDeck=id=>byId.get(id)||null;

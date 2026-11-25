/** Suggested lists only. Loading these recipes never grants any cards. */
import {EXPANSION_FAMILIES} from './additional-set-data.js?v=20261125-37';
import {FIFTH_FAMILIES} from './fifth-set-data.js?v=20261125-37';
const copies=cards=>cards.flatMap(card=>[card.id,card.id]);
export function makeExpansionRecipes(cards,starters){
 const get=id=>cards.find(card=>card.id===id),recipes=[];
 for(const [i,starter] of starters.entries()){
  const earlier=cards.filter(c=>c.setId==='BK02'&&c.type==='beast'&&c.cost<=3&&c.origin===starter.origin).slice(0,2);
  const support=cards.filter(c=>c.setId==='BK03'&&c.type==='beast'&&c.series==='legacy-'+i&&['legacy_rally','legacy_aegis'].includes(c.effect.kind)).slice(0,2);
  const spell=kind=>cards.find(c=>c.setId==='BK03'&&c.type==='miracle'&&c.series==='legacy-'+i&&c.effect.kind===kind);
  const trap=kind=>cards.find(c=>c.setId==='BK03'&&c.type==='gimmick'&&c.series==='legacy-'+i&&c.effect.kind===kind);
  const oldMiracle=get(starter.ids.find(id=>get(id).type==='miracle'&&get(id).effect.kind!=='fusion'));
  const oldTraps=[...new Set(starter.ids.filter(id=>get(id).type==='gimmick'))].slice(0,2).map(get);
  const ids=[...starter.ids.filter(id=>get(id).type==='beast').slice(0,8),...copies(earlier),...copies(support),...copies([oldMiracle,get('M0256'),spell('legacy_bless'),spell('legacy_bond')]),...copies(oldTraps),...copies([trap('family_ambush'),trap('legacy_rally')])];
  const specialIds=[starter.specialIds[0],cards.find(c=>c.setId==='BK02'&&c.type==='fusion'&&c.origin===starter.origin).id,...cards.filter(c=>c.setId==='BK03'&&c.type==='fusion'&&c.series==='legacy-'+i).slice(0,2).map(c=>c.id)];
  recipes.push({id:'inheritance-'+starter.id,name:starter.name+'・継承',subtitle:'第一弾・第二弾を共鳴で強化',description:'使い慣れた魔獣に第二弾の戦力を添え、第三弾の強化・結界・継承火力で支える構築。',setId:'BK03',family:'legacy',origin:starter.origin,element:starter.origin,ids,specialIds});
 }
 for(const family of EXPANSION_FAMILIES){
  const list=type=>cards.filter(c=>c.setId==='BK04'&&c.type===type&&c.family===family.id);
  const beasts=list('beast'),miracles=list('miracle'),traps=list('gimmick'),fusions=list('fusion');
  recipes.push({id:'genesis-'+family.id,name:family.name+'の創世',subtitle:family.description,description:family.description+' 第四弾のみ、魔獣16枚・ミラクル8枚・ギミック8枚と特殊4枚。',setId:'BK04',family:family.id,origin:beasts[0].origin,element:beasts[0].origin,ids:[...copies([0,1,3,4,8,9,10,19].map(i=>beasts[i])),...copies([0,1,4,63].map(i=>miracles[i])),...copies([0,1,2,3].map(i=>traps[i]))],specialIds:[0,4,8,12].map(i=>fusions[i].id)});
 }
 const dreamLists={
  origami:{name:'折紙の白頁航路',beasts:[0,1,2,3,4,5,6,8],miracles:[0,1,3,5]},
  glass:{name:'玻璃の万華宮',beasts:[0,2,3,4,5,6,8,9],miracles:[0,1,2,5]},
  shadow:{name:'影絵の逆転劇',beasts:[0,2,3,4,5,6,8,9],miracles:[0,3,4,5]},
  pigment:{name:'彩墨の三彩絵巻',beasts:[0,1,2,3,4,5,8,10],miracles:[0,1,3,5]},
 };
 for(const family of FIFTH_FAMILIES){
  const list=type=>cards.filter(c=>c.setId==='BK05'&&c.type===type&&c.family===family.id);
  const beasts=list('beast'),miracles=list('miracle'),traps=list('gimmick'),fusions=list('fusion'),plan=dreamLists[family.id];
  recipes.push({id:'dream-'+family.id,name:plan.name,subtitle:family.description,description:family.description+' 第五弾の同じ系統だけで構成。通常魔獣16枚・ミラクル8枚・ギミック8枚、合成魔獣2種類を2枚ずつ。',setId:'BK05',family:family.id,origin:beasts[0].origin,element:beasts[0].origin,ids:[...copies(plan.beasts.map(i=>beasts[i])),...copies(plan.miracles.map(i=>miracles[i])),...copies(traps)],specialIds:copies(fusions)});
 }
 return Object.freeze(recipes.map(recipe=>Object.freeze({...recipe,ids:Object.freeze(recipe.ids),specialIds:Object.freeze(recipe.specialIds)})));
}

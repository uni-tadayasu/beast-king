/** Suggested lists only. Loading these recipes never grants any cards. */
import {EXPANSION_FAMILIES} from './additional-set-data.js?v=20261124-28';
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
 return Object.freeze(recipes.map(recipe=>Object.freeze({...recipe,ids:Object.freeze(recipe.ids),specialIds:Object.freeze(recipe.specialIds)})));
}

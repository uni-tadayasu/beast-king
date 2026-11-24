import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CARDS,CARD_SETS,EXPANSION_DECKS,EXPANSION_FAMILIES,EXPANSION_EFFECT_KINDS,getCard,getCardsForSet,validateDeck,validateSpecialDeck} from '../catalog.js';
import {FIFTH_CARD_SET,FIFTH_FAMILIES,FIFTH_EFFECT_KINDS,FIFTH_ART_DIRECTION} from '../fifth-set-data.js';
import {PREMIUM_CARD_IDS,PREMIUM_CARD_SET_ASSIGNMENTS} from '../premium-cards.js';
import {getPack,openPack,RARITY_ODDS,grantDeckCollection,quoteDeckRecipe} from '../shop.js';

const fifth=getCardsForSet('BK05');
const typeCounts=cards=>Object.fromEntries(['beast','miracle','gimmick','fusion'].map(type=>[type,cards.filter(c=>c.type===type).length]));

test('the fifth pack appends 96 unique authored cards without occupying premium IDs or indices',()=>{
 assert.equal(FIFTH_CARD_SET.name,'幻彩の夢界');
 assert.equal(CARD_SETS.at(-1).id,'BK05');assert.equal(CARD_SETS.at(-1).cardCount,96);
 assert.equal(fifth.length,96);assert.equal(CARDS.length,4721);
 assert.deepEqual(fifth.map(c=>c.index),Array.from({length:96},(_,i)=>4626+i));
 assert.deepEqual(CARDS.slice(4625),fifth);
 assert.equal(createHash('sha256').update(JSON.stringify(CARDS.slice(0,4625))).digest('hex'),'bc1cb162e55da3bbf3152615061bac280a692ffbac2d7b97b96be1da6cf595e3','All r30 card data remains byte-equivalent to the published baseline.');
 assert.equal(new Set(CARDS.map(c=>c.id)).size,CARDS.length);
 assert.equal(new Set(CARDS.map(c=>c.name)).size,CARDS.length);
 assert.deepEqual(typeCounts(fifth),{beast:48,miracle:24,gimmick:16,fusion:8});
 for(const [type,prefix,start,count] of [['beast','B',2056,48],['miracle','M',1031,24],['gimmick','G',1027,16],['fusion','F',515,8]]){
  assert.deepEqual(fifth.filter(c=>c.type===type).map(c=>c.id),Array.from({length:count},(_,i)=>prefix+String(start+i).padStart(4,'0')));
 }
 for(const id of PREMIUM_CARD_IDS){assert.equal(getCard(id).setId,PREMIUM_CARD_SET_ASSIGNMENTS[id]);assert.ok(getCard(id).index<=4625);assert.ok(!fifth.some(c=>c.id===id));}
});

test('four dreamcraft families have complete mechanics, balanced origin/model representation and distinct scene briefs',()=>{
 assert.deepEqual(FIFTH_FAMILIES.map(f=>f.id),['origami','glass','shadow','pigment']);
 assert.equal(new Set(FIFTH_ART_DIRECTION.map(d=>d.subject)).size,96);
 assert.equal(FIFTH_ART_DIRECTION.length,96);
 for(const family of FIFTH_FAMILIES){
  const cards=fifth.filter(c=>c.family===family.id);
  assert.deepEqual(typeCounts(cards),{beast:12,miracle:6,gimmick:4,fusion:2});
  assert.equal(cards.filter(c=>c.model==='attack').length,6);
  assert.equal(cards.filter(c=>c.model==='defense').length,6);
  assert.equal(new Set(cards.map(c=>c.rarity)).size,6);
  assert.equal(cards.filter(c=>c.effect.kind==='fusion').length,1);
  assert.ok(EXPANSION_FAMILIES.some(f=>f.id===family.id&&f.setId==='BK05'&&f.editionLabel==='第五弾'));
  for(const role of ['bolt','aegis','rally','focus']){
   const kind=family.id+'_'+role;
   assert.ok(FIFTH_EFFECT_KINDS.includes(kind));assert.ok(EXPANSION_EFFECT_KINDS.includes(kind));
   assert.ok(cards.some(c=>c.effect.kind===kind));
  }
 }
 for(const origin of ['mountain','river','seed','grass','flower','tree'])assert.equal(fifth.filter(c=>c.origin===origin).length,16);
 assert.equal(fifth.some(c=>c.origin==='king'||c.regaliaSupport),false);
 for(const card of fifth){
  const direction=FIFTH_ART_DIRECTION.find(d=>d.id===card.id);
  assert.equal(direction.name,card.name);assert.equal(direction.origin,card.origin);assert.equal(direction.type,card.type);
  assert.ok(card.flavor.length>=10);assert.ok(direction.subject.length>=40);
  assert.ok(Object.isFrozen(card)&&Object.isFrozen(card.effect)&&Object.isFrozen(card.keywords));
  if(card.effect.kind.endsWith('_focus')){assert.equal(card.type,'miracle');assert.equal(card.targetType,card.family);}
  if(card.effect.kind.endsWith('_bolt'))assert.equal(card.targetType,card.type==='miracle'?'enemy':undefined);
  if(card.type==='fusion'){assert.equal(card.model,'hybrid');assert.equal(card.cost,0);assert.ok(card.attack>=400&&card.attack<=700);assert.ok(card.hp>=400&&card.hp<=700);}
 }
});

test('every fifth card is reachable from its own rarity pool and pack opening retains economy guarantees',()=>{
 const pack=getPack('BK05');
 assert.equal(pack.cardCount,96);assert.equal(pack.cost,100);assert.equal(pack.size,12);assert.equal(pack.premiumGgrCount,0);
 assert.ok(!pack.description.includes('レガリア専用GGR0'));
 assert.deepEqual(pack.typeCounts,{beast:48,fusion:8,miracle:24,gimmick:16});
 const rarityEntries=Object.entries(RARITY_ODDS);
 for(const card of fifth){
  const pool=fifth.filter(c=>c.rarity===card.rarity),rarityIndex=rarityEntries.findIndex(([rarity])=>rarity===card.rarity);
  const before=rarityEntries.slice(0,rarityIndex).reduce((n,[,weight])=>n+weight,0);
  const values=[(before+RARITY_ODDS[card.rarity]/2)/100,(pool.findIndex(c=>c.id===card.id)+.5)/pool.length,...Array(22).fill(0)];
  const state=Object.freeze({treasure:100,collection:Object.freeze({})});
  const result=openPack(state,{packId:'BK05',randomFn:()=>values.shift()});
  assert.equal(result.ok,true,card.id);assert.equal(result.packId,'BK05');assert.equal(result.pulls.length,12);
  assert.equal(result.pulls[0].cardId,card.id);
  assert.ok(result.pulls.every(p=>getCard(p.cardId).setId==='BK05'));
  assert.notEqual(getCard(result.pulls.at(-1).cardId).rarity,'N');assert.equal(result.pulls.at(-1).guaranteed,true);
  assert.ok(Object.values(result.collection).every(n=>n>=1&&n<=3));
  assert.equal(result.treasure,result.bonusTreasure);assert.equal(result.bonusTreasure,result.pulls.filter(p=>p.converted).length*5);
  assert.deepEqual(state,{treasure:100,collection:{}});
 }
});

test('each fifth recipe forms a legal family-only 32+4 deck and requires every owned copy',()=>{
 const recipes=EXPANSION_DECKS.filter(d=>d.setId==='BK05');
 assert.deepEqual(recipes.map(d=>d.id),['dream-origami','dream-glass','dream-shadow','dream-pigment']);
 for(const recipe of recipes){
  assert.equal(validateDeck(recipe.ids).valid,true);assert.equal(validateSpecialDeck(recipe.specialIds).valid,true);
  assert.deepEqual(typeCounts(recipe.ids.map(getCard)),{beast:16,miracle:8,gimmick:8,fusion:0});
  const all=[...recipe.ids,...recipe.specialIds];
  assert.ok(all.every(id=>getCard(id).setId==='BK05'&&getCard(id).family===recipe.family));
  assert.equal(new Set(recipe.specialIds).size,2);
  assert.ok(recipe.specialIds.every(id=>recipe.specialIds.filter(x=>x===id).length===2));
  assert.ok(recipe.ids.some(id=>getCard(id).effect.kind==='fusion'));
  assert.equal(quoteDeckRecipe({},recipe.id).missingCopies,36);
  const collection=grantDeckCollection({},all),before=structuredClone(collection);
  assert.equal(quoteDeckRecipe(collection,recipe.id).owned,true);assert.deepEqual(collection,before);
  for(const id of new Set(all)){
   const partial={...collection,[id]:collection[id]-1},quote=quoteDeckRecipe(partial,recipe.id);
   assert.equal(quote.owned,false);assert.equal(quote.missingCopies,1);assert.equal(partial[id],collection[id]-1);
  }
 }
});

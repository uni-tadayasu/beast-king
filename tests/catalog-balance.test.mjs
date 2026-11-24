import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS,getCard,STARTER_DECKS,FUSION_CARD_ID,CATALOG_VERSION,validateDeck,validateSpecialDeck} from '../catalog.js';
import {newGame,playCard,endTurn,attack,MAX_HEART_POINTS} from '../engine.js';
import {grantDeckCollection,migrateLegacyStarters,hasStarterCards} from '../shop.js';

const base=newGame({seed:442871});
function fixture(){
 const game=structuredClone(base);game.active=0;game.winner=null;game.turn=1;game.log=[];
 for(const [owner,p] of game.players.entries())Object.assign(p,{core:1000,shield:0,energy:10,maxEnergy:10,deck:Array(20).fill('B0003'),hand:[],grave:[],banished:[],traps:[],field:[{uid:`fixture-${owner}`,cardId:'B0002',attack:100,hp:1000,maxHp:3000,ready:true,keywords:[],owner}]});
 return game;
}

test('balance revision removes free guard engines and gives attack models a combat purpose',()=>{
 assert.equal(CATALOG_VERSION,6);
 for(const card of CARDS.filter(c=>c.type==='beast'&&!c.regaliaSupport)){
  if(card.effect.kind==='draw')assert.ok(card.cost>=2,card.id);
  if(card.effect.kind==='buff_all')assert.ok(card.cost>=3,card.id);
  if(card.cost<=2&&card.keywords.includes('guard'))assert.ok(card.hp<=400,card.id);
 }
 const guard=getCard('B0263'),counter=getCard('B0067');
 assert.equal(guard.cost,2);assert.equal(guard.hp,200);
 assert.ok(counter.attack>guard.hp,'an ordinary low-cost attacker can break a replacement-draw guard');
 assert.equal(getCard('B0199').cost,4,'rush + guard + global boost is a substantial tempo commitment');
 const king=getCard('B0512');assert.equal(king.cost,8);assert.equal(king.attack,2400);assert.equal(king.hp,2600);
 assert.deepEqual(king.keywords,['guard','rush','drain']);assert.equal(king.effect.kind,'regalia_sovereign');
 assert.notEqual(getCard('B1024').hp,king.hp,'the restored mechanical spirit does not inherit the royal finisher body');
});

test('equal support effects have equal prices and fusion rarity alone never strictly dominates',()=>{
 const prices=new Map();
 for(const c of CARDS.filter(c=>c.type==='gimmick')){
  const key=`${c.effect.kind}:${c.effect.value}`;
  if(prices.has(key))assert.equal(c.cost,prices.get(key),c.id);
  prices.set(key,c.cost);
 }
 const fusions=CARDS.filter(c=>c.type==='fusion');
 for(const a of fusions)for(const b of fusions){
  if(a.effect.kind!==b.effect.kind||a.effect.value!==b.effect.value||a.keywords.join()!==b.keywords.join())continue;
  assert.ok(!(a.attack>=b.attack&&a.hp>=b.hp&&(a.attack>b.attack||a.hp>b.hp)),`${a.id} strictly dominates ${b.id} with identical effects`);
 }
 assert.ok(CARDS.filter(c=>c.type==='miracle'&&c.effect.kind==='shield_heal').every(c=>c.cost>=2));
 const water=STARTER_DECKS.find(d=>d.id==='azure-memory');
 assert.equal(water.ids.filter(id=>getCard(id).keywords.includes('guard')).length,2);
 assert.equal(water.ids.filter(id=>id==='B0083').length,2);
 assert.equal(water.ids.filter(id=>id==='M0043').length,2);
});

test('a saved water starter retains its old owned cards and valid deck without an unearned upgrade',()=>{
 const revised=STARTER_DECKS.find(d=>d.id==='azure-memory');
 const replacements={B0071:'B0073',B0083:'B0084',M0043:'M0042'};
 const oldIds=revised.ids.map(id=>replacements[id]||id);
 const collection=grantDeckCollection({},[...oldIds,...revised.specialIds]);
 const saved={version:6,starter:revised.id,freeStarterId:revised.id,deckIds:oldIds,specialIds:[...revised.specialIds],collection};
 const before=structuredClone(saved),migration=migrateLegacyStarters(saved);
 assert.deepEqual(saved,before);assert.deepEqual(migration.collection,collection);assert.equal(migration.removed,0);
 assert.equal(validateDeck(oldIds).valid,true);assert.equal(validateSpecialDeck(revised.specialIds).valid,true);
 assert.equal(hasStarterCards(collection,revised.id),false,'new template still requires its six unowned cards');
 assert.equal(Object.values(collection).reduce((sum,n)=>sum+n,0),36);
});

test('all 2303 unchanged original cards execute the exact numeric effects printed in the catalog',()=>{
 for(const c of CARDS.filter(card=>!card.regaliaSupport&&card.id!=='B0512'&&['BK01','BK02'].includes(card.setId))){
  const game=fixture(),p=game.players[0],enemy=game.players[1];
  p.hand=[c.type==='fusion'?FUSION_CARD_ID:c.id];
  if(c.type==='fusion'){
   p.special=[c.id];p.grave=['B0003'];
  }
  const choice=c.type==='fusion'?{specialIndex:0,materials:[{zone:'grave',index:0,cardId:'B0003'}]}:
    c.effect.kind==='fusion'?{specialIndex:0,materials:[{zone:'grave',index:0,cardId:'B0003'}]}:
    c.effect.kind==='damage_enemy'?{player:1,uid:'fixture-1'}:c.effect.kind==='buff'?{player:0,uid:'fixture-0'}:undefined;
  if(c.effect.kind==='fusion'){p.special=['F0001'];p.grave=['B0003'];}
  const result=playCard(game,0,choice);assert.equal(result.ok,true,`${c.id}: ${result.error}`);
  assert.equal(p.energy,10-(c.type==='fusion'?3:c.cost),c.id);
  const {kind,value}=c.effect;
  if(!['none','fusion','draw'].includes(kind))assert.ok(c.text.includes(String(value)),c.id);
  if(c.type==='beast'||c.type==='fusion'){
   const unit=p.field.at(-1);assert.equal(unit.cardId,c.id,c.id);
   assert.equal(unit.attack,c.attack+(kind==='buff_all'?value:0),c.id);
   assert.equal(unit.hp,c.hp,c.id);assert.equal(unit.maxHp,c.hp,c.id);
   assert.deepEqual(unit.keywords,c.keywords,c.id);
  }
  if(kind==='draw')assert.equal(p.hand.length,Math.min(value,4),c.id);
  if(kind==='heal'||kind==='shield_heal')assert.equal(p.core,Math.min(MAX_HEART_POINTS,1000+value),c.id);
  if(kind==='shield'||kind==='shield_heal')assert.equal(p.shield,value,c.id);
  if(kind==='damage_core'||kind==='drain')assert.equal(enemy.core,1000-value,c.id);
  if(kind==='drain')assert.equal(p.core,1000+value,c.id);
  if(kind==='damage_enemy'||kind==='sweep')assert.equal(enemy.field[0].hp,1000-value,c.id);
  if(kind==='buff_all')assert.equal(p.field[0].attack,100+value,c.id);
  if(kind==='buff'){
   assert.equal(p.field[0].attack,100+value,c.id);assert.equal(p.field[0].hp,1000+value,c.id);assert.equal(p.field[0].maxHp,3000+value,c.id);
  }
  if(kind==='renew')assert.equal(p.field[0].hp,1000+value,c.id);
  if(c.type==='gimmick'){
   assert.equal(p.traps[0].cardId,c.id,c.id);assert.equal(p.field[0].hp,1000,c.id);
   assert.equal(endTurn(game).ok,true,c.id);
   if(kind==='spring'||kind==='fountain'){
    assert.equal(endTurn(game).ok,true,c.id);assert.equal(p.traps.length,0,c.id);
    assert.equal(p.field[0].hp,1000+value,c.id);
    assert.equal(p.field[0].attack,100+(kind==='spring'?value:0),c.id);
    assert.equal(p.field[0].maxHp,3000+(kind==='spring'?value:0),c.id);
    assert.equal(p.core,1000,c.id);
   }else{
    enemy.field[0].attack=2000;enemy.field[0].hp=5000;enemy.field[0].maxHp=5000;p.core=3000;
    assert.equal(attack(game,'fixture-1',{player:0,core:true}).ok,true,c.id);
    assert.equal(enemy.field[0].hp,5000-value,c.id);assert.equal(p.traps.length,0,c.id);
    assert.equal(p.core,kind==='barrier'?1000+value:1000,c.id);
   }
  }
 }
});

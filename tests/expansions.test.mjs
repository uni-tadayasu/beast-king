import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CARDS,CARD_SETS,EXPANSION_DECKS,EXPANSION_FAMILIES,getCard,getCardsForSet,validateDeck,validateSpecialDeck} from '../catalog.js';
import {CARDS as HISTORICAL,getCard as getHistoricalCard} from '../rebuild/catalog.js';
import {PACKS,quoteDeckRecipe,grantDeckCollection,hasDeckRecipeCards} from '../shop.js';
import {newGame,playCard,getLegalTargets,getPlayableCards,attack,endTurn,runAutomatedTurn} from '../engine.js';
import {treasureShop} from '../product-views.js';
import {PREMIUM_DECK_ID} from '../premium-deck.js';

const newer=CARDS.filter(c=>!c.regaliaSupport&&['BK03','BK04'].includes(c.setId));
const find=(kind,type='miracle',family)=>newer.find(c=>c.type===type&&c.effect.kind===kind&&(!family||c.family===family));
const beast=family=>newer.find(c=>c.type==='beast'&&c.family===family&&c.cost<=4);
const unit=(card,owner,index=0)=>({uid:'fixture-'+owner+'-'+index,cardId:card.id,attack:card.attack,hp:card.hp,maxHp:card.hp,owner,ready:true,keywords:[]});
function fixture(family='legacy'){
 const game=newGame({seed:9981});game.active=0;game.turn=1;game.log=[];game.nextUid=50;
 for(const [owner,p] of game.players.entries())Object.assign(p,{core:5000,shield:0,energy:10,maxEnergy:10,deck:Array(20).fill('B0002'),hand:[],grave:[],banished:[],field:[],traps:[]});
 game.players[0].field=[unit(getCard('B0001'),0,0),unit(getCard('B0513'),0,1),unit(beast(family),0,2)];
 game.players[1].field=[{...unit(getCard('B0002'),1),attack:500,hp:5000,maxHp:5000}];
 return game;
}
const physicalCount=game=>game.players.reduce((sum,p)=>sum+['deck','hand','grave','banished','field','traps','special'].reduce((n,zone)=>n+p[zone].length,0),0);

test('BK03/BK04 retain their 2304 base cards and only the authorized original Regalia changes',()=>{
 assert.equal(CARDS.length,4721);assert.equal(new Set(CARDS.map(c=>c.name)).size,4721);
 assert.equal(createHash('sha256').update(JSON.stringify(CARDS.slice(0,2304).filter(c=>c.id!=='B0512'))).digest('hex'),'9b8c051f0fd224f25eaa237ff378e5a3d5f94169c32cf5d441f8f343b5f5f802');
 assert.equal(HISTORICAL.length,2304);assert.equal(getHistoricalCard('B1025'),undefined);
 assert.deepEqual(CARD_SETS.map(s=>s.id),['BK01','BK02','BK03','BK04','BK05']);
 for(const setId of ['BK03','BK04']){
  const cards=getCardsForSet(setId).filter(c=>!c.regaliaSupport);assert.equal(cards.length,1152);
  for(const [type,count] of [['beast',512],['fusion',128],['miracle',256],['gimmick',256]]){
   const group=cards.filter(c=>c.type===type);assert.equal(group.length,count);
   assert.deepEqual(new Set(group.map(c=>c.rarity)),new Set(['N','R','KR','KKR','GR','GGR']));
  }
  for(const origin of ['mountain','river','seed','grass','flower','tree'])assert.equal(cards.filter(c=>c.origin===origin).length,192);
  assert.equal(cards.some(c=>c.origin==='king'),false);
  const pack=PACKS.find(p=>p.id===setId);assert.equal(pack.cost,100);assert.equal(pack.size,12);
 }
});

test('all eight recipes are legal, collection-gated, and cannot mint or silently substitute cards',()=>{
 assert.equal(EXPANSION_DECKS.filter(deck=>deck.setId!=='BK05').length,8);assert.equal(EXPANSION_FAMILIES.filter(family=>family.setId!=='BK05').length,4);
 for(const deck of EXPANSION_DECKS.filter(deck=>deck.setId!=='BK05')){
  for(const key of ['id','name','description','setId','family'])assert.equal(typeof deck[key],'string',deck.id+' '+key);
  assert.equal(validateDeck(deck.ids).valid,true);assert.equal(validateSpecialDeck(deck.specialIds).valid,true);
  assert.equal(deck.ids.filter(id=>getCard(id).type==='beast').length,16);
  assert.equal(deck.ids.filter(id=>getCard(id).type==='miracle').length,8);
  assert.equal(deck.ids.filter(id=>getCard(id).type==='gimmick').length,8);
  assert.equal(quoteDeckRecipe({},deck.id).missingCopies,36);
  const collection=grantDeckCollection({},[...deck.ids,...deck.specialIds]),before=structuredClone(collection);
  assert.equal(hasDeckRecipeCards(collection,deck.id),true);assert.deepEqual(collection,before);
  collection[deck.ids[0]]--;assert.equal(hasDeckRecipeCards(collection,deck.id),false);assert.equal(quoteDeckRecipe(collection,deck.id).missingCopies,1);
  const sets=new Set([...deck.ids,...deck.specialIds].map(id=>getCard(id).setId));
  assert.deepEqual(sets,deck.setId==='BK04'?new Set(['BK04']):new Set(['BK01','BK02','BK03']));
 }
 assert.equal(hasDeckRecipeCards({},'missing-recipe'),false);
});

test('shop selections expose the selected expansion recipes and the public premium recipe',()=>{
 for(const pack of PACKS){
  const html=treasureShop({data:{treasure:100,collection:{}},packId:pack.id,title:()=>'',icon:()=>'',esc:String,fmt:String,artStyle:()=>'',collected:0});
  assert.match(html,new RegExp('class="btn primary pack-buy" data-action="pack-open" data-pack="'+pack.id+'"'));
  const recipeIds=[...html.matchAll(/data-action="expansion-recipe" data-id="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(recipeIds,[...EXPANSION_DECKS.filter(deck=>deck.setId===pack.id).map(deck=>deck.id),PREMIUM_DECK_ID]);
  assert.equal((html.match(/class="active" aria-pressed="true"/g)||[]).length,1);
  assert.ok(!html.includes('undefined')&&!html.includes('NaN'));
 }
});

test('legacy strengthening targets only the first two sets and illegal targets are atomic',()=>{
 const game=fixture(),p=game.players[0],spell=find('legacy_bless');p.hand=[spell.id];
 const targets=getLegalTargets(game,0);assert.deepEqual(targets.map(t=>t.uid),p.field.slice(0,2).map(u=>u.uid));
 const before=structuredClone(game);assert.equal(playCard(game,0,{player:0,uid:p.field[2].uid}).ok,false);assert.deepEqual(game,before);
 assert.equal(playCard(game,0,targets[1]).ok,true);assert.equal(p.field[1].hp,before.players[0].field[1].hp+spell.effect.value);
 const rally=find('legacy_rally');p.hand=[rally.id];p.energy=10;const old=p.field.map(u=>u.attack);playCard(game,0);
 assert.deepEqual(p.field.map(u=>u.attack),[old[0]+rally.effect.value,old[1]+rally.effect.value,old[2]]);
});

test('legacy recall returns one eligible grave card, respects the hand cap and never recalls a fusion',()=>{
 const game=fixture(),p=game.players[0],spell=find('legacy_recall');p.grave=['F0001',beast('orbit').id,'B0002','B0513'];p.hand=[spell.id];
 assert.equal(playCard(game,0).ok,true);assert.deepEqual(p.hand,['B0002']);assert.ok(p.grave.includes('F0001'));assert.ok(p.grave.includes(beast('orbit').id));
 const summon=find('legacy_recall','beast');p.field=[];p.hand=[summon.id,'B0003','B0004','B0005','B0006'];p.energy=10;
 playCard(game,0);assert.equal(p.hand.length,4);assert.ok(p.grave.includes('B0513'));
});

test('legacy bond keeps its printed heart-only target even when a client supplies a unit target',()=>{
 const spell=find('legacy_bond');
 for(const target of [undefined,{player:1,uid:'fixture-1-0'},{player:0,uid:'fixture-0-0'},{player:1,uid:'missing'}]){
  const game=fixture(),p=game.players[0],before=structuredClone(game.players[1].field);
  p.hand=[spell.id];assert.deepEqual(getLegalTargets(game,0),[]);
  assert.equal(playCard(game,0,target).ok,true);
  assert.equal(game.players[1].core,5000-spell.effect.value-100);
  assert.deepEqual(game.players[1].field,before);
  assert.equal(p.energy,10-spell.cost);assert.deepEqual(p.grave,[spell.id]);
 }
});

test('orbit counts unique origins within its own fourth-set family and caps at three',()=>{
 const game=fixture('orbit'),p=game.players[0],spell=find('orbit_aegis');
 const creatures=CARDS.filter(c=>c.type==='beast'&&c.family==='orbit');
 p.field=[0,1,2,3].map(i=>unit(creatures[i],0,i));p.hand=[spell.id];playCard(game,0);assert.equal(p.shield,3*spell.effect.value);
 p.shield=0;p.energy=10;p.hand=[spell.id];p.field=[unit(creatures[0],0,0),unit(creatures[0],0,1),unit(beast('echo'),0,2),unit(getCard('B0001'),0,3)];
 playCard(game,0);assert.equal(p.shield,spell.effect.value);
});

test('echo excludes the resolving copy, counts another physical copy and caps memory at three',()=>{
 const spell=find('echo_bolt'),other=find('echo_aegis');
 for(const remembered of [0,1,2,5]){
  const game=fixture('echo'),p=game.players[0];p.grave=remembered?[spell.id,...Array(remembered-1).fill(other.id)]:[];p.hand=[spell.id];
  playCard(game,0,{player:1,core:true});assert.equal(game.players[1].core,5000-spell.effect.value-100*Math.min(3,remembered));
 }
});

test('vow pays actual HP through shields, refuses a lethal payment and does not boost other families',()=>{
 const spell=find('vow_rally');
 for(const core of [200,201,5000]){
  const game=fixture('vow'),p=game.players[0];p.core=core;p.shield=900;p.hand=[spell.id];const before=p.field.map(u=>u.attack);
  playCard(game,0);assert.equal(p.core,core>200?core-200:core);assert.equal(p.shield,900);assert.equal(game.winner,null);
  assert.deepEqual(p.field.map(u=>u.attack),[before[0],before[1],before[2]+(core>200?spell.effect.value:0)]);
 }
 const game=fixture('vow'),p=game.players[0],bolt=find('vow_bolt');p.core=201;p.hand=[bolt.id];playCard(game,0,{player:1,core:true});
 assert.equal(p.core,1);assert.equal(game.players[1].core,5000-bolt.effect.value-100,'damage remains valid after the HP cost is paid');
});

test('CPU legally cycles one blocked vow miracle from a full hand so a recovery card can be drawn',()=>{
 const game=fixture('vow'),p=game.players[0],bolt=find('vow_bolt'),recovery=newer.find(c=>c.family==='vow'&&c.effect.kind==='heal');
 p.field=Array.from({length:4},(_,i)=>({...unit(beast('vow'),0,i),ready:false}));
 p.hand=[bolt.id,...Array(3).fill(beast('vow').id)];p.deck=[recovery.id];p.core=200;p.shield=900;p.energy=4;
 assert.equal(runAutomatedTurn(game,'hard').ok,true);
 assert.equal(p.core,200);assert.equal(p.shield,900);assert.equal(game.players[1].core,5000);
 assert.deepEqual(p.grave,[bolt.id]);assert.equal(p.hand.length,3);assert.equal(p.energy,4-bolt.cost);
 assert.equal(endTurn(game).ok,true);assert.equal(p.hand.at(-1),recovery.id);assert.equal(p.deck.length,0);
});

test('forge consumes exactly one public family beast, excludes spells and preserves empty-target material',()=>{
 const game=fixture('forge'),p=game.players[0],spell=find('forge_bolt'),material=beast('forge');
 p.grave=['M0001',find('forge_aegis').id,'B0002',material.id,material.id];p.hand=[spell.id];const count=physicalCount(game);
 playCard(game,0,{player:1,core:true});assert.deepEqual(p.banished,[material.id]);assert.equal(game.players[1].core,5000-spell.effect.value-200);assert.equal(physicalCount(game),count);assert.ok(p.grave.includes(spell.id));
 const restore=find('forge_restore');p.hand=[restore.id];p.energy=10;playCard(game,0);assert.equal(p.banished.length,1,'full defense has no useful target and consumes no material');
});

test('new family traps stay private and wait for an eligible formation before revealing',()=>{
 const game=fixture('orbit'),p=game.players[0],trap=find('family_ambush','gimmick','orbit');p.field=[];p.hand=[trap.id];playCard(game,0);
 assert.ok(!game.log.some(e=>e.text.includes(trap.id)||e.text.includes(trap.name)));endTurn(game);
 attack(game,'fixture-1-0',{player:0,core:true});assert.equal(p.traps.length,1);
 p.field=[unit(beast('orbit'),0)];game.players[1].field[0].ready=true;
 attack(game,'fixture-1-0',{player:0,core:true});assert.equal(p.traps.length,0);assert.ok(game.log.some(e=>e.text.includes(trap.name)&&e.type==='gimmick'));
});

test('all 2304 new cards execute without unsupported effects, duplicate cards or invalid stats',()=>{
 for(const card of newer){
  const game=fixture(card.family),p=game.players[0];p.grave=['B0002',beast(card.family).id];
  p.hand=[card.type==='fusion'?'M0256':card.id];
  const fusion=card.type==='fusion'||card.effect.kind==='fusion';if(fusion)p.special=[card.type==='fusion'?card.id:'F0001'];
  const target=fusion?{specialIndex:0,materials:[{zone:'grave',index:0,cardId:'B0002'}]}:getLegalTargets(game,0)[0];
  const before=physicalCount(game),result=playCard(game,0,target);assert.equal(result.ok,true,card.id+': '+result.error);
  if(card.type==='gimmick'){endTurn(game);if(card.trigger==='turn_start')endTurn(game);else attack(game,'fixture-1-0',{player:0,core:true});assert.equal(p.traps.length,0,card.id);}
  assert.equal(physicalCount(game),before,card.id+' physical card conservation');
  for(const player of game.players){assert.ok(Number.isFinite(player.core)&&player.core>=0&&player.core<=5000,card.id);for(const u of player.field)assert.ok(u.attack>=0&&u.hp>0&&u.maxHp>=u.hp,card.id);}
  assert.ok(game.log.every(e=>!e.text.includes('undefined')&&!e.text.includes('NaN')),card.id);
 }
});

test('every new recipe completes seeded CPU games in both seats without altering the opening rule',()=>{
 for(const deck of EXPANSION_DECKS)for(const seat of [0,1]){
  const input={seed:8851+seat,difficulty:'hard'};input[seat?'cpuDeck':'playerDeck']=deck.ids;input[seat?'cpuSpecialDeck':'playerSpecialDeck']=deck.specialIds;
  const game=newGame(input);assert.equal(game.openingRuleVersion,1);
  for(let i=0;i<200&&game.winner===null;i++)assert.equal(runAutomatedTurn(game,'hard').ok,true,deck.id);
  assert.notEqual(game.winner,null,deck.id+' finished in both seats');
 }
});

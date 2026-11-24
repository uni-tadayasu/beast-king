import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS,EXPANSION_DECKS,getCard} from '../catalog.js';
import {newGame,playCard,getLegalTargets,getPlayableCards,attack,endTurn,runAutomatedTurn} from '../engine.js';

const cards=CARDS.filter(card=>card.setId==='BK05');
const families=['origami','glass','shadow','pigment'];
const find=(family,role,type='miracle')=>cards.find(card=>card.family===family&&card.type===type&&card.effect.kind===family+'_'+role);
const creature=family=>cards.find(card=>card.family===family&&card.type==='beast');
const unit=(card,owner,index=0)=>({uid:`dream-${owner}-${index}`,cardId:card.id,attack:card.attack,hp:card.hp,maxHp:card.hp,owner,ready:false,keywords:[]});
function fixture(){
 const game=newGame({seed:51319});game.active=0;game.turn=1;game.log=[];game.nextUid=100;
 for(const player of game.players)Object.assign(player,{core:5000,shield:0,energy:10,maxEnergy:10,deck:Array(20).fill('B0002'),hand:[],grave:[],banished:[],field:[],traps:[],special:[]});
 return game;
}
const countPhysical=game=>game.players.reduce((total,player)=>total+['deck','hand','grave','banished','field','traps','special'].reduce((sum,zone)=>sum+player[zone].length,0),0);

test('all four Dream Realm families expose real implemented battle effects',()=>{
 assert.equal(cards.length,96);
 for(const family of families){
  for(const role of ['bolt','aegis','rally','focus'])assert.ok(find(family,role),family+' '+role);
  assert.ok(find(family,'bolt','beast'),family+' summon bolt');
  assert.ok(find(family,'rally','gimmick'),family+' delayed rally');
 }
});

test('origami checks the remaining hand after removing exactly the played copy',()=>{
 const spell=find('origami','bolt');
 for(const remaining of [0,1,2,3]){
  const game=fixture(),p=game.players[0];p.hand=[...Array(remaining).fill(spell.id),spell.id];
  assert.equal(playCard(game,remaining,{player:1,core:true}).ok,true);
  assert.equal(game.players[1].core,5000-spell.effect.value-(remaining<=1?200:0));
  assert.equal(p.hand.length,remaining);assert.deepEqual(p.grave,[spell.id]);
 }
});

test('shadow compares all living creatures and includes the newly summoned creature',()=>{
 const spell=find('shadow','bolt'),summon=find('shadow','bolt','beast');
 for(const [own,other,bonus] of [[0,1,200],[1,1,0],[2,1,0],[1,3,200]]){
  const game=fixture(),p=game.players[0],enemy=game.players[1];
  p.field=Array.from({length:own},(_,i)=>unit(getCard('B0002'),0,i));
  enemy.field=Array.from({length:other},(_,i)=>unit(getCard('B0002'),1,i));p.hand=[spell.id];
  assert.equal(playCard(game,0,{player:1,core:true}).ok,true);
  assert.equal(enemy.core,5000-spell.effect.value-bonus);
 }
 const game=fixture(),p=game.players[0],enemy=game.players[1];
 enemy.field=[unit(getCard('B0002'),1)];p.hand=[summon.id];const before=structuredClone(enemy.field);
 assert.deepEqual(getLegalTargets(game,0),[]);
 assert.equal(playCard(game,0,{player:1,uid:enemy.field[0].uid}).ok,true);
 assert.equal(enemy.core,5000-summon.effect.value,'one newly summoned creature ties one opposing creature');
 assert.deepEqual(enemy.field,before,'summon effect ignores a forged creature target');
});

test('pigment requires all three types in the remaining owner hand, never the played miracle',()=>{
 const spell=find('pigment','bolt');
 for(const [remaining,bonus] of [[['B0002','M0001','G0001'],200],[['B0002',spell.id,'G0001'],200],[['B0002','G0001'],0],[['B0002','B0003','G0001'],0]]){
  const game=fixture(),p=game.players[0];p.hand=[spell.id,...remaining];
  game.players[1].hand=['B0002','M0001','G0001'];
  assert.equal(playCard(game,0,{player:1,core:true}).ok,true);
  assert.equal(game.players[1].core,5000-spell.effect.value-bonus);
  assert.deepEqual(p.hand,remaining);
 }
});

test('glass consumes exactly 200 shield, never HP, with an explicit net aegis gain',()=>{
 for(const role of ['bolt','aegis'])for(const shield of [0,199,200,900]){
  const game=fixture(),p=game.players[0],spell=find('glass',role);p.shield=shield;p.hand=[spell.id];
  const enhanced=shield>=200;assert.equal(playCard(game,0,role==='bolt'?{player:1,core:true}:undefined).ok,true);
  assert.equal(p.core,5000);
  assert.equal(p.shield,shield-(enhanced?200:0)+(role==='aegis'?spell.effect.value+(enhanced?300:0):0));
  assert.equal(game.players[1].core,5000-(role==='bolt'?spell.effect.value+(enhanced?200:0):0));
 }
 const game=fixture(),p=game.players[0],rally=find('glass','rally');p.shield=900;p.hand=[rally.id];
 assert.equal(playCard(game,0).ok,true);assert.equal(p.shield,900,'empty strengthening never spends shield');
});

test('Dream Realm rally raises only its own family attack; focus rejects foreign or missing targets atomically',()=>{
 for(const family of families){
  const game=fixture(),p=game.players[0],focus=find(family,'focus'),rally=find(family,'rally');
  p.field=[unit(creature(family),0,0),unit(getCard('B0002'),0,1),unit(creature(families.find(value=>value!==family)),0,2)];
  game.players[1].field=[unit(creature(family),1,0)];p.shield=200;p.hand=[focus.id];
  const targets=getLegalTargets(game,0);assert.deepEqual(targets,[{player:0,uid:p.field[0].uid}]);
  for(const target of [undefined,{player:0,uid:p.field[1].uid},{player:1,uid:game.players[1].field[0].uid},{player:0,uid:'missing'},{player:0,core:true}]){
   const before=structuredClone(game);assert.equal(playCard(game,0,target).ok,false);assert.deepEqual(game,before);
  }
  const before=structuredClone(p.field),bonus=['origami','glass'].includes(family)?100:0;
  assert.equal(playCard(game,0,targets[0]).ok,true);
  for(const stat of ['attack','hp','maxHp'])assert.equal(p.field[0][stat],before[0][stat]+focus.effect.value+bonus);
  assert.deepEqual(p.field.slice(1),before.slice(1));
  p.hand=[rally.id];p.energy=10;p.shield=200;const saved=structuredClone(p.field);
  assert.equal(playCard(game,0).ok,true);
  assert.equal(p.field[0].attack,saved[0].attack+rally.effect.value+bonus);
  assert.equal(p.field[0].hp,saved[0].hp);assert.equal(p.field[0].maxHp,saved[0].maxHp);assert.deepEqual(p.field.slice(1),saved.slice(1));
 }
});

test('fifth-pack damage rejects illegal targets without consuming a card, energy or shield',()=>{
 const game=fixture(),p=game.players[0],spell=find('glass','bolt');
 p.hand=[spell.id];p.shield=500;p.field=[unit(creature('glass'),0)];
 for(const target of [undefined,{player:0,core:true},{player:0,uid:p.field[0].uid},{player:1,uid:'missing'}]){
  const before=structuredClone(game);assert.equal(playCard(game,0,target).ok,false);assert.deepEqual(game,before);
 }
 game.players[1].field=[{...unit(getCard('B0002'),1),hp:3000,maxHp:3000}];
 assert.equal(playCard(game,0,{player:1,uid:game.players[1].field[0].uid}).ok,true);
 assert.equal(game.players[1].field[0].hp,3000-spell.effect.value-200);assert.equal(game.players[1].core,5000);assert.equal(p.shield,300);
});

test('delayed fifth-pack effects check current conditions before the normal hand refill',()=>{
 const game=fixture(),p=game.players[0],trap=find('origami','aegis','gimmick');p.hand=[trap.id,'B0002'];
 assert.equal(playCard(game,0).ok,true);assert.equal(p.shield,0);assert.equal(p.traps.length,1);
 assert.equal(endTurn(game).ok,true);assert.equal(p.traps.length,1);
 assert.equal(endTurn(game).ok,true);assert.equal(p.shield,trap.effect.value+200);assert.equal(p.hand.length,4);assert.equal(p.traps.length,0);
 const second=fixture(),owner=second.players[0],shadow=find('shadow','aegis','gimmick');
 owner.hand=[shadow.id];second.players[1].field=[unit(getCard('B0002'),1)];playCard(second,0);endTurn(second);
 owner.field=[unit(getCard('B0002'),0,0),unit(getCard('B0002'),0,1)];endTurn(second);
 assert.equal(owner.shield,shadow.effect.value,'a set-time advantage is not remembered after the board changes');
 const third=fixture(),glass=third.players[0],rally=find('glass','rally','gimmick');glass.shield=400;glass.hand=[rally.id];
 glass.field=[unit(creature('glass'),0)];playCard(third,0);endTurn(third);glass.field=[];endTurn(third);
 assert.equal(glass.shield,400,'no family target at delayed activation spends no glass shield');
});

test('fifth family ambush stays hidden until its own family is present',()=>{
 const game=fixture(),p=game.players[0],enemy=game.players[1],trap=cards.find(card=>card.family==='origami'&&card.effect.kind==='family_ambush');
 p.hand=[trap.id];enemy.field=[{...unit(getCard('B0002'),1),attack:100,hp:5000,maxHp:5000,keywords:[],ready:true}];
 playCard(game,0);assert.ok(!game.log.some(event=>event.text.includes(trap.name)));endTurn(game);
 assert.equal(attack(game,enemy.field[0].uid,{player:0,core:true}).ok,true);assert.equal(p.traps.length,1);
 p.field=[unit(creature('origami'),0)];enemy.field[0].ready=true;
 assert.equal(attack(game,enemy.field[0].uid,{player:0,core:true}).ok,true);assert.equal(p.traps.length,0);
 assert.ok(game.log.some(event=>event.type==='gimmick'&&event.text.includes(trap.name)));
});

test('CPU uses post-play hand and incoming creature counts when choosing a lethal fifth-pack play',()=>{
 const bolt=find('origami','bolt');
 for(const other of [getCard('B0003'),find('shadow','bolt','beast')]){
  const game=fixture(),p=game.players[0],enemy=game.players[1];
  p.hand=[other.id,bolt.id];p.energy=Math.max(other.cost,bolt.cost);
  enemy.core=bolt.effect.value+100;enemy.field=[{...unit(getCard('B0002'),1),hp:5000,maxHp:5000,keywords:['guard']}];
  assert.equal(runAutomatedTurn(game,'hard').ok,true);assert.equal(game.winner,0);
  assert.deepEqual(p.grave,[bolt.id]);assert.deepEqual(p.hand,[other.id]);
 }
});

test('all 96 fifth-pack cards execute, preserve physical cards and produce finite legal battle state',()=>{
 assert.equal(cards.length,96);
 for(const card of cards){
  const game=fixture(),p=game.players[0],enemy=game.players[1];
  p.field=[unit(creature(card.family),0,0)];p.grave=['B0002'];p.shield=400;
  enemy.field=[{...unit(getCard('B0002'),1),attack:100,hp:5000,maxHp:5000,keywords:[],ready:true}];
  const fusion=card.type==='fusion'||card.effect.kind==='fusion';
  p.hand=[card.type==='fusion'?'M0256':card.id,'B0002','M0001','G0001'];
  if(fusion)p.special=[card.type==='fusion'?card.id:cards.find(value=>value.family===card.family&&value.type==='fusion').id];
  const target=fusion?{specialIndex:0,materials:[{zone:'grave',index:0,cardId:'B0002'}]}:getLegalTargets(game,0)[0];
  const count=countPhysical(game),result=playCard(game,0,target);assert.equal(result.ok,true,card.id+': '+result.error);
  if(card.type==='gimmick'){
   endTurn(game);if(card.trigger==='turn_start')endTurn(game);else assert.equal(attack(game,enemy.field[0].uid,{player:0,core:true}).ok,true,card.id);
   assert.equal(p.traps.length,0,card.id);
  }
  assert.equal(countPhysical(game),count,card.id+' physical card conservation');
  for(const player of game.players){
   assert.ok(Number.isFinite(player.core)&&player.core>=0&&player.core<=5000,card.id+' HP');assert.ok(Number.isFinite(player.shield)&&player.shield>=0,card.id+' shield');
   for(const unit of player.field)assert.ok(Number.isFinite(unit.attack)&&unit.attack>=0&&unit.hp>0&&unit.maxHp>=unit.hp,card.id+' unit stats');
  }
  assert.ok(game.log.every(event=>!event.text.includes('undefined')&&!event.text.includes('NaN')),card.id+' log');
 }
});

test('fifth-pack recipes finish deterministic CPU matches from both seats with existing saves and opening rules',()=>{
 const decks=EXPANSION_DECKS.filter(deck=>deck.setId==='BK05');assert.equal(decks.length,4);
 for(const deck of decks)for(const seat of [0,1])for(const seed of [51319,57301]){
  const options={seed,difficulty:'hard'};options[seat?'cpuDeck':'playerDeck']=deck.ids;options[seat?'cpuSpecialDeck':'playerSpecialDeck']=deck.specialIds;
  const game=newGame(options);assert.equal(game.openingRuleVersion,1);
  for(let i=0;i<200&&game.winner===null;i++)assert.equal(runAutomatedTurn(game,'hard').ok,true,deck.id);
  assert.notEqual(game.winner,null,deck.id+' finished from seat '+seat);
 }
});

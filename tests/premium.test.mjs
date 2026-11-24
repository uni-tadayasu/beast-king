import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS,CARD_SETS,getCard,getCardsForSet,getDeckPreset,validateDeck,validateSpecialDeck} from '../catalog.js';
import {PREMIUM_DECK,PREMIUM_DECK_ID,PREMIUM_DECK_REQUIRED} from '../premium-deck.js';
import {PREMIUM_CARD_IDS,PREMIUM_CARD_SET_ASSIGNMENTS,PREMIUM_SET_ADDITIONS,PREMIUM_SET_SEED} from '../premium-cards.js';
import {newGame,getCardCost,getPlayableCards,getLegalTargets,getAttackTargets,getFusionChoices,getEligibleFusionMaterials,playCard,attack,endTurn,validateFusionSelection,runAutomatedTurn} from '../engine.js';

function fixture(){
 const state=newGame({playerDeck:PREMIUM_DECK.ids,cpuDeck:PREMIUM_DECK.ids,seed:7331,difficulty:'hard'});
 state.turn=1;state.active=0;state.winner=null;state.log=[];state.nextUid=50;
 for(const player of state.players)Object.assign(player,{core:5000,shield:0,energy:10,maxEnergy:10,deck:[],hand:[],field:[],traps:[],grave:[],banished:[],fatigue:0});
 return state;
}
function unit(id,owner,uid){
 const card=getCard(id);return {uid,cardId:id,attack:card.attack,hp:card.hp,maxHp:card.hp,ready:true,keywords:[...card.keywords],owner};
}
const physicalCount=state=>state.players.reduce((sum,p)=>sum+['deck','hand','grave','banished','field','traps','special'].reduce((n,zone)=>n+p[zone].length,0),0);
const withHand=(state,...ids)=>{state.players[state.active].hand=ids;return state.players[state.active];};

test('premium is a public 32 plus 4 recipe made only from two Regalias and seventeen new GGR cards',()=>{
 assert.equal(PREMIUM_CARD_IDS.length,17);assert.equal(new Set(PREMIUM_CARD_IDS).size,17);
 assert.equal(PREMIUM_DECK_ID,'regalia-premium-v1');assert.deepEqual(getDeckPreset(PREMIUM_DECK_ID),PREMIUM_DECK);
 assert.equal(validateDeck(PREMIUM_DECK.ids).valid,true);assert.equal(validateSpecialDeck(PREMIUM_DECK.specialIds).valid,true);
 assert.deepEqual(Object.keys(PREMIUM_DECK_REQUIRED),['B0512',...PREMIUM_CARD_IDS]);
 assert.ok(Object.values(PREMIUM_DECK_REQUIRED).every(count=>count===2));
 assert.equal(PREMIUM_DECK.ids.filter(id=>getCard(id).type==='beast').length,16);
 for(const id of Object.keys(PREMIUM_DECK_REQUIRED)){
  const card=getCard(id);assert.equal(card.origin,'king',id);assert.equal(card.rarity,'GGR',id);assert.equal(card.family,'regalia',id);
  assert.ok(Object.isFrozen(card));assert.ok(Object.isFrozen(card.effect));assert.ok(Object.isFrozen(card.keywords));
 }
 assert.ok(Object.isFrozen(PREMIUM_DECK));assert.ok(Object.isFrozen(PREMIUM_DECK.ids));assert.ok(Object.isFrozen(PREMIUM_DECK_REQUIRED));
 const game=newGame({playerDeck:PREMIUM_DECK.ids,cpuDeck:PREMIUM_DECK.ids,seed:91});
 assert.deepEqual(game.players[0].special,PREMIUM_DECK.specialIds);assert.deepEqual(game.players[1].special,PREMIUM_DECK.specialIds);
});

test('one fixed shuffle distributes all new cards into the ordinary four public packs',()=>{
 assert.equal(PREMIUM_SET_SEED,0x72656761);
 assert.deepEqual(PREMIUM_CARD_SET_ASSIGNMENTS,{
  B2052:'BK01',F0513:'BK02',G1026:'BK03',M1025:'BK04',B2055:'BK01',F0514:'BK02',M1026:'BK03',B2053:'BK04',
  M1027:'BK01',M1029:'BK02',M1028:'BK03',G1025:'BK04',B2054:'BK01',B2049:'BK02',B2051:'BK03',M1030:'BK04',B2050:'BK01',
 });
 assert.deepEqual(PREMIUM_SET_ADDITIONS,{BK01:5,BK02:4,BK03:4,BK04:4});
 for(const set of CARD_SETS.filter(set=>set.id!=='BK05')){
  const cards=getCardsForSet(set.id);assert.equal(cards.length,set.cardCount);assert.equal(cards.filter(c=>c.regaliaSupport).length,PREMIUM_SET_ADDITIONS[set.id]);
  assert.equal(cards.filter(c=>!c.regaliaSupport).length,1152);
 }
 for(const id of PREMIUM_CARD_IDS){const card=getCard(id);assert.equal(card.setId,PREMIUM_CARD_SET_ASSIGNMENTS[id]);assert.ok(getCardsForSet(card.setId).includes(card));}
 assert.equal(CARDS.length,4721);assert.equal(getCard('B0512').setId,'BK02');
});

test('the canonical Regalia has the same public strength and summon effect for both seats',()=>{
 const card=getCard('B0512');assert.equal(card.cost,8);assert.equal(card.attack,2400);assert.equal(card.hp,2600);
 assert.deepEqual(card.keywords,['guard','rush','drain']);assert.equal(card.model,'defense');
 for(const who of [0,1]){
  const state=fixture();state.active=who;const own=withHand(state,'B0512'),enemy=state.players[1-who];own.core=4100;
  enemy.field=[unit('B0002',1-who,'low'),{...unit('B0002',1-who,'high'),hp:1300,maxHp:1300}];
  const before=physicalCount(state);assert.equal(playCard(state,0).ok,true);assert.equal(physicalCount(state),before);
  assert.equal(own.core,5000);assert.equal(own.energy,2);assert.equal(own.field[0].ready,true);
  assert.deepEqual(enemy.field.map(u=>[u.uid,u.hp]),[['high',300]]);assert.deepEqual(enemy.grave,['B0002']);
 }
});

test('Conduit reduces only its owner’s Regalia cost, stacks to two, and rejects insufficient energy atomically',()=>{
 for(const who of [0,1]){
  const state=fixture();state.active=who;const own=withHand(state,'B0512');own.field=[unit('B2052',who,'conduit')];
  assert.equal(getCardCost(state,'B0512'),5);assert.equal(getCardCost(state,getCard('B0512')),5);assert.equal(getCardCost(state,'B0512',1-who),8);
  assert.equal(getCardCost(state,'B2054'),3);assert.equal(getCardCost(state,'M1030'),2);
  own.energy=4;const before=structuredClone(state);assert.deepEqual(getPlayableCards(state),[]);assert.equal(playCard(state,0).ok,false);assert.deepEqual(state,before);
  own.energy=5;assert.deepEqual(getPlayableCards(state),[0]);assert.equal(playCard(state,0).ok,true);assert.equal(own.energy,0);
  own.field.push(unit('B2052',who,'second'));assert.equal(getCardCost(state,'B0512'),2);
  own.field[0].hp=0;assert.equal(getCardCost(state,'B0512'),5);assert.equal(getCard('B0512').cost,8);
 }
});

test('public searches move exactly one existing physical card and never create a copy',()=>{
 for(const [source,wanted] of [['B2049','B0512'],['B2053','M1028'],['B2054','B0512']]){
  const state=fixture(),own=withHand(state,source);own.deck=['B0002',wanted,'M0001','B0512'];
  const before=physicalCount(state),result=playCard(state,0);assert.equal(result.ok,true);
  assert.deepEqual(own.hand,[wanted]);assert.equal(physicalCount(state),before);assert.equal(own.deck.length,3);
  assert.ok(result.events.some(event=>event.text.includes('公開')&&event.text.includes(getCard(wanted).name)));
 }
 const state=fixture(),own=withHand(state,'B2054');own.grave=['B0512'];own.deck=['B0512'];
 assert.equal(playCard(state,0).ok,true);assert.deepEqual(own.hand,['B0512']);assert.deepEqual(own.deck,['B0512']);assert.deepEqual(own.grave,[]);
});

test('Advent summons an existing hand copy before searching the deck and obeys the four-unit cap',()=>{
 for(const handCopy of [false,true]){
  const state=fixture(),own=withHand(state,'M1025',...(handCopy?['B0512']:[]));own.deck=['B0512'];own.energy=3;
  const before=physicalCount(state);assert.equal(playCard(state,0).ok,true);assert.equal(physicalCount(state),before);
  assert.equal(own.field[0].cardId,'B0512');assert.equal(own.field[0].ready,true);assert.equal(own.energy,0);
  assert.equal(own.deck.length,handCopy?1:0);assert.equal(own.hand.length,0);assert.deepEqual(own.grave,['M1025']);
 }
 const state=fixture(),own=withHand(state,'M1025','B0512');own.deck=['B0512'];own.field=Array.from({length:4},(_,i)=>unit('B2049',0,'full-'+i));
 const before=physicalCount(state);assert.equal(playCard(state,0).ok,true);assert.equal(physicalCount(state),before);assert.equal(own.field.length,4);assert.deepEqual(own.hand,['B0512']);assert.deepEqual(own.deck,['B0512']);
});

test('the guard grants printed shield and adds defense only when a royal is summoned',()=>{
 const state=fixture(),own=withHand(state,'B2051');assert.equal(playCard(state,0).ok,true);assert.equal(own.shield,600);
 own.field.push(unit('B2051',0,'second-guard'));own.energy=10;own.hand=['B0512'];assert.equal(playCard(state,0).ok,true);
 assert.equal(own.field.at(-1).hp,3800);assert.equal(own.field.at(-1).maxHp,3800);assert.equal(own.field.at(-1).attack,2400);
 own.energy=10;own.hand=['B2051'];assert.equal(playCard(state,0).ok,true);assert.equal(own.field.find(u=>u.cardId==='B0512').hp,3800);
});

test('prayer and sanctuary heal with their stated conditions and cap at 5000',()=>{
 for(const id of ['B2050','M1028'])for(const royal of [false,true]){
  const state=fixture(),own=withHand(state,id);own.core=2000;if(royal)own.field=[unit('B0512',0,'king')];
  assert.equal(playCard(state,0).ok,true);assert.equal(own.core,2000+(id==='B2050'&&!royal?600:1200));
  assert.equal(own.shield,id==='M1028'&&royal?600:0);
 }
 const state=fixture(),own=withHand(state,'M1028');own.core=4900;assert.equal(playCard(state,0).ok,true);assert.equal(own.core,5000);
});

test('royal-only buffs accept own Regalia and royal fusions, reject other targets without mutation',()=>{
 const state=fixture(),own=withHand(state,'M1026');own.field=[unit('B0512',0,'king'),unit('F0513',0,'sun'),unit('B2052',0,'support')];state.players[1].field=[unit('B0512',1,'enemy')];
 assert.deepEqual(getLegalTargets(state,0),[{player:0,uid:'king'},{player:0,uid:'sun'}]);
 for(const target of [{player:0,uid:'support'},{player:1,uid:'enemy'},{player:0,uid:'missing'}]){
  const before=structuredClone(state);assert.equal(playCard(state,0,target).ok,false);assert.deepEqual(state,before);
 }
 assert.equal(playCard(state,0,{player:0,uid:'king'}).ok,true);assert.deepEqual([own.field[0].attack,own.field[0].hp,own.field[0].maxHp],[3400,3600,3600]);
 own.hand=['B2055'];own.energy=10;assert.equal(playCard(state,0).ok,true);
 assert.equal(own.field[0].attack,4000);assert.equal(own.field[1].attack,2200);assert.equal(own.field[2].attack,400);
});

test('revival moves one grave Regalia to a fresh unit and preserves caps and physical cards',()=>{
 for(const full of [false,true]){
  const state=fixture(),own=withHand(state,'M1027');own.grave=['B0512','B0512'];own.core=3000;
  own.field=Array.from({length:full?4:1},(_,i)=>unit('B2051',0,'guard-'+i));const before=physicalCount(state);
  assert.equal(playCard(state,0).ok,true);assert.equal(physicalCount(state),before);assert.equal(own.grave.filter(id=>id==='B0512').length,full?2:1);
  if(!full){const revived=own.field.at(-1);assert.equal(revived.cardId,'B0512');assert.equal(revived.hp,3200);assert.equal(revived.ready,true);assert.equal(own.core,4500);assert.equal(new Set(own.field.map(u=>u.uid)).size,own.field.length);}
  else assert.equal(own.field.length,4);
 }
});

test('Judgment sweeps units, adds heart damage only with a royal, and respects shields',()=>{
 for(const royal of [false,true]){
  const state=fixture(),own=withHand(state,'M1029'),enemy=state.players[1];if(royal)own.field=[unit('F0513',0,'royal')];
  enemy.shield=200;enemy.field=[{...unit('B0002',1,'target'),hp:900,maxHp:900}];
  assert.equal(playCard(state,0).ok,true);assert.equal(enemy.field[0].hp,100);assert.equal(enemy.core,royal?4400:5000);assert.equal(enemy.shield,royal?0:200);
 }
});

test('the defensive trap stays hidden without a royal and cancels a destroyed attacker when enabled',()=>{
 for(const royal of [false,true]){
  const state=fixture(),own=withHand(state,'G1025');if(royal)own.field=[unit('B0512',0,'king')];
  const placed=playCard(state,0);assert.equal(placed.ok,true);assert.ok(placed.events.every(e=>!e.text.includes('守護陣')));
  const enemy=state.players[1];enemy.field=[{...unit('B0002',1,'attacker'),attack:1000,hp:800,maxHp:800}];state.active=1;
  const before=physicalCount(state);assert.equal(attack(state,'attacker',royal?{player:0,uid:'king'}:{player:0,core:true}).ok,true);assert.equal(physicalCount(state),before);
  assert.equal(own.traps.length,royal?0:1);assert.equal(enemy.field.length,royal?0:1);assert.equal(own.core,royal?5000:4000);assert.equal(own.shield,royal?800:0);
 }
});

test('Coronation resolves next own turn, handles full hands and never leaks a hidden card before activation',()=>{
 for(const mode of ['royal','search','full']){
  const state=fixture(),own=withHand(state,'G1026');own.deck=['B0512','B2050','B2051','B2052','B2053'];state.players[1].deck=Array(4).fill('B0002');
  if(mode==='royal')own.field=[unit('B0512',0,'king')];
  const result=playCard(state,0);assert.ok(result.events.every(e=>!e.text.includes('戴冠式')));assert.equal(own.traps.length,1);
  if(mode==='full')own.hand=['M1027','M1027','G1025','G1025'];
  const before=physicalCount(state);assert.equal(endTurn(state).ok,true);assert.equal(own.traps.length,1);assert.equal(endTurn(state).ok,true);assert.equal(own.traps.length,0);assert.equal(physicalCount(state),before);
  if(mode==='royal')assert.equal(own.field[0].attack,2900);
  if(mode==='search')assert.ok(own.hand.includes('B0512'));
  if(mode==='full'){assert.equal(own.hand.length,4);assert.equal(own.deck[0],'B0512');}
 }
});

test('both royal fusions use actual dedicated material, resolve effects and reject ordinary or opposing materials',()=>{
 for(const spell of ['M1030','M0256'])for(const fusion of ['F0513','F0514']){
  const state=fixture(),own=withHand(state,spell);own.special=[fusion];own.grave=['B2050','B0512'];own.core=3000;
  const selection={specialIndex:0,materials:[{zone:'grave',index:0,cardId:'B2050'}]},before=physicalCount(state);
  assert.equal(validateFusionSelection(state,0,selection).valid,true);assert.equal(playCard(state,0,selection).ok,true);assert.equal(physicalCount(state),before);
  assert.deepEqual(own.banished,['B2050']);assert.equal(own.field[0].cardId,fusion);assert.equal(own.field[0].ready,fusion==='F0513');
  assert.equal(own.energy,10-getCard(spell).cost);assert.equal(own.core,fusion==='F0513'?3800:4000);
  if(fusion==='F0514'){assert.equal(own.shield,1000);assert.deepEqual(own.hand,['B0512']);}
 }
 for(const [spell,fusion,material] of [['M1030','F0001','B2050'],['M1030','F0513','B0002'],['M0256','F0513','B0002']]){
  const state=fixture(),own=withHand(state,spell);own.special=[fusion];own.grave=[material];const before=structuredClone(state);
  assert.equal(playCard(state,0,{specialIndex:0,materials:[{zone:'grave',index:0}]}).ok,false);assert.deepEqual(state,before);
 }
 const state=fixture(),own=withHand(state,'M1030');own.special=['F0513'];own.grave=['B2050'];const before=structuredClone(state);
 assert.equal(playCard(state,0,{specialIndex:0,materials:[{zone:'grave',index:0,player:1}]}).ok,false);assert.deepEqual(state,before);
});

test('public fusion choice helpers expose the same dedicated restrictions for either seat',()=>{
 for(const who of [0,1])for(const spell of ['M1030','M0256']){
  const state=fixture(),own=state.players[who];own.hand=[spell,'B0512','B0002'];own.special=['F0001','F0513'];own.grave=['B2050','B0003'];
  const before=structuredClone(state);
  assert.deepEqual(getFusionChoices(state,0,who),spell==='M1030'?[{id:'F0513',index:1}]:[{id:'F0001',index:0},{id:'F0513',index:1}]);
  assert.deepEqual(getEligibleFusionMaterials(state,0,1,who).map(m=>m.cardId),['B0512','B2050']);
  assert.deepEqual(getEligibleFusionMaterials(state,0,0,who).map(m=>m.cardId),spell==='M1030'?[]:['B0512','B0002','B2050','B0003']);
  assert.deepEqual(getFusionChoices(state,1,who),[]);assert.deepEqual(getEligibleFusionMaterials(state,0,99,who),[]);assert.deepEqual(state,before);
 }
 assert.deepEqual(getFusionChoices(null,0),[]);assert.deepEqual(getEligibleFusionMaterials(null,0,0),[]);
});

test('Regalia remains subject to ordinary combat, guard, effect damage, and one attack per turn',()=>{
 const state=fixture();state.players[0].field=[{...unit('B0002',0,'attacker'),attack:2700}];state.players[1].field=[unit('B0512',1,'king')];
 assert.deepEqual(getAttackTargets(state,'attacker'),[{player:1,uid:'king'}]);assert.equal(attack(state,'attacker',{player:1,uid:'king'}).ok,true);
 assert.equal(state.players[1].field.length,0);assert.equal(state.players[1].core,4900);assert.deepEqual(state.players[1].grave,['B0512']);
 const repeat=structuredClone(state);assert.equal(attack(state,'attacker',{player:1,core:true}).ok,false);assert.deepEqual(state,repeat);
});

test('a seeded premium mirror plays legally without account-specific rules or losing physical cards',()=>{
 for(const seed of [0x731ecb95,0x129dcf84]){
  const state=newGame({playerDeck:PREMIUM_DECK.ids,cpuDeck:PREMIUM_DECK.ids,seed,difficulty:'hard'});
  for(let turns=0;state.winner===null&&turns<200;turns++){
   assert.equal(runAutomatedTurn(state,'hard').ok,true);assert.equal(physicalCount(state),72);
   for(const p of state.players){assert.ok(p.hand.length<=4&&p.field.length<=4&&p.traps.length<=2);assert.ok(p.energy>=0);assert.ok(p.core>=0&&p.core<=5000);assert.ok(p.field.every(u=>u.hp>0&&u.hp<=u.maxHp));}
  }
  assert.notEqual(state.winner,null);
 }
});

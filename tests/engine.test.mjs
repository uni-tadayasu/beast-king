import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, getCard, STARTER_DECKS, DECK_MIN } from '../catalog.js';
import { newGame, playCard, attack, endTurn, runCpuTurn, getLegalTargets, getAttackTargets, canAttack, getPlayableCards } from '../engine.js';

const find = (type,kind) => CARDS.find(c=>c.type===type && c.effect.kind===kind);
const beast = () => CARDS.find(c=>c.type==='beast' && !c.keywords.includes('rush') && c.effect.kind==='none');
function state() {
  const s=newGame({playerDeck:STARTER_DECKS[0].ids,cpuDeck:STARTER_DECKS[1].ids,seed:20261124});
  for (const p of s.players) Object.assign(p,{core:30,shield:0,energy:10,maxEnergy:10,hand:[],field:[],traps:[],grave:[],fatigue:0});
  s.log=[]; return s;
}
function unit(owner,props={}) {
  const card=beast();
  return {uid:`fixture-${owner}-${Math.random()}`,cardId:card.id,attack:3,hp:5,maxHp:5,ready:true,keywords:[],owner,...props};
}
function hand(s,card,who=s.active) {s.players[who].hand=[card.id];return card;}
function conserved(s) {
  for(const p of s.players) {
    assert.equal(p.deck.length+p.hand.length+p.field.length+p.traps.length+p.grave.length,p.deckSize,'each physical card belongs to exactly one zone');
    assert.ok(p.energy>=0 && p.energy<=p.maxEnergy);
    assert.ok(p.field.length<=4 && p.traps.length<=2 && p.hand.length<=4);
    assert.ok(p.core>=0 && p.core<=30 && p.shield>=0);
    assert.ok(p.field.every(u=>u.hp>0 && u.hp<=u.maxHp));
    assert.equal(new Set(p.field.map(u=>u.uid)).size,p.field.length);
  }
  assert.ok(s.log.length<=100);
}

test('seeded setup is reproducible and decks are defensively copied',()=>{
  const ids=[...STARTER_DECKS[0].ids],before=[...ids];
  const a=newGame({playerDeck:ids,cpuDeck:STARTER_DECKS[1].ids,seed:'beast-king'});
  const b=newGame({playerDeck:ids,cpuDeck:STARTER_DECKS[1].ids,seed:'beast-king'});
  assert.deepEqual(a,b);assert.deepEqual(ids,before);
  assert.equal(a.players[0].hand.length,4);assert.equal(a.players[1].hand.length,4);
  assert.equal(a.players[0].energy,1);assert.equal(a.players[1].energy,0);
  assert.equal(a.active,0);assert.equal(a.turn,1);assert.equal(a.players[0].deckSize,DECK_MIN);conserved(a);
  assert.throws(()=>newGame({playerDeck:[ids[0]]}),/デッキ/);
});

test('all rejected plays and attacks preserve the complete state',()=>{
  const s=state();const c=hand(s,find('miracle','buff'));
  const before=structuredClone(s);
  assert.equal(playCard(s,0).ok,false);assert.deepEqual(s,before);
  assert.equal(playCard(s,99).ok,false);assert.deepEqual(s,before);
  assert.equal(attack(s,'missing').ok,false);assert.deepEqual(s,before);
  s.players[0].energy=c.cost-1;const poor=structuredClone(s);
  assert.equal(playCard(s,0).ok,false);assert.deepEqual(s,poor);
});

test('summon wait, turn refresh, rush, once-per-turn, and field capacity',()=>{
  const s=state();hand(s,beast());assert.ok(playCard(s,0).ok);
  const uid=s.players[0].field[0].uid;
  assert.equal(canAttack(s,uid),false);
  endTurn(s);assert.equal(s.active,1);endTurn(s);assert.equal(canAttack(s,uid),true);
  assert.ok(attack(s,uid,{player:1,core:true}).ok);
  const after=structuredClone(s);assert.equal(attack(s,uid,{player:1,core:true}).ok,false);assert.deepEqual(s,after);
  const rush=CARDS.find(c=>c.type==='beast' && c.keywords.includes('rush'));
  s.players[0].energy=10;hand(s,rush);assert.ok(playCard(s,0).ok);assert.equal(s.players[0].field.at(-1).ready,true);
  s.players[0].field.push(unit(0),unit(0));s.players[0].energy=10;hand(s,beast());
  const full=structuredClone(s);assert.equal(playCard(s,0).ok,false);assert.deepEqual(s,full);
});

test('guard forces legal attack targets but does not prevent miracle targeting',()=>{
  const s=state(),attacker=unit(0),guard=unit(1,{keywords:['guard']}),other=unit(1);
  s.players[0].field=[attacker];s.players[1].field=[guard,other];
  assert.deepEqual(getAttackTargets(s,attacker.uid),[{player:1,uid:guard.uid}]);
  const before=structuredClone(s);assert.equal(attack(s,attacker.uid,{player:1,core:true}).ok,false);assert.deepEqual(s,before);
  hand(s,find('miracle','damage_enemy'));
  assert.equal(getLegalTargets(s,0).length,3);assert.ok(playCard(s,0,{player:1,core:true}).ok);
});

test('creature combat is simultaneous; both defeated cards enter the grave',()=>{
  const s=state(),a=unit(0,{attack:5,hp:2,maxHp:2}),b=unit(1,{attack:2,hp:5,maxHp:5});
  s.players[0].field=[a];s.players[1].field=[b];
  assert.ok(attack(s,a.uid,{player:1,uid:b.uid}).ok);
  assert.equal(s.players[0].field.length,0);assert.equal(s.players[1].field.length,0);
  assert.deepEqual(s.players[0].grave,[a.cardId]);assert.deepEqual(s.players[1].grave,[b.cardId]);
});

test('absorption heals actual damage after shield and not overkill',()=>{
  const s=state(),a=unit(0,{attack:8,keywords:['drain']});s.players[0].field=[a];s.players[0].core=10;
  s.players[1].shield=6;attack(s,a.uid,{player:1,core:true});assert.equal(s.players[0].core,12);assert.equal(s.players[1].core,28);
  a.ready=true;const b=unit(1,{attack:0,hp:2,maxHp:2});s.players[1].field=[b];
  attack(s,a.uid,{player:1,uid:b.uid});assert.equal(s.players[0].core,14);
});

test('ambush triggers from hidden information, removes itself, and can cancel attack',()=>{
  const s=state(),c=find('gimmick','ambush'),a=unit(0,{hp:1,maxHp:1});
  s.players[0].field=[a];s.players[1].traps=[{uid:'ambush',cardId:c.id}];
  assert.ok(attack(s,a.uid,{player:1,core:true}).ok);
  assert.equal(s.players[1].core,30);assert.equal(s.players[0].field.length,0);
  assert.equal(s.players[1].traps.length,0);assert.equal(s.players[1].grave[0],c.id);
  const t=state();hand(t,c);playCard(t,0);assert.ok(!t.log.some(e=>e.text.includes(c.name)),'set logs must not reveal identity');
});

test('barrier triggers only on core attacks and combines with shield',()=>{
  const s=state(),c=find('gimmick','barrier'),a=unit(0,{attack:10}),b=unit(1,{hp:20,maxHp:20,attack:0});
  s.players[0].field=[a];s.players[1].field=[b];s.players[1].traps=[{uid:'barrier',cardId:c.id}];
  attack(s,a.uid,{player:1,uid:b.uid});assert.equal(s.players[1].traps.length,1);
  a.ready=true;s.players[1].shield=2;attack(s,a.uid,{player:1,core:true});
  assert.equal(s.players[1].traps.length,0);assert.equal(s.players[1].core,30-Math.max(0,10-c.effect.value-2));
});

test('delayed spring and fountain activate only at their owner next turn',()=>{
  for(const kind of ['spring','fountain']) {
    const s=state(),c=hand(s,find('gimmick',kind));s.players[0].core=10;
    assert.ok(playCard(s,0).ok);assert.equal(s.players[0].traps.length,1);
    endTurn(s);assert.equal(s.players[0].traps.length,1);const deckBefore=s.players[0].deck.length;
    endTurn(s);assert.equal(s.players[0].traps.length,0);assert.equal(s.players[0].grave[0],c.id);
    assert.equal(s.players[0].hand.length,4);assert.equal(s.players[0].deck.length,deckBefore-4);
    if(kind==='spring') assert.equal(s.players[0].shield,c.effect.value);
    else assert.equal(s.players[0].core,10+c.effect.value);
  }
});

test('targeted buff grows attack, current HP, and maximum HP',()=>{
  const s=state(),a=unit(0,{attack:2,hp:2,maxHp:4});s.players[0].field=[a];const c=hand(s,find('miracle','buff'));
  assert.ok(playCard(s,0,{player:0,uid:a.uid}).ok);
  assert.equal(a.attack,2+c.effect.value);assert.equal(a.hp,2+c.effect.value);assert.equal(a.maxHp,4+c.effect.value);
});

test('all supported miracle effects have resolved gameplay, caps, and grave movement',()=>{
  for(const kind of ['damage_enemy','heal','draw','sweep','shield','drain','renew']) {
    const s=state(),c=hand(s,find('miracle',kind));s.players[0].core=20;
    const a=unit(0,{hp:1,maxHp:8}),b=unit(1,{hp:20,maxHp:20});s.players[0].field=[a];s.players[1].field=[b];
    const deck=s.players[0].deck.length;
    assert.ok(playCard(s,0,kind==='damage_enemy'?{player:1,uid:b.uid}:undefined).ok,kind);
    assert.equal(s.players[0].grave[0],c.id);assert.equal(s.players[0].energy,10-c.cost);
    if(kind==='damage_enemy'||kind==='sweep') assert.equal(b.hp,20-c.effect.value);
    if(kind==='heal') assert.equal(s.players[0].core,Math.min(30,20+c.effect.value));
    if(kind==='draw') {assert.equal(s.players[0].hand.length,c.effect.value);assert.equal(s.players[0].deck.length,deck-c.effect.value);}
    if(kind==='shield') assert.equal(s.players[0].shield,c.effect.value);
    if(kind==='drain') {assert.equal(s.players[1].core,30-c.effect.value);assert.equal(s.players[0].core,20+c.effect.value);}
    if(kind==='renew') assert.equal(a.hp,Math.min(8,1+c.effect.value));
  }
});

test('every beast summon effect resolves, including self in team buff',()=>{
  for(const kind of ['none','draw','heal','damage_core','buff_all','shield']) {
    const s=state(),c=hand(s,find('beast',kind));s.players[0].core=20;
    const a=unit(0,{attack:2});s.players[0].field=[a];
    assert.ok(playCard(s,0).ok,kind);const summoned=s.players[0].field[1];
    assert.equal(summoned.cardId,c.id);assert.equal(s.players[0].energy,10-c.cost);
    if(kind==='draw') assert.equal(s.players[0].hand.length,c.effect.value);
    if(kind==='heal') assert.equal(s.players[0].core,Math.min(30,20+c.effect.value));
    if(kind==='damage_core') assert.equal(s.players[1].core,30-c.effect.value);
    if(kind==='buff_all') {assert.equal(a.attack,2+c.effect.value);assert.equal(summoned.attack,c.attack+c.effect.value);}
    if(kind==='shield') assert.equal(s.players[0].shield,c.effect.value);
  }
});

test('gimmick capacity and targeting checks apply without consuming resources',()=>{
  const s=state(),c=hand(s,find('gimmick','spring'));
  s.players[0].traps=[{uid:'x',cardId:c.id},{uid:'y',cardId:c.id}];
  assert.deepEqual(getPlayableCards(s),[]);const before=structuredClone(s);assert.equal(playCard(s,0).ok,false);assert.deepEqual(s,before);
  s.players[0].traps=[];hand(s,find('miracle','buff'));assert.deepEqual(getPlayableCards(s),[]);
});

test('each turn refills to four without consuming or discarding surplus cards',()=>{
  for (const remaining of [0,1,2,3,4]) {
    const s=state();s.players[1].hand=Array(remaining).fill(beast().id);
    const deck=s.players[1].deck.length, grave=s.players[1].grave.length;
    endTurn(s);
    assert.equal(s.players[1].hand.length,4);
    assert.equal(s.players[1].deck.length,deck-(4-remaining));
    assert.equal(s.players[1].grave.length,grave);
  }
});

test('draw effects stop at four and leave surplus cards in the deck',()=>{
  for (const type of ['miracle','beast']) {
    const s=state(),card=CARDS.find(c=>c.type===type && c.effect.kind==='draw' && c.effect.value>=2);
    s.players[0].hand=[card.id,beast().id,beast().id,beast().id];
    const deck=s.players[0].deck.length;
    assert.ok(playCard(s,0).ok);
    assert.equal(s.players[0].hand.length,4);
    assert.equal(s.players[0].deck.length,deck-1);
    assert.deepEqual(s.players[0].grave,type==='miracle'?[card.id]:[]);
  }
});

test('empty-deck refill causes fatigue per missing card and can finish a game',()=>{
  const s=state();s.players[1].hand=Array(3).fill(beast().id);
  s.players[1].deck=[];s.players[1].core=3;s.players[1].shield=0;endTurn(s);
  assert.equal(s.players[1].fatigue,1);assert.equal(s.players[1].core,2);assert.equal(s.winner,null);
  endTurn(s);endTurn(s);assert.equal(s.players[1].fatigue,2);assert.equal(s.winner,0);
  const ended=structuredClone(s);assert.equal(endTurn(s).ok,false);assert.equal(runCpuTurn(s).ok,false);assert.deepEqual(s,ended);
  const t=state();t.players[1].hand=[beast().id];t.players[1].deck=[];endTurn(t);
  assert.equal(t.players[1].fatigue,3);assert.equal(t.players[1].core,24);
});

test('damage can win immediately; final result prevents further actions',()=>{
  const s=state(),a=unit(0,{attack:5});s.players[0].field=[a];s.players[1].core=3;
  assert.ok(attack(s,a.uid,{player:1,core:true}).ok);assert.equal(s.winner,0);
  assert.equal(s.log.at(-1).type,'result');assert.equal(s.players[1].core,0);
  const before=structuredClone(s);assert.equal(playCard(s,0).ok,false);assert.deepEqual(s,before);
});

function humanTurn(s) {
  for(let step=0;step<20 && s.winner===null;step++) {
    const playable=getPlayableCards(s);if(!playable.length) break;
    // Prefer a creature and then higher-cost usable cards for a reproducible opponent.
    playable.sort((a,b)=>{const ca=getCard(s.players[0].hand[a]),cb=getCard(s.players[0].hand[b]);return (cb.type==='beast'?20:0)+cb.cost-((ca.type==='beast'?20:0)+ca.cost);});
    const i=playable[0],targets=getLegalTargets(s,i);
    assert.ok(playCard(s,i,targets[0]).ok);conserved(s);
  }
  for(const u of [...s.players[0].field]) {
    if(s.winner!==null) break;
    const targets=getAttackTargets(s,u.uid);if(targets.length) assert.ok(attack(s,u.uid,targets[0]).ok);
    conserved(s);
  }
  if(s.winner===null) assert.ok(endTurn(s).ok);
}

test('CPU plays complete legal games across all starter decks and difficulties',()=>{
  for(const difficulty of ['easy','normal','hard']) {
    for(let n=0;n<STARTER_DECKS.length;n++) {
      const s=newGame({playerDeck:STARTER_DECKS[n].ids,cpuDeck:STARTER_DECKS[(n+3)%STARTER_DECKS.length].ids,seed:300+n,difficulty});
      let turns=0;
      while(s.winner===null && turns++<160) {
        if(s.active===0) humanTurn(s);else assert.ok(runCpuTurn(s,difficulty).ok);
        conserved(s);
      }
      assert.ok(s.winner!==null,`${difficulty} ${n} must terminate`);
      assert.ok(s.turn<160);assert.ok(s.log.length<=100);
    }
  }
});


test('decks larger than the minimum preserve every card and complete a match',()=>{
  const playerDeck=[...STARTER_DECKS[0].ids,...STARTER_DECKS[1].ids];
  const cpuDeck=[...STARTER_DECKS[2].ids,...STARTER_DECKS[3].ids];
  const s=newGame({playerDeck,cpuDeck,seed:'larger-decks',difficulty:'hard'});
  assert.equal(s.players[0].deckSize,DECK_MIN*2);assert.equal(s.players[1].deckSize,DECK_MIN*2);
  conserved(s);
  let turns=0;
  while(s.winner===null && turns++<320) {
    if(s.active===0) humanTurn(s);else assert.ok(runCpuTurn(s,'hard').ok);
    conserved(s);
  }
  assert.ok(s.winner!==null,'a larger deck game must terminate');
});

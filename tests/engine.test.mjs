import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, getCard, STARTER_DECKS, DECK_MIN, DECK_SIZE, SPECIAL_DECK_SIZE, FUSION_CARD_ID, POINT_SCALE, FUSION_MATERIAL_BONUS } from '../catalog.js';
import { newGame, playCard, attack, endTurn, runCpuTurn, getLegalTargets, getAttackTargets, canAttack, getPlayableCards, getFusionMaterials, validateFusionSelection, MAX_HEART_POINTS, MAX_CORE, MAX_LOG_ENTRIES, RULES } from '../engine.js';

const N = value => value * POINT_SCALE;
const find = (type,kind) => CARDS.find(c=>c.type===type && c.effect.kind===kind);
const beast = () => CARDS.find(c=>c.type==='beast' && c.model==='defense' && !c.keywords.includes('rush') && c.effect.kind==='none');
function state() {
  const s=newGame({playerDeck:STARTER_DECKS[0].ids,cpuDeck:STARTER_DECKS[1].ids,seed:20261124});
  for (const p of s.players) Object.assign(p,{core:MAX_HEART_POINTS,shield:0,energy:10,maxEnergy:10,hand:[],field:[],traps:[],grave:[],fatigue:0});
  s.log=[]; return s;
}
function unit(owner,props={}) {
  const card=beast();
  const result={uid:`fixture-${owner}-${Math.random()}`,cardId:card.id,attack:3,hp:5,maxHp:5,ready:true,keywords:[],owner,...props};
  // Fixture combat statistics are expressed in 100-point units.
  for(const key of ['attack','hp','maxHp']) result[key]=N(result[key]);
  return result;
}
function hand(s,card,who=s.active) {s.players[who].hand=[card.id];return card;}
function conserved(s) {
  for(const p of s.players) {
    assert.equal(p.deck.length+p.hand.length+p.field.length+p.traps.length+p.grave.length+p.special.length+p.banished.length,p.deckSize+p.specialSize,'each physical card belongs to exactly one zone');
    assert.ok(p.energy>=0 && p.energy<=p.maxEnergy);
    assert.ok(p.field.length<=4 && p.traps.length<=2 && p.hand.length<=4);
    assert.ok(p.core>=0 && p.core<=MAX_HEART_POINTS && p.shield>=0);
    assert.ok(p.field.every(u=>u.hp>0 && u.hp<=u.maxHp));
    assert.ok(p.special.every(id=>getCard(id).type==='fusion'));
    assert.ok(p.banished.every(id=>['beast','fusion'].includes(getCard(id).type)));
    assert.ok(p.special.length<=SPECIAL_DECK_SIZE);
    assert.equal(new Set(p.field.map(u=>u.uid)).size,p.field.length);
  }
  assert.ok(s.log.length<=MAX_LOG_ENTRIES);
  assert.ok(s.log.every(event=>Number.isInteger(event.turn)&&event.turn>0&&event.turn<=s.turn));
}

test('seeded setup is reproducible and decks are defensively copied',()=>{
  const ids=[...STARTER_DECKS[0].ids],before=[...ids];
  const a=newGame({playerDeck:ids,cpuDeck:STARTER_DECKS[1].ids,seed:'beast-king'});
  const b=newGame({playerDeck:ids,cpuDeck:STARTER_DECKS[1].ids,seed:'beast-king'});
  assert.deepEqual(a,b);assert.deepEqual(ids,before);
  assert.equal(a.players[0].hand.length,4);assert.equal(a.players[1].hand.length,4);
  assert.equal(a.rulesVersion,2);assert.equal(a.players[0].core,5000);assert.equal(a.players[1].core,5000);assert.equal(MAX_CORE,MAX_HEART_POINTS);assert.equal(RULES.heartPoints,5000);
  assert.equal(a.players[0].energy,1);assert.equal(a.players[1].energy,0);
  assert.equal(a.active,0);assert.equal(a.turn,1);assert.equal(a.players[0].deckSize,DECK_MIN);assert.equal(a.players[0].specialSize,4);assert.equal(a.players[0].special.length,4);conserved(a);
  assert.throws(()=>newGame({playerDeck:[ids[0]]}),/デッキ/);
});

test('new games accept two identical cards but reject a third in either deck',()=>{
  const ids=[...STARTER_DECKS[0].ids],third=[...ids],duplicate=ids[0];
  third[third.findIndex(id=>id!==duplicate)]=duplicate;
  assert.throws(()=>newGame({playerDeck:third}),/2枚まで/);
  assert.throws(()=>newGame({cpuDeck:third}),/2枚まで/);
  assert.throws(()=>newGame({playerSpecialDeck:['F0001','F0001','F0001','F0002']}),/2枚まで/);
  assert.throws(()=>newGame({cpuSpecialDeck:['F0001','F0001','F0001','F0002']}),/2枚まで/);
  const s=newGame({playerDeck:ids,playerSpecialDeck:['F0001','F0001','F0002','F0002'],seed:12});
  assert.deepEqual(s.players[0].special,['F0001','F0001','F0002','F0002']);conserved(s);
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

test('equal attack and defense leave the defending beast unchanged with no HP damage or counterattack',()=>{
  const s=state(),a=unit(0,{attack:5,hp:2,maxHp:2}),b=unit(1,{attack:20,hp:5,maxHp:5});
  s.players[0].field=[a];s.players[1].field=[b];
  assert.ok(attack(s,a.uid,{player:1,uid:b.uid}).ok);
  assert.equal(s.players[0].field.length,1);assert.equal(s.players[1].field.length,1);
  assert.equal(a.hp,200);assert.equal(b.hp,500);assert.equal(s.players[0].core,5000);assert.equal(s.players[1].core,5000);
  assert.deepEqual(s.players[0].grave,[]);assert.deepEqual(s.players[1].grave,[]);
});

test('absorption heals actual heart-point damage after shield and defense',()=>{
  const s=state(),a=unit(0,{attack:8,keywords:['drain']});s.players[0].field=[a];s.players[0].core=N(10);
  s.players[1].shield=N(6);attack(s,a.uid,{player:1,core:true});assert.equal(s.players[0].core,N(12));assert.equal(s.players[1].core,MAX_HEART_POINTS-N(2));
  a.ready=true;const b=unit(1,{attack:0,hp:2,maxHp:2});s.players[1].field=[b];
  attack(s,a.uid,{player:1,uid:b.uid});assert.equal(s.players[0].core,N(18));
});

test('ambush triggers from hidden information, removes itself, and can cancel attack',()=>{
  const s=state(),c=find('gimmick','ambush'),a=unit(0,{hp:1,maxHp:1});
  s.players[0].field=[a];s.players[1].traps=[{uid:'ambush',cardId:c.id}];
  assert.ok(attack(s,a.uid,{player:1,core:true}).ok);
  assert.equal(s.players[1].core,MAX_HEART_POINTS);assert.equal(s.players[0].field.length,0);
  assert.equal(s.players[1].traps.length,0);assert.equal(s.players[1].grave[0],c.id);
  const t=state();hand(t,c);playCard(t,0);assert.ok(!t.log.some(e=>e.text.includes(c.name)),'set logs must not reveal identity');
});

test('barrier triggers only on core attacks and combines with shield',()=>{
  const s=state(),c=find('gimmick','barrier'),a=unit(0,{attack:10}),b=unit(1,{hp:20,maxHp:20,attack:0});
  s.players[0].field=[a];s.players[1].field=[b];s.players[1].traps=[{uid:'barrier',cardId:c.id}];
  attack(s,a.uid,{player:1,uid:b.uid});assert.equal(s.players[1].traps.length,1);
  a.ready=true;s.players[1].shield=N(2);attack(s,a.uid,{player:1,core:true});
  assert.equal(s.players[1].traps.length,0);assert.equal(s.players[1].core,MAX_HEART_POINTS-Math.max(0,N(10)-c.effect.value-N(2)));
});

test('delayed beast-support gimmicks activate only at their owner next turn',()=>{
  for(const kind of ['spring','fountain']) {
    const s=state(),c=hand(s,find('gimmick',kind));s.players[0].core=N(10);
    const supported=unit(0,{attack:2,hp:1,maxHp:8});s.players[0].field=[supported];
    assert.ok(playCard(s,0).ok);assert.equal(s.players[0].traps.length,1);
    endTurn(s);assert.equal(s.players[0].traps.length,1);const deckBefore=s.players[0].deck.length;
    endTurn(s);assert.equal(s.players[0].traps.length,0);assert.equal(s.players[0].grave[0],c.id);
    assert.equal(s.players[0].hand.length,4);assert.equal(s.players[0].deck.length,deckBefore-4);
    assert.equal(s.players[0].core,N(10));assert.equal(s.players[0].shield,0);
    if(kind==='spring') {assert.equal(supported.attack,N(2)+c.effect.value);assert.equal(supported.hp,N(1)+c.effect.value);assert.equal(supported.maxHp,N(8)+c.effect.value);}
    else {assert.equal(supported.attack,N(2));assert.equal(supported.hp,Math.min(N(8),N(1)+c.effect.value));}
  }
});

test('targeted buff grows attack, current HP, and maximum HP',()=>{
  const s=state(),a=unit(0,{attack:2,hp:2,maxHp:4});s.players[0].field=[a];const c=hand(s,find('miracle','buff'));
  assert.ok(playCard(s,0,{player:0,uid:a.uid}).ok);
  assert.equal(a.attack,N(2)+c.effect.value);assert.equal(a.hp,N(2)+c.effect.value);assert.equal(a.maxHp,N(4)+c.effect.value);
});

test('all supported miracle effects have resolved gameplay, caps, and grave movement',()=>{
  for(const kind of ['damage_enemy','heal','draw','sweep','shield_heal','drain','renew']) {
    const s=state(),c=hand(s,find('miracle',kind));s.players[0].core=N(20);
    const a=unit(0,{hp:1,maxHp:8}),b=unit(1,{hp:20,maxHp:20});s.players[0].field=[a];s.players[1].field=[b];
    const deck=s.players[0].deck.length;
    assert.ok(playCard(s,0,kind==='damage_enemy'?{player:1,uid:b.uid}:undefined).ok,kind);
    assert.equal(s.players[0].grave[0],c.id);assert.equal(s.players[0].energy,10-c.cost);
    if(kind==='damage_enemy'||kind==='sweep') assert.equal(b.hp,N(20)-c.effect.value);
    if(kind==='heal'||kind==='shield_heal') assert.equal(s.players[0].core,Math.min(MAX_HEART_POINTS,N(20)+c.effect.value));
    if(kind==='draw') {assert.equal(s.players[0].hand.length,c.effect.value);assert.equal(s.players[0].deck.length,deck-c.effect.value);}
    if(kind==='shield_heal') assert.equal(s.players[0].shield,c.effect.value);
    if(kind==='drain') {assert.equal(s.players[1].core,MAX_HEART_POINTS-c.effect.value);assert.equal(s.players[0].core,N(20)+c.effect.value);}
    if(kind==='renew') assert.equal(a.hp,Math.min(N(8),N(1)+c.effect.value));
  }
});

test('every beast summon effect resolves, including self in team buff',()=>{
  for(const kind of ['none','draw','heal','damage_core','buff_all','shield']) {
    const s=state(),c=hand(s,find('beast',kind));s.players[0].core=N(20);
    const a=unit(0,{attack:2});s.players[0].field=[a];
    assert.ok(playCard(s,0).ok,kind);const summoned=s.players[0].field[1];
    assert.equal(summoned.cardId,c.id);assert.equal(s.players[0].energy,10-c.cost);
    if(kind==='draw') assert.equal(s.players[0].hand.length,c.effect.value);
    if(kind==='heal'||kind==='shield_heal') assert.equal(s.players[0].core,Math.min(MAX_HEART_POINTS,N(20)+c.effect.value));
    if(kind==='damage_core') assert.equal(s.players[1].core,MAX_HEART_POINTS-c.effect.value);
    if(kind==='buff_all') {assert.equal(a.attack,N(2)+c.effect.value);assert.equal(summoned.attack,c.attack+c.effect.value);}
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
  s.players[1].deck=[];s.players[1].core=N(3);s.players[1].shield=N(0);endTurn(s);
  assert.equal(s.players[1].fatigue,1);assert.equal(s.players[1].core,N(2));assert.equal(s.winner,null);
  endTurn(s);endTurn(s);assert.equal(s.players[1].fatigue,2);assert.equal(s.winner,0);
  const ended=structuredClone(s);assert.equal(endTurn(s).ok,false);assert.equal(runCpuTurn(s).ok,false);assert.deepEqual(s,ended);
  const t=state();t.players[1].hand=[beast().id];t.players[1].deck=[];endTurn(t);
  assert.equal(t.players[1].fatigue,3);assert.equal(t.players[1].core,MAX_HEART_POINTS-N(6));
});

test('damage can win immediately; final result prevents further actions',()=>{
  const s=state(),a=unit(0,{attack:5});s.players[0].field=[a];s.players[1].core=N(3);
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
    const selection=getCard(s.players[0].hand[i]).effect.kind==='fusion'?firstFusionSelection(s):targets[0];
    assert.ok(playCard(s,i,selection).ok);conserved(s);
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
      assert.ok(s.turn<160);assert.ok(s.log.length<=MAX_LOG_ENTRIES);
    }
  }
});


test('main decks require exactly 32 and special decks exactly four',()=>{
  const deck=[...STARTER_DECKS[0].ids],special=[...STARTER_DECKS[0].specialIds];
  assert.throws(()=>newGame({playerDeck:deck.slice(1)}),/デッキ/);
  assert.throws(()=>newGame({playerDeck:[...deck,'B0512']}),/デッキ/);
  assert.throws(()=>newGame({playerDeck:[...deck,...STARTER_DECKS[1].ids]}),/デッキ/);
  assert.throws(()=>newGame({playerSpecialDeck:special.slice(1)}),/特殊デッキ/);
  assert.throws(()=>newGame({playerSpecialDeck:[...special,'F0128']}),/特殊デッキ/);
  assert.throws(()=>newGame({playerSpecialDeck:[...special.slice(1),'B0001']}),/特殊デッキ/);
  const normal=newGame({playerDeck:deck,playerSpecialDeck:special,seed:45});
  assert.equal(normal.players[0].deckSize,DECK_SIZE);assert.equal(normal.players[0].specialSize,SPECIAL_DECK_SIZE);
  assert.deepEqual(special,STARTER_DECKS[0].specialIds);
  normal.players[0].special.pop();assert.equal(special.length,4);
});

function firstFusionSelection(s) {
  const available=getFusionMaterials(s),p=s.players[s.active];
  const material=p.field.length>=4?available.find(m=>m.zone==='field'):available.find(m=>m.zone==='grave')||available[0];
  return {specialIndex:0,materials:[material]};
}
const fusionCard=()=>CARDS.find(c=>c.type==='fusion' && c.effect.kind==='none' && !c.keywords.includes('rush'));
function fusionState() {
  const s=state(),c=fusionCard();
  s.players[0].hand=[FUSION_CARD_ID,beast().id];
  s.players[0].special=[c.id,...STARTER_DECKS[0].specialIds.slice(1)];
  return s;
}

test('fusion material discovery includes all beasts in own three zones and excludes spells, banished and opponent',()=>{
  const s=fusionState(),p=s.players[0];
  p.field=[unit(0),unit(0,{cardId:fusionCard().id})];
  p.grave=[beast().id,FUSION_CARD_ID,fusionCard().id];p.banished=[beast().id];
  s.players[1].field=[unit(1)];
  const before=structuredClone(s),materials=getFusionMaterials(s);
  assert.deepEqual(materials.map(m=>m.zone),['hand','field','field','grave','grave']);
  assert.equal(materials[1].uid,p.field[0].uid);
  assert.ok(materials.every(m=>['beast','fusion'].includes(getCard(m.cardId).type)));
  assert.deepEqual(s,before,'enumeration is read-only');
});

test('one material is sufficient and consumes one special plus exactly three ether',()=>{
  const s=fusionState(),p=s.players[0],base=getCard(p.special[0]);p.energy=3;
  assert.ok(getPlayableCards(s).includes(0));
  const selection={specialIndex:0,materials:[{zone:'hand',index:1}]};
  assert.deepEqual(validateFusionSelection(s,0,selection),{valid:true,errors:[]});
  assert.ok(playCard(s,0,selection).ok);
  assert.equal(p.energy,0);assert.equal(p.hand.length,0);assert.equal(p.special.length,3);
  assert.deepEqual(p.grave,[FUSION_CARD_ID]);assert.deepEqual(p.banished,[beast().id]);
  assert.equal(p.field[0].cardId,base.id);assert.equal(p.field[0].attack,base.attack);assert.equal(p.field[0].hp,base.hp);
  assert.equal(p.field[0].fusionMaterialCount,1);assert.equal(p.field[0].ready,false);
});

test('mixed-zone fusion removes original indexes atomically including materials before and after the spell',()=>{
  const s=fusionState(),p=s.players[0],base=getCard(p.special[0]);
  const b1='B0002',b2='B0003',b3='B0004',b4='B0005',kept='G0001';
  p.hand=[b1,FUSION_CARD_ID,b2,kept];p.field=[unit(0,{cardId:b3}),unit(0,{cardId:'B0006'})];p.grave=[b4,'M0001'];
  const fieldUid=p.field[0].uid;
  const selection={specialIndex:0,materials:[{zone:'hand',index:0},{zone:'hand',index:2},{zone:'field',index:0,uid:fieldUid},{zone:'grave',index:0}]};
  assert.ok(playCard(s,1,selection).ok);
  assert.deepEqual(p.hand,[kept]);assert.deepEqual(p.grave,['M0001',FUSION_CARD_ID]);
  assert.deepEqual(p.banished,[b1,b2,b3,b4]);assert.equal(p.field.length,2);
  assert.equal(p.field[0].cardId,'B0006');const summoned=p.field[1];
  assert.equal(summoned.attack,base.attack+3*FUSION_MATERIAL_BONUS);assert.equal(summoned.hp,base.hp+3*FUSION_MATERIAL_BONUS);assert.equal(summoned.maxHp,base.hp+3*FUSION_MATERIAL_BONUS);assert.equal(summoned.fusionMaterialCount,4);
});

test('same card ids from distinct physical copies are legal and there is no arbitrary material-count cap',()=>{
  const s=fusionState(),p=s.players[0],base=getCard(p.special[0]);
  p.hand=[FUSION_CARD_ID];p.grave=STARTER_DECKS[0].ids.filter(id=>getCard(id).type==='beast');
  assert.equal(p.grave.length,16);
  const selection={specialIndex:0,materials:getFusionMaterials(s)};
  assert.ok(playCard(s,0,selection).ok);
  assert.equal(p.banished.length,16);assert.equal(p.field[0].fusionMaterialCount,16);
  assert.equal(p.field[0].attack,base.attack+15*FUSION_MATERIAL_BONUS);assert.equal(p.field[0].hp,base.hp+15*FUSION_MATERIAL_BONUS);
});

test('invalid fusion selections reject without mutating resources, zones, history, or RNG',()=>{
  const bad=[undefined,{}, {specialIndex:0,materials:[]},
    {specialIndex:-1,materials:[{zone:'hand',index:1}]},
    {specialIndex:0.5,materials:[{zone:'hand',index:1}]},
    {specialIndex:4,materials:[{zone:'hand',index:1}]},
    {specialIndex:0,materials:[{zone:'hand',index:0}]},
    {specialIndex:0,materials:[{zone:'hand',index:-1}]},
    {specialIndex:0,materials:[{zone:'hand',index:1.1}]},
    {specialIndex:0,materials:[{zone:'hand',index:8}]},
    {specialIndex:0,materials:[{zone:'opponent',index:0}]},
    {specialIndex:0,materials:[{zone:'banished',index:0}]},
    {specialIndex:0,materials:[{zone:'special',index:0}]},
    {specialIndex:0,materials:[{zone:'hand',index:1},{zone:'hand',index:1}]},
    {specialIndex:0,materials:[{zone:'hand',index:1,player:1}]},
    {specialIndex:0,materials:[{zone:'hand',index:1,cardId:'B0512'}]},
    {specialIndex:0,materials:[{zone:'field',index:0,uid:'opponent-unit'}]},
    {specialIndex:0,materials:[{zone:'grave',index:0}]}
  ];
  for(const selection of bad) {
    const s=fusionState();s.players[0].field=[unit(0)];s.players[0].grave=[FUSION_CARD_ID];
    const before=structuredClone(s);
    assert.equal(validateFusionSelection(s,0,selection).valid,false,JSON.stringify(selection));
    assert.equal(playCard(s,0,selection).ok,false,JSON.stringify(selection));
    assert.deepEqual(s,before);
  }
  const s=fusionState();s.players[0].energy=2;const before=structuredClone(s);
  assert.equal(playCard(s,0,{specialIndex:0,materials:[{zone:'hand',index:1}]}).ok,false);assert.deepEqual(s,before);
});

test('full field permits fusion only after consuming enough selected field materials',()=>{
  const s=fusionState(),p=s.players[0];p.field=Array.from({length:4},()=>unit(0));
  assert.ok(getPlayableCards(s).includes(0));
  const noSpace={specialIndex:0,materials:[{zone:'hand',index:1}]};
  const before=structuredClone(s);assert.equal(playCard(s,0,noSpace).ok,false);assert.deepEqual(s,before);
  const freesSpace={specialIndex:0,materials:[{zone:'field',index:2,uid:p.field[2].uid}]};
  assert.ok(playCard(s,0,freesSpace).ok);assert.equal(p.field.length,4);assert.equal(p.banished.length,1);
  const t=fusionState();t.players[0].field=Array.from({length:4},()=>unit(0,{cardId:fusionCard().id}));
  assert.ok(getPlayableCards(t).includes(0),'fusion beasts may be used as materials to free a slot');
  assert.ok(playCard(t,0,{specialIndex:0,materials:[{zone:'field',index:0,uid:t.players[0].field[0].uid}]}).ok);
  assert.equal(t.players[0].field.length,4);assert.equal(getCard(t.players[0].banished[0]).type,'fusion');
});

test('spent material and absent special cannot be reused; defeated fusion becomes a grave material',()=>{
  const s=fusionState(),p=s.players[0];p.special=[fusionCard().id];p.specialSize=1;
  p.hand=[FUSION_CARD_ID,FUSION_CARD_ID,beast().id];
  assert.ok(playCard(s,0,{specialIndex:0,materials:[{zone:'hand',index:2}]}).ok);
  const before=structuredClone(s);assert.equal(playCard(s,0,{specialIndex:0,materials:[{zone:'hand',index:2}]}).ok,false);assert.deepEqual(s,before);
  assert.ok(!getPlayableCards(s).includes(0));assert.equal(getFusionMaterials(s).length,1);assert.equal(getFusionMaterials(s)[0].zone,'field');
  const fused=p.field[0];fused.hp=N(1);s.active=1;const enemy=unit(1,{attack:2,hp:99,maxHp:99});s.players[1].field=[enemy];
  assert.ok(attack(s,enemy.uid,{player:0,uid:fused.uid}).ok);
  assert.ok(p.grave.includes(fused.cardId));const eligible=getFusionMaterials(s,0);assert.equal(eligible.length,1);assert.equal(eligible[0].cardId,fused.cardId);assert.equal(eligible[0].zone,'grave');assert.deepEqual(p.banished,[beast().id]);
});

test('fusion summon effects and rush resolve normally while draw remains capped at four',()=>{
  for(const card of CARDS.filter(c=>c.type==='fusion' && ['draw','shield','buff_all'].includes(c.effect.kind)).slice(0,16)) {
    const s=fusionState(),p=s.players[0];p.special[0]=card.id;p.hand=[FUSION_CARD_ID,'M0001','M0002','M0003'];p.grave=[beast().id];
    assert.ok(playCard(s,0,{specialIndex:0,materials:[{zone:'grave',index:0}]}).ok);
    const fused=p.field[0];assert.equal(fused.ready,card.keywords.includes('rush'));
    if(card.effect.kind==='draw') assert.equal(p.hand.length,4);
    if(card.effect.kind==='shield') assert.equal(p.shield,card.effect.value);
    if(card.effect.kind==='buff_all') assert.equal(fused.attack,card.attack+card.effect.value);
  }
  const rush=CARDS.find(c=>c.type==='fusion'&&c.keywords.includes('rush')),s=fusionState();s.players[0].special[0]=rush.id;
  assert.ok(playCard(s,0,{specialIndex:0,materials:[{zone:'hand',index:1}]}).ok);
  assert.equal(canAttack(s,s.players[0].field[0].uid),true);
});

test('CPU can fuse using hand, field, or grave at all difficulties',()=>{
  for(const difficulty of ['easy','normal','hard']) for(const zone of ['hand','field','grave']) {
    const s=state();s.active=1;const p=s.players[1];p.energy=3;p.hand=[FUSION_CARD_ID];p.special=[fusionCard().id];
    if(zone==='hand') p.hand.push(beast().id);
    else if(zone==='field') p.field=[unit(1,{ready:false})];
    else p.grave=[beast().id];
    const result=runCpuTurn(s,difficulty);
    assert.ok(result.ok);assert.ok(result.events.some(e=>e.type==='fusion'),`${difficulty}/${zone}`);
    assert.equal(p.banished.length,1);assert.equal(p.special.length,0);assert.equal(p.field[0].cardId,fusionCard().id);
  }
});


test('a single hand-only, field-only, or grave-only selection can independently perform fusion',()=>{
  for(const zone of ['hand','field','grave']) {
    const s=fusionState(),p=s.players[0];p.hand=[FUSION_CARD_ID];p.field=[];p.grave=[];
    if(zone==='hand') p.hand.push(beast().id);
    else if(zone==='field') p.field.push(unit(0));
    else p.grave.push(beast().id);
    const materials=getFusionMaterials(s);
    assert.equal(materials.length,1);assert.equal(materials[0].zone,zone);
    assert.ok(playCard(s,0,{specialIndex:0,materials}).ok,zone);
    assert.equal(p.field.length,1);assert.equal(p.banished.length,1);assert.equal(p.special.length,3);
  }
});

test('fusion beasts are materials in hand, field, or grave, but never directly in special or otherworld',()=>{
  for(const zone of ['hand','field','grave']) {
    const s=fusionState(),p=s.players[0];p.hand=[FUSION_CARD_ID];p.field=[];p.grave=[];const materialId='F0001';
    if(zone==='hand') p.hand.push(materialId);
    else if(zone==='field') p.field.push(unit(0,{cardId:materialId}));
    else p.grave.push(materialId);
    const materials=getFusionMaterials(s);assert.equal(materials.length,1);assert.equal(materials[0].cardId,materialId);
    assert.ok(playCard(s,0,{specialIndex:0,materials}).ok,zone);assert.deepEqual(p.banished,[materialId]);
    p.hand=[FUSION_CARD_ID];const before=structuredClone(s);
    for(const invalidZone of ['special','banished']) {
      assert.equal(playCard(s,0,{specialIndex:0,materials:[{zone:invalidZone,index:0}]}).ok,false);
      assert.deepEqual(s,before);
    }
  }
});

test('a defeated fusion beast can be fused again from the grave and then remains in the otherworld',()=>{
  const s=fusionState(),p=s.players[0];p.hand=[FUSION_CARD_ID,FUSION_CARD_ID,beast().id];
  const first=p.special[0],next=p.special[1];
  assert.ok(playCard(s,0,{specialIndex:0,materials:[{zone:'hand',index:2}]}).ok);
  const fused=p.field[0];fused.hp=N(1);s.active=1;const enemy=unit(1,{attack:2,hp:99,maxHp:99});s.players[1].field=[enemy];
  assert.ok(attack(s,enemy.uid,{player:0,uid:fused.uid}).ok);assert.ok(p.grave.includes(first));
  s.active=0;p.energy=3;
  const materials=getFusionMaterials(s).filter(m=>m.zone==='grave'&&m.cardId===first);assert.equal(materials.length,1);
  assert.ok(playCard(s,0,{specialIndex:0,materials}).ok);
  assert.ok(p.banished.includes(first));assert.ok(!p.grave.includes(first));assert.ok(p.field.some(u=>u.cardId===next));
  assert.ok(!getFusionMaterials(s).some(m=>m.cardId===first));assert.equal(p.special.length,2);
});


test('heart points start at 5000, heal caps at 5000 and zero means defeat',()=>{
  const s=state(),p=s.players[0];p.core=4900;
  hand(s,find('miracle','heal'));assert.ok(playCard(s,0).ok);assert.equal(p.core,5000);
  const attacker=unit(0,{attack:49});p.field=[attacker];
  assert.ok(attack(s,attacker.uid,{player:1,core:true}).ok);assert.equal(s.players[1].core,100);assert.equal(s.winner,null);
  attacker.ready=true;attacker.attack=100;
  assert.ok(attack(s,attacker.uid,{player:1,core:true}).ok);assert.equal(s.players[1].core,0);assert.equal(s.winner,0);
  assert.ok(s.log.every(e=>!e.text.includes('コア')));
});


const attackBeast=()=>CARDS.find(c=>c.type==='beast' && c.model==='attack');
test('an attacked attack-model beast is destroyed and its owner loses full attack: 5000 to 4400',()=>{
  const s=state(),a=unit(0,{attack:6,hp:2,maxHp:2}),b=unit(1,{cardId:attackBeast().id,attack:40,hp:90,maxHp:90});
  s.players[0].field=[a];s.players[1].field=[b];
  assert.ok(attack(s,a.uid,{player:1,uid:b.uid}).ok);
  assert.equal(s.players[1].core,4400);assert.equal(s.players[1].field.length,0);assert.deepEqual(s.players[1].grave,[b.cardId]);
  assert.equal(a.hp,200,'there is no counterattack');assert.equal(s.players[0].core,5000);
  assert.ok(s.log.some(e=>e.text.includes('アタック型')&&e.text.includes('強制的に消滅')));
});

test('even a weak attack destroys a stronger attack-model beast and bypasses shield without consuming it',()=>{
  const s=state(),a=unit(0,{attack:1,hp:1,maxHp:1}),b=unit(1,{cardId:attackBeast().id,attack:99,hp:99,maxHp:99});
  s.players[0].field=[a];s.players[1].field=[b];s.players[1].shield=3000;
  const barrier=find('gimmick','barrier');s.players[1].traps=[{uid:'attack-model-barrier',cardId:barrier.id}];
  assert.ok(attack(s,a.uid,{player:1,uid:b.uid}).ok);
  assert.equal(s.players[1].core,4900);assert.equal(s.players[1].shield,3000);assert.equal(a.hp,100);
  assert.equal(s.players[1].traps.length,1,'a direct-HP barrier does not trigger for a beast target');
});

test('ambush cancelling an attack prevents attack-model destruction and heart-point damage',()=>{
  const s=state(),a=unit(0,{attack:6,hp:1,maxHp:1}),b=unit(1,{cardId:attackBeast().id,hp:9,maxHp:9});
  s.players[0].field=[a];s.players[1].field=[b];s.players[1].traps=[{uid:'cancel-attack-model',cardId:find('gimmick','ambush').id}];
  assert.ok(attack(s,a.uid,{player:1,uid:b.uid}).ok);
  assert.equal(s.players[0].field.length,0);assert.equal(s.players[1].field.length,1);assert.equal(b.hp,900);assert.equal(s.players[1].core,5000);
  assert.ok(s.log.some(e=>e.type==='cancel'));
});

test('attack-model absorption heals once from actual heart-point loss, without defensive absorption',()=>{
  const s=state(),a=unit(0,{attack:6,keywords:['drain']}),b=unit(1,{cardId:attackBeast().id,attack:10,hp:1,maxHp:1,keywords:['drain']});
  s.players[0].field=[a];s.players[1].field=[b];s.players[0].core=1000;s.players[1].core=400;s.players[1].shield=2000;
  assert.ok(attack(s,a.uid,{player:1,uid:b.uid}).ok);
  assert.equal(s.players[0].core,1400,'heal only actual remaining400 HP, once');
  assert.equal(s.players[1].core,0);assert.equal(s.players[1].shield,2000);assert.equal(s.winner,0);assert.equal(a.hp,500);
});

test('miracle damage does not trigger the attack-model forced-destruction rule',()=>{
  const s=state(),b=unit(1,{cardId:attackBeast().id,hp:10,maxHp:10});s.players[1].field=[b];
  const spell=hand(s,find('miracle','damage_enemy'));assert.ok(playCard(s,0,{player:1,uid:b.uid}).ok);
  assert.equal(b.hp,1000-spell.effect.value);assert.equal(s.players[1].field.length,1);assert.equal(s.players[1].core,5000);
});

test('all fusion beasts are hybrid and compare defense for weaker, equal and stronger attacks',()=>{
  for(const fusion of CARDS.filter(c=>c.type==='fusion')) {
    assert.equal(fusion.model,'hybrid');
    for(const [power,damage,vanishes] of [[4,0,false],[6,0,false],[8,200,true]]) {
      const s=state(),a=unit(0,{attack:power,hp:3,maxHp:3});
      // Restored per-unit legacy model fields cannot override current card rules.
      const b=unit(1,{cardId:fusion.id,model:'attack',attack:99,hp:6,maxHp:9});
      s.players[0].field=[a];s.players[1].field=[b];s.players[1].shield=2000;
      const result=attack(s,a.uid,{player:1,uid:b.uid});assert.ok(result.ok,fusion.id);
      assert.equal(s.players[1].core,5000-damage,fusion.id);
      assert.equal(s.players[1].shield,2000);assert.equal(a.hp,300,'hybrid defense does not counterattack');
      assert.equal(s.players[1].field.length,vanishes?0:1);
      assert.deepEqual(s.players[1].grave,vanishes?[fusion.id]:[]);
      assert.equal(b.hp,vanishes?0:600);
      assert.ok(result.events.some(e=>e.text.includes('アタック・ディフェンス型')));
      assert.ok(!result.events.some(e=>e.text.includes('強制的に消滅')));
      if(vanishes) assert.ok(getFusionMaterials(s,1).some(m=>m.zone==='grave'&&m.cardId===fusion.id));
    }
  }
});

test('a hybrid fusion uses attack offensively and defense when the opponent attacks',()=>{
  const s=state(),fusion=fusionCard(),a=unit(0,{cardId:fusion.id,attack:6,hp:7,maxHp:7});
  const b=unit(1,{attack:5,hp:10,maxHp:10});
  s.players[0].field=[a];s.players[1].field=[b];
  assert.ok(attack(s,a.uid,{player:1,core:true}).ok);
  assert.equal(s.players[1].core,4400,'the fusion attacks for600, not its700 defense');
  s.active=1;
  assert.ok(attack(s,b.uid,{player:0,uid:a.uid}).ok);
  assert.equal(s.players[0].core,5000);assert.equal(a.hp,700);assert.equal(b.hp,1000);
  assert.ok(s.players[0].field.includes(a));
});

test('hard CPU distinguishes durable hybrid fusion from a vulnerable normal attack-model beast',()=>{
  const s=state();s.active=1;
  const cpu=unit(1,{attack:4,hp:5,maxHp:5});
  const durable=unit(0,{cardId:fusionCard().id,attack:50,hp:20,maxHp:20});
  const vulnerable=unit(0,{cardId:attackBeast().id,attack:3,hp:10,maxHp:10});
  s.players[1].field=[cpu];s.players[0].field=[durable,vulnerable];
  assert.ok(runCpuTurn(s,'hard').ok);
  assert.ok(s.players[0].field.some(u=>u.uid===durable.uid));assert.equal(durable.hp,2000);
  assert.ok(!s.players[0].field.some(u=>u.uid===vulnerable.uid));
  assert.ok(s.players[0].grave.includes(vulnerable.cardId));
  assert.equal(s.players[0].core,4600);assert.equal(cpu.hp,500);
});


test('defense comparison handles lower, equal, and higher attacks without reducing surviving defense',()=>{
  for(const [power,defense,damage,vanishes] of [[4,6,0,false],[6,6,0,false],[8,6,200,true]]) {
    const s=state(),a=unit(0,{attack:power,hp:3,maxHp:3}),b=unit(1,{attack:90,hp:defense,maxHp:9});
    s.players[0].field=[a];s.players[1].field=[b];s.players[1].shield=2000;
    const result=attack(s,a.uid,{player:1,uid:b.uid});assert.ok(result.ok);
    assert.equal(s.players[1].core,5000-damage);assert.equal(s.players[1].shield,2000);assert.equal(a.hp,300);
    assert.equal(s.players[1].field.length,vanishes?0:1);assert.equal(s.players[1].grave.length,vanishes?1:0);
    if(!vanishes) assert.equal(b.hp,N(defense));
    assert.equal(result.events.filter(e=>e.type==='damage').length,damage?1:0,'no duplicate excess damage');
  }
});

test('defense uses current defense rather than original maximum and heals absorption from excess HP loss only',()=>{
  const s=state(),a=unit(0,{attack:6,hp:3,maxHp:3,keywords:['drain']}),b=unit(1,{attack:20,hp:4,maxHp:9,keywords:['drain']});
  s.players[0].field=[a];s.players[1].field=[b];s.players[0].core=1000;s.players[1].shield=3000;
  assert.ok(attack(s,a.uid,{player:1,uid:b.uid}).ok);
  assert.equal(s.players[1].core,4800);assert.equal(s.players[1].shield,3000);assert.equal(s.players[0].core,1200);assert.equal(a.hp,300);
  assert.deepEqual(s.players[1].grave,[b.cardId]);
});

test('blocked defense attacks do not absorb and lethal excess heals only actual remaining HP',()=>{
  const s=state(),a=unit(0,{attack:6,keywords:['drain']}),b=unit(1,{hp:6,maxHp:6,keywords:['drain']});
  s.players[0].field=[a];s.players[1].field=[b];s.players[0].core=1000;s.players[1].core=400;s.players[1].shield=2000;
  assert.ok(attack(s,a.uid,{player:1,uid:b.uid}).ok);assert.equal(s.players[0].core,1000);assert.equal(s.players[1].core,400);
  a.ready=true;b.hp=100;
  assert.ok(attack(s,a.uid,{player:1,uid:b.uid}).ok);assert.equal(s.players[0].core,1400);assert.equal(s.players[1].core,0);assert.equal(s.winner,0);
  assert.equal(s.players[1].shield,2000);
});

test('ambush cancellation prevents defense disappearance and excess HP damage',()=>{
  const s=state(),a=unit(0,{attack:8,hp:1,maxHp:1}),b=unit(1,{hp:2,maxHp:2});s.players[0].field=[a];s.players[1].field=[b];
  s.players[1].traps=[{uid:'cancel-defense',cardId:find('gimmick','ambush').id}];
  assert.ok(attack(s,a.uid,{player:1,uid:b.uid}).ok);assert.equal(s.players[0].field.length,0);assert.equal(s.players[1].field.length,1);
  assert.equal(b.hp,200);assert.equal(s.players[1].core,5000);
});


test('shield-heal regeneration restores HP up to 5000 and adds its complete shield amount',()=>{
  const s=state(),c=hand(s,find('miracle','shield_heal'));s.players[0].core=4900;s.players[0].shield=200;
  assert.ok(playCard(s,0).ok);assert.equal(s.players[0].core,5000);assert.equal(s.players[0].shield,200+c.effect.value);
});

test('barrier reflection returns only the blocked amount and cancelling the attacker stops residual damage',()=>{
  const s=state(),c=find('gimmick','barrier'),a=unit(0,{attack:8,hp:2,maxHp:2});
  s.players[0].field=[a];s.players[1].traps=[{uid:'reflection-cancel',cardId:c.id}];s.players[1].shield=1000;
  assert.ok(attack(s,a.uid,{player:1,core:true}).ok);assert.equal(s.players[0].field.length,0);assert.equal(s.players[1].core,5000);assert.equal(s.players[1].shield,1000);
  assert.equal(s.players[1].traps.length,0);assert.deepEqual(s.players[1].grave,[c.id]);
  const t=state(),low=unit(0,{attack:1,hp:5,maxHp:5});t.players[0].field=[low];t.players[1].traps=[{uid:'reflection-cap',cardId:c.id}];
  assert.ok(attack(t,low.uid,{player:1,core:true}).ok);assert.equal(low.hp,400,'reflect only100 blocked, not full card value');assert.equal(t.players[1].core,5000);
});

test('support gimmicks buff or restore allied normal and fusion beasts without modifying player HP',()=>{
  for(const kind of ['spring','fountain']) {
    const s=state(),c=hand(s,find('gimmick',kind)),normal=unit(0,{attack:2,hp:1,maxHp:6}),fused=unit(0,{cardId:fusionCard().id,attack:4,hp:6,maxHp:7}),enemy=unit(1,{attack:2,hp:1,maxHp:6});
    s.players[0].field=[normal,fused];s.players[1].field=[enemy];s.players[0].core=1000;
    assert.ok(playCard(s,0).ok);endTurn(s);assert.equal(normal.attack,200);assert.equal(normal.hp,100);endTurn(s);
    assert.equal(s.players[0].core,1000);assert.equal(s.players[0].shield,0);assert.equal(enemy.attack,200);assert.equal(enemy.hp,100);
    if(kind==='spring') {assert.equal(normal.attack,200+c.effect.value);assert.equal(fused.attack,400+c.effect.value);assert.equal(normal.hp,100+c.effect.value);assert.equal(normal.maxHp,600+c.effect.value);assert.equal(fused.hp,600+c.effect.value);assert.equal(fused.maxHp,700+c.effect.value);}
    else {assert.equal(normal.hp,Math.min(600,100+c.effect.value));assert.equal(fused.hp,700);assert.equal(normal.attack,200);}
    const once=kind==='spring'?normal.attack:normal.hp;endTurn(s);endTurn(s);assert.equal(kind==='spring'?normal.attack:normal.hp,once,'support activates once');
  }
});

test('lastMiracle starts empty, tracks successful miracles for either player and remains display-only',()=>{
  const countCards=p=>p.deck.length+p.hand.length+p.field.length+p.traps.length+p.grave.length+p.special.length+p.banished.length;
  for(const who of [0,1]) {
    const s=state();s.active=who;const p=s.players[who];
    assert.equal(p.lastMiracle,null);assert.equal(s.players[1-who].lastMiracle,null);
    const spell=hand(s,find('miracle','heal')),before=countCards(p);
    assert.ok(playCard(s,0).ok);assert.equal(p.lastMiracle,spell.id);
    assert.deepEqual(p.grave,[spell.id]);assert.equal(p.field.length,0);assert.equal(countCards(p),before);
    assert.equal(s.players[1-who].lastMiracle,null);
    p.energy=10;hand(s,beast());assert.ok(playCard(s,0).ok);assert.equal(p.lastMiracle,spell.id);
    p.energy=10;hand(s,find('gimmick','ambush'));assert.ok(playCard(s,0).ok);assert.equal(p.lastMiracle,spell.id);
    p.energy=10;const next=hand(s,find('miracle','damage_enemy'));
    assert.ok(playCard(s,0,{player:1-who,core:true}).ok);assert.equal(p.lastMiracle,next.id);
  }
});

test('lastMiracle records M0256 after successful fusion without adding a physical card',()=>{
  const s=fusionState(),p=s.players[0];delete p.lastMiracle;
  const countCards=()=>p.deck.length+p.hand.length+p.field.length+p.traps.length+p.grave.length+p.special.length+p.banished.length;
  const before=countCards();
  assert.ok(playCard(s,0,{specialIndex:0,materials:[{zone:'hand',index:1}]}).ok);
  assert.equal(p.lastMiracle,FUSION_CARD_ID);assert.equal(countCards(),before);
  assert.deepEqual(p.grave,[FUSION_CARD_ID]);assert.equal(p.field.length,1);
  assert.equal(getCard(p.field[0].cardId).type,'fusion');assert.equal(s.players[1].lastMiracle,null);
});

test('lastMiracle stays unchanged when target, energy, or fusion selection is rejected',()=>{
  const prior=find('miracle','heal').id;
  for(const failure of ['target','energy','fusion']) {
    const s=failure==='fusion'?fusionState():state(),p=s.players[0];p.lastMiracle=prior;
    if(failure!=='fusion') hand(s,find('miracle','damage_enemy'));
    if(failure==='energy') p.energy=0;
    const target=failure==='fusion'?{specialIndex:0,materials:[]}:failure==='target'?{player:0,core:true}:{player:1,core:true};
    const before=structuredClone(s);
    assert.equal(playCard(s,0,target).ok,false);assert.deepEqual(s,before);assert.equal(p.lastMiracle,prior);
  }
});

test('effect events carry turn numbers and retain the newest 1000 records without changing their shape',()=>{
  const s=state();s.turn=7;
  s.log=Array.from({length:MAX_LOG_ENTRIES},(_,i)=>({type:'info',text:`retained-${i}`,turn:1}));
  assert.equal(MAX_LOG_ENTRIES,1000);
  const card=hand(s,find('miracle','heal')),result=playCard(s,0);
  assert.ok(result.ok);assert.ok(result.events.every(event=>event.turn===7&&typeof event.text==='string'&&typeof event.type==='string'));
  assert.equal(s.log.length,1000);assert.equal(s.log[0].text,`retained-${result.events.length}`);
  assert.deepEqual(s.log.slice(-result.events.length),result.events);assert.ok(result.events.some(event=>event.text.includes(card.name)&&event.text.includes('0回復')));
});

test('damage and healing logs name the source and report actual point changes including caps and shielded zero damage',()=>{
  const s=state(),damage=hand(s,find('miracle','damage_enemy'));s.players[1].core=50;
  const dealt=playCard(s,0,{player:1,core:true});assert.ok(dealt.ok);
  assert.ok(dealt.events.some(event=>event.type==='damage'&&event.text.includes(damage.name)&&event.text.includes('50ダメージ（50→0）')));
  const h=state(),heal=hand(h,find('miracle','heal'));h.players[0].core=4950;
  const healed=playCard(h,0);assert.ok(healed.ok);
  assert.ok(healed.events.some(event=>event.type==='heal'&&event.text.includes(heal.name)&&event.text.includes('50回復（4950→5000）')));
  const shielded=state();hand(shielded,damage);shielded.players[1].shield=damage.effect.value;
  const blocked=playCard(shielded,0,{player:1,core:true});assert.ok(blocked.ok);
  assert.ok(blocked.events.some(event=>event.type==='damage'&&event.text.includes(damage.name)&&event.text.includes('0ダメージ（5000→5000）')));
  assert.ok(blocked.events.some(event=>event.type==='shield'&&event.text.includes(`結界${damage.effect.value}→0`)));
});

test('unit effect logs report actual defense damage, grave movement and per-beast defense recovery',()=>{
  const s=state(),victim=unit(1,{hp:.5,maxHp:.5});s.players[1].field=[victim];
  const card=hand(s,find('miracle','damage_enemy')),result=playCard(s,0,{player:1,uid:victim.uid});assert.ok(result.ok);
  assert.ok(result.events.some(event=>event.type==='damage'&&event.text.includes(card.name)&&event.text.includes('守備力に50ダメージ（50→0）')));
  assert.ok(result.events.some(event=>event.type==='destroy'&&event.text.includes(card.name)&&event.text.includes(getCard(victim.cardId).name)&&event.text.includes('お墓ゾーン')));
  const healState=state(),ally=unit(0,{hp:1,maxHp:2});healState.players[0].field=[ally];
  const recovery=hand(healState,find('miracle','renew')),healed=playCard(healState,0);assert.ok(healed.ok);
  assert.ok(healed.events.some(event=>event.type==='heal'&&event.text.includes(recovery.name)&&event.text.includes(getCard(ally.cardId).name)&&event.text.includes('100回復（100→200）')));
});

test('summon effects and fusion logs identify their revealed sources while draws and untriggered gimmicks stay private',()=>{
  const s=state(),drawer=find('beast','draw'),hidden=CARDS.find(card=>card.type==='beast'&&card.id!==drawer.id&&!drawer.name.includes(card.name));
  hand(s,drawer);s.players[0].deck=[hidden.id];
  const drawn=playCard(s,0);assert.ok(drawn.ok);
  assert.ok(drawn.events.some(event=>event.text.includes(drawer.name)&&event.text.includes('召喚時効果')));
  assert.ok(drawn.events.some(event=>event.type==='draw'&&event.text.includes(drawer.name)));
  assert.ok(drawn.events.every(event=>!event.text.includes(hidden.name)));
  const t=state(),trap=hand(t,find('gimmick','ambush'));assert.ok(playCard(t,0).ok);assert.ok(t.log.every(event=>!event.text.includes(trap.name)));
  const f=state(),fusion=CARDS.find(card=>card.type==='fusion'&&card.effect.kind==='none');f.turn=9;
  f.players[0].special=[fusion.id];f.players[0].hand=[FUSION_CARD_ID,beast().id];
  const summoned=playCard(f,0,{specialIndex:0,materials:[{zone:'hand',index:1}]});assert.ok(summoned.ok);
  assert.ok(summoned.events.some(event=>event.type==='fusion'&&event.turn===9&&event.text.includes(fusion.name)&&event.text.includes(`攻撃力${fusion.attack}・守備力${fusion.hp}`)));
  assert.ok(summoned.events.some(event=>event.text.includes('素材の魔獣1枚を異世界ゾーン')));
});

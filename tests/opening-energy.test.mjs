import test from 'node:test';
import assert from 'node:assert/strict';
import {STARTER_DECKS,getCard} from '../catalog.js';
import {newGame,endTurn,playCard,RULES} from '../engine.js';

const roundTrip=state=>JSON.parse(JSON.stringify(state));
const create=()=>newGame({playerDeck:STARTER_DECKS[0].ids,cpuDeck:STARTER_DECKS[0].ids,seed:73194217});
function arrangeHand(player,ids){
  const pool=[...player.hand,...player.deck];
  player.hand=ids.map(id=>{const index=pool.indexOf(id);assert.notEqual(index,-1);return pool.splice(index,1)[0];});
  while(player.hand.length<RULES.hand)player.hand.push(pool.shift());
  player.deck=pool;
}
function advance(state){assert.equal(endTurn(state).ok,true);return roundTrip(state);}

test('new matches compensate exactly two second-player turns and retain the normal cap and card pool after saves',()=>{
  let game=create();
  assert.equal(game.openingRuleVersion,1);
  const expected=[[1,2,3,4,5,6,7,8,9,10,10],[2,3,3,4,5,6,7,8,9,10,10]],seen=[[],[]];
  for(let turn=1;turn<=22;turn++){
    const player=game.players[game.active];
    seen[game.active].push(player.maxEnergy);
    assert.equal(player.energy,player.maxEnergy);
    const notices=game.log.filter(event=>event.text.startsWith('後攻補正：'));
    assert.equal(notices.length,turn===1?0:1,'the public explanation appears once, including across restores');
    if(notices.length){assert.equal(notices[0].type,'info');assert.equal(notices[0].turn,2);}
    for(const p of game.players){
      assert.ok(p.energy>=0&&p.energy<=p.maxEnergy&&p.maxEnergy<=10);
      assert.equal(p.core,5000);assert.equal(p.hand.length,4);
      assert.equal(p.deck.length+p.hand.length+p.special.length,36);
    }
    if(turn<22)game=advance(game);
  }
  assert.deepEqual(seen,expected);
});

test('the opening allowance can pay real costs, refills after spending, and expires without an extra third-turn ether',()=>{
  let game=create();
  arrangeHand(game.players[1],['B0009','B0020']);
  assert.equal(getCard('B0009').cost,2);assert.equal(getCard('B0020').cost,3);
  game=advance(game);
  const rejected=roundTrip(game);
  assert.equal(playCard(game,game.players[1].hand.indexOf('B0020')).ok,false);
  assert.deepEqual(game,rejected,'the third ether is not available on the first turn');
  assert.equal(playCard(game,game.players[1].hand.indexOf('B0009')).ok,true);
  assert.equal(game.players[1].energy,0);
  game=advance(advance(game));
  assert.equal(game.turn,4);assert.equal(game.players[1].energy,3);
  assert.equal(playCard(game,game.players[1].hand.indexOf('B0020')).ok,true);
  assert.equal(game.players[1].energy,0);
  game=advance(advance(game));
  assert.equal(game.turn,6);assert.equal(game.players[1].energy,3);
  game=advance(advance(game));
  assert.equal(game.players[1].energy,4);
});

test('unmarked turn-one and already-started legacy saves retain their original opening schedule',()=>{
  for(const resumeTurn of [1,2]){
    let game=create();delete game.openingRuleVersion;
    if(resumeTurn===2)game=advance(game);
    for(;game.turn<=8;game=advance(game)){
      assert.equal(Object.hasOwn(game,'openingRuleVersion'),false);
      assert.equal(game.log.some(event=>event.text.startsWith('後攻補正：')),false);
      assert.equal(game.players[game.active].energy,Math.ceil(game.turn/2));
      assert.equal(game.players[game.active].maxEnergy,Math.ceil(game.turn/2));
    }
  }
});

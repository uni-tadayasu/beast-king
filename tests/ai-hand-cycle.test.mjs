import test from 'node:test';
import assert from 'node:assert/strict';
import {DECK_PRESETS} from '../catalog.js';
import {newGame,runAutomatedTurn,endTurn} from '../engine.js';

const fixture=()=>{
 const game=newGame({seed:92571});
 Object.assign(game.players[0],{core:5000,shield:0,hand:['M0002','M0034','M0066','M0098'],deck:['B0002'],field:[],traps:[],grave:[],energy:4,maxEnergy:4});
 return game;
};
test('hard CPU spends one legal zero-heal to unblock a full hand, then uses the normal next-turn draw',()=>{
 const game=fixture(),p=game.players[0];
 assert.equal(runAutomatedTurn(game,'hard').ok,true);
 assert.equal(p.hand.length,3);assert.deepEqual(p.grave,['M0002']);assert.equal(p.core,5000);
 assert.equal(p.energy,3);assert.deepEqual(p.deck,['B0002']);
 assert.equal(endTurn(game).ok,true);assert.equal(p.hand.length,4);assert.equal(p.hand.at(-1),'B0002');assert.equal(p.deck.length,0);
});
test('CPU preserves situational supports if the hand already has room and still prioritizes useful cards',()=>{
 const waiting=fixture();waiting.players[0].hand.pop();runAutomatedTurn(waiting,'hard');
 assert.equal(waiting.players[0].hand.length,3);assert.equal(waiting.players[0].grave.length,0);
 const useful=fixture();useful.players[0].hand[3]='B0002';runAutomatedTurn(useful,'hard');
 assert.equal(useful.players[0].field[0].cardId,'B0002');assert.equal(useful.players[0].hand.length,3);assert.equal(useful.players[0].grave.length,0);
});
test('known full-hand support deadlock resolves through legal play without inventing a winner',()=>{
 const first=DECK_PRESETS[3],second=DECK_PRESETS[0];
 const game=newGame({playerDeck:first.ids,cpuDeck:second.ids,playerSpecialDeck:first.specialIds,cpuSpecialDeck:second.specialIds,seed:1944304593,difficulty:'hard'});
 for(let i=0;i<200&&game.winner===null;i++)assert.equal(runAutomatedTurn(game,'hard').ok,true);
 assert.notEqual(game.winner,null);
 assert.ok(game.players.some(p=>p.core===0));
 for(const p of game.players)assert.equal(p.deck.length+p.hand.length+p.field.length+p.traps.length+p.grave.length+p.special.length+p.banished.length,36);
});

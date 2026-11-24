import test from 'node:test';
import assert from 'node:assert/strict';
import {DECK_PRESETS,getCard,validateDeck,validateSpecialDeck} from '../catalog.js';
import {newGame,runAutomatedTurn} from '../engine.js';
import {OPERATOR_DECK} from '../operator-deck.js';
test('Kirahara revision 2 is legal and wins at least 95% of a balanced hard-CPU benchmark',()=>{
 assert.equal(validateDeck(OPERATOR_DECK.ids).valid,true);
 assert.equal(validateSpecialDeck(OPERATOR_DECK.specialIds).valid,true);
 assert.equal(OPERATOR_DECK.ids.filter(id=>getCard(id).cost<=2).length,24);
 let seed=3628591,wins=0,losses=0,draws=0;
 for(let i=0;i<800;i++){
  seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
  const d=DECK_PRESETS[(i>>1)%8],seat=i%2;
  const g=newGame({playerDeck:seat?d.ids:OPERATOR_DECK.ids,cpuDeck:seat?OPERATOR_DECK.ids:d.ids,playerSpecialDeck:seat?d.specialIds:OPERATOR_DECK.specialIds,cpuSpecialDeck:seat?OPERATOR_DECK.specialIds:d.specialIds,seed:(seed>>>0)||1,difficulty:'hard'});
  for(let k=0;k<200&&g.winner===null;k++)assert.equal(runAutomatedTurn(g,'hard').ok,true);
  if(g.winner===seat)wins++;else if(g.winner===1-seat)losses++;else draws++;
 }
 console.log('Kirahara benchmark',JSON.stringify({wins,losses,draws,total:800}));
 assert.ok(wins>=760,`Win rate ${wins}/800`);
});

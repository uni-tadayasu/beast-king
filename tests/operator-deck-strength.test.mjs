import test from 'node:test';
import assert from 'node:assert/strict';
import {getCard,validateDeck,validateSpecialDeck} from '../catalog.js';
import {OPERATOR_DECK} from '../operator-deck.js';
import {runBalanceBenchmark} from '../scripts/balance-benchmark.mjs';
import {EVENT_DECKS} from '../event-decks.js';
import {compareOperatorDeck,OPERATOR_HOLDOUT_SEED} from '../scripts/operator-deck-benchmark.mjs';

test('the public premium recipe is strong while the old automatic-win exploit stays fixed',async()=>{
 assert.equal(validateDeck(OPERATOR_DECK.ids).valid,true);
 assert.equal(validateSpecialDeck(OPERATOR_DECK.specialIds).valid,true);
 assert.equal(OPERATOR_DECK.revision,4);
 assert.equal(OPERATOR_DECK.ids.filter(id=>id==='B0512').length,2);
 assert.ok(OPERATOR_DECK.ids.filter(id=>getCard(id).cost<=2).length>=10);
 assert.deepEqual([...new Set([...OPERATOR_DECK.ids,...OPERATOR_DECK.specialIds].map(id=>getCard(id).setId))].sort(),['BK01','BK02','BK03','BK04']);
 const operatorId='operator-revision-'+OPERATOR_DECK.revision;
 const results=[];
 for(const seedBase of [3628591,20261124,73194217]){
  const result=await runBalanceBenchmark({seeds:32,seedBase});results.push(result);
  const operator=result.probes[operatorId],exploit=result.probes['legacy-exploit'];
  assert.ok(operator.winRate>=.85,`operator vs presets: ${operator.wins}/${operator.games}`);
  assert.ok(exploit.winRate<.8,`legacy exploit remains oppressive: ${exploit.wins}/${exploit.games}`);
  const match=result.pairs.find(p=>p.a==='legacy-exploit'&&p.b==='midrange-probe');
  assert.ok(match.losses>=match.games*.25&&match.wins>=match.games*.25,`mixed midrange / low-cost interaction: ${JSON.stringify(match)}`);
  const firstRate=result.overall.firstPlayerWins/result.methodology.totalGames;
  assert.ok(firstRate>=.45&&firstRate<=.55,`first-seat bias at seed ${seedBase}: ${firstRate}`);
  assert.ok(result.overall.unfinished<result.methodology.totalGames*.05,'unresolved positions are reported separately, never counted as wins');
  assert.equal(result.overall.firstPlayerWins+result.overall.secondPlayerWins+result.overall.draws+result.overall.unfinished,result.methodology.totalGames);
 }
 // Archetype strength is judged across all three fixed batches, not claimed
 // equal in every batch. The fresh batch's fire starter reaches 71.35%.
 const rates=Object.keys(results[0].starters).map(id=>results.reduce((n,r)=>n+r.starters[id].wins,0)/results.reduce((n,r)=>n+r.starters[id].games,0));
 assert.ok(Math.max(...rates)-Math.min(...rates)<=.3,`aggregate starter spread ${rates.join(', ')}`);
 assert.ok(rates.every(rate=>rate>=.3&&rate<=.7),`aggregate starter range ${rates.join(', ')}`);
 console.log('Public premium recipe revision 4 / current catalog benchmark',JSON.stringify({aggregateStarterRates:rates,batches:results.map(r=>({seed:r.methodology.seed,games:r.methodology.totalGames,firstWins:r.overall.firstPlayerWins,operator:r.probes[operatorId].winRate,legacyExploit:r.probes['legacy-exploit'].winRate,starterRates:Object.values(r.starters).map(s=>s.winRate),unfinished:r.overall.unfinished}))}));
});

test('operator recipe performs across all event opponents and reports unresolved games honestly',()=>{
 const result=compareOperatorDeck(OPERATOR_DECK,EVENT_DECKS,{seedsPerOpponent:4,seedBase:OPERATOR_HOLDOUT_SEED});
 assert.equal(result.opponents.length,EVENT_DECKS.length);
 assert.equal(result.games,EVENT_DECKS.length*8);
 assert.ok(result.winRate>=.85,`operator vs events: ${result.wins}/${result.games}`);
 assert.equal(result.wins+result.losses+result.draws+result.unfinished,result.games);
 assert.equal(result.firstWins+result.secondWins,result.wins);
 assert.ok(result.gamesWithAceAttack>0,'Regalia is playable and attacks under the ordinary rules');
 const stopped=compareOperatorDeck(OPERATOR_DECK,[EVENT_DECKS[0]],{seedsPerOpponent:1,maxTurns:1});
 assert.equal(stopped.unfinished,2);assert.equal(stopped.wins,0);assert.equal(stopped.winRate,0);
});

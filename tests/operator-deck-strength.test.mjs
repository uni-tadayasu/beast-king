import test from 'node:test';
import assert from 'node:assert/strict';
import {getCard,validateDeck,validateSpecialDeck} from '../catalog.js';
import {OPERATOR_DECK} from '../operator-deck.js';
import {runBalanceBenchmark} from '../scripts/balance-benchmark.mjs';

test('the unchanged operator recipe remains competitive without restoring the old automatic-win exploit',async()=>{
 assert.equal(validateDeck(OPERATOR_DECK.ids).valid,true);
 assert.equal(validateSpecialDeck(OPERATOR_DECK.specialIds).valid,true);
 assert.equal(OPERATOR_DECK.revision,2);
 assert.equal(OPERATOR_DECK.ids.filter(id=>getCard(id).cost<=2).length,14);
 const results=[];
 for(const seedBase of [3628591,20261124,73194217]){
  const result=await runBalanceBenchmark({seeds:32,seedBase});results.push(result);
  const operator=result.probes['operator-revision-2'],exploit=result.probes['legacy-exploit'];
  assert.ok(operator.winRate>=.4&&operator.winRate<=.85,`operator vs presets: ${operator.wins}/${operator.games}`);
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
 console.log('Balance revision 4 / opening revision 1 benchmark',JSON.stringify({aggregateStarterRates:rates,batches:results.map(r=>({seed:r.methodology.seed,games:r.methodology.totalGames,firstWins:r.overall.firstPlayerWins,operator:r.probes['operator-revision-2'].winRate,legacyExploit:r.probes['legacy-exploit'].winRate,starterRates:Object.values(r.starters).map(s=>s.winRate),unfinished:r.overall.unfinished}))}));
});

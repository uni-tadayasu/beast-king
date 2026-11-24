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
 const result=await runBalanceBenchmark({seeds:32});
 const operator=result.probes['operator-revision-2'],exploit=result.probes['legacy-exploit'];
 assert.ok(operator.winRate>=.4&&operator.winRate<=.85,`operator vs presets: ${operator.wins}/${operator.games}`);
 assert.ok(exploit.winRate<.8,`legacy exploit remains oppressive: ${exploit.wins}/${exploit.games}`);
 const match=result.pairs.find(p=>p.a==='legacy-exploit'&&p.b==='midrange-probe');
 assert.ok(match.losses>=match.games*.25&&match.wins>=match.games*.25,`mixed midrange / low-cost interaction: ${JSON.stringify(match)}`);
 const rates=Object.values(result.starters).map(r=>r.winRate);
 assert.ok(Math.max(...rates)-Math.min(...rates)<=.3,`starter spread ${rates.join(', ')}`);
 assert.ok(rates.every(rate=>rate>=.3&&rate<=.7),`starter range ${rates.join(', ')}`);
 assert.ok(result.overall.unfinished<result.methodology.totalGames*.05,'unresolved positions are reported separately, never counted as wins');
 assert.equal(result.overall.firstPlayerWins+result.overall.secondPlayerWins+result.overall.draws+result.overall.unfinished,result.methodology.totalGames);
 console.log('Balance revision 4 benchmark',JSON.stringify({games:result.methodology.totalGames,operator:operator.winRate,legacyExploit:exploit.winRate,starterRates:rates,unfinished:result.overall.unfinished}));
});

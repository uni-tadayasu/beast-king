/** Offline, reproducible recipe search. Never changes cards, combat rules or AI. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {CARDS,DECK_PRESETS,EXPANSION_DECKS,getCard} from '../catalog.js';
import {OPERATOR_DECK} from '../operator-deck.js';
import {compareOperatorDeck,publicBenchmarkOpponents,OPERATOR_TRAINING_SEED} from './operator-deck-benchmark.mjs';

const args=process.argv.slice(2),opt=(name,fallback)=>args.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3)??fallback;
let rng=Number(opt('rng',19031973))>>>0;
const random=()=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return (rng>>>0)/4294967296;};
const pick=list=>list[Math.floor(random()*list.length)];
const uniquePool=(cards,duplicates=2)=>{
 const counts=new Map();return cards.filter(c=>{const key=JSON.stringify([c.type,c.setId,c.origin,c.family,c.model,c.cost,c.attack,c.hp,c.effect,c.keywords]);const n=counts.get(key)||0;counts.set(key,n+1);return n<duplicates;});
};
// Keep every mechanical identity in scope; numeric ranges limit the initial
// curve, not which expansions are eligible. Every accepted recipe retains its ace.
const mainPool=uniquePool(CARDS.filter(c=>c.type!=='fusion'&&c.cost<=6));
const creaturePool=mainPool.filter(c=>c.type==='beast');
const supportPool=mainPool.filter(c=>c.type!=='beast');
const specialPool=uniquePool(CARDS.filter(c=>c.type==='fusion'));
const opponents=opt('events','true')==='true'?await publicBenchmarkOpponents():[...DECK_PRESETS,...EXPANSION_DECKS];
const pairs=ids=>ids.flatMap(id=>[id,id]);
const legal=deck=>{
 const cards=deck.ids.map(getCard);
 return new Set(deck.ids).size===16&&new Set(deck.specialIds).size===2&&cards.filter(c=>c.type==='beast').length>=16&&cards.filter(c=>c.cost<=3).length>=14&&(!opt('targeted')||cards.some(c=>c.type==='miracle'&&c.effect.kind==='damage_enemy'))&&['BK01','BK02','BK03','BK04'].every(set=>[...deck.ids,...deck.specialIds].some(id=>getCard(id).setId===set));
};
const input=opt('input')?JSON.parse(await readFile(resolve(opt('input')),'utf8')):structuredClone(OPERATOR_DECK);
let start=input.deck||input;
if(!start.ids.some(id=>getCard(id).setId==='BK03'))start.ids=start.ids.map(id=>id==='B0005'?'B1031':id);
if(!start.ids.some(id=>getCard(id).setId==='BK04'))start.ids=start.ids.map(id=>id==='B0199'?'B1540':id);
const cache=new Map(),seeds=Number(opt('seeds',3)),trainingSeed=Number(opt('seed',OPERATOR_TRAINING_SEED));
const evaluate=deck=>{
 const key=JSON.stringify([deck.ids,deck.specialIds]);if(cache.has(key))return cache.get(key);
 const result=compareOperatorDeck(deck,opponents,{seedsPerOpponent:seeds,seedBase:trainingSeed});
 const min=Math.min(...result.opponents.map(r=>r.winRate));
 const score=result.winRate+.01*min-.5*result.unfinished/result.games+.0000001*result.heartMargin/result.games;
 const row={deck:structuredClone(deck),score,result};cache.set(key,row);return row;
};
let best=evaluate(start),elite=[best];
const history=[{iteration:0,score:best.score,wins:best.result.wins,games:best.result.games}];
const output=resolve(opt('output','/tmp/beast-operator-search.json'));
const iterations=Number(opt('iterations',1400));
const deadline=Date.now()+Number(opt('seconds',86400))*1000;
for(let iteration=1;iteration<=iterations;iteration++){
 if(Date.now()>deadline)break;
 const parent=random()<.6?best:pick(elite),deck=structuredClone(parent.deck);
 const changes=random()<.8?1:random()<.85?2:4;
 for(let change=0;change<changes;change++){
  if(random()<.1){const slot=random()<.5?0:2,id=pick(specialPool).id;deck.specialIds[slot]=deck.specialIds[slot+1]=id;}
  else {const slot=Math.floor(random()*16)*2;if(deck.ids[slot]==='B0512')continue;const pool=random()<.7?creaturePool:supportPool,id=pick(pool).id;deck.ids[slot]=deck.ids[slot+1]=id;}
 }
 if(!legal(deck))continue;
 const row=evaluate(deck);
 if(row.score>best.score){best=row;history.push({iteration,score:row.score,wins:row.result.wins,games:row.result.games});console.log(JSON.stringify({iteration,wins:row.result.wins,games:row.result.games,score:row.score,ids:[...new Set(deck.ids)],specialIds:[...new Set(deck.specialIds)]}));await writeFile(output,JSON.stringify({deck:best.deck,training:best.result,history,candidates:cache.size},null,2)+'\n');}
 if(!elite.some(e=>JSON.stringify(e.deck)===JSON.stringify(row.deck)))elite.push(row);
 elite.sort((a,b)=>b.score-a.score);elite=elite.slice(0,12);
}
await writeFile(output,JSON.stringify({deck:best.deck,training:best.result,history,candidates:cache.size},null,2)+'\n');
console.log(JSON.stringify({complete:true,output,candidates:cache.size,wins:best.result.wins,games:best.result.games}));

/** Deterministic, ordinary-rule comparisons. Wins are never fabricated or inferred. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {getCard,DECK_PRESETS,EXPANSION_DECKS,validateDeck,validateSpecialDeck} from '../catalog.js';
import {newGame,runAutomatedTurn} from '../engine.js';
import {OPERATOR_DECK} from '../operator-deck.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const OPERATOR_TRAINING_SEED=0x27b4c913;
// The first evaluation seed became development data after it exposed stalls.
// Final recipes are frozen before these two independent seeds are evaluated.
export const OPERATOR_REFINEMENT_SEED=0x6e31a5d7;
export const OPERATOR_HOLDOUT_SEED=0x43c97f1b;
export const OPERATOR_CONFIRMATION_SEED=0x9d02e6a1;
const blank=()=>({games:0,wins:0,losses:0,draws:0,unfinished:0,firstWins:0,secondWins:0,turns:0,heartMargin:0,aceSummons:0,aceAttacks:0,gamesWithAceSummoned:0,gamesWithAceAttack:0,winsWithAceSummoned:0});
const keySeed=(text)=>{let h=2166136261;for(const ch of text)h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;return h;};
export function compareOperatorDeck(deck,opponents,{seedsPerOpponent=4,seedBase=OPERATOR_HOLDOUT_SEED,maxTurns=200}={}){
 if(!validateDeck(deck.ids).valid||!validateSpecialDeck(deck.specialIds).valid)throw new Error('Illegal operator deck.');
 if(!Number.isInteger(seedsPerOpponent)||seedsPerOpponent<1||seedsPerOpponent>256)throw new Error('Invalid seed count.');
 if(!Number.isInteger(seedBase)||seedBase<1||seedBase>0xffffffff)throw new Error('Invalid seed base.');
 if(!Number.isInteger(maxTurns)||maxTurns<1||maxTurns>1000)throw new Error('Invalid turn ceiling.');
 if(!Array.isArray(opponents)||!opponents.length)throw new Error('At least one opponent is required.');
 const aceName=getCard(deck.aceId||'B0512')?.name;
 const result={...blank(),opponents:[]};
 for(const opponent of opponents){
  if(!validateDeck(opponent.ids).valid||!validateSpecialDeck(opponent.specialIds).valid)throw new Error('Illegal opponent '+opponent.id);
  const row={id:opponent.id,name:opponent.name,...blank()};
  for(let round=0;round<seedsPerOpponent;round++)for(const seat of [0,1]){
   const seed=(seedBase^keySeed(opponent.id)^Math.imul(round+1,0x85ebca6b))>>>0||1;
   const first=seat?opponent:deck,second=seat?deck:opponent;
   const game=newGame({playerDeck:first.ids,cpuDeck:second.ids,playerSpecialDeck:first.specialIds,cpuSpecialDeck:second.specialIds,seed,difficulty:'hard'});
   let turns=0,aceSummoned=false,aceAttacked=false;
   for(;game.winner===null&&turns<maxTurns;turns++){
    const ownTurn=game.active===seat,action=runAutomatedTurn(game,'hard');
    if(!action.ok)throw new Error('Automated turn failed.');
    if(ownTurn&&aceName)for(const event of action.events){
     if(!event.text.includes('「'+aceName+'」'))continue;
     if(event.type==='summon'){row.aceSummons++;aceSummoned=true;}
     if(event.type==='attack'){row.aceAttacks++;aceAttacked=true;}
    }
   }
   row.games++;row.turns+=turns;row.heartMargin+=game.players[seat].core-game.players[1-seat].core;
   if(aceSummoned)row.gamesWithAceSummoned++;if(aceAttacked)row.gamesWithAceAttack++;
   if(game.winner===seat){row.wins++;row[seat?'secondWins':'firstWins']++;if(aceSummoned)row.winsWithAceSummoned++;}
   else if(game.winner===1-seat)row.losses++;
   else if(game.winner==='draw')row.draws++;else row.unfinished++;
  }
  row.winRate=row.wins/row.games;
  for(const k of Object.keys(blank()))result[k]+=row[k];
  result.opponents.push(row);
 }
 return {...result,winRate:result.wins/result.games,meanTurns:result.turns/result.games,methodology:{seedBase,seedsPerOpponent,seatsPerSeed:2,maxTurns,ai:'Production hard CPU in both seats',rules:'Unmodified catalog and engine, 32 main + 4 fusion, at most 2 copies'}};
}
export async function publicBenchmarkOpponents(){
 let events=[];try{events=(await import('../event-decks.js')).EVENT_DECKS||[];}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
 const seen=new Set();return [...DECK_PRESETS,...EXPANSION_DECKS,...events].filter(deck=>{
  const key=[...deck.ids].sort().join(',')+'|'+[...deck.specialIds].sort().join(',');if(seen.has(key))return false;seen.add(key);return true;
 });
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),option=(name,fallback)=>args.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3)??fallback;
 const deckFile=option('deck'),input=deckFile?JSON.parse(await readFile(resolve(deckFile),'utf8')):OPERATOR_DECK,deck=input.deck||input;
 const result=compareOperatorDeck(deck,await publicBenchmarkOpponents(),{seedsPerOpponent:Number(option('seeds',4)),seedBase:Number(option('seed',OPERATOR_HOLDOUT_SEED))});
 const report={deck:{id:deck.id,name:deck.name,revision:deck.revision,aceId:deck.aceId,ids:deck.ids,specialIds:deck.specialIds},...result,hashes:Object.fromEntries(await Promise.all(['catalog.js','catalog-balance.js','second-set-data.js','additional-set-data.js','expansion-recipes.js','engine.js','operator-deck.js','event-decks.js','scripts/operator-deck-benchmark.mjs'].map(async name=>[name,await readFile(resolve(root,name)).then(b=>createHash('sha256').update(b).digest('hex')).catch(e=>{if(e.code==='ENOENT')return null;throw e;})])))};
 const output=option('output');if(output)await writeFile(resolve(output),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}

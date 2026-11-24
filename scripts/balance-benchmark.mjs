/** Reproducible hard-CPU deck comparison; no inference of human or exhaustive balance. */
import {pathToFileURL, fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

export const BALANCE_SEED = 3628591;
export const BALANCE_PROBES = Object.freeze([
  {id:'legacy-exploit', name:'旧低コスト連鎖', ids:['B0512','B0199','B0263','B0005','B0647','B0514','B0839','B0399','B0079','B0847','M0166','M0294','M0065','M0256','M0512','G0227'].flatMap(id=>[id,id]), specialIds:['F0128','F0128','F0047','F0047']},
  {id:'midrange-probe', name:'攻守混成検証', ids:['B0002','B0131','B0013','B0142','B0147','B0209','B0025','B0039','B0001','B0512','M0065','M0004','M0014','M0256','G0001','G0003'].flatMap(id=>[id,id]), specialIds:['F0001','F0005','F0047','F0128']},
]);
const blank = () => ({wins:0,losses:0,draws:0,unfinished:0,turns:0,games:0,firstWins:0,secondWins:0,firstLosses:0,secondLosses:0});
const record = (row, winner, seat, turns) => {
  row.games++;row.turns+=turns;
  if(winner===seat){row.wins++;row[seat===0?'firstWins':'secondWins']++;}
  else if(winner===1-seat){row.losses++;row[seat===0?'firstLosses':'secondLosses']++;}
  else if(winner==='draw')row.draws++;
  else row.unfinished++;
};
export async function runBalanceBenchmark({sourceRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..'), presetSourceRoot, seeds=32, seedBase=BALANCE_SEED}={}) {
  if(!Number.isInteger(seeds)||seeds<1||seeds>256)throw new Error('seeds must be an integer from 1 to 256');
  if(!Number.isInteger(seedBase)||seedBase<1||seedBase>0xffffffff)throw new Error('seed must be an unsigned, nonzero 32-bit integer');
  const load = file => import(pathToFileURL(resolve(sourceRoot,file)).href);
  const [{CARDS,DECK_PRESETS,validateDeck,validateSpecialDeck},{newGame,runAutomatedTurn},{OPERATOR_DECK}] = await Promise.all([load('catalog.js'),load('engine.js'),load('operator-deck.js')]);
  const presets=presetSourceRoot?(await import(pathToFileURL(resolve(presetSourceRoot,'catalog.js')).href)).DECK_PRESETS:DECK_PRESETS;
  const probes=[{...OPERATOR_DECK,id:'operator-revision-2'},...BALANCE_PROBES];
  for(const d of [...presets,...probes])if(!validateDeck(d.ids).valid||!validateSpecialDeck(d.specialIds).valid)throw new Error(`Illegal benchmark deck: ${d.id}`);
  const pairs=[];
  const compare=(a,b,pairIndex)=>{
    const result={a:a.id,b:b.id,...blank()};
    for(let i=0;i<seeds;i++){
      // The same shuffle seed is tested in both seats for every pair.
      let seed=(seedBase ^ Math.imul(pairIndex+1,0x9e3779b1) ^ Math.imul(i+1,0x85ebca6b))>>>0;
      if(!seed)seed=1;
      for(const seat of [0,1]){
        const first=seat?b:a,second=seat?a:b;
        const game=newGame({playerDeck:first.ids,cpuDeck:second.ids,playerSpecialDeck:first.specialIds,cpuSpecialDeck:second.specialIds,seed,difficulty:'hard'});
        let turns=0;
        for(;turns<200&&game.winner===null;turns++){
          if(!runAutomatedTurn(game,'hard').ok)throw new Error(`Automated turn failed: ${a.id}/${b.id}/${seed}/${seat}`);
        }
        record(result,game.winner,seat,turns);
      }
    }
    return result;
  };
  let pairIndex=0;
  for(let a=0;a<presets.length;a++)for(let b=a+1;b<presets.length;b++)pairs.push(compare(presets[a],presets[b],pairIndex++));
  for(const a of probes)for(const b of presets)pairs.push(compare(a,b,pairIndex++));
  for(let a=0;a<probes.length;a++)for(let b=a+1;b<probes.length;b++)pairs.push(compare(probes[a],probes[b],pairIndex++));
  const summary=ids=>Object.fromEntries(ids.map(id=>{
    const rows=pairs.filter(p=>ids.includes(p.a)&&ids.includes(p.b)&&(p.a===id||p.b===id));
    const row=blank();
    for(const r of rows){
      row.games+=r.games;row.turns+=r.turns;row.draws+=r.draws;row.unfinished+=r.unfinished;
      row.wins+=r.a===id?r.wins:r.losses;row.losses+=r.a===id?r.losses:r.wins;
      row.firstWins+=r.a===id?r.firstWins:r.secondLosses;row.secondWins+=r.a===id?r.secondWins:r.firstLosses;
      row.firstLosses+=r.a===id?r.firstLosses:r.secondWins;row.secondLosses+=r.a===id?r.secondLosses:r.firstWins;
    }
    return [id,{...row,winRate:Number((row.wins/row.games).toFixed(4)),meanTurns:Number((row.turns/row.games).toFixed(2))}];
  }));
  const presetIds=presets.map(d=>d.id);
  const probeSummary=Object.fromEntries(probes.map(probe=>{
    const rows=pairs.filter(p=>p.a===probe.id&&presetIds.includes(p.b));
    const row=blank();for(const r of rows)for(const key of Object.keys(row))row[key]+=r[key];
    return [probe.id,{...row,winRate:Number((row.wins/row.games).toFixed(4)),meanTurns:Number((row.turns/row.games).toFixed(2))}];
  }));
  const stats=group=>({count:group.length,meanCost:Number((group.reduce((s,c)=>s+c.cost,0)/group.length).toFixed(3)),meanAttack:Math.round(group.reduce((s,c)=>s+c.attack,0)/group.length),meanDefense:Math.round(group.reduce((s,c)=>s+c.hp,0)/group.length)});
  const hashes=Object.fromEntries(await Promise.all(['catalog.js','catalog-balance.js','engine.js','operator-deck.js'].map(async file=>[file,await readFile(resolve(sourceRoot,file)).then(bytes=>createHash('sha256').update(bytes).digest('hex')).catch(error=>{if(error.code==='ENOENT')return null;throw error;})])));
  return {
    methodology:{seed:seedBase,seedsPerPair:seeds,seatsPerSeed:2,maxTurns:200,ai:'production hard CPU; source hashes identify the AI and catalog version',historicalPresets:Boolean(presetSourceRoot),totalGames:pairs.reduce((n,p)=>n+p.games,0),hashes},
    overall:{unfinished:pairs.reduce((n,p)=>n+p.unfinished,0),draws:pairs.reduce((n,p)=>n+p.draws,0),firstPlayerWins:pairs.reduce((n,p)=>n+p.firstWins+p.secondLosses,0),secondPlayerWins:pairs.reduce((n,p)=>n+p.secondWins+p.firstLosses,0),meanTurns:Number((pairs.reduce((n,p)=>n+p.turns,0)/pairs.reduce((n,p)=>n+p.games,0)).toFixed(2))},
    catalog:{cards:CARDS.length,byType:Object.fromEntries(['beast','miracle','gimmick','fusion'].map(type=>[type,stats(CARDS.filter(c=>c.type===type))])),byModel:Object.fromEntries(['attack','defense'].map(model=>[model,stats(CARDS.filter(c=>c.type==='beast'&&c.model===model))])),oneCostGuardEngines:CARDS.filter(c=>c.type==='beast'&&c.cost===1&&c.keywords.includes('guard')&&['draw','buff_all'].includes(c.effect.kind)).length},
    starters:summary(presetIds.slice(0,4)),presets:summary(presetIds),probes:probeSummary,pairs,
  };
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  const option=name=>args.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
  const result=await runBalanceBenchmark({sourceRoot:option('source')?resolve(option('source')):undefined,presetSourceRoot:option('presets')?resolve(option('presets')):undefined,seeds:option('seeds')?Number(option('seeds')):32,seedBase:option('seed')?Number(option('seed')):BALANCE_SEED});
  if(option('output'))await writeFile(resolve(option('output')),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({methodology:result.methodology,overall:result.overall,catalog:result.catalog,starters:result.starters,presets:result.presets,probes:result.probes,probePairs:result.pairs.filter(p=>['operator-revision-2','legacy-exploit','midrange-probe'].includes(p.a)&&['operator-revision-2','legacy-exploit','midrange-probe'].includes(p.b))},null,2));
}

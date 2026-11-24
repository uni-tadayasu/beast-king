import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS,DECK_PRESETS,EXPANSION_FAMILIES,getCard,validateDeck,validateSpecialDeck} from '../catalog.js';
import {newGame,runAutomatedTurn} from '../engine.js';
import {EVENT_DECKS,EVENT_DECK_GROUPS,getEventDeck} from '../event-decks.js';
import {createEventProgress,normalizeEventProgress,recordEventResult} from '../event-battles.js';
import {eventChallengeView} from '../event-views.js';

test('32 distinct public challenges cover six origins, inherited series, every fourth-set family and mixed strategies',()=>{
 assert.equal(EVENT_DECKS.length,32);
 const signatures=new Set(),sets=new Set();
 for(const deck of EVENT_DECKS){
  assert.equal(validateDeck(deck.ids).valid,true,deck.id);assert.equal(validateSpecialDeck(deck.specialIds).valid,true,deck.id);
  assert.equal(deck.difficulty,'hard');assert.ok(deck.ids.some(id=>getCard(id).effect.kind==='fusion'));
  assert.ok([...deck.ids,...deck.specialIds].includes(deck.aceId));
  const counts=new Map();for(const id of [...deck.ids,...deck.specialIds]){assert.ok(CARDS.some(c=>c.id===id));counts.set(id,(counts.get(id)||0)+1);sets.add(getCard(id).setId);}assert.ok([...counts.values()].every(n=>n<=2));
  const signature=[...deck.ids].sort().join(',')+'|'+[...deck.specialIds].sort().join(',');assert.ok(!signatures.has(signature),deck.id);signatures.add(signature);
  assert.equal('artwork' in deck,false);assert.notEqual(deck.id,'operator-kirahara-v1');
 }
 for(const origin of ['mountain','river','seed','grass','flower','tree'])assert.equal(EVENT_DECKS.filter(d=>d.group==='origins'&&d.origin===origin).length,2);
 for(const family of EXPANSION_FAMILIES.filter(family=>family.setId==='BK04'))assert.equal(EVENT_DECKS.filter(d=>d.family===family.id).length,2);
 assert.deepEqual([...sets].sort(),['BK01','BK02','BK03','BK04']);
 assert.equal(getEventDeck('operator-kirahara-v1'),null);
 assert.equal(getEventDeck('event-mixed-royal').ids.filter(id=>id==='B0512').length,2);
});

test('challenge results are bounded, independent, idempotent and award a clear only for a win',()=>{
 const deckId=EVENT_DECKS[0].id;
 let progress=createEventProgress();
 for(const [i,result] of ['loss','draw','surrender'].entries())progress=recordEventResult(progress,{deckId,matchId:'trial-'+i,result}).progress;
 assert.deepEqual(progress.clearedDeckIds,[]);
 const won=recordEventResult(progress,{deckId,matchId:'win-1',result:'win'});assert.equal(won.firstClear,true);assert.deepEqual(won.progress.clearedDeckIds,[deckId]);
 const duplicate=recordEventResult(won.progress,{deckId,matchId:'win-1',result:'loss'});assert.equal(duplicate.recorded,false);assert.deepEqual(duplicate.progress,won.progress);
 const malicious=normalizeEventProgress({version:9,clearedDeckIds:['unknown',deckId,deckId],results:[...won.progress.results,...won.progress.results,{deckId:'unknown',matchId:'bad',result:'win'},{deckId,matchId:'',result:'win'}]});
 assert.deepEqual(malicious,won.progress);
 for(let index=0;index<220;index++)progress=recordEventResult(progress,{deckId,matchId:'bounded-'+index,result:'loss'}).progress;
 assert.equal(progress.results.length,200);assert.equal(progress.results.at(-1).matchId,'bounded-219');
});

test('every challenge completes ordinary hard-CPU turns from both seats',()=>{
 for(const [index,deck] of EVENT_DECKS.entries())for(const seat of [0,1]){
  const rival=DECK_PRESETS[index%DECK_PRESETS.length],first=seat?rival:deck,second=seat?deck:rival;
  const game=newGame({playerDeck:first.ids,cpuDeck:second.ids,playerSpecialDeck:first.specialIds,cpuSpecialDeck:second.specialIds,seed:(0x1f785c1d^Math.imul(index+1,0x9e3779b9))>>>0,difficulty:'hard'});
  let turns=0;while(game.winner===null&&turns++<200)assert.equal(runAutomatedTurn(game,'hard').ok,true,deck.id);
  assert.notEqual(game.winner,null,deck.id+' should complete');
 }
});

test('event views page all opponents and use public art even for the royal challenge',()=>{
 const data={deckName:'試験デッキ',deckIds:DECK_PRESETS[0].ids,specialIds:DECK_PRESETS[0].specialIds,eventProgress:createEventProgress()},seen=new Set(),contexts=[];
 for(const group of EVENT_DECK_GROUPS){
  const expected=EVENT_DECKS.filter(d=>group.id==='all'||d.group===group.id),pages=Math.ceil(expected.length/4),ids=[];
  for(let page=0;page<pages;page++){
   const html=eventChallengeView({data,group:group.id,listPage:page,selectedId:expected[page*4].id,artStyle:(card,context)=>{contexts.push(context);return '';}});
   const matches=[...html.matchAll(/data-action="event-select" data-deck="([^"]+)"/g)].map(m=>m[1]);assert.ok(matches.length<=4);ids.push(...matches);for(const id of matches)seen.add(id);
   assert.ok(html.includes('data-action="event-start"'));assert.ok(html.includes('対戦相手のカードを見る'));
  }
  assert.deepEqual(ids,expected.map(d=>d.id));
 }
 assert.equal(seen.size,32);assert.deepEqual([...new Set(contexts)],['public']);
 const empty=eventChallengeView({data:{...data,deckIds:[]}});assert.match(empty,/data-action="event-start"[^>]* disabled/);
});

test('short logical landscapes separate a two-opponent page from full-size battle preparation',()=>{
 const data={deckName:'試験デッキ',deckIds:DECK_PRESETS[0].ids,specialIds:DECK_PRESETS[0].specialIds,eventProgress:createEventProgress()};
 const ids=[];
 for(let page=0;page<EVENT_DECKS.length/2;page++){
  const html=eventChallengeView({data,compact:true,pageSize:2,listPage:page,section:'opponents',selectedId:EVENT_DECKS[page*2].id});
  const visible=[...html.matchAll(/data-action="event-select" data-deck="([^"]+)"/g)].map(m=>m[1]);assert.equal(visible.length,2);ids.push(...visible);
  assert.match(html,/class="event-selected" hidden/);assert.match(html,/class="event-roster" >/);assert.match(html,/data-action="event-section" data-section="detail"/);
 }
 assert.deepEqual(ids,EVENT_DECKS.map(d=>d.id));
 const selected=eventChallengeView({data,compact:true,pageSize:2,section:'detail',selectedId:EVENT_DECKS[1].id});
 assert.match(selected,/class="event-roster" hidden/);assert.match(selected,/class="event-filters" hidden/);assert.match(selected,/class="event-selected"  style=/);
 assert.match(selected,/data-action="event-start" data-deck="event-mountain-control"/);assert.ok(selected.includes(EVENT_DECKS[1].description));
});

/** Bounded, JSON-safe challenge progress. Does not grant cards or entitlements. */
import {EVENT_DECKS,getEventDeck} from './event-decks.js?v=20261124-32';
export const EVENT_BATTLES=EVENT_DECKS;
export const getEventBattle=getEventDeck;
export const createEventProgress=()=>({version:1,clearedDeckIds:[],results:[]});
const outcomes=new Set(['win','loss','draw','surrender']);
const validMatch=id=>typeof id==='string'&&id.trim().length>0&&id.length<=200;
export function normalizeEventProgress(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return createEventProgress();
 const clearedDeckIds=[...new Set((Array.isArray(raw.clearedDeckIds)?raw.clearedDeckIds:[]).filter(id=>!!getEventDeck(id)))];
 const results=[],seen=new Set();
 for(const row of Array.isArray(raw.results)?raw.results:[]){
  if(!row||!getEventDeck(row.deckId)||!validMatch(row.matchId)||!outcomes.has(row.result)||seen.has(row.matchId))continue;
  seen.add(row.matchId);results.push({deckId:row.deckId,matchId:row.matchId,result:row.result});
 }
 return {version:1,clearedDeckIds,results:results.slice(-200)};
}
export function recordEventResult(raw,{deckId,matchId,result}={}){
 const progress=normalizeEventProgress(raw);
 if(!getEventDeck(deckId)||!validMatch(matchId)||!outcomes.has(result)||progress.results.some(row=>row.matchId===matchId))return {progress,recorded:false,firstClear:false};
 const firstClear=result==='win'&&!progress.clearedDeckIds.includes(deckId);
 if(firstClear)progress.clearedDeckIds.push(deckId);
 progress.results=[...progress.results,{deckId,matchId,result}].slice(-200);
 return {progress,recorded:true,firstClear};
}

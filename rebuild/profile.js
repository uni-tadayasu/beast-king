// New local save boundary. The live game's storage is never read or modified.
import {STARTER_DECKS,getCard,validateDeck,validateSpecialDeck} from './catalog.js?v=20261125-34';
import {grantDeckCollection,normalizeCollection,STARTING_TREASURE,openPack,getBattleReward} from './shop.js?v=20261125-34';
import {normalizeSoloSnapshot,normalizeAudioSettings} from './solo-save.js?v=20261125-34';
import {migrateLegacyStarters} from '../shop.js?v=20261125-34';
export const STORAGE_KEY='beast-king-rebuild-v1';
export const STARTERS=Object.freeze(STARTER_DECKS.filter(s=>['star-crown','azure-memory','crimson-pulse','sky-promise'].includes(s.id)));
export const ORIGIN_IDS=Object.freeze(['mountain','river','seed','grass','flower','tree','king']);
export function validateName(value){
 const s=String(value??'').trim();
 return s.length>=1&&Array.from(s).length<=16&&!/[\u0000-\u001f\u007f]/.test(s)?s:null;
}
export function counts(ids){const out={};for(const id of ids)out[id]=(out[id]||0)+1;return out}
export function initialProfile(name,origin,starterId){
 name=validateName(name);
 if(!name||!ORIGIN_IDS.includes(origin))throw new Error('名前とアイコンを確認してください。');
 const starter=STARTERS.find(s=>s.id===starterId);
 if(!starter)throw new Error('スターターを選択してください。');
 const collection=grantDeckCollection({},[...starter.ids,...starter.specialIds]);
 return {version:1,name,origin,starterId,freeStarterId:starterId,collection,treasure:STARTING_TREASURE,main:[...starter.ids],special:[...starter.specialIds],wins:0,losses:0,draws:0,completed:0,settled:[],lastPack:[],bgm:true,bgmVolume:.5,suspendedMatch:null};
}
export function checkDeck(profile,main,special){
 const a=validateDeck(main),b=validateSpecialDeck(special),errors=[...a.errors,...b.errors];
 for(const [id,n] of Object.entries(counts([...(Array.isArray(main)?main:[]),...(Array.isArray(special)?special:[])]))){
  if(n>(profile.collection[id]||0))errors.push((getCard(id)?.name||id)+'の所持枚数を超えています。');
 }
 return {valid:errors.length===0,errors};
}
export function saveDeck(profile,main,special){
 const result=checkDeck(profile,main,special);
 if(!result.valid)throw new Error(result.errors[0]);
 return {...profile,main:[...main],special:[...special]};
}
export function chooseStarter(profile,id){
 const s=STARTERS.find(s=>s.id===id);if(!s)throw new Error('存在しないスターターです。');
 return {...saveDeck(profile,s.ids,s.specialIds),starterId:id};
}
// Run the same one-time recall on local saves and imported backups.
export function migrateRebuildProfile(raw){
 const migrated=migrateLegacyStarters(raw,raw.collection,{starters:STARTERS,preferred:raw.starterId});
 const next={...raw,collection:migrated.collection,freeStarterId:migrated.freeStarterId};
 if(migrated.removed&&!checkDeck(next,next.main,next.special).valid){
  const starter=STARTERS.find(d=>d.id===next.freeStarterId);
  next.starterId=starter.id;next.main=[...starter.ids];next.special=[...starter.specialIds];
 }
 if(migrated.removed)next.suspendedMatch=normalizeSoloSnapshot(raw.suspendedMatch,next);
 return next;
}
const nonnegative=v=>Number.isSafeInteger(v)&&v>=0?v:0;
export function loadProfile(storage){
 try{
  const raw=JSON.parse(storage.getItem(STORAGE_KEY)||'null');
  if(!raw||raw.version!==1||!validateName(raw.name)||!ORIGIN_IDS.includes(raw.origin))return null;
  let p={...initialProfile(raw.name,raw.origin,STARTERS.some(s=>s.id===raw.starterId)?raw.starterId:STARTERS[0].id),...raw,collection:normalizeCollection(raw.collection),treasure:nonnegative(raw.treasure),wins:nonnegative(raw.wins),losses:nonnegative(raw.losses),draws:nonnegative(raw.draws),completed:Math.min(20,nonnegative(raw.completed)),settled:Array.isArray(raw.settled)?raw.settled.filter(v=>typeof v==='string').slice(-200):[],lastPack:Array.isArray(raw.lastPack)?raw.lastPack.filter(x=>x&&getCard(x.id||x.cardId)).slice(0,12):[]};
  // initialProfile supplies defaults; an unmarked raw save must still migrate.
  if(!raw.freeStarterId)delete p.freeStarterId;
  p=migrateRebuildProfile(p);
  p.name=validateName(p.name);Object.assign(p,normalizeAudioSettings(raw));
  p.suspendedMatch=normalizeSoloSnapshot(raw.suspendedMatch,p);
  if(!checkDeck(p,p.main,p.special).valid){
   const owned=STARTERS.find(s=>checkDeck(p,s.ids,s.specialIds).valid);
   if(owned)return chooseStarter(p,owned.id);
   const pool=(fusion,size)=>Object.entries(p.collection).filter(([id])=>(getCard(id)?.type==='fusion')===fusion).flatMap(([id,n])=>Array(Math.min(2,n)).fill(id)).slice(0,size);
   const main=pool(false,32),special=pool(true,4);
   if(checkDeck(p,main,special).valid)return saveDeck(p,main,special);
   const recovery=STARTERS.find(s=>s.id===p.starterId)||STARTERS[0];
   return chooseStarter({...p,collection:grantDeckCollection(p.collection,[...recovery.ids,...recovery.specialIds])},recovery.id);
  }
  return p;
 }catch{return null}
}
export function persistProfile(storage,p){storage.setItem(STORAGE_KEY,JSON.stringify(p));return p;}
export function purchase(profile,random=Math.random,packId='BK01'){
 const result=openPack(profile,random,packId);
 if(!result.ok)throw new Error(result.error);
 return {...profile,treasure:result.treasure,collection:result.collection,lastPack:result.pulls,lastPackId:packId};
}
export function settle(profile,matchId,outcome,chapter=null){
 if(typeof matchId!=='string'||!matchId||profile.settled.includes(matchId))return profile;
 if(!['win','loss','draw','forfeit'].includes(outcome))throw new Error('不明な対戦結果');
 const key=outcome==='win'?'wins':outcome==='draw'?'draws':'losses';
 return {...profile,treasure:profile.treasure+getBattleReward({winner:outcome==='win'?0:outcome==='draw'?'draw':1,forfeited:outcome==='forfeit'}),[key]:profile[key]+1,completed:outcome==='win'&&chapter===profile.completed?Math.min(20,profile.completed+1):profile.completed,settled:[...profile.settled,matchId].slice(-200)};
}

/** Save the board and outcome together, preventing payout after a reload twice. */
export function recordSolo(profile,raw){
 const snapshot=normalizeSoloSnapshot(raw,profile);
 if(!snapshot)throw Error('対戦状態を保存できません。');
 const w=snapshot.game.winner;
 const next=w===null?profile:settle(profile,snapshot.id,w===0?'win':w===1?'loss':'draw',snapshot.chapter);
 return {...next,suspendedMatch:snapshot};
}
export function endSuspendedSolo(profile){
 const snapshot=profile.suspendedMatch;
 const next=snapshot&&snapshot.game.winner===null?settle(profile,snapshot.id,'forfeit',snapshot.chapter):profile;
 return {...next,suspendedMatch:null};
}

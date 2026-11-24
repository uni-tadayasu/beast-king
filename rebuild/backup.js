// Portable solo saves are user data, never authority for online decks or ratings.
import {CARDS,PACKS,getCard} from './catalog.js?v=20261125-33';
import {STARTERS,ORIGIN_IDS,validateName,checkDeck} from './profile.js?v=20261125-33';
import {normalizeSoloSnapshot} from './solo-save.js?v=20261125-33';
export const MAX_REBUILD_BACKUP_BYTES=1000000;
export const ROLLBACK_KEY='beast-king-rebuild-before-restore-v1';
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const assert=v=>{if(!v)throw Error('新生版の保存データの形式が正しくありません。')};
export function validateRebuildBackup(raw){
 assert(plain(raw)&&raw.version===1&&typeof raw.name==='string');
 const name=validateName(raw.name);
 assert(name&&ORIGIN_IDS.includes(raw.origin)&&STARTERS.some(s=>s.id===raw.starterId));
 assert(plain(raw.collection)&&Object.keys(raw.collection).length<=CARDS.length);
 assert(Object.entries(raw.collection).every(([id,n])=>!!getCard(id)&&integer(n,0,3)));
 const collection=Object.fromEntries(Object.entries(raw.collection).filter(([,n])=>n>0));
 assert(checkDeck({collection},raw.main,raw.special).valid);
 assert(['treasure','wins','losses','draws'].every(k=>integer(raw[k]))&&integer(raw.completed,0,20));
 assert(raw.completed<=raw.wins);
 assert(typeof raw.bgm==='boolean'&&Number.isFinite(raw.bgmVolume)&&raw.bgmVolume>=0&&raw.bgmVolume<=1);
 assert(Array.isArray(raw.settled)&&raw.settled.length<=200&&raw.settled.every(s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(s)));
 assert(Array.isArray(raw.lastPack)&&[0,12].includes(raw.lastPack.length));
 const lastPackId=raw.lastPackId??'BK01';
 assert(PACKS.some(p=>p.id===lastPackId));
 const lastPack=raw.lastPack.map(p=>{
  assert(plain(p)&&getCard(p.cardId)?.pack===lastPackId&&['isNew','converted','guaranteed'].every(k=>typeof p[k]==='boolean'));
  return {cardId:p.cardId,isNew:p.isNew,converted:p.converted,guaranteed:p.guaranteed};
 });
 const result={version:1,name,origin:raw.origin,starterId:raw.starterId,collection,treasure:raw.treasure,main:[...raw.main],special:[...raw.special],wins:raw.wins,losses:raw.losses,draws:raw.draws,completed:raw.completed,settled:[...new Set(raw.settled)],lastPack,lastPackId,bgm:raw.bgm,bgmVolume:raw.bgmVolume,suspendedMatch:null};
 if(raw.freeStarterId!==undefined){assert(STARTERS.some(s=>s.id===raw.freeStarterId));result.freeStarterId=raw.freeStarterId;}
 if(raw.suspendedMatch!=null){
  result.suspendedMatch=normalizeSoloSnapshot(raw.suspendedMatch,result);assert(result.suspendedMatch);
  if(result.suspendedMatch.game.winner!==null)assert(result.settled.includes(result.suspendedMatch.id));
 }
 assert(new TextEncoder().encode(JSON.stringify(result)).length<=MAX_REBUILD_BACKUP_BYTES);
 return result;
}

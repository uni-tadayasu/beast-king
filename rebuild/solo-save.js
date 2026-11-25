// Strict allowlisted solo snapshots. No bearer tokens, operator grant, or
// server authority can be recovered from the local save.
import {getCard,validateDeck,validateSpecialDeck,STARTER_DECKS} from './catalog.js?v=20261125-35';
import {RULES,MAX_HEART_POINTS,MAX_LOG_ENTRIES} from './engine.js?v=20261125-35';
import {CAMPAIGN_BATTLES} from '../campaign.js?v=20261125-35';
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const int=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const text=(v,max)=>typeof v==='string'&&Array.from(v).length<=max;
const requireValue=(v)=>{if(!v)throw Error('中断データを確認できません。')};
const zones=[['deck',['beast','miracle','gimmick'],32],['hand',['beast','miracle','gimmick','fusion'],4],['special',['fusion'],4],['grave',['beast','miracle','gimmick','fusion'],36],['banished',['beast','fusion'],36]];
export function poolOf(player){
 return [...player.deck,...player.hand,...player.special,...player.grave,...player.banished,...player.field.map(u=>u.cardId),...player.traps.map(t=>t.cardId)];
}
function sameCards(a,b){return a.length===b.length&&[...a].sort().join('|')===[...b].sort().join('|')}
function normalizeGame(raw){
 requireValue(plain(raw)&&raw.rulesVersion===2&&int(raw.turn,1,9999)&&[0,1].includes(raw.active)&&[null,0,1,'draw'].includes(raw.winner)&&int(raw.seed,0,0xffffffff)&&int(raw.nextUid,1,100000)&&['easy','normal','hard'].includes(raw.difficulty));
 requireValue(Array.isArray(raw.players)&&raw.players.length===2&&Array.isArray(raw.log)&&raw.log.length<=MAX_LOG_ENTRIES);
 const seen=new Set();
 const players=raw.players.map((p,owner)=>{
  requireValue(plain(p)&&text(p.name,80)&&int(p.core,0,MAX_HEART_POINTS)&&int(p.shield,0,1000000)&&int(p.energy,0,RULES.maxEnergy)&&int(p.maxEnergy,0,RULES.maxEnergy)&&p.energy<=p.maxEnergy&&int(p.fatigue,0,10000));
  const out={name:p.name,core:p.core,shield:p.shield,energy:p.energy,maxEnergy:p.maxEnergy,fatigue:p.fatigue,deckSize:32,specialSize:4};
  for(const [zone,types,max] of zones){requireValue(Array.isArray(p[zone])&&p[zone].length<=max&&p[zone].every(id=>typeof id==='string'&&types.includes(getCard(id)?.type)));out[zone]=[...p[zone]]}
  requireValue(Array.isArray(p.field)&&p.field.length<=RULES.field&&Array.isArray(p.traps)&&p.traps.length<=RULES.traps);
  function identity(u,prefix){requireValue(plain(u)&&typeof u.uid==='string'&&new RegExp('^'+prefix+'[1-9][0-9]{0,5}$').test(u.uid)&&!seen.has(u.uid)&&Number(u.uid.slice(1))<raw.nextUid);seen.add(u.uid)}
  out.field=p.field.map(u=>{
   identity(u,'u');const c=getCard(u.cardId);
   requireValue(['beast','fusion'].includes(c?.type)&&u.owner===owner&&typeof u.ready==='boolean'&&int(u.attack,0,1000000)&&int(u.hp,1,1000000)&&int(u.maxHp,1,1000000)&&u.hp<=u.maxHp&&Array.isArray(u.keywords)&&sameCards(u.keywords,c.keywords));
   const unit={uid:u.uid,cardId:u.cardId,owner,ready:u.ready,attack:u.attack,hp:u.hp,maxHp:u.maxHp,keywords:[...u.keywords]};
   if(u.fusionMaterialCount!==undefined){requireValue(c.type==='fusion'&&int(u.fusionMaterialCount,1,36));unit.fusionMaterialCount=u.fusionMaterialCount}
   return unit;
  });
  out.traps=p.traps.map(t=>{identity(t,'g');requireValue(getCard(t.cardId)?.type==='gimmick');return {uid:t.uid,cardId:t.cardId}});
  const pool=poolOf(out);requireValue(validateDeck(pool.filter(id=>getCard(id)?.type!=='fusion')).valid&&validateSpecialDeck(pool.filter(id=>getCard(id)?.type==='fusion')).valid);
  requireValue(p.lastMiracle==null||getCard(p.lastMiracle)?.type==='miracle');out.lastMiracle=p.lastMiracle??null;
  return out;
 });
 const outcome=players[0].core===0?(players[1].core===0?'draw':1):players[1].core===0?0:null;
 requireValue(outcome===raw.winner);
 const log=raw.log.map(e=>{requireValue(plain(e)&&text(e.text,1000)&&text(e.type,32)&&e.type.length>0&&int(e.turn,1,raw.turn));return {text:e.text,type:e.type,turn:e.turn}});
 return {rulesVersion:2,turn:raw.turn,active:raw.active,winner:raw.winner,players,log,nextUid:raw.nextUid,seed:raw.seed,difficulty:raw.difficulty};
}
export function normalizeSoloSnapshot(raw,profile){
 if(raw==null)return null;
 try{
  requireValue(plain(raw)&&typeof raw.id==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(raw.id)&&['normal','kirahara'].includes(raw.mode));
  requireValue(raw.chapter===null||int(raw.chapter,0,CAMPAIGN_BATTLES.length-1));
  const game=normalizeGame(raw.game);
  requireValue(!profile||raw.chapter===null||raw.chapter<=profile.completed);
  if(profile&&raw.mode==='normal'){
   const required={};for(const id of poolOf(game.players[0]))required[id]=(required[id]||0)+1;
   requireValue(Object.entries(required).every(([id,n])=>n<=(profile.collection[id]||0)));
  }
  const battle=raw.chapter===null?null:CAMPAIGN_BATTLES[raw.chapter];
  const cpu=battle?STARTER_DECKS.find(s=>s.id===battle.cpuDeckId):STARTER_DECKS[2];
  requireValue(!!cpu&&sameCards(poolOf(game.players[1]),[...cpu.ids,...cpu.specialIds]));
  if(battle)requireValue(game.difficulty===battle.difficulty);
  return {id:raw.id,mode:raw.mode,chapter:raw.chapter,game};
 }catch{return null}
}
export function verifyOperatorSnapshot(snapshot,grant){
 return !!(snapshot?.mode==='kirahara'&&grant?.entitled&&grant.deck?.id==='kirahara'&&Array.isArray(grant.deck.main)&&Array.isArray(grant.deck.special)&&sameCards(poolOf(snapshot.game.players[0]),[...grant.deck.main,...grant.deck.special]));
}
export function normalizeAudioSettings(raw={}){
 return {bgm:typeof raw?.bgm==='boolean'?raw.bgm:true,bgmVolume:typeof raw?.bgmVolume==='number'&&Number.isFinite(raw.bgmVolume)?Math.max(0,Math.min(1,raw.bgmVolume)):.5};
}
export function musicScene(page,game){
 if(page!=='battle'||!game||game.winner!==null)return 'menu';
 return game.players.some(p=>p.core<=2500)?'battle-danger':'battle';
}

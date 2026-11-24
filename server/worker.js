import {operatorPublicStatus,NEW_MATCHES_ALLOWED_SQL} from './operator-content.js';
import {newGame,playCard,attack,endTurn,runCpuTurn,MAX_LOG_ENTRIES} from '../engine.js';
import {ORIGINS,STARTER_DECKS,validateDeck,validateSpecialDeck} from '../catalog.js';
import {authenticateAccount,handleAccountRoute,assertNewMatchesAllowed} from './account.js';

const BOT_WAIT=60_000, TURN_LIMIT=120_000, QUEUE_LIVE=30_000, ROOM_LIFE=30*60_000;
const PUBLIC_ORIGINS=new Set(['https://www.beast-king.com','https://beast-king.com','https://beast-king.hisa-0128-1996.chatgpt.site']);
const ROOM_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ACTIONS=new Set(['play','attack','endTurn','surrender']);
const PROFILE_ORIGINS=new Set(ORIGINS.map(origin=>origin.id));
const MATCH_COLUMNS=['id','mode','room_code','player0','player1','name0','name1','rating0','rating1','bot','state_json','revision','status','turn_deadline','write_token','created_at','updated_at'];
class ApiError extends Error {constructor(status,code,message,extra={}){super(message);this.status=status;this.code=code;this.extra=extra;}}
const problem=(status,code,message,extra)=>{throw new ApiError(status,code,message,extra);};
const statement=(db,sql,...args)=>db.prepare(sql).bind(...args);
const first=(db,sql,...args)=>statement(db,sql,...args).first();
const run=(db,sql,...args)=>statement(db,sql,...args).run();
const clone=value=>JSON.parse(JSON.stringify(value));
const changed=result=>Number(result?.meta?.changes||0)>0;
const uuid=()=>crypto.randomUUID();
const bytes=n=>crypto.getRandomValues(new Uint8Array(n));
function token(){return btoa(String.fromCharCode(...bytes(32))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
async function hash(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
function nickname(value){
  if(typeof value!=='string')problem(400,'invalid_nickname','ニックネームを1〜16文字で入力してください。');
  const name=value.normalize('NFC').trim();
  if([...name].length<1||[...name].length>16||/[\u0000-\u001f\u007f-\u009f<>]/u.test(name))problem(400,'invalid_nickname','ニックネームは1〜16文字で、改行や記号 < > を含めずに入力してください。');
  return name;
}
function profileOrigin(value){
  if(!PROFILE_ORIGINS.has(value))problem(400,'invalid_origin','アイコンは山・川・種・草・花・木・王から選んでください。');
  return value;
}
const KIRAHARA_SLOT='operator-kirahara-v1';
async function decks(body,db,playerId){
  const main=validateDeck(body.deck),special=validateSpecialDeck(body.special);
  if(!main.valid||!special.valid)problem(400,'invalid_deck',[...main.errors,...special.errors].join('／'));
  let deckSlotId=null;
  if(body.deckSlotId===KIRAHARA_SLOT){const entitled=await first(db,"SELECT 1 AS allowed FROM bk_operator o JOIN bk_reward_claims c ON c.player_id=o.player_id WHERE o.singleton=1 AND o.player_id=? AND c.item_type='gift' AND c.item_id IN ('operator-kirahara-deck-v1','operator-kirahara-deck-v2','operator-kirahara-deck-v3','operator-kirahara-deck-v4') LIMIT 1",playerId);if(entitled)deckSlotId=KIRAHARA_SLOT;}
  return {deck:[...body.deck],special:[...body.special],deckSlotId};
}
const storedDeck=selected=>JSON.stringify(selected.deckSlotId?{ids:selected.deck,deckSlotId:selected.deckSlotId}:selected.deck);
function readStoredDeck(raw){const value=JSON.parse(raw);return Array.isArray(value)?{deck:value,deckSlotId:null}:{deck:value.ids,deckSlotId:value.deckSlotId===KIRAHARA_SLOT?KIRAHARA_SLOT:null};}
async function bodyJSON(request,limit=16_384){
  if(Number(request.headers.get('content-length')||0)>limit)problem(413,'body_too_large','送信データが大きすぎます。');
  const reader=request.body?.getReader(),chunks=[];let size=0;
  if(reader)for(;;){
    const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;
    if(size>limit){await reader.cancel();problem(413,'body_too_large','送信データが大きすぎます。');}
    chunks.push(value);
  }
  const combined=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){combined.set(chunk,offset);offset+=chunk.byteLength;}
  const text=new TextDecoder().decode(combined);
  if(!text.trim())return {};
  let value;try{value=JSON.parse(text);}catch{problem(400,'invalid_json','送信データの形式を確認してください。');}
  if(!value||typeof value!=='object'||Array.isArray(value))problem(400,'invalid_json','送信データはオブジェクトで指定してください。');
  return value;
}
function allowedOrigin(origin,url){
  if(!origin)return true;
  if(PUBLIC_ORIGINS.has(origin)||origin===url.origin)return true;
  try{const u=new URL(origin);return ['http:','https:'].includes(u.protocol)&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&u.origin===origin;}catch{return false;}
}
function profilePublic(row){return {id:row.id,nickname:row.nickname,origin:row.origin_v2||row.origin||'mountain',rating:row.rating,wins:row.wins,losses:row.losses,draws:row.draws,lastMatchId:row.last_match_id||null};}
async function cleanWaiting(db,now,keepPlayer){
  await db.batch([
    statement(db,"UPDATE bk_rooms SET status='closed',updated_at=? WHERE status='waiting' AND expires_at<=?",now,now),
    statement(db,"DELETE FROM bk_occupancy WHERE kind='room' AND EXISTS (SELECT 1 FROM bk_rooms r WHERE r.code=bk_occupancy.ref AND r.status='closed')"),
    statement(db,"DELETE FROM bk_occupancy WHERE kind='queue' AND player_id<>? AND EXISTS (SELECT 1 FROM bk_queue q WHERE q.player_id=bk_occupancy.player_id AND q.id=bk_occupancy.ref AND q.last_seen<?)",keepPlayer,now-QUEUE_LIVE),
    statement(db,"DELETE FROM bk_queue WHERE NOT EXISTS (SELECT 1 FROM bk_occupancy o WHERE o.player_id=bk_queue.player_id AND o.kind='queue' AND o.ref=bk_queue.id)")
  ]);
}
function seatOf(row,id){if(row.player0===id)return 0;if(row.player1===id)return 1;problem(403,'not_participant','この対戦には参加していません。');}
function publicState(row,viewer){
  const state=JSON.parse(row.state_json),toViewer=seat=>seat===viewer?0:1;
  const players=[viewer,1-viewer].map((seat,index)=>{
    const p=clone(state.players[seat]);
    p.deck=p.deck.map(()=>null);
    p.field=p.field.map(unit=>({...unit,owner:toViewer(unit.owner)}));
    if(index===1){p.hand=p.hand.map(()=>null);p.special=(p.special||[]).map(()=>null);p.traps=p.traps.map(trap=>({uid:trap.uid}));}
    return p;
  });
  return {rulesVersion:state.rulesVersion,...(state.openingRuleVersion===1?{openingRuleVersion:1}:{}),turn:state.turn,active:toViewer(state.active),winner:typeof state.winner==='number'?toViewer(state.winner):state.winner,players,log:clone(state.log.slice(-MAX_LOG_ENTRIES)),nextUid:state.nextUid,difficulty:state.difficulty};
}
async function snapshot(db,row,playerId,now){
  const seat=seatOf(row,playerId),state=publicState(row,seat),opponent=1-seat,privateState=JSON.parse(row.state_json);
  const own=await first(db,'SELECT rating FROM bk_profiles WHERE id=?',playerId);
  const other=row.bot?null:await first(db,'SELECT COALESCE(origin_v2,origin) AS origin FROM bk_profiles WHERE id=?',row[`player${opponent}`]);
  const avatar=row.bot?JSON.parse(row.state_json).botOrigin:other?.origin;
  return {id:row.id,mode:row.mode,roomCode:row.room_code||null,revision:row.revision,state,...(Array.isArray(privateState.deckSlots)?{ownDeckSlot:privateState.deckSlots[seat]===KIRAHARA_SLOT?KIRAHARA_SLOT:null}:{}),
    opponent:{name:row[`name${opponent}`],kind:row.bot?'bot':'human',origin:PROFILE_ORIGINS.has(avatar)?avatar:'mountain',rating:row[`rating${opponent}`]+row[`rating_delta${opponent}`]},
    status:row.status,result:state.winner===null?null:state.winner==='draw'?'draw':state.winner===0?'win':'loss',
    ratingDelta:row[`rating_delta${seat}`],selfRating:own?.rating??row[`rating${seat}`],reason:row.reason||null,
    turnDeadline:row.status==='active'?row.turn_deadline:null,serverTime:now};
}
function createMatchRecord({mode,roomCode=null,a,b,now,bot=false}){
  const state=newGame({playerDeck:a.deck,cpuDeck:b.deck,playerSpecialDeck:a.special,cpuSpecialDeck:b.special,seed:uuid(),difficulty:'normal'});
  state.players[0].name=a.nickname;state.players[1].name=b.nickname;
  state.deckSlots=[a.deckSlotId===KIRAHARA_SLOT?KIRAHARA_SLOT:null,b.deckSlotId===KIRAHARA_SLOT?KIRAHARA_SLOT:null];
  if(bot)state.botOrigin=PROFILE_ORIGINS.has(b.origin)?b.origin:'mountain';
  state.log=state.log.map(event=>event.text.startsWith('あなたの')?{...event,text:a.nickname+event.text.slice(3)}:event);
  return {id:uuid(),mode,room_code:roomCode,player0:a.id,player1:bot?null:b.id,name0:a.nickname,name1:b.nickname,
    rating0:a.rating,rating1:b.rating,bot:bot?1:0,state_json:JSON.stringify(state),revision:0,status:'active',turn_deadline:now+TURN_LIMIT,write_token:uuid(),created_at:now,updated_at:now};
}
function insertMatch(db,row,condition,args){return statement(db,`INSERT INTO bk_matches (${MATCH_COLUMNS.join(',')}) SELECT ${MATCH_COLUMNS.map(()=>'?').join(',')} WHERE (${condition}) AND ${NEW_MATCHES_ALLOWED_SQL}`,...MATCH_COLUMNS.map(k=>row[k]),...args,row.created_at,row.created_at);}
function claimMatchStatements(db,row){
  return [
    statement(db,"UPDATE bk_occupancy SET kind='match',ref=?,updated_at=? WHERE player_id IN (?,?) AND EXISTS (SELECT 1 FROM bk_matches WHERE id=?)",row.id,row.created_at,row.player0,row.player1,row.id),
    statement(db,'DELETE FROM bk_queue WHERE player_id IN (?,?) AND EXISTS (SELECT 1 FROM bk_matches WHERE id=?)',row.player0,row.player1,row.id),
    statement(db,'UPDATE bk_profiles SET last_match_id=?,updated_at=? WHERE id IN (?,?) AND EXISTS (SELECT 1 FROM bk_matches WHERE id=?)',row.id,row.created_at,row.player0,row.player1,row.id)
  ];
}
function ratingDeltas(row,winner){
  if(row.mode!=='ranked'||winner===null)return [0,0];
  const score=winner==='draw'?.5:winner===0?1:0;
  const delta=Math.round(32*(score-1/(1+10**((row.rating1-row.rating0)/400))));
  return [Math.max(-row.rating0,delta),row.bot?0:Math.max(-row.rating1,-delta)];
}
async function commitMatch(db,row,state,{now,reason=null,actorId=null,actionId=null,requestHash=null}){
  const finished=state.winner!==null,nextRevision=row.revision+1,writeToken=uuid();
  const previous=JSON.parse(row.state_json),deadline=finished?row.turn_deadline:state.turn!==previous.turn?now+TURN_LIMIT:row.turn_deadline;
  const deltas=ratingDeltas(row,state.winner),status=finished?'finished':'active';
  const guard='EXISTS (SELECT 1 FROM bk_matches m WHERE m.id=? AND m.write_token=?)';
  const statements=[statement(db,"UPDATE bk_matches SET state_json=?,revision=?,status=?,reason=?,turn_deadline=?,rating_delta0=?,rating_delta1=?,write_token=?,updated_at=? WHERE id=? AND revision=? AND status='active'",JSON.stringify(state),nextRevision,status,finished?reason||'battle':null,deadline,...deltas,writeToken,now,row.id,row.revision)];
  if(actionId)statements.push(statement(db,`INSERT INTO bk_actions (match_id,player_id,action_id,request_hash,revision,created_at) SELECT ?,?,?,?,?,? WHERE ${guard}`,row.id,actorId,actionId,requestHash,nextRevision,now,row.id,writeToken));
  if(finished){
    if(row.mode==='ranked')for(const seat of [0,1]){
      const id=row[`player${seat}`];if(!id)continue;
      const won=state.winner===seat?1:0,lost=typeof state.winner==='number'&&state.winner!==seat?1:0,drawn=state.winner==='draw'?1:0;
      statements.push(statement(db,"UPDATE bk_profiles SET rating=MAX(0,rating+?),wins=wins+?,losses=losses+?,draws=draws+?,updated_at=? WHERE id=? AND EXISTS (SELECT 1 FROM bk_matches m WHERE m.id=? AND m.write_token=? AND m.rating_applied=0)",deltas[seat],won,lost,drawn,now,id,row.id,writeToken));
    }
    statements.push(statement(db,`UPDATE bk_matches SET rating_applied=1 WHERE id=? AND write_token=? AND rating_applied=0`,row.id,writeToken));
    statements.push(statement(db,`DELETE FROM bk_occupancy WHERE kind='match' AND ref=? AND ${guard}`,row.id,row.id,writeToken));
  }
  const result=await db.batch(statements);
  return changed(result[0]);
}
async function expireMatch(db,row,now){
  for(let retry=0;retry<3;retry++){
    if(row.status!=='active'||now<row.turn_deadline)return row;
    const state=JSON.parse(row.state_json),loser=state.active;
    state.winner=1-loser;
    state.log.push({text:`${state.players[loser].name}が120秒の制限時間を超えたため、${state.players[1-loser].name}の勝利。`,type:'result',turn:state.turn});state.log=state.log.slice(-MAX_LOG_ENTRIES);
    await commitMatch(db,row,state,{now,reason:'timeout'});
    row=await first(db,'SELECT * FROM bk_matches WHERE id=?',row.id);
  }
  return row;
}
async function matchFor(db,id,playerId,now){
  let row=await first(db,'SELECT * FROM bk_matches WHERE id=?',id);
  if(!row)problem(404,'match_not_found','対戦が見つかりません。');
  seatOf(row,playerId);
  row=await expireMatch(db,row,now);
  return row;
}
async function occupancy(db,playerId,now){
  const current=await first(db,'SELECT * FROM bk_occupancy WHERE player_id=?',playerId);
  if(current?.kind==='match'){
    const row=await matchFor(db,current.ref,playerId,now);
    if(row.status==='finished')return null;
  }
  return current;
}
async function activity(db,playerId,now){
  const o=await occupancy(db,playerId,now);
  return !o?null:o.kind==='match'?{kind:'match',matchId:o.ref}:o.kind==='room'?{kind:'room',roomCode:o.ref}:{kind:'queue',queueId:o.ref};
}
async function busy(db,current,playerId,now){
  const extra=current.kind==='match'?{match:await snapshot(db,await matchFor(db,current.ref,playerId,now),playerId,now)}:{activity:current.kind==='room'?{kind:'room',roomCode:current.ref}:{kind:'queue'}};
  problem(409,'already_active','すでに待機中、または対戦中です。現在のオンライン画面へ戻ってください。',extra);
}
async function profileRoute(db,request,method,now){
  const body=method==='POST'?await bodyJSON(request):{};
  if(request.headers.has('authorization')||method==='GET'){
    let player=await authenticateAccount(db,request,now,problem);
    if(method==='POST'){
      const name=body.nickname===undefined?null:nickname(body.nickname),origin=body.origin===undefined?null:profileOrigin(body.origin);
      if(name!==null||origin!==null)await run(db,'UPDATE bk_profiles SET nickname=COALESCE(?,nickname),origin=COALESCE(?,origin),origin_v2=COALESCE(?,origin_v2),updated_at=? WHERE id=?',name,origin==='king'?'mountain':origin,origin,now,player.id);
    }
    await cleanWaiting(db,now,player.id);
    const current=await activity(db,player.id,now);
    player=await first(db,'SELECT * FROM bk_profiles WHERE id=?',player.id);
    return {ok:true,profile:profilePublic(player),activity:current};
  }
  const name=nickname(body.nickname===undefined?'プレイヤー':body.nickname),origin=profileOrigin(body.origin===undefined?'mountain':body.origin),bearer=token(),id=uuid();
  await run(db,'INSERT INTO bk_profiles (id,token_hash,nickname,origin,origin_v2,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',id,await hash(bearer),name,origin==='king'?'mountain':origin,origin,now,now);
  return {ok:true,token:bearer,profile:profilePublic(await first(db,'SELECT * FROM bk_profiles WHERE id=?',id)),activity:null};
}

async function queueParticipant(db,q){
  const p=await first(db,'SELECT * FROM bk_profiles WHERE id=?',q.player_id);
  return {id:p.id,nickname:p.nickname,rating:p.rating,...readStoredDeck(q.deck_json),special:JSON.parse(q.special_json)};
}
async function matchQueue(db,playerId,now){
  for(let retry=0;retry<4;retry++){
    const o=await first(db,'SELECT * FROM bk_occupancy WHERE player_id=?',playerId);
    if(o?.kind==='match')return matchFor(db,o.ref,playerId,now);
    if(o?.kind!=='queue')return null;
    if((await operatorPublicStatus(db,now)).maintenance)return null;
    const own=await first(db,'SELECT * FROM bk_queue WHERE player_id=? AND id=?',playerId,o.ref);
    if(!own)return null;
    const candidate=await first(db,"SELECT q.* FROM bk_queue q JOIN bk_occupancy o ON o.player_id=q.player_id AND o.kind='queue' AND o.ref=q.id WHERE q.player_id<>? AND q.last_seen>=? ORDER BY q.joined_at,q.id LIMIT 1",playerId,now-QUEUE_LIVE);
    const self=await queueParticipant(db,own);
    if(candidate){
      const other=await queueParticipant(db,candidate),selfFirst=own.joined_at<candidate.joined_at||(own.joined_at===candidate.joined_at&&own.id<candidate.id);
      const row=createMatchRecord({mode:'ranked',a:selfFirst?self:other,b:selfFirst?other:self,now});
      const guard="EXISTS (SELECT 1 FROM bk_queue q JOIN bk_occupancy o ON o.player_id=q.player_id AND o.kind='queue' AND o.ref=q.id WHERE q.player_id=? AND q.id=? AND q.last_seen>=?)";
      const result=await db.batch([insertMatch(db,row,`${guard} AND ${guard}`,[own.player_id,own.id,now-QUEUE_LIVE,candidate.player_id,candidate.id,now-QUEUE_LIVE]),...claimMatchStatements(db,row)]);
      if(changed(result[0]))return first(db,'SELECT * FROM bk_matches WHERE id=?',row.id);
      continue;
    }
    if(now-own.joined_at<BOT_WAIT)return null;
    const preset=STARTER_DECKS[bytes(1)[0]%STARTER_DECKS.length];
    const bot={id:null,nickname:'CPU 1',origin:preset.origin,rating:1000,deck:preset.ids,special:preset.specialIds};
    const row=createMatchRecord({mode:'ranked',a:self,b:bot,now,bot:true});
    // Recheck both the 60-second server clock and absence of a human inside
    // the same transaction that claims the seat. A newly queued human wins.
    const condition="EXISTS (SELECT 1 FROM bk_queue q JOIN bk_occupancy o ON o.player_id=q.player_id AND o.kind='queue' AND o.ref=q.id WHERE q.player_id=? AND q.id=? AND q.joined_at<=?) AND NOT EXISTS (SELECT 1 FROM bk_queue q JOIN bk_occupancy o ON o.player_id=q.player_id AND o.kind='queue' AND o.ref=q.id WHERE q.player_id<>? AND q.last_seen>=?)";
    const result=await db.batch([insertMatch(db,row,condition,[playerId,own.id,now-BOT_WAIT,playerId,now-QUEUE_LIVE]),...claimMatchStatements(db,row)]);
    if(changed(result[0]))return first(db,'SELECT * FROM bk_matches WHERE id=?',row.id);
  }
  const o=await first(db,"SELECT ref FROM bk_occupancy WHERE player_id=? AND kind='match'",playerId);
  return o?matchFor(db,o.ref,playerId,now):null;
}
async function queueResponse(db,playerId,now,row=null){
  if(row)return {ok:true,status:'matched',queue:null,match:await snapshot(db,row,playerId,now)};
  const o=await first(db,'SELECT * FROM bk_occupancy WHERE player_id=?',playerId);
  if(o?.kind==='match')return {ok:true,status:'matched',queue:null,match:await snapshot(db,await matchFor(db,o.ref,playerId,now),playerId,now)};
  const q=o?.kind==='queue'?await first(db,'SELECT * FROM bk_queue WHERE player_id=? AND id=?',playerId,o.ref):null;
  const publicStatus=q?await operatorPublicStatus(db,now):null;
  return {ok:true,status:q?'waiting':'idle',queue:q?{id:q.id,joinedAt:q.joined_at,elapsedSeconds:Math.max(0,Math.floor((now-q.joined_at)/1000)),botAfterSeconds:BOT_WAIT/1000,paused:publicStatus.maintenance}:null,match:null};
}
async function queueRoute(db,request,player,method,now){
  if(method==='DELETE'){
    const o=await first(db,'SELECT * FROM bk_occupancy WHERE player_id=?',player.id);
    if(o?.kind==='queue')await db.batch([
      statement(db,"DELETE FROM bk_queue WHERE player_id=? AND id=? AND EXISTS (SELECT 1 FROM bk_occupancy WHERE player_id=? AND kind='queue' AND ref=?)",player.id,o.ref,player.id,o.ref),
      statement(db,"DELETE FROM bk_occupancy WHERE player_id=? AND kind='queue' AND ref=?",player.id,o.ref)
    ]);
    return queueResponse(db,player.id,now);
  }
  if(method==='POST'){
    const selected=await decks(await bodyJSON(request),db,player.id);
    await cleanWaiting(db,now,player.id);
    const current=await occupancy(db,player.id,now);
    if(current&&current.kind!=='queue')await busy(db,current,player.id,now);
    if(!current){
      const id=uuid();
      await db.batch([
        statement(db,'INSERT INTO bk_queue (player_id,id,deck_json,special_json,joined_at,last_seen) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM bk_occupancy WHERE player_id=?)',player.id,id,storedDeck(selected),JSON.stringify(selected.special),now,now,player.id),
        statement(db,"INSERT INTO bk_occupancy (player_id,kind,ref,updated_at) SELECT ?,'queue',?,? WHERE EXISTS (SELECT 1 FROM bk_queue WHERE player_id=? AND id=?) AND NOT EXISTS (SELECT 1 FROM bk_occupancy WHERE player_id=?)",player.id,id,now,player.id,id,player.id)
      ]);
      const claimed=await first(db,'SELECT * FROM bk_occupancy WHERE player_id=?',player.id);
      if(claimed&&claimed.kind!=='queue'&&claimed.kind!=='match')await busy(db,claimed,player.id,now);
    }
  }
  await run(db,'UPDATE bk_queue SET last_seen=MAX(last_seen,?) WHERE player_id=?',now,player.id);
  await cleanWaiting(db,now,player.id);
  return queueResponse(db,player.id,now,await matchQueue(db,player.id,now));
}
function roomCode(){return [...bytes(6)].map(v=>ROOM_ALPHABET[v%ROOM_ALPHABET.length]).join('');}
async function loadRoom(db,code){
  const room=await first(db,'SELECT r.*,p.nickname AS host_name FROM bk_rooms r JOIN bk_profiles p ON p.id=r.host_id WHERE r.code=?',code);
  if(!room)problem(404,'room_not_found','ルームが見つかりません。合言葉を確認してください。');
  return room;
}
async function roomResponse(db,room,playerId,now){
  const row=room.match_id&&(room.host_id===playerId||room.guest_id===playerId)?await matchFor(db,room.match_id,playerId,now):null;
  return {ok:true,status:room.status,room:{code:room.code,status:room.status,host:{name:room.host_name},createdAt:room.created_at,expiresAt:room.expires_at},match:row?await snapshot(db,row,playerId,now):null};
}
async function renameFromBody(db,player,body,now){
  if(body.nickname===undefined)return player;
  const name=nickname(body.nickname);await run(db,'UPDATE bk_profiles SET nickname=?,updated_at=? WHERE id=?',name,now,player.id);
  return {...player,nickname:name};
}
async function createRoom(db,request,player,now){
  const body=await bodyJSON(request),selected=await decks(body,db,player.id);
  player=await renameFromBody(db,player,body,now);
  await cleanWaiting(db,now,player.id);
  const current=await occupancy(db,player.id,now);if(current)await busy(db,current,player.id,now);
  for(let retry=0;retry<6;retry++){
    const code=roomCode();
    try{
      const results=await db.batch([
        statement(db,`INSERT INTO bk_rooms (code,host_id,status,host_deck_json,host_special_json,created_at,updated_at,expires_at) SELECT ?,?,'waiting',?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM bk_occupancy WHERE player_id=?) AND ${NEW_MATCHES_ALLOWED_SQL}`,code,player.id,storedDeck(selected),JSON.stringify(selected.special),now,now,now+ROOM_LIFE,player.id,now,now),
        statement(db,"INSERT INTO bk_occupancy (player_id,kind,ref,updated_at) SELECT ?,'room',?,? WHERE EXISTS (SELECT 1 FROM bk_rooms WHERE code=? AND host_id=? AND status='waiting') AND NOT EXISTS (SELECT 1 FROM bk_occupancy WHERE player_id=?)",player.id,code,now,code,player.id,player.id)
      ]);
      if(changed(results[0]))return roomResponse(db,await loadRoom(db,code),player.id,now);
      await assertNewMatchesAllowed(db,problem,now);
      const occupied=await occupancy(db,player.id,now);if(occupied)await busy(db,occupied,player.id,now);
    }catch(error){if(!/unique|constraint/i.test(error.message)||error instanceof ApiError)throw error;}
  }
  problem(409,'room_conflict','ルーム作成が重なりました。もう一度お試しください。');
}
async function joinRoom(db,request,player,code,now){
  const body=await bodyJSON(request),selected=await decks(body,db,player.id);player=await renameFromBody(db,player,body,now);
  await cleanWaiting(db,now,player.id);
  let room=await loadRoom(db,code);
  if(room.status==='matched'&&(room.host_id===player.id||room.guest_id===player.id))return roomResponse(db,room,player.id,now);
  if(room.status!=='waiting')problem(409,'room_unavailable','このルームは待機を終了しています。');
  if(room.host_id===player.id)problem(400,'own_room','自分のルームには相手が入室するまでお待ちください。');
  const current=await occupancy(db,player.id,now);if(current)await busy(db,current,player.id,now);
  const host=await first(db,'SELECT * FROM bk_profiles WHERE id=?',room.host_id),guest=await first(db,'SELECT * FROM bk_profiles WHERE id=?',player.id);
  const row=createMatchRecord({mode:'room',roomCode:code,a:{...host,...readStoredDeck(room.host_deck_json),special:JSON.parse(room.host_special_json)},b:{...guest,...selected},now});
  const condition="EXISTS (SELECT 1 FROM bk_rooms r JOIN bk_occupancy o ON o.player_id=r.host_id AND o.kind='room' AND o.ref=r.code WHERE r.code=? AND r.host_id=? AND r.status='waiting' AND r.expires_at>?) AND NOT EXISTS (SELECT 1 FROM bk_occupancy WHERE player_id=?)";
  const result=await db.batch([
    insertMatch(db,row,condition,[code,host.id,now,player.id]),
    statement(db,"INSERT INTO bk_occupancy (player_id,kind,ref,updated_at) SELECT ?,'match',?,? WHERE EXISTS (SELECT 1 FROM bk_matches WHERE id=?)",player.id,row.id,now,row.id),
    ...claimMatchStatements(db,row),
    statement(db,"UPDATE bk_rooms SET guest_id=?,status='matched',match_id=?,updated_at=? WHERE code=? AND status='waiting' AND EXISTS (SELECT 1 FROM bk_matches WHERE id=?)",player.id,row.id,now,code,row.id)
  ]);
  room=await loadRoom(db,code);
  if(!changed(result[0])){
    if(room.status==='matched'&&(room.host_id===player.id||room.guest_id===player.id))return roomResponse(db,room,player.id,now);
    await assertNewMatchesAllowed(db,problem,now);
    problem(409,'room_conflict','別の参加者が入室したか、ルームが閉じられました。');
  }
  return roomResponse(db,room,player.id,now);
}
function surrenderState(row,playerId){
  const state=JSON.parse(row.state_json),seat=seatOf(row,playerId);state.winner=1-seat;
  state.log.push({text:`${state.players[seat].name}が降参。${state.players[1-seat].name}の勝利。`,type:'result',turn:state.turn});state.log=state.log.slice(-MAX_LOG_ENTRIES);
  return state;
}
async function leaveRoom(db,room,playerId,now){
  if(room.host_id!==playerId&&room.guest_id!==playerId)problem(403,'not_participant','このルームには参加していません。');
  if(room.match_id){
    let row=await matchFor(db,room.match_id,playerId,now);
    for(let retry=0;retry<3&&row.status==='active';retry++){
      await commitMatch(db,row,surrenderState(row,playerId),{now,reason:'surrender'});
      row=await first(db,'SELECT * FROM bk_matches WHERE id=?',row.id);
    }
    return roomResponse(db,room,playerId,now);
  }
  await db.batch([
    statement(db,"UPDATE bk_rooms SET status='closed',updated_at=? WHERE code=? AND host_id=? AND status='waiting'",now,room.code,playerId),
    statement(db,"DELETE FROM bk_occupancy WHERE player_id=? AND kind='room' AND ref=? AND EXISTS (SELECT 1 FROM bk_rooms WHERE code=? AND status='closed')",playerId,room.code,room.code)
  ]);
  room=await loadRoom(db,room.code);
  // A join that committed first owns the match; do not release its seats.
  if(room.match_id)return leaveRoom(db,room,playerId,now);
  return roomResponse(db,room,playerId,now);
}

function mapTarget(target,seat){
  if(target===undefined||target===null)return undefined;
  if(typeof target!=='object'||Array.isArray(target)||![0,1].includes(target.player))problem(400,'invalid_target','対象のプレイヤーを確認してください。');
  const mapped={player:target.player===0?seat:1-seat};
  if(target.core===true&&!target.uid)return {...mapped,core:true};
  if(typeof target.uid==='string'&&/^u[1-9]\d{0,10}$/.test(target.uid)&&target.core!==true)return {...mapped,uid:target.uid};
  problem(400,'invalid_target','対象の魔獣かハートポイントを選んでください。');
}
function mapFusion(selection,seat){
  if(!selection||typeof selection!=='object'||Array.isArray(selection)||!Number.isInteger(selection.specialIndex)||!Array.isArray(selection.materials)||selection.materials.length<1||selection.materials.length>36)problem(400,'invalid_fusion','特殊ゾーンの合成魔獣と素材を選んでください。');
  if(selection.player!==undefined&&selection.player!==0)problem(400,'invalid_fusion','相手のカードは合成素材にできません。');
  return {specialIndex:selection.specialIndex,player:seat,materials:selection.materials.map(m=>{
    if(!m||typeof m!=='object'||Array.isArray(m)||!['hand','field','grave'].includes(m.zone)||!Number.isInteger(m.index)||m.index<0||(m.player!==undefined&&m.player!==0)||(m.owner!==undefined&&m.owner!==0))problem(400,'invalid_fusion','素材は自分の手札・場・お墓ゾーンから選んでください。');
    if(m.zone==='field'&&(typeof m.uid!=='string'||!/^u[1-9]\d{0,10}$/.test(m.uid)))problem(400,'invalid_fusion','場の素材の識別番号を確認してください。');
    const material={zone:m.zone,index:m.index,player:seat,owner:seat};
    if(m.uid!==undefined)material.uid=m.uid;
    if(m.cardId!==undefined)material.cardId=m.cardId;
    return material;
  })};
}
async function applyAction(db,request,player,matchId,now){
  const body=await bodyJSON(request);
  if(typeof body.actionId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(body.actionId))problem(400,'invalid_action_id','操作の識別番号を確認してください。');
  if(!Number.isSafeInteger(body.revision)||body.revision<0||!ACTIONS.has(body.kind))problem(400,'invalid_action','操作の形式を確認してください。');
  const requestHash=await hash(canonical(body));
  let row=await matchFor(db,matchId,player.id,now),seat=seatOf(row,player.id);
  const replay=async()=>{
    const previous=await first(db,'SELECT * FROM bk_actions WHERE match_id=? AND player_id=? AND action_id=?',matchId,player.id,body.actionId);
    if(!previous)return null;
    if(previous.request_hash!==requestHash)problem(409,'action_id_reused','同じ操作番号を別の操作には使用できません。',{match:await snapshot(db,row,player.id,now)});
    row=await first(db,'SELECT * FROM bk_matches WHERE id=?',matchId);
    return {ok:true,match:await snapshot(db,row,player.id,now),replayed:true,appliedRevision:previous.revision};
  };
  const previous=await replay();if(previous)return previous;
  if(row.status!=='active')problem(409,'match_finished','この対戦は終了しています。',{match:await snapshot(db,row,player.id,now)});
  if(row.revision!==body.revision)problem(409,'revision_conflict','対戦の状態が更新されました。最新の盤面で操作してください。',{match:await snapshot(db,row,player.id,now)});
  let state=JSON.parse(row.state_json),result;
  if(body.kind==='surrender'){state=surrenderState(row,player.id);result={ok:true};}
  else{
    if(state.active!==seat)problem(409,'not_your_turn','相手のターンです。',{match:await snapshot(db,row,player.id,now)});
    if(body.kind==='play'){
      if(!Number.isInteger(body.handIndex)||body.handIndex<0||body.handIndex>=state.players[seat].hand.length)problem(400,'invalid_hand','使用する手札を選んでください。');
      result=playCard(state,body.handIndex,body.fusion!==undefined?mapFusion(body.fusion,seat):mapTarget(body.target,seat));
    }else if(body.kind==='attack'){
      if(typeof body.attackerUid!=='string'||!/^u[1-9]\d{0,10}$/.test(body.attackerUid))problem(400,'invalid_attacker','攻撃する自分の魔獣を選んでください。');
      result=attack(state,body.attackerUid,mapTarget(body.target,seat));
    }else result=endTurn(state);
  }
  if(!result.ok)problem(400,'illegal_action',result.error||'その操作はできません。');
  if(row.bot&&state.winner===null&&state.active===1){
    const cpu=runCpuTurn(state,'normal');if(!cpu.ok)throw new Error('CPU turn could not be completed');
  }
  const committed=await commitMatch(db,row,state,{now,reason:body.kind==='surrender'?'surrender':null,actorId:player.id,actionId:body.actionId,requestHash});
  row=await first(db,'SELECT * FROM bk_matches WHERE id=?',matchId);
  if(!committed){
    const repeated=await replay();if(repeated)return repeated;
    problem(409,'revision_conflict','別の操作が先に確定しました。最新の盤面を確認してください。',{match:await snapshot(db,row,player.id,now)});
  }
  return {ok:true,match:await snapshot(db,row,player.id,now),appliedRevision:row.revision};
}

/** The injected clock is only available to server-side tests; requests cannot
 * supply timestamps, random seeds, boards, ratings, or an opponent identity. */
export function createOnlineWorker({now=()=>Date.now()}={}){
  return {async fetch(request,env,ctx){
    const url=new URL(request.url),path=url.pathname.replace(/\/+$/,''),method=request.method.toUpperCase(),origin=request.headers.get('origin');
    const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','vary':'Origin'};
    const respond=(body,status=200)=>new Response(body===null?null:JSON.stringify(body),{status,headers});
    if(!path.startsWith('/api/')&&path!=='/health')return new Response(null,{status:302,headers:{location:'https://www.beast-king.com/','cache-control':'no-store'}});
    if(!allowedOrigin(origin,url))return respond({ok:false,code:'origin_not_allowed',error:'この接続元からオンライン対戦は利用できません。'},403);
    if(origin)headers['access-control-allow-origin']=origin;
    if(method==='OPTIONS'){
      headers['access-control-allow-methods']='GET, POST, DELETE, OPTIONS';headers['access-control-allow-headers']='Authorization, Content-Type';headers['access-control-max-age']='600';
      return respond(null,204);
    }
    try{
      if(!env?.DB)problem(503,'database_unavailable','オンライン対戦の準備中です。少し待ってお試しください。');
      const db=typeof env.DB.withSession==='function'?env.DB.withSession('first-primary'):env.DB,time=Number(now());
      if(path==='/health'||path==='/api/health'){
        if(method!=='GET')problem(405,'method_not_allowed','この操作は利用できません。');
        await first(db,'SELECT id FROM bk_profiles LIMIT 1');
        return respond({ok:true,service:'beast-king-online',serverTime:time,contentRevision:'20261124-31'});
      }
      if(path==='/api/profile'){
        if(!['GET','POST'].includes(method))problem(405,'method_not_allowed','この操作は利用できません。');
        return respond(await profileRoute(db,request,method,time));
      }
      const account=await handleAccountRoute({db,request,env,now:time,path,method,problem,bodyJSON,profilePublic});
      if(account!==null)return respond(account);
      const player=await authenticateAccount(db,request,time,problem);
      if(method==='POST'&&(path==='/api/queue'||path==='/api/rooms'||/^\/api\/rooms\/[A-Z2-9]{6}\/join$/.test(path)))await assertNewMatchesAllowed(db,problem,time);
      if(path==='/api/queue'){
        if(!['GET','POST','DELETE'].includes(method))problem(405,'method_not_allowed','この操作は利用できません。');
        return respond(await queueRoute(db,request,player,method,time));
      }
      if(path==='/api/rooms'){
        if(method!=='POST')problem(405,'method_not_allowed','この操作は利用できません。');
        return respond(await createRoom(db,request,player,time));
      }
      const roomPath=path.match(/^\/api\/rooms\/([A-Z2-9]{6})(\/join)?$/);
      if(roomPath){
        const code=roomPath[1];
        if(roomPath[2]){
          if(method!=='POST')problem(405,'method_not_allowed','この操作は利用できません。');
          return respond(await joinRoom(db,request,player,code,time));
        }
        if(!['GET','DELETE'].includes(method))problem(405,'method_not_allowed','この操作は利用できません。');
        await cleanWaiting(db,time,player.id);
        const room=await loadRoom(db,code);
        return respond(method==='DELETE'?await leaveRoom(db,room,player.id,time):await roomResponse(db,room,player.id,time));
      }
      const matchPath=path.match(/^\/api\/matches\/([a-zA-Z0-9_-]{8,100})(\/actions)?$/);
      if(matchPath){
        if(matchPath[2]){
          if(method!=='POST')problem(405,'method_not_allowed','この操作は利用できません。');
          return respond(await applyAction(db,request,player,matchPath[1],time));
        }
        if(method!=='GET')problem(405,'method_not_allowed','この操作は利用できません。');
        const row=await matchFor(db,matchPath[1],player.id,time);
        return respond({ok:true,match:await snapshot(db,row,player.id,time)});
      }
      problem(404,'not_found','オンライン API が見つかりません。');
    }catch(error){
      if(error instanceof ApiError)return respond({ok:false,code:error.code,error:error.message,...error.extra},error.status);
      console.error('Online API error',error?.name);
      return respond({ok:false,code:'server_error',error:'オンライン対戦との通信に失敗しました。もう一度お試しください。'},503);
    }
  }};
}
export default createOnlineWorker();

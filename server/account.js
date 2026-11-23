import {CARDS,ORIGINS,STARTER_DECKS,DECK_COPY_LIMIT,getCard,validateDeck,validateSpecialDeck} from '../catalog.js';
import {MAX_HEART_POINTS,MAX_LOG_ENTRIES} from '../engine.js';
import {normalizeCampaignProgress,getCampaignBattle} from '../campaign.js';
import {EXTRA_COPY_TREASURE} from '../shop.js';

// Account secrets exist only in request memory. D1 stores SHA-256 digests, never
// bearer tokens, link codes, or the operator's environment-only bootstrap code.
const ORIGIN_IDS=new Set(ORIGINS.map(x=>x.id)),TOKEN=/^[A-Za-z0-9_-]{43}$/;
const IDENTIFIER=/^[A-Za-z0-9_-]{8,100}$/;
const identifier=value=>typeof value==='string'&&IDENTIFIER.test(value);
const LINK_LIFE=600_000,MAX_SAVE_BYTES=1_000_000;
const statement=(db,sql,...args)=>db.prepare(sql).bind(...args);
const first=(db,sql,...args)=>statement(db,sql,...args).first();
const all=async(db,sql,...args)=>(await statement(db,sql,...args).all()).results;
const run=(db,sql,...args)=>statement(db,sql,...args).run();
const changed=result=>Number(result?.meta?.changes||0)>0;
const uuid=()=>crypto.randomUUID();
const opaque=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
async function digest(value){return new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));}
async function hash(value){return [...await digest(value)].map(n=>n.toString(16).padStart(2,'0')).join('');}
async function equalSecret(a,b){const [x,y]=await Promise.all([digest(a),digest(b)]);let different=0;for(let i=0;i<32;i++)different|=x[i]^y[i];return different===0;}
function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const text=(value,max,{empty=true,lines=false}={})=>typeof value==='string'&&[...value].length<=max&&(empty||value.trim().length>0)&&!(lines?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u:/[\u0000-\u001f\u007f-\u009f]/u).test(value);
const check=(condition,fail,code='invalid_data',message='送信データの内容を確認してください。')=>{if(!condition)fail(400,code,message);};
const noAccess=fail=>fail(404,'operator_unavailable','この操作は利用できません。');

/** A revoked original session must block the legacy-profile fallback too. */
export async function authenticateAccount(db,request,now,fail){
  const bearer=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/i)?.[1];
  if(!bearer)fail(401,'unauthorized','オンラインのプロフィールを確認してください。');
  const tokenHash=await hash(bearer);
  let session=await first(db,'SELECT * FROM bk_sessions WHERE token_hash=?',tokenHash);
  if(!session){
    const legacy=await first(db,'SELECT id,created_at FROM bk_profiles WHERE token_hash=?',tokenHash);
    if(!legacy)fail(401,'unauthorized','この端末の認証情報を確認できません。');
    await run(db,"INSERT OR IGNORE INTO bk_sessions (id,player_id,token_hash,label,kind,created_at,last_seen_at) VALUES (?,?,?,'最初の端末','original',?,?)",legacy.id,legacy.id,tokenHash,legacy.created_at,now);
    session=await first(db,'SELECT * FROM bk_sessions WHERE token_hash=?',tokenHash);
  }
  if(!session||session.revoked_at!==null)fail(401,'unauthorized','この端末の接続は解除されています。');
  const player=await first(db,'SELECT * FROM bk_profiles WHERE id=?',session.player_id);
  if(!player)fail(401,'unauthorized','この端末の認証情報を確認できません。');
  if(now-session.last_seen_at>=60_000)await run(db,'UPDATE bk_sessions SET last_seen_at=MAX(last_seen_at,?) WHERE id=? AND revoked_at IS NULL',now,session.id);
  Object.defineProperty(player,'_sessionId',{value:session.id});
  return player;
}

async function rateLimit(db,request,playerId,scope,now,{ip=20,player=10,window=900_000}={}){
  // CF-Connecting-IP is supplied by the Worker edge; X-Forwarded-For is not trusted.
  const address=request.headers.get('cf-connecting-ip')||'unknown';
  const buckets=[{key:scope+':ip:'+await hash(address.slice(0,100)),limit:ip}];
  if(playerId)buckets.push({key:scope+':player:'+playerId,limit:player});
  const results=await db.batch(buckets.map(({key,limit})=>statement(db,`INSERT INTO bk_account_limits (bucket,started_at,attempts,updated_at) VALUES (?,?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN bk_account_limits.started_at<=? THEN 1 ELSE MIN(bk_account_limits.attempts+1,?) END,started_at=CASE WHEN bk_account_limits.started_at<=? THEN excluded.started_at ELSE bk_account_limits.started_at END,updated_at=MAX(bk_account_limits.updated_at,excluded.updated_at) RETURNING attempts`,key,now,now,now-window,limit+1,now-window)));
  await run(db,'DELETE FROM bk_account_limits WHERE updated_at<?',now-86_400_000);
  return results.every((result,i)=>Number(result.results[0]?.attempts)<=buckets[i].limit);
}
async function publicStatus(db){const row=await first(db,'SELECT notice,maintenance FROM bk_operator_settings WHERE singleton=1');return {ok:true,notice:row?.notice||'',maintenance:row?.maintenance===1};}
export async function assertNewMatchesAllowed(db,fail){const status=await publicStatus(db);if(status.maintenance)fail(503,'maintenance','メンテナンス中のため、新しい対戦は開始できません。進行中の対戦は続けられます。',{notice:status.notice,maintenance:true});}
const savePublic=row=>row?{revision:row.revision,data:JSON.parse(row.data_json),updatedAt:row.updated_at}:null;
async function currentSave(db,playerId){return savePublic(await first(db,'SELECT revision,data_json,updated_at FROM bk_cloud_saves WHERE player_id=?',playerId));}

function cardIds(ids,types,max,fail){check(Array.isArray(ids)&&ids.length<=max&&ids.every(id=>types.includes(getCard(id)?.type)),fail,'invalid_save','保存するカード情報を確認してください。');return [...ids];}
function cpuSave(raw,fail){
  if(raw===null||raw===undefined)return null;
  check(plain(raw)&&raw.rulesVersion===2&&integer(raw.turn,1,9999)&&[0,1].includes(raw.active)&&[null,0,1,'draw'].includes(raw.winner)&&integer(raw.seed,0,0xffffffff)&&integer(raw.nextUid,1,100_000)&&['easy','normal','hard'].includes(raw.difficulty),fail,'invalid_save','ソロ対戦の状態を確認してください。');
  check(Array.isArray(raw.players)&&raw.players.length===2&&Array.isArray(raw.log)&&raw.log.length<=MAX_LOG_ENTRIES,fail,'invalid_save');
  const used=new Set();
  const players=raw.players.map((p,owner)=>{
    check(plain(p)&&text(p.name,80)&&integer(p.core,0,MAX_HEART_POINTS)&&integer(p.shield,0,1_000_000)&&integer(p.energy,0,10)&&integer(p.maxEnergy,0,10)&&p.energy<=p.maxEnergy&&integer(p.fatigue,0,10_000),fail,'invalid_save');
    const out={name:p.name,core:p.core,shield:p.shield,energy:p.energy,maxEnergy:p.maxEnergy,fatigue:p.fatigue,deckSize:32,specialSize:4};
    for(const [zone,types,max] of [['deck',['beast','miracle','gimmick'],32],['hand',['beast','miracle','gimmick','fusion'],4],['special',['fusion'],4],['grave',['beast','miracle','gimmick','fusion'],36],['banished',['beast','fusion'],36]])out[zone]=cardIds(p[zone],types,max,fail);
    check(Array.isArray(p.field)&&p.field.length<=4&&Array.isArray(p.traps)&&p.traps.length<=2,fail,'invalid_save');
    const identify=(entry,prefix)=>{check(plain(entry)&&typeof entry.uid==='string'&&new RegExp('^'+prefix+'[1-9][0-9]{0,5}$').test(entry.uid)&&!used.has(entry.uid)&&Number(entry.uid.slice(1))<raw.nextUid,fail,'invalid_save');used.add(entry.uid);};
    out.field=p.field.map(u=>{identify(u,'u');check(['beast','fusion'].includes(getCard(u.cardId)?.type)&&u.owner===owner&&typeof u.ready==='boolean'&&['attack','hp','maxHp'].every(k=>integer(u[k],0,1_000_000))&&u.hp<=u.maxHp&&Array.isArray(u.keywords)&&u.keywords.length<=3&&u.keywords.every(k=>['guard','rush','drain'].includes(k)),fail,'invalid_save');const unit={uid:u.uid,cardId:u.cardId,owner,ready:u.ready,attack:u.attack,hp:u.hp,maxHp:u.maxHp,keywords:[...new Set(u.keywords)]};if(u.fusionMaterialCount!==undefined){check(integer(u.fusionMaterialCount,1,36),fail,'invalid_save');unit.fusionMaterialCount=u.fusionMaterialCount;}return unit;});
    out.traps=p.traps.map(t=>{identify(t,'g');check(getCard(t.cardId)?.type==='gimmick',fail,'invalid_save');return {uid:t.uid,cardId:t.cardId};});
    const pool=[...out.deck,...out.hand,...out.special,...out.grave,...out.banished,...out.field.map(u=>u.cardId),...out.traps.map(t=>t.cardId)];
    check(validateDeck(pool.filter(id=>getCard(id)?.type!=='fusion')).valid&&validateSpecialDeck(pool.filter(id=>getCard(id)?.type==='fusion')).valid,fail,'invalid_save','ソロ対戦のカード36枚を確認してください。');
    check(p.lastMiracle==null||getCard(p.lastMiracle)?.type==='miracle',fail,'invalid_save');out.lastMiracle=p.lastMiracle??null;return out;
  });
  const log=raw.log.map(event=>{check(plain(event)&&text(event.text,1000,{lines:true})&&text(event.type,32,{empty:false})&&(event.turn===undefined||integer(event.turn,1,9999)),fail,'invalid_save');return {text:event.text,type:event.type,...(event.turn===undefined?{}:{turn:event.turn})};});
  const game={rulesVersion:2,turn:raw.turn,active:raw.active,winner:raw.winner,players,log,nextUid:raw.nextUid,seed:raw.seed,difficulty:raw.difficulty};
  for(const key of ['cpuDeckName','playerDeckName'])if(raw[key]!==undefined){check(text(raw[key],80),fail,'invalid_save');game[key]=raw[key];}
  for(const key of ['statsRecorded','forfeited'])if(raw[key]!==undefined){check(typeof raw[key]==='boolean',fail,'invalid_save');game[key]=raw[key];}
  if(raw.cpuOrigin!==undefined){check(ORIGIN_IDS.has(raw.cpuOrigin),fail,'invalid_save');game.cpuOrigin=raw.cpuOrigin;}
  if(raw.treasureReward!==undefined){check(integer(raw.treasureReward,0,100_000),fail,'invalid_save');game.treasureReward=raw.treasureReward;}
  if(raw.campaignBattleId!==undefined){check(!!getCampaignBattle(raw.campaignBattleId)&&text(raw.campaignMatchId,200,{empty:false}),fail,'invalid_save');game.campaignBattleId=raw.campaignBattleId;game.campaignMatchId=raw.campaignMatchId;}
  return game;
}

/** Build a new allowlisted object; credentials, roles and online state cannot persist. */
export function validateCloudData(raw,player,fail){
  check(plain(raw)&&raw.version===6,fail,'invalid_save','バージョン6の保存データを指定してください。');
  check(typeof raw.playerName==='string',fail,'invalid_save');
  const name=raw.playerName.normalize('NFC').trim()||player.nickname;
  check(text(name,16,{empty:false})&&!/[<>]/.test(name)&&ORIGIN_IDS.has(raw.profileOrigin),fail,'invalid_save','名前とプロフィールアイコンを確認してください。');
  check(validateDeck(raw.deckIds).valid&&validateSpecialDeck(raw.specialIds).valid&&text(raw.deckName,28,{empty:false}),fail,'invalid_save','通常32枚・特殊4枚のデッキを確認してください。');
  check(plain(raw.collection)&&Object.keys(raw.collection).length<=CARDS.length&&Object.entries(raw.collection).every(([id,n])=>!!getCard(id)&&integer(n,0,3)),fail,'invalid_save','所持カードは既存カードを0〜3枚で指定してください。');
  const collection=Object.fromEntries(Object.entries(raw.collection).filter(([,n])=>n>0));
  const pool=[...raw.deckIds,...raw.specialIds];check(pool.every(id=>pool.filter(x=>x===id).length<=(collection[id]||0)),fail,'invalid_save','デッキのカードの所持枚数が不足しています。');
  check(integer(raw.treasure)&&plain(raw.stats)&&['played','won','drawn'].every(k=>integer(raw.stats[k]))&&raw.stats.won+raw.stats.drawn<=raw.stats.played,fail,'invalid_save');
  check(['bgm','sound','motion'].every(k=>typeof raw[k]==='boolean')&&Number.isFinite(raw.bgmVolume)&&raw.bgmVolume>=0&&raw.bgmVolume<=1,fail,'invalid_save');
  check(Array.isArray(raw.rewardedMatches)&&raw.rewardedMatches.length<=200&&raw.rewardedMatches.every(id=>text(id,200,{empty:false})),fail,'invalid_save');
  check(plain(raw.campaignProgress)&&Array.isArray(raw.campaignProgress.results)&&raw.campaignProgress.results.length<=1000&&Array.isArray(raw.campaignProgress.clearedBattleIds)&&raw.campaignProgress.clearedBattleIds.length<=20,fail,'invalid_save');
  const data={version:6,playerName:name,profileOrigin:raw.profileOrigin,campaignProgress:normalizeCampaignProgress(raw.campaignProgress),bgm:raw.bgm,bgmVolume:raw.bgmVolume,sound:raw.sound,motion:raw.motion,treasure:raw.treasure,collection,rewardedMatches:[...new Set(raw.rewardedMatches)],lastPack:null,deckName:raw.deckName,deckIds:[...raw.deckIds],specialIds:[...raw.specialIds],starter:STARTER_DECKS.some(d=>d.id===raw.starter)?raw.starter:'',draft:null,stats:{played:raw.stats.played,won:raw.stats.won,drawn:raw.stats.drawn},game:cpuSave(raw.game,fail)};
  if(raw.draft!=null){check(plain(raw.draft)&&text(raw.draft.name,28),fail,'invalid_save');const ids=cardIds(raw.draft.ids,['beast','miracle','gimmick'],32,fail),specialIds=cardIds(raw.draft.specialIds,['fusion'],4,fail);check([...ids,...specialIds].every(id=>[...ids,...specialIds].filter(x=>x===id).length<=DECK_COPY_LIMIT),fail,'invalid_save',`編集中のデッキも同じカードは${DECK_COPY_LIMIT}枚までです。`);data.draft={name:raw.draft.name,ids,specialIds};}
  if(raw.lastPack!=null){check(plain(raw.lastPack)&&Array.isArray(raw.lastPack.pulls)&&raw.lastPack.pulls.length===12&&integer(raw.lastPack.bonusTreasure,0,100_000),fail,'invalid_save');data.lastPack={pulls:raw.lastPack.pulls.map(p=>{check(plain(p)&&!!getCard(p.cardId)&&['isNew','converted','guaranteed'].every(k=>typeof p[k]==='boolean'),fail,'invalid_save');return {cardId:p.cardId,isNew:p.isNew,converted:p.converted,guaranteed:p.guaranteed};}),bonusTreasure:raw.lastPack.bonusTreasure};if(raw.lastPack.openedAt!==undefined){check(integer(raw.lastPack.openedAt),fail,'invalid_save');data.lastPack.openedAt=raw.lastPack.openedAt;}}
  check(new TextEncoder().encode(JSON.stringify(data)).length<=MAX_SAVE_BYTES,fail,'invalid_save','保存データが大きすぎます。');
  return data;
}

async function saveRoute(c,player){
  const {db,request,method,now,fail,bodyJSON}=c;
  const profile=async()=>c.profilePublic(await first(db,'SELECT * FROM bk_profiles WHERE id=?',player.id));
  if(method==='GET')return {ok:true,save:await currentSave(db,player.id),profile:await profile()};
  if(method!=='POST')fail(405,'method_not_allowed','この操作は利用できません。');
  if(!await rateLimit(db,request,player.id,'save',now,{ip:240,player:120,window:60_000}))fail(429,'rate_limited','保存の操作が続いています。少し待って再試行してください。');
  const body=await bodyJSON(request,MAX_SAVE_BYTES+16_384);
  check(integer(body.revision)&&identifier(body.mutationId),fail,'invalid_save');
  const data=validateCloudData(body.data,player,fail),requestHash=await hash(canonical({revision:body.revision,data}));
  const replay=async()=>{const old=await first(db,'SELECT request_hash,revision FROM bk_save_mutations WHERE player_id=? AND mutation_id=?',player.id,body.mutationId);if(!old)return null;if(old.request_hash!==requestHash)fail(409,'mutation_id_reused','同じ保存番号を別のデータには使えません。',{save:await currentSave(db,player.id)});return {ok:true,save:await currentSave(db,player.id),profile:await profile(),replayed:true,appliedRevision:old.revision};};
  const prior=await replay();if(prior)return prior;
  const writeToken=uuid(),next=body.revision+1;
  check(integer(next,1),fail,'invalid_save');
  const guard='EXISTS (SELECT 1 FROM bk_cloud_saves WHERE player_id=? AND write_token=?)';
  const result=await db.batch([
    statement(db,`INSERT INTO bk_cloud_saves (player_id,revision,data_json,write_token,updated_at) SELECT ?,1,?,?,? WHERE ?=0 AND NOT EXISTS (SELECT 1 FROM bk_cloud_saves WHERE player_id=?) AND NOT EXISTS (SELECT 1 FROM bk_save_mutations WHERE player_id=? AND mutation_id=?)`,player.id,JSON.stringify(data),writeToken,now,body.revision,player.id,player.id,body.mutationId),
    statement(db,`UPDATE bk_cloud_saves SET revision=?,data_json=?,write_token=?,updated_at=? WHERE player_id=? AND revision=? AND ?>0 AND NOT EXISTS (SELECT 1 FROM bk_save_mutations WHERE player_id=? AND mutation_id=?)`,next,JSON.stringify(data),writeToken,now,player.id,body.revision,body.revision,player.id,body.mutationId),
    statement(db,`INSERT INTO bk_save_mutations (player_id,mutation_id,request_hash,revision,created_at) SELECT ?,?,?,?,? WHERE ${guard}`,player.id,body.mutationId,requestHash,next,now,player.id,writeToken),
    statement(db,`UPDATE bk_profiles SET nickname=?,origin=?,origin_v2=?,updated_at=? WHERE id=? AND ${guard}`,data.playerName,data.profileOrigin==='king'?'mountain':data.profileOrigin,data.profileOrigin,now,player.id,player.id,writeToken)
  ]);
  if(!changed(result[0])&&!changed(result[1])){const again=await replay();if(again)return again;fail(409,'save_conflict','別の端末で保存データが更新されています。どちらを使うか確認してください。',{save:await currentSave(db,player.id)});}
  return {ok:true,save:await currentSave(db,player.id),profile:await profile(),appliedRevision:next};
}

async function linkCreate(c,player){
  const {db,request,now,fail}=c;
  if(!await rateLimit(db,request,player.id,'link-create',now,{ip:30,player:10,window:600_000}))fail(429,'rate_limited','引き継ぎコードの発行が続いています。少し待ってください。');
  const code=opaque(),expiresAt=now+LINK_LIFE;
  await db.batch([statement(db,'DELETE FROM bk_link_codes WHERE player_id=? OR expires_at<=?',player.id,now),statement(db,'INSERT INTO bk_link_codes (code_hash,player_id,created_at,expires_at) VALUES (?,?,?,?)',await hash(code),player.id,now,expiresAt)]);
  return {ok:true,link:{code,expiresAt}};
}
async function linkClaim(c){
  const {db,request,now,fail,bodyJSON,profilePublic}=c;
  if(!await rateLimit(db,request,null,'link-claim',now,{ip:20,window:600_000}))fail(429,'rate_limited','引き継ぎの操作が続いています。少し待ってください。');
  const body=await bodyJSON(request),denied=()=>fail(400,'link_unavailable','引き継ぎコードを確認してください。期限切れ・使用済みのコードは使えません。');
  if(typeof body.code!=='string'||!TOKEN.test(body.code))denied();
  const label=body.deviceName===undefined?'追加した端末':typeof body.deviceName==='string'?body.deviceName.trim():null;check(text(label,40,{empty:false}),fail,'invalid_device_name','端末名は1〜40文字で入力してください。');
  const codeHash=await hash(body.code),link=await first(db,'SELECT * FROM bk_link_codes WHERE code_hash=?',codeHash);
  if(!link||link.claimed_at!==null||link.expires_at<=now)denied();
  if(!await rateLimit(db,request,link.player_id,'link-owner',now,{ip:20,player:10,window:600_000}))denied();
  const bearer=opaque(),id=uuid();
  const result=await db.batch([
    statement(db,'UPDATE bk_link_codes SET claimed_at=?,claim_session_id=? WHERE code_hash=? AND claimed_at IS NULL AND expires_at>? AND (SELECT count(*) FROM bk_sessions WHERE player_id=? AND revoked_at IS NULL)<20',now,id,codeHash,now,link.player_id),
    statement(db,"INSERT INTO bk_sessions (id,player_id,token_hash,label,kind,created_at,last_seen_at) SELECT ?,player_id,?,?,'linked',?,? FROM bk_link_codes WHERE code_hash=? AND claim_session_id=?",id,await hash(bearer),label,now,now,codeHash,id)
  ]);
  if(!changed(result[1]))denied();
  const player=await first(db,'SELECT * FROM bk_profiles WHERE id=?',link.player_id);
  return {ok:true,token:bearer,profile:profilePublic(player),save:await currentSave(db,player.id),sessionId:id};
}
async function sessions(c,player,id){
  const {db,method,now,fail}=c;
  if(!id&&method==='GET'){const rows=await all(db,'SELECT id,label,created_at,last_seen_at,revoked_at FROM bk_sessions WHERE player_id=? ORDER BY created_at DESC LIMIT 100',player.id);return {ok:true,sessions:rows.map(r=>({id:r.id,label:r.label,isCurrent:r.id===player._sessionId,createdAt:r.created_at,lastSeenAt:r.last_seen_at,revokedAt:r.revoked_at}))};}
  if(!id||method!=='DELETE')fail(405,'method_not_allowed','この操作は利用できません。');
  const row=await first(db,'SELECT id FROM bk_sessions WHERE id=? AND player_id=?',id,player.id);if(!row)fail(404,'session_not_found','この端末は見つかりません。');
  await run(db,'UPDATE bk_sessions SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND player_id=?',now,id,player.id);
  return {ok:true,revokedId:id,currentRevoked:id===player._sessionId};
}

async function presence(c,player){
  const {db,request,now,fail,bodyJSON}=c;
  if(!await rateLimit(db,request,player.id,'presence',now,{ip:600,player:120,window:60_000}))fail(429,'rate_limited','接続状況の更新が続いています。少し待ってください。');
  const body=await bodyJSON(request);
  check(typeof body.online==='boolean'&&(body.login===undefined||typeof body.login==='boolean')&&(!body.login||body.online),fail,'invalid_presence');
  const onlineUntil=body.online?now+90_000:0,loginAt=body.login?now:null;
  await run(db,`INSERT INTO bk_presence (session_id,player_id,online_until,last_seen_at,last_login_at) VALUES (?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET online_until=excluded.online_until,last_seen_at=MAX(bk_presence.last_seen_at,excluded.last_seen_at),last_login_at=CASE WHEN excluded.last_login_at IS NULL THEN bk_presence.last_login_at ELSE MAX(COALESCE(bk_presence.last_login_at,0),excluded.last_login_at) END`,player._sessionId,player.id,onlineUntil,now,loginAt);
  const row=await first(db,'SELECT online_until,last_seen_at,last_login_at FROM bk_presence WHERE session_id=? AND player_id=?',player._sessionId,player.id);
  return {ok:true,presence:{online:row.online_until>now,onlineUntil:row.online_until,lastSeenAt:row.last_seen_at,lastLoginAt:row.last_login_at}};
}

const announcementPublic=row=>({id:row.id,title:row.title,body:row.body,target:row.target_player||'all',createdAt:row.created_at,expiresAt:row.expires_at,readAt:row.read_at??null,...(row.kind==='gift'?{treasure:row.treasure,cards:JSON.parse(row.cards_json),claimedAt:row.claimed_at??null}: {})});
const eventPublic=row=>({id:row.id,title:row.title,body:row.body,startAt:row.start_at,endAt:row.end_at,status:row.status,treasure:row.treasure,cards:JSON.parse(row.cards_json),revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at,claimedAt:row.claimed_at??null});
async function dashboard(db,now){
  const cutoff=now-86_400_000;
  const players=`SELECT p.id,p.nickname,COALESCE(p.origin_v2,p.origin) AS origin,p.rating,MAX(r.last_seen_at) AS lastSeenAt,MAX(r.last_login_at) AS lastLoginAt,MAX(CASE WHEN r.online_until>? AND s.revoked_at IS NULL THEN 1 ELSE 0 END) AS online FROM bk_profiles p JOIN bk_presence r ON r.player_id=p.id JOIN bk_sessions s ON s.id=r.session_id GROUP BY p.id`;
  const [stats,recentPlayers,status,audit,items,events,onlineRows,recentRows]=await Promise.all([
    first(db,"SELECT (SELECT count(*) FROM bk_profiles) AS totalPlayers,(SELECT count(*) FROM bk_matches WHERE status='active') AS activeBattles,(SELECT count(*) FROM bk_announcements WHERE kind='message') AS totalMessages,(SELECT count(*) FROM bk_announcements WHERE kind='gift') AS totalGifts,(SELECT count(*) FROM bk_events) AS totalEvents,(SELECT count(DISTINCT r.player_id) FROM bk_presence r JOIN bk_sessions s ON s.id=r.session_id WHERE r.online_until>? AND s.revoked_at IS NULL) AS onlinePlayers,(SELECT count(DISTINCT player_id) FROM bk_presence WHERE last_login_at>?) AS recentLogins24h",now,cutoff),
    all(db,'SELECT id,nickname,COALESCE(origin_v2,origin) AS origin,rating FROM bk_profiles ORDER BY created_at DESC,id LIMIT 30'),publicStatus(db),
    all(db,'SELECT id,action,created_at AS createdAt FROM bk_operator_audit ORDER BY created_at DESC,id DESC LIMIT 50'),
    all(db,'SELECT * FROM bk_announcements ORDER BY created_at DESC,id DESC LIMIT 100'),
    all(db,'SELECT * FROM bk_events ORDER BY updated_at DESC,id DESC LIMIT 100'),
    all(db,players+' HAVING online=1 ORDER BY lastSeenAt DESC,p.id LIMIT 100',now),
    all(db,players+' HAVING lastLoginAt>? ORDER BY lastLoginAt DESC,p.id LIMIT 100',now,cutoff)
  ]);
  return {ok:true,operator:{stats,recentPlayers,onlinePlayers:onlineRows.map(({online,...row})=>row),recentLogins:recentRows.map(row=>({...row,online:row.online===1})),settings:{notice:status.notice,maintenance:status.maintenance},audit,messages:items.filter(x=>x.kind==='message').map(announcementPublic),gifts:items.filter(x=>x.kind==='gift').map(announcementPublic),events:events.map(eventPublic)}};
}
async function requireOperator(c,player,{setup=false}={}){
  const row=await first(c.db,'SELECT player_id FROM bk_operator WHERE singleton=1');
  if(row?.player_id===player.id)return;
  c.fail(404,'operator_unavailable','この操作は利用できません。',setup&&!row&&typeof c.env.BK_OPERATOR_BOOTSTRAP==='string'&&c.env.BK_OPERATOR_BOOTSTRAP.length?{setupAvailable:true}:{});
}
async function activate(c,player){
  const {db,request,env,now,fail,bodyJSON}=c;
  if(!await rateLimit(db,request,player.id,'operator-activate',now,{ip:10,player:5,window:900_000}))noAccess(fail);
  const body=await bodyJSON(request),configured=typeof env.BK_OPERATOR_BOOTSTRAP==='string'&&env.BK_OPERATOR_BOOTSTRAP.length>0;
  const candidate=typeof body.code==='string'&&body.code.length<=1024?body.code:'';
  const matches=await equalSecret(candidate,configured?env.BK_OPERATOR_BOOTSTRAP:'unconfigured-operator');
  if(!configured||!candidate||!matches)noAccess(fail);
  const auditId=uuid();
  const result=await db.batch([
    statement(db,'INSERT OR IGNORE INTO bk_operator (singleton,player_id,activated_at) VALUES (1,?,?)',player.id,now),
    statement(db,"INSERT INTO bk_operator_audit (id,player_id,action,payload_json,created_at) SELECT ?,?,'operator.activated','{}',? WHERE EXISTS (SELECT 1 FROM bk_operator WHERE player_id=? AND activated_at=?) AND NOT EXISTS (SELECT 1 FROM bk_operator_audit WHERE action='operator.activated')",auditId,player.id,now,player.id,now)
  ]);
  if(!changed(result[0]))noAccess(fail);
  return dashboard(db,now);
}
function rewardInput(body,fail,allowEmpty=false){
  const treasure=body.treasure??0,cards=body.cards??[];
  check(integer(treasure,0,100_000)&&Array.isArray(cards)&&cards.length<=12&&cards.every(c=>plain(c)&&!!getCard(c.cardId)&&integer(c.count,1,3))&&new Set(cards.map(c=>c.cardId)).size===cards.length,fail,'invalid_reward','秘宝は0〜100,000個、カードは最大12種類・各1〜3枚で指定してください。');
  check(allowEmpty||treasure>0||cards.length>0,fail,'invalid_reward','配布する秘宝またはカードを指定してください。');
  return {treasure,cards:cards.map(c=>({cardId:c.cardId,count:c.count}))};
}
async function operatorWrite(c,player,kind){
  const {db,request,now,fail,bodyJSON}=c;await requireOperator(c,player);
  if(!await rateLimit(db,request,player.id,'operator-write',now,{ip:120,player:60,window:60_000}))fail(429,'rate_limited','操作が続いています。少し待ってください。');
  const body=await bodyJSON(request),mutationId=body.mutationId??(kind==='settings'?uuid():null);
  check(identifier(mutationId),fail,'invalid_mutation_id','操作番号を確認してください。');
  const value={};
  if(kind==='settings'){check(text(body.notice,200,{lines:true})&&typeof body.maintenance==='boolean',fail,'invalid_settings');value.notice=body.notice;value.maintenance=body.maintenance;}
  else{
    check(text(body.title,80,{empty:false})&&text(body.body,1000,{lines:true}),fail,'invalid_content','タイトルは80文字以内、本文は1,000文字以内で入力してください。');value.title=body.title.trim();value.body=body.body;
    if(kind==='event'){
      check(integer(body.startAt)&&integer(body.endAt)&&body.endAt>body.startAt&&['draft','published','ended'].includes(body.status)&&(body.id===undefined||identifier(body.id)),fail,'invalid_event','公開状態と開始・終了日時を確認してください。');
      Object.assign(value,{id:body.id??null,startAt:body.startAt,endAt:body.endAt,status:body.status},rewardInput(body,fail,true));
      if(value.id&&!await first(db,'SELECT id FROM bk_events WHERE id=?',value.id))fail(404,'event_not_found','イベントが見つかりません。');
    }else{
      check(body.target==='all'||identifier(body.target),fail,'invalid_target');value.target=body.target;
      if(value.target!=='all'&&!await first(db,'SELECT id FROM bk_profiles WHERE id=?',value.target))fail(404,'player_not_found','配信先のプレイヤーが見つかりません。');
      value.expiresAt=body.expiresAt??null;check(value.expiresAt===null||integer(value.expiresAt),fail,'invalid_expiry');
      if(kind==='gift')Object.assign(value,rewardInput(body,fail));
    }
  }
  const requestHash=await hash(canonical({kind,value}));
  const replay=async()=>{const old=await first(db,'SELECT request_hash,resource_id FROM bk_operator_mutations WHERE player_id=? AND mutation_id=?',player.id,mutationId);if(!old)return null;if(old.request_hash!==requestHash)fail(409,'mutation_id_reused','同じ操作番号を別の内容には使えません。');return {...await dashboard(db,now),replayed:true,createdId:old.resource_id};};
  const previous=await replay();if(previous)return previous;
  if(value.expiresAt!==undefined&&value.expiresAt!==null)check(value.expiresAt>now,fail,'invalid_expiry');
  const id=kind==='settings'?'settings':value.id||uuid(),guard='NOT EXISTS (SELECT 1 FROM bk_operator_mutations WHERE player_id=? AND mutation_id=?)',guardArgs=[player.id,mutationId];
  const statements=[];
  if(kind==='settings')statements.push(statement(db,`INSERT INTO bk_operator_settings (singleton,notice,maintenance,updated_at,updated_by) SELECT 1,?,?,?,? WHERE ${guard} ON CONFLICT(singleton) DO UPDATE SET notice=excluded.notice,maintenance=excluded.maintenance,updated_at=excluded.updated_at,updated_by=excluded.updated_by`,value.notice,value.maintenance?1:0,now,player.id,...guardArgs));
  else if(kind==='event'&&value.id)statements.push(statement(db,`UPDATE bk_events SET title=?,body=?,start_at=?,end_at=?,status=?,treasure=?,cards_json=?,revision=revision+1,updated_at=? WHERE id=? AND ${guard}`,value.title,value.body,value.startAt,value.endAt,value.status,value.treasure,JSON.stringify(value.cards),now,id,...guardArgs));
  else if(kind==='event')statements.push(statement(db,`INSERT INTO bk_events (id,title,body,start_at,end_at,status,treasure,cards_json,revision,created_at,updated_at,created_by) SELECT ?,?,?,?,?,?,?,?,1,?,?,? WHERE ${guard}`,id,value.title,value.body,value.startAt,value.endAt,value.status,value.treasure,JSON.stringify(value.cards),now,now,player.id,...guardArgs));
  else statements.push(statement(db,`INSERT INTO bk_announcements (id,kind,target_player,title,body,treasure,cards_json,created_at,expires_at,created_by) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${guard}`,id,kind,value.target==='all'?null:value.target,value.title,value.body,value.treasure||0,JSON.stringify(value.cards||[]),now,value.expiresAt,player.id,...guardArgs));
  // The guard is consumed by the final INSERT, after its resource and audit rows.
  const action=kind==='event'?(value.id?'event.updated':'event.created'):kind==='settings'?'settings.updated':kind+'.sent';
  statements.push(statement(db,`INSERT INTO bk_operator_audit (id,player_id,action,payload_json,created_at) SELECT ?,?,?,?,? WHERE ${guard}`,uuid(),player.id,action,JSON.stringify({id,target:value.target??null,title:value.title??null}),now,...guardArgs));
  statements.push(statement(db,`INSERT INTO bk_operator_mutations (player_id,mutation_id,request_hash,resource_id,created_at) SELECT ?,?,?,?,? WHERE ${guard}`,player.id,mutationId,requestHash,id,now,...guardArgs));
  const result=await db.batch(statements);
  if(!changed(result[0])){const again=await replay();if(again)return again;fail(409,'operation_conflict','別の操作が先に確定しました。再確認してください。');}
  return {...await dashboard(db,now),createdId:id};
}

async function inbox(db,player,now){
  const rows=await all(db,"SELECT a.*,r.read_at,c.claimed_at FROM bk_announcements a LEFT JOIN bk_inbox_reads r ON r.item_id=a.id AND r.player_id=? LEFT JOIN bk_reward_claims c ON c.item_id=a.id AND c.item_type='gift' AND c.player_id=? WHERE (a.target_player IS NULL OR a.target_player=?) ORDER BY a.created_at DESC,a.id DESC LIMIT 100",player.id,player.id,player.id);
  return {ok:true,messages:rows.filter(r=>r.kind==='message').map(announcementPublic),gifts:rows.filter(r=>r.kind==='gift').map(r=>({...announcementPublic(r),claimable:r.claimed_at===null&&(r.expires_at===null||r.expires_at>now)}))};
}
async function eventList(db,player,now){const rows=await all(db,"SELECT e.*,c.claimed_at FROM bk_events e LEFT JOIN bk_reward_claims c ON c.item_id=e.id AND c.item_type='event' AND c.player_id=? WHERE e.status='published' AND e.end_at>? ORDER BY e.start_at,e.id LIMIT 100",player.id,now);return {ok:true,events:rows.map(r=>({...eventPublic(r),claimable:r.claimed_at===null&&r.start_at<=now&&(r.treasure>0||JSON.parse(r.cards_json).length>0)}))};}
async function inboxRead(c,player,id){const {db,now,fail}=c;const item=await first(db,'SELECT id FROM bk_announcements WHERE id=? AND (target_player IS NULL OR target_player=?)',id,player.id);if(!item)fail(404,'item_not_found','お知らせが見つかりません。');await run(db,'INSERT OR IGNORE INTO bk_inbox_reads (player_id,item_id,read_at) VALUES (?,?,?)',player.id,id,now);const row=await first(db,'SELECT read_at FROM bk_inbox_reads WHERE player_id=? AND item_id=?',player.id,id);return {ok:true,id,readAt:row.read_at};}
async function claimReward(c,player,kind,id){
  const {db,request,now,fail,bodyJSON}=c;
  if(!await rateLimit(db,request,player.id,'claim',now,{ip:120,player:60,window:60_000}))fail(429,'rate_limited','受け取りの操作が続いています。少し待ってください。');
  const body=await bodyJSON(request);check(integer(body.revision),fail,'invalid_revision');
  const item=kind==='gift'?await first(db,"SELECT * FROM bk_announcements WHERE id=? AND kind='gift' AND (target_player IS NULL OR target_player=?)",id,player.id):await first(db,'SELECT * FROM bk_events WHERE id=?',id);
  if(!item)fail(404,'item_not_found','受け取り対象が見つかりません。');
  const replay=async()=>{const previous=await first(db,'SELECT result_json FROM bk_reward_claims WHERE player_id=? AND item_type=? AND item_id=?',player.id,kind,id);return previous?{ok:true,save:await currentSave(db,player.id),claim:JSON.parse(previous.result_json),replayed:true}:null;};
  const previous=await replay();if(previous)return previous;
  const available=kind==='gift'?(item.expires_at===null||item.expires_at>now):item.status==='published'&&item.start_at<=now&&now<item.end_at&&(item.treasure>0||JSON.parse(item.cards_json).length>0);
  if(!available)fail(409,'reward_unavailable','この報酬は現在受け取れません。');
  const save=await currentSave(db,player.id);
  if(!save)fail(409,'cloud_save_required','先にこの端末のデータをクラウドに保存してください。',{save:null});
  if(save.revision!==body.revision)fail(409,'save_conflict','別の端末で保存データが更新されています。最新データを確認してください。',{save});
  const data=save.data,granted=[],cards=JSON.parse(item.cards_json);let convertedTreasure=0;
  for(const {cardId,count} of cards){const before=data.collection[cardId]||0,received=Math.min(count,3-before);data.collection[cardId]=before+received;if(received)granted.push({cardId,count:received});convertedTreasure+=(count-received)*EXTRA_COPY_TREASURE;}
  const treasure=item.treasure;check(integer(data.treasure+treasure+convertedTreasure),fail,'treasure_limit','秘宝の所持上限に達しています。');data.treasure+=treasure+convertedTreasure;
  const claim={id,treasure,cards:granted,convertedTreasure,claimedAt:now},writeToken=uuid(),next=save.revision+1;
  check(integer(next,1),fail,'invalid_revision');
  // Eligibility is checked again in the same transaction as the save revision:
  // event edits/closure and another device's claim cannot race a stale read.
  const itemGuard=kind==='gift'?"EXISTS (SELECT 1 FROM bk_announcements WHERE id=? AND kind='gift' AND (target_player IS NULL OR target_player=?) AND (expires_at IS NULL OR expires_at>?))":"EXISTS (SELECT 1 FROM bk_events WHERE id=? AND status='published' AND start_at<=? AND end_at>? AND revision=?)";
  const itemArgs=kind==='gift'?[id,player.id,now]:[id,now,now,item.revision];
  const guard='EXISTS (SELECT 1 FROM bk_cloud_saves WHERE player_id=? AND write_token=?)';
  const statements=[statement(db,`UPDATE bk_cloud_saves SET revision=?,data_json=?,write_token=?,updated_at=? WHERE player_id=? AND revision=? AND NOT EXISTS (SELECT 1 FROM bk_reward_claims WHERE player_id=? AND item_type=? AND item_id=?) AND ${itemGuard}`,next,JSON.stringify(data),writeToken,now,player.id,save.revision,player.id,kind,id,...itemArgs),statement(db,`INSERT INTO bk_reward_claims (player_id,item_type,item_id,result_json,save_revision,claimed_at) SELECT ?,?,?,?,?,? WHERE ${guard}`,player.id,kind,id,JSON.stringify(claim),next,now,player.id,writeToken)];
  if(kind==='gift')statements.push(statement(db,`INSERT OR IGNORE INTO bk_inbox_reads (player_id,item_id,read_at) SELECT ?,?,? WHERE ${guard}`,player.id,id,now,player.id,writeToken));
  const result=await db.batch(statements);
  if(!changed(result[0])){const again=await replay();if(again)return again;fail(409,'save_conflict','保存データまたは配布内容が更新されました。最新情報を確認してください。',{save:await currentSave(db,player.id)});}
  return {ok:true,save:await currentSave(db,player.id),claim};
}

/** Returns null for existing matchmaking routes, otherwise the account payload. */
export async function handleAccountRoute(options){
  const c={...options,fail:options.problem}, {path,method,db,now,fail}=c;
  const paths=['/api/public-status','/api/cloud-save','/api/account/link-code','/api/account/link-claim','/api/account/sessions','/api/operator','/api/operator/activate','/api/operator/settings','/api/operator/messages','/api/operator/gifts','/api/operator/events','/api/inbox','/api/events','/api/presence'];
  const sessionPath=path.match(/^\/api\/account\/sessions\/([A-Za-z0-9_-]{8,100})$/),inboxPath=path.match(/^\/api\/inbox\/([A-Za-z0-9_-]{8,100})\/(read|claim)$/),eventPath=path.match(/^\/api\/events\/([A-Za-z0-9_-]{8,100})\/claim$/);
  if(!paths.includes(path)&&!sessionPath&&!inboxPath&&!eventPath)return null;
  const expect=verb=>{if(method!==verb)fail(405,'method_not_allowed','この操作は利用できません。');};
  if(path==='/api/public-status'){expect('GET');return publicStatus(db);}
  if(path==='/api/account/link-claim'){expect('POST');return linkClaim(c);}
  const player=await authenticateAccount(db,c.request,now,fail);
  if(path==='/api/presence'){expect('POST');return presence(c,player);}
  if(path==='/api/cloud-save')return saveRoute(c,player);
  if(path==='/api/account/link-code'){expect('POST');return linkCreate(c,player);}
  if(path==='/api/account/sessions'||sessionPath)return sessions(c,player,sessionPath?.[1]);
  if(path==='/api/operator'){expect('GET');await requireOperator(c,player,{setup:true});return dashboard(db,now);}
  if(path==='/api/operator/activate'){expect('POST');return activate(c,player);}
  for(const [suffix,kind] of [['settings','settings'],['messages','message'],['gifts','gift'],['events','event']])if(path==='/api/operator/'+suffix){expect('POST');return operatorWrite(c,player,kind);}
  if(path==='/api/inbox'){expect('GET');return inbox(db,player,now);}
  if(path==='/api/events'){expect('GET');return eventList(db,player,now);}
  if(inboxPath){expect('POST');return inboxPath[2]==='read'?inboxRead(c,player,inboxPath[1]):claimReward(c,player,'gift',inboxPath[1]);}
  if(eventPath){expect('POST');return claimReward(c,player,'event',eventPath[1]);}
  return null;
}

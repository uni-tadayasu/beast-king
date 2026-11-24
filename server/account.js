import {operatorPublicStatus,operatorContentSummary,operatorRecords,writeOperatorContent,announcementPublic,eventPublic,contentPhase} from './operator-content.js';
import {operatorRegaliaArtwork} from './operator-art.js';
import {isRegaliaRasterArtwork} from '../regalia-art-format.js';
import {KIRAHARA_RECIPE,requiredCards} from '../rebuild/operator-deck.js';
import {validateRebuildBackup,MAX_REBUILD_BACKUP_BYTES} from '../rebuild/backup.js';
import {verifyOperatorSnapshot} from '../rebuild/solo-save.js';
import {CARDS,ORIGINS,STARTER_DECKS,getDeckPreset,DECK_COPY_LIMIT,getCard,validateDeck,validateSpecialDeck} from '../catalog.js';
import {MAX_HEART_POINTS,MAX_LOG_ENTRIES} from '../engine.js';
import {normalizeCampaignProgress,getCampaignBattle} from '../campaign.js';
import {normalizeEventProgress,getEventBattle,EVENT_BATTLES} from '../event-battles.js';
import {EXTRA_COPY_TREASURE,MAX_CARD_COPIES,PACK_ID,getPack} from '../shop.js';
import {OPERATOR_DECK,OPERATOR_DECK_REQUIRED} from '../operator-deck.js';

// Account secrets exist only in request memory. D1 stores SHA-256 digests, never
// bearer tokens, link codes, or the operator's environment-only access codes.
const ORIGIN_IDS=new Set(ORIGINS.map(x=>x.id)),TOKEN=/^[A-Za-z0-9_-]{43}$/;
const IDENTIFIER=/^[A-Za-z0-9_-]{8,100}$/;
const identifier=value=>typeof value==='string'&&IDENTIFIER.test(value);
const LINK_LIFE=600_000,MAX_SAVE_BYTES=1_000_000;
const REGALIA_REWARD_ID='operator-regalia-v1',REGALIA_CARD_ID='B0512',OPERATOR_DECK_REWARD_ID='operator-kirahara-deck-v3';
const OPERATOR_DECK_REWARD_IDS=Object.freeze([OPERATOR_DECK_REWARD_ID,'operator-kirahara-deck-v2','operator-kirahara-deck-v1']);
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
export async function assertNewMatchesAllowed(db,fail,now=Date.now()){const status=await operatorPublicStatus(db,now);if(status.maintenance)fail(503,'maintenance',status.maintenanceMessage||'メンテナンス中のため、新しい対戦は開始できません。進行中の対戦は続けられます。',{notice:status.notice,maintenance:true});}
const savePublic=row=>row?{revision:row.revision,data:JSON.parse(row.data_json),updatedAt:row.updated_at}:null;
async function currentSave(db,playerId){return savePublic(await first(db,'SELECT revision,data_json,updated_at FROM bk_cloud_saves WHERE player_id=?',playerId));}

function cardIds(ids,types,max,fail){check(Array.isArray(ids)&&ids.length<=max&&ids.every(id=>types.includes(getCard(id)?.type)),fail,'invalid_save','保存するカード情報を確認してください。');return [...ids];}
function cpuSave(raw,fail){
  if(raw===null||raw===undefined)return null;
  check(plain(raw)&&raw.rulesVersion===2&&(raw.openingRuleVersion===undefined||raw.openingRuleVersion===1)&&integer(raw.turn,1,9999)&&[0,1].includes(raw.active)&&[null,0,1,'draw'].includes(raw.winner)&&integer(raw.seed,0,0xffffffff)&&integer(raw.nextUid,1,100_000)&&['easy','normal','hard'].includes(raw.difficulty),fail,'invalid_save','ソロ対戦の状態を確認してください。');
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
  if(raw.openingRuleVersion===1)game.openingRuleVersion=1;
  for(const key of ['cpuDeckName','playerDeckName'])if(raw[key]!==undefined){check(text(raw[key],80),fail,'invalid_save');game[key]=raw[key];}
  if(raw.playerDeckId!==undefined){check(raw.playerDeckId===null||raw.playerDeckId==='operator-kirahara-v1',fail,'invalid_save');game.playerDeckId=raw.playerDeckId;}
  for(const key of ['statsRecorded','forfeited'])if(raw[key]!==undefined){check(typeof raw[key]==='boolean',fail,'invalid_save');game[key]=raw[key];}
  if(raw.cpuOrigin!==undefined){check(ORIGIN_IDS.has(raw.cpuOrigin),fail,'invalid_save');game.cpuOrigin=raw.cpuOrigin;}
  if(raw.treasureReward!==undefined){check(integer(raw.treasureReward,0,100_000),fail,'invalid_save');game.treasureReward=raw.treasureReward;}
  if(raw.campaignBattleId!==undefined){check(!!getCampaignBattle(raw.campaignBattleId)&&text(raw.campaignMatchId,200,{empty:false}),fail,'invalid_save');game.campaignBattleId=raw.campaignBattleId;game.campaignMatchId=raw.campaignMatchId;}
  if(raw.eventBattleId!==undefined){check(raw.campaignBattleId===undefined&&!!getEventBattle(raw.eventBattleId)&&text(raw.eventMatchId,200,{empty:false}),fail,'invalid_save');game.eventBattleId=raw.eventBattleId;game.eventMatchId=raw.eventMatchId;}
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
  const data={version:6,playerName:name,profileOrigin:raw.profileOrigin,campaignProgress:normalizeCampaignProgress(raw.campaignProgress),bgm:raw.bgm,bgmVolume:raw.bgmVolume,sound:raw.sound,motion:raw.motion,treasure:raw.treasure,collection,rewardedMatches:[...new Set(raw.rewardedMatches)],lastPack:null,deckName:raw.deckName,deckIds:[...raw.deckIds],specialIds:[...raw.specialIds],starter:getDeckPreset(raw.starter)?raw.starter:'',draft:null,stats:{played:raw.stats.played,won:raw.stats.won,drawn:raw.stats.drawn},game:cpuSave(raw.game,fail)};
  if(raw.freeStarterId!==undefined){check(STARTER_DECKS.some(d=>d.id===raw.freeStarterId),fail,'invalid_save','無料スターターを確認してください。');data.freeStarterId=raw.freeStarterId;}
  if(raw.eventProgress!==undefined){check(plain(raw.eventProgress)&&Array.isArray(raw.eventProgress.results)&&raw.eventProgress.results.length<=200&&Array.isArray(raw.eventProgress.clearedDeckIds)&&raw.eventProgress.clearedDeckIds.length<=EVENT_BATTLES.length,fail,'invalid_save');data.eventProgress=normalizeEventProgress(raw.eventProgress);}
  if(raw.draft!=null){check(plain(raw.draft)&&text(raw.draft.name,28),fail,'invalid_save');const ids=cardIds(raw.draft.ids,['beast','miracle','gimmick'],32,fail),specialIds=cardIds(raw.draft.specialIds,['fusion'],4,fail);check([...ids,...specialIds].every(id=>[...ids,...specialIds].filter(x=>x===id).length<=DECK_COPY_LIMIT),fail,'invalid_save',`編集中のデッキも同じカードは${DECK_COPY_LIMIT}枚までです。`);data.draft={name:raw.draft.name,ids,specialIds};}
  if(raw.deckLibrary!==undefined){
    const validId=id=>typeof id==='string'&&/^(?:starter-(?:star-crown|azure-memory|crimson-pulse|sky-promise)|custom-[a-z0-9-]{1,60}|operator-kirahara-v1)$/.test(id);
    check(Array.isArray(raw.deckLibrary)&&raw.deckLibrary.length>=1&&raw.deckLibrary.length<=16&&new Set(raw.deckLibrary.map(d=>d?.id)).size===raw.deckLibrary.length,fail,'invalid_save','保存デッキの一覧を確認してください。');
    data.deckLibrary=raw.deckLibrary.map(d=>{
      check(plain(d)&&validId(d.id)&&text(d.name,28,{empty:false})&&validateDeck(d.ids).valid&&validateSpecialDeck(d.specialIds).valid,fail,'invalid_save','保存デッキを確認してください。');
      const cards=[...d.ids,...d.specialIds];check(cards.every(id=>cards.filter(x=>x===id).length<=(collection[id]||0)),fail,'invalid_save','保存デッキの所持枚数が不足しています。');
      const out={id:d.id,name:d.name,ids:[...d.ids],specialIds:[...d.specialIds]};if(integer(d.recipeRevision,1,1000))out.recipeRevision=d.recipeRevision;
      if(d.draft!=null){check(plain(d.draft)&&text(d.draft.name,28),fail,'invalid_save');const ids=cardIds(d.draft.ids,['beast','miracle','gimmick'],32,fail),specialIds=cardIds(d.draft.specialIds,['fusion'],4,fail);const pool=[...ids,...specialIds];check(pool.every(id=>pool.filter(x=>x===id).length<=DECK_COPY_LIMIT),fail,'invalid_save');out.draft={name:d.draft.name,ids,specialIds};}
      return out;
    });
    const active=data.deckLibrary.find(d=>d.id===raw.activeDeckId),editing=data.deckLibrary.find(d=>d.id===raw.editingDeckId);
    check(!!active&&!!editing&&active.name===data.deckName&&active.ids.join('|')===data.deckIds.join('|')&&active.specialIds.join('|')===data.specialIds.join('|'),fail,'invalid_save','使用中のデッキを確認してください。');
    data.activeDeckId=active.id;data.editingDeckId=editing.id;
  }
  if(raw.lastPack!=null){
    check(plain(raw.lastPack)&&Array.isArray(raw.lastPack.pulls)&&raw.lastPack.pulls.length===12&&integer(raw.lastPack.bonusTreasure,0,100_000),fail,'invalid_save');
    const packId=raw.lastPack.packId===undefined?PACK_ID:raw.lastPack.packId,pack=getPack(packId);
    check(!!pack,fail,'invalid_save','開封履歴のパックを確認してください。');
    // Regalia appeared in BK01 before the second expansion. A historical receipt
    // remains readable after migration; this display record never grants cards.
    const permitted=id=>pack.cardIds.includes(id)||(packId==='BK01'&&id===REGALIA_CARD_ID);
    data.lastPack={packId,pulls:raw.lastPack.pulls.map(p=>{
      check(plain(p)&&!!getCard(p.cardId)&&permitted(p.cardId)&&['isNew','converted','guaranteed'].every(k=>typeof p[k]==='boolean'),fail,'invalid_save');
      return {cardId:p.cardId,isNew:p.isNew,converted:p.converted,guaranteed:p.guaranteed};
    }),bonusTreasure:raw.lastPack.bonusTreasure};
    if(raw.lastPack.openedAt!==undefined){check(integer(raw.lastPack.openedAt),fail,'invalid_save');data.lastPack.openedAt=raw.lastPack.openedAt;}
  }
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

async function dashboard(db,now){
  const cutoff=now-86_400_000;
  const players=`SELECT p.id,p.nickname,COALESCE(p.origin_v2,p.origin) AS origin,p.rating,MAX(r.last_seen_at) AS lastSeenAt,MAX(r.last_login_at) AS lastLoginAt,MAX(CASE WHEN r.online_until>? AND s.revoked_at IS NULL THEN 1 ELSE 0 END) AS online FROM bk_profiles p JOIN bk_presence r ON r.player_id=p.id JOIN bk_sessions s ON s.id=r.session_id GROUP BY p.id`;
  const [stats,recentPlayers,content,onlineRows,recentRows,regalia,privateDeck]=await Promise.all([
    first(db,"SELECT (SELECT count(*) FROM bk_profiles) AS totalPlayers,(SELECT count(*) FROM bk_matches WHERE status='active') AS activeBattles,(SELECT count(*) FROM bk_announcements WHERE kind='message') AS totalMessages,(SELECT count(*) FROM bk_announcements WHERE kind='gift') AS totalGifts,(SELECT count(*) FROM bk_events) AS totalEvents,(SELECT count(DISTINCT r.player_id) FROM bk_presence r JOIN bk_sessions s ON s.id=r.session_id WHERE r.online_until>? AND s.revoked_at IS NULL) AS onlinePlayers,(SELECT count(DISTINCT player_id) FROM bk_presence WHERE last_login_at>?) AS recentLogins24h",now,cutoff),
    all(db,'SELECT id,nickname,COALESCE(origin_v2,origin) AS origin,rating FROM bk_profiles ORDER BY created_at DESC,id LIMIT 30'),operatorContentSummary(db,now),
    all(db,players+' HAVING online=1 ORDER BY lastSeenAt DESC,p.id LIMIT 100',now),
    all(db,players+' HAVING lastLoginAt>? ORDER BY lastLoginAt DESC,p.id LIMIT 100',now,cutoff),
    first(db,"SELECT c.claimed_at FROM bk_reward_claims c JOIN bk_operator o ON o.player_id=c.player_id WHERE o.singleton=1 AND c.item_type='gift' AND c.item_id=?",REGALIA_REWARD_ID),
    first(db,"SELECT c.claimed_at,c.player_id,c.item_id FROM bk_reward_claims c JOIN bk_operator o ON o.player_id=c.player_id WHERE o.singleton=1 AND c.item_type='gift' AND c.item_id IN (?,?,?) ORDER BY (c.item_id=?) DESC,c.claimed_at DESC LIMIT 1",...OPERATOR_DECK_REWARD_IDS,OPERATOR_DECK_REWARD_ID)
  ]);
  return {ok:true,operator:{...content,stats:{...stats,totalNotices:content.contentTotals.notice},recentPlayers,onlinePlayers:onlineRows.map(({online,...row})=>row),recentLogins:recentRows.map(row=>({...row,online:row.online===1})),regalia:{claimedAt:regalia?.claimed_at??null},deck:await unlockedOperatorDeck(db,privateDeck?.player_id,privateDeck?.claimed_at,!!privateDeck&&privateDeck.item_id!==OPERATOR_DECK_REWARD_ID)}};
}
async function requireOperator(c,player,{setup=false}={}){
  const row=await first(c.db,'SELECT player_id FROM bk_operator WHERE singleton=1');
  if(row?.player_id===player.id)return;
  c.fail(404,'operator_unavailable','この操作は利用できません。',setup&&!row&&typeof c.env.BK_OPERATOR_BOOTSTRAP==='string'&&c.env.BK_OPERATOR_BOOTSTRAP.length?{setupAvailable:true}:{});
}
async function privateRegaliaArt(db,playerId){
 const uploaded=await first(db,"SELECT a.payload_json FROM bk_operator_audit a JOIN bk_operator o ON o.singleton=1 AND o.player_id=a.player_id WHERE a.player_id=? AND a.action='operator.artwork' AND a.id=?",playerId,'regalia-artwork:'+playerId);
 if(uploaded){try{const art=JSON.parse(uploaded.payload_json).artwork;if(isRegaliaRasterArtwork(art))return art;}catch{}}
 const select=()=>first(db,"SELECT a.id FROM bk_operator_audit a JOIN bk_operator o ON o.singleton=1 AND o.player_id=a.player_id WHERE a.player_id=? AND a.action IN ('operator.activated','operator.art_seed') ORDER BY CASE WHEN a.action='operator.activated' THEN 0 ELSE 1 END,a.created_at,a.id LIMIT 1",playerId);
 let row=await select();
 if(!row){
  await run(db,"INSERT INTO bk_operator_audit (id,player_id,action,payload_json,created_at) SELECT ?,?,'operator.art_seed','{}',? WHERE EXISTS (SELECT 1 FROM bk_operator WHERE singleton=1 AND player_id=?) AND NOT EXISTS (SELECT 1 FROM bk_operator_audit WHERE player_id=? AND action IN ('operator.activated','operator.art_seed'))",uuid(),playerId,Date.now(),playerId,playerId);
  row=await select();
 }
 return row?operatorRegaliaArtwork(row.id):null;
}
const unlockedOperatorDeck=async(db,playerId,claimedAt,upgradeRequired=false)=>claimedAt==null?null:{...OPERATOR_DECK,unlockedAt:claimedAt,upgradeRequired,artwork:await privateRegaliaArt(db,playerId)};
async function readOperatorDeck(c,player){
  await requireOperator(c,player);
  const row=await first(c.db,"SELECT c.claimed_at,c.item_id FROM bk_reward_claims c JOIN bk_operator o ON o.player_id=c.player_id WHERE o.singleton=1 AND c.player_id=? AND c.item_type='gift' AND c.item_id IN (?,?,?) ORDER BY (c.item_id=?) DESC,c.claimed_at DESC LIMIT 1",player.id,...OPERATOR_DECK_REWARD_IDS,OPERATOR_DECK_REWARD_ID);
  return {ok:true,deck:await unlockedOperatorDeck(c.db,player.id,row?.claimed_at,!!row&&row.item_id!==OPERATOR_DECK_REWARD_ID)};
}
async function replacePrivateRegaliaArtwork(c,player){
 const {db,request,now,fail,bodyJSON}=c;
 await requireOperator(c,player);
 const entitled=await first(db,"SELECT 1 AS allowed FROM bk_reward_claims WHERE player_id=? AND item_type='gift' AND item_id IN (?,?,?) LIMIT 1",player.id,...OPERATOR_DECK_REWARD_IDS);
 if(!entitled)noAccess(fail);
 const body=await bodyJSON(request,740000),artwork=body?.artwork;
 check(isRegaliaRasterArtwork(artwork),fail,'invalid_artwork','540KB以下の静止WebP画像を選んでください。');
 await run(db,"INSERT INTO bk_operator_audit (id,player_id,action,payload_json,created_at) SELECT ?,?,'operator.artwork',?,? WHERE EXISTS (SELECT 1 FROM bk_operator WHERE singleton=1 AND player_id=?) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json,created_at=excluded.created_at WHERE bk_operator_audit.player_id=excluded.player_id AND bk_operator_audit.action='operator.artwork'",'regalia-artwork:'+player.id,player.id,JSON.stringify({artwork}),now,player.id);
 return readOperatorDeck(c,player);
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

/** Private, one-time rewards. Reserved ledger items have no public announcement.
 * A valid code never grants an operator role, and only the stored role may claim.
 * The separate deck ledger upgrades operators who received the original pair.
 */
async function claimRegalia(c,player){
  const {db,request,env,now,fail,bodyJSON}=c;
  await requireOperator(c,player);
  if(!await rateLimit(db,request,player.id,'operator-regalia',now,{ip:10,player:5,window:900_000}))noAccess(fail);
  const body=await bodyJSON(request);
  const normalize=value=>typeof value==='string'&&value.length<=1024?value.normalize('NFKC').trim():'';
  const candidate=normalize(body.code),configured=normalize(env.BK_OPERATOR_REGALIA_CODE);
  const matches=await equalSecret(candidate,configured||'unconfigured-regalia-reward');
  const receipt=async id=>{const row=await first(db,"SELECT result_json FROM bk_reward_claims WHERE player_id=? AND item_type='gift' AND item_id=?",player.id,id);return row?JSON.parse(row.result_json):null;};
  const upgrade=body.upgrade===true;
  const priorDeck=await first(db,"SELECT item_id,claimed_at FROM bk_reward_claims WHERE player_id=? AND item_type='gift' AND item_id IN (?,?,?) ORDER BY (item_id=?) DESC LIMIT 1",player.id,...OPERATOR_DECK_REWARD_IDS,OPERATOR_DECK_REWARD_ID);
  if(upgrade){if(!priorDeck)noAccess(fail);}else if(!configured||!candidate||!matches)noAccess(fail);
  check(integer(body.revision),fail,'invalid_revision');
  const replay=async()=>{
    const deckClaim=await receipt(OPERATOR_DECK_REWARD_ID);
    return deckClaim?{ok:true,save:await currentSave(db,player.id),claim:await receipt(REGALIA_REWARD_ID),deckClaim,deck:await unlockedOperatorDeck(db,player.id,deckClaim.claimedAt),replayed:true}:null;
  };
  const previous=await replay();if(previous)return previous;
  const legacyClaim=await receipt(REGALIA_REWARD_ID);
  const save=await currentSave(db,player.id);
  if(!save)fail(409,'cloud_save_required','先にこの端末のデータをクラウドに保存してください。',{save:null});
  if(save.revision!==body.revision){
    // Another device may have committed after the first ledger read.
    const raced=await replay();if(raced)return raced;
    fail(409,'save_conflict','別の端末で保存データが更新されています。最新データを確認してください。',{save});
  }
  const data=save.data,before=data.collection[REGALIA_CARD_ID]||0;
  // A legacy deck receipt also proves the original grant was already made.
  // Recipe upgrades fill only missing copies, even if its older pair receipt is absent.
  const grantOriginalPair=!legacyClaim&&!priorDeck;
  const received=grantOriginalPair?Math.min(2,MAX_CARD_COPIES-before):0,convertedTreasure=grantOriginalPair?(2-received)*EXTRA_COPY_TREASURE:0;
  check(integer(before,0,MAX_CARD_COPIES)&&integer(data.treasure+convertedTreasure),fail,'treasure_limit','秘宝の所持上限に達しています。');
  data.collection[REGALIA_CARD_ID]=before+received;data.treasure+=convertedTreasure;
  const claim=legacyClaim||{id:REGALIA_REWARD_ID,treasure:0,cards:received?[{cardId:REGALIA_CARD_ID,count:received}]:[],convertedTreasure,claimedAt:priorDeck?.claimed_at??now};
  const deckCards=[];
  for(const [cardId,required] of Object.entries(OPERATOR_DECK_REQUIRED)){
    const owned=data.collection[cardId]||0;
    check(integer(owned,0,MAX_CARD_COPIES)&&required<=MAX_CARD_COPIES,fail,'invalid_save');
    if(owned<required){deckCards.push({cardId,count:required-owned});data.collection[cardId]=required;}
  }
  const deckClaim={id:OPERATOR_DECK_REWARD_ID,deckId:OPERATOR_DECK.id,recipeRevision:OPERATOR_DECK.revision,cards:deckCards,claimedAt:now};
  const writeToken=uuid(),next=save.revision+1;check(integer(next,1),fail,'invalid_revision');
  const guard='EXISTS (SELECT 1 FROM bk_cloud_saves WHERE player_id=? AND write_token=?)';
  const result=await db.batch([
    statement(db,`UPDATE bk_cloud_saves SET revision=?,data_json=?,write_token=?,updated_at=? WHERE player_id=? AND revision=? AND NOT EXISTS (SELECT 1 FROM bk_reward_claims WHERE player_id=? AND item_type='gift' AND item_id=?) AND (SELECT count(*) FROM bk_reward_claims WHERE player_id=? AND item_type='gift' AND item_id=?)=? AND EXISTS (SELECT 1 FROM bk_operator WHERE singleton=1 AND player_id=?)`,next,JSON.stringify(data),writeToken,now,player.id,save.revision,player.id,OPERATOR_DECK_REWARD_ID,player.id,REGALIA_REWARD_ID,legacyClaim?1:0,player.id),
    ...(!legacyClaim?[
      statement(db,`INSERT INTO bk_operator_audit (id,player_id,action,payload_json,created_at) SELECT ?,?,'regalia.claimed',?,? WHERE ${guard}`,uuid(),player.id,JSON.stringify({id:REGALIA_REWARD_ID,cardId:REGALIA_CARD_ID,count:grantOriginalPair?2:0,reconciled:!!priorDeck}),now,player.id,writeToken),
      statement(db,`INSERT INTO bk_reward_claims (player_id,item_type,item_id,result_json,save_revision,claimed_at) SELECT ?,'gift',?,?,?,? WHERE ${guard}`,player.id,REGALIA_REWARD_ID,JSON.stringify(claim),next,now,player.id,writeToken),
    ]:[]),
    statement(db,`INSERT INTO bk_operator_audit (id,player_id,action,payload_json,created_at) SELECT ?,?,'operator.deck_unlocked',?,? WHERE ${guard}`,uuid(),player.id,JSON.stringify({id:OPERATOR_DECK_REWARD_ID,deckId:OPERATOR_DECK.id}),now,player.id,writeToken),
    statement(db,`INSERT INTO bk_reward_claims (player_id,item_type,item_id,result_json,save_revision,claimed_at) SELECT ?,'gift',?,?,?,? WHERE ${guard}`,player.id,OPERATOR_DECK_REWARD_ID,JSON.stringify(deckClaim),next,now,player.id,writeToken)
  ]);
  if(!changed(result[0])){
    await requireOperator(c,player);
    const again=await replay();if(again)return again;
    fail(409,'save_conflict','別の端末で保存データが更新されています。最新データを確認してください。',{save:await currentSave(db,player.id)});
  }
  return {ok:true,save:await currentSave(db,player.id),claim,deckClaim,deck:await unlockedOperatorDeck(db,player.id,now),upgraded:!!legacyClaim||!!priorDeck};
}
async function operatorWrite(c,player,kind){return writeOperatorContent(c,player,kind,{requireOperator,rateLimit,dashboard});}

function pageOptions(request,fail){
  const search=new URL(request.url).searchParams,page=Number(search.get('page')||0),pageSize=Number(search.get('pageSize')||100);
  check(integer(page,0,100000)&&integer(pageSize,1,100),fail,'invalid_page');return {page,pageSize,kind:search.get('kind')||''};
}
async function inbox(db,player,now,request,fail){
  const {page,pageSize,kind}=pageOptions(request,fail);check(['','message','gift'].includes(kind),fail,'invalid_kind');
  const join="FROM bk_announcements a LEFT JOIN bk_inbox_reads r ON r.item_id=a.id AND r.player_id=? LEFT JOIN bk_reward_claims c ON c.item_id=a.id AND c.item_type='gift' AND c.player_id=? WHERE (a.target_player IS NULL OR a.target_player=?) AND ((a.status='published' AND a.publish_at<=? AND (a.kind='gift' OR a.expires_at IS NULL OR a.expires_at>?)) OR r.read_at IS NOT NULL OR c.claimed_at IS NOT NULL)";
  const args=[player.id,player.id,player.id,now,now];
  const counts=await first(db,"SELECT sum(CASE WHEN a.kind='message' THEN 1 ELSE 0 END) AS messages,sum(CASE WHEN a.kind='gift' THEN 1 ELSE 0 END) AS gifts,sum(CASE WHEN a.kind='message' AND r.read_at IS NULL AND a.status='published' THEN 1 ELSE 0 END) AS unread,sum(CASE WHEN a.kind='gift' AND c.claimed_at IS NULL AND a.status='published' AND (a.expires_at IS NULL OR a.expires_at>?) THEN 1 ELSE 0 END) AS claimable "+join,now,...args);
  const rows=await all(db,'SELECT a.*,r.read_at,c.claimed_at,c.result_json '+join+(kind?' AND a.kind=?':'')+' ORDER BY a.publish_at DESC,a.created_at DESC,a.id DESC LIMIT ? OFFSET ?',...args,...(kind?[kind]:[]),pageSize,page*pageSize);
  return {ok:true,messages:rows.filter(r=>r.kind==='message').map(r=>announcementPublic(r,now)),gifts:rows.filter(r=>r.kind==='gift').map(r=>({...announcementPublic(r,now),claimable:r.claimed_at===null&&contentPhase(r,now)==='active',claim:r.result_json?JSON.parse(r.result_json):null})),counts:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,v||0])),pagination:{kind,page,pageSize,total:kind==='message'?counts.messages||0:kind==='gift'?counts.gifts||0:(counts.messages||0)+(counts.gifts||0)},serverTime:now};
}
async function eventList(db,player,now,request,fail){
  const {page,pageSize}=pageOptions(request,fail),join="FROM bk_events e LEFT JOIN bk_reward_claims c ON c.item_id=e.id AND c.item_type='event' AND c.player_id=? WHERE (e.target_player IS NULL OR e.target_player=?) AND ((e.status='published' AND e.end_at>?) OR c.claimed_at IS NOT NULL)",args=[player.id,player.id,now];
  const [count,rows]=await Promise.all([first(db,'SELECT count(*) AS n '+join,...args),all(db,'SELECT e.*,c.claimed_at,c.result_json '+join+' ORDER BY e.start_at DESC,e.id DESC LIMIT ? OFFSET ?',...args,pageSize,page*pageSize)]);
  return {ok:true,events:rows.map(r=>({...eventPublic(r,now),claimable:r.claimed_at===null&&contentPhase(r,now)==='active'&&(r.treasure>0||JSON.parse(r.cards_json).length>0),claim:r.result_json?JSON.parse(r.result_json):null})),pagination:{page,pageSize,total:count.n},serverTime:now};
}
async function inboxRead(c,player,id){
  const {db,now,fail}=c;
  await run(db,"INSERT OR IGNORE INTO bk_inbox_reads (player_id,item_id,read_at) SELECT ?,a.id,? FROM bk_announcements a WHERE a.id=? AND (a.target_player IS NULL OR a.target_player=?) AND a.status='published' AND a.publish_at<=? AND (a.kind='gift' OR a.expires_at IS NULL OR a.expires_at>?)",player.id,now,id,player.id,now,now);
  const row=await first(db,'SELECT read_at FROM bk_inbox_reads WHERE player_id=? AND item_id=?',player.id,id);
  if(!row)fail(404,'item_not_found','お知らせが見つかりません。');return {ok:true,id,readAt:row.read_at};
}
async function claimReward(c,player,kind,id){
  const {db,request,now,fail,bodyJSON}=c;
  if(!await rateLimit(db,request,player.id,'claim',now,{ip:120,player:60,window:60_000}))fail(429,'rate_limited','受け取りの操作が続いています。少し待ってください。');
  const body=await bodyJSON(request);check(integer(body.revision),fail,'invalid_revision');
  const item=kind==='gift'?await first(db,"SELECT * FROM bk_announcements WHERE id=? AND kind='gift' AND (target_player IS NULL OR target_player=?)",id,player.id):await first(db,'SELECT * FROM bk_events WHERE id=? AND (target_player IS NULL OR target_player=?)',id,player.id);
  if(!item)fail(404,'item_not_found','受け取り対象が見つかりません。');
  const replay=async()=>{const previous=await first(db,'SELECT result_json FROM bk_reward_claims WHERE player_id=? AND item_type=? AND item_id=?',player.id,kind,id);return previous?{ok:true,save:await currentSave(db,player.id),claim:JSON.parse(previous.result_json),replayed:true}:null;};
  const previous=await replay();if(previous)return previous;
  const available=contentPhase(item,now)==='active'&&(kind==='gift'||item.treasure>0||JSON.parse(item.cards_json).length>0);
  if(!available)fail(409,'reward_unavailable','この報酬は現在受け取れません。');
  const save=await currentSave(db,player.id);
  if(!save)fail(409,'cloud_save_required','先にこの端末のデータをクラウドに保存してください。',{save:null});
  if(save.revision!==body.revision){
    // A linked device can commit this same reward after the receipt read but
    // before the save read. Return its receipt instead of a false conflict.
    const raced=await replay();if(raced)return raced;
    fail(409,'save_conflict','別の端末で保存データが更新されています。最新データを確認してください。',{save});
  }
  const data=save.data,granted=[],cards=JSON.parse(item.cards_json);let convertedTreasure=0;
  for(const {cardId,count} of cards){const before=data.collection[cardId]||0,received=Math.max(0,Math.min(count,MAX_CARD_COPIES-before));data.collection[cardId]=before+received;if(received)granted.push({cardId,count:received});convertedTreasure+=(count-received)*EXTRA_COPY_TREASURE;}
  const treasure=item.treasure;check(integer(data.treasure+treasure+convertedTreasure),fail,'treasure_limit','秘宝の所持上限に達しています。');data.treasure+=treasure+convertedTreasure;
  const claim={id,treasure,cards:granted,convertedTreasure,claimedAt:now,contentRevision:item.revision},writeToken=uuid(),next=save.revision+1;
  check(integer(next,1),fail,'invalid_revision');
  // Eligibility is checked again in the same transaction as the save revision:
  // event edits/closure and another device's claim cannot race a stale read.
  const itemGuard=kind==='gift'?"EXISTS (SELECT 1 FROM bk_announcements WHERE id=? AND kind='gift' AND status='published' AND publish_at<=? AND (target_player IS NULL OR target_player=?) AND (expires_at IS NULL OR expires_at>?) AND revision=?)":"EXISTS (SELECT 1 FROM bk_events WHERE id=? AND status='published' AND (target_player IS NULL OR target_player=?) AND start_at<=? AND end_at>? AND revision=?)";
  const itemArgs=kind==='gift'?[id,now,player.id,now,item.revision]:[id,player.id,now,now,item.revision];
  const guard='EXISTS (SELECT 1 FROM bk_cloud_saves WHERE player_id=? AND write_token=?)';
  const statements=[statement(db,`UPDATE bk_cloud_saves SET revision=?,data_json=?,write_token=?,updated_at=? WHERE player_id=? AND revision=? AND NOT EXISTS (SELECT 1 FROM bk_reward_claims WHERE player_id=? AND item_type=? AND item_id=?) AND ${itemGuard}`,next,JSON.stringify(data),writeToken,now,player.id,save.revision,player.id,kind,id,...itemArgs),statement(db,`INSERT INTO bk_reward_claims (player_id,item_type,item_id,result_json,save_revision,claimed_at) SELECT ?,?,?,?,?,? WHERE ${guard}`,player.id,kind,id,JSON.stringify(claim),next,now,player.id,writeToken)];
  if(kind==='gift')statements.push(statement(db,`INSERT OR IGNORE INTO bk_inbox_reads (player_id,item_id,read_at) SELECT ?,?,? WHERE ${guard}`,player.id,id,now,player.id,writeToken));
  const result=await db.batch(statements);
  if(!changed(result[0])){const again=await replay();if(again)return again;fail(409,'save_conflict','保存データまたは配布内容が更新されました。最新情報を確認してください。',{save:await currentSave(db,player.id)});}
  return {ok:true,save:await currentSave(db,player.id),claim};
}

/** Returns null for existing matchmaking routes, otherwise the account payload. */

// Rebuild-only entitlement. Reuses existing operator audit table, so no destructive
// migration or change to the production save format is required. The grant is
// permanent for the verified operator account, not for the device or bearer.
const REBUILD_GRANT_ACTION='rebuild.regalia.granted';
async function rebuildEntitled(db,playerId){
  const row=await first(db,'SELECT a.id FROM bk_operator_audit a JOIN bk_operator o ON o.player_id=a.player_id WHERE o.singleton=1 AND a.player_id=? AND a.action=? LIMIT 1',playerId,REBUILD_GRANT_ACTION);
  return !!row;
}
// Access to the prebuilt deck requires entitlement, not possession of any normal card.
export async function assertRebuildDeckEntitlement({db,playerId,deckId,problem}){
  if(deckId===KIRAHARA_RECIPE.id&&!await rebuildEntitled(db,playerId))noAccess(problem);
  return true;
}
async function rebuildOperatorDeck(c,player){
  const {db,request,env,now,fail,bodyJSON,method}=c;
  await requireOperator(c,player);
  if(!['GET','POST'].includes(method))fail(405,'method_not_allowed','この操作は利用できません。');
  let granted=await rebuildEntitled(db,player.id);
  if(method==='POST'&&!granted){
    if(!await rateLimit(db,request,player.id,'rebuild-regalia',now,{ip:10,player:5,window:900_000}))noAccess(fail);
    const body=await bodyJSON(request);
    const configured=typeof env.BK_OPERATOR_REGALIA_CODE==='string'&&env.BK_OPERATOR_REGALIA_CODE.length>0;
    const candidate=typeof body.code==='string'&&body.code.length<=1024?body.code:'';
    const matches=await equalSecret(candidate,configured?env.BK_OPERATOR_REGALIA_CODE:'unconfigured-regalia');
    if(!configured||!candidate||!matches)noAccess(fail);
    // One INSERT statement with an existence predicate is atomic in SQLite/D1.
    // Repeat requests and concurrent devices cannot grant twice.
    await run(db,"INSERT INTO bk_operator_audit (id,player_id,action,payload_json,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM bk_operator WHERE singleton=1 AND player_id=?) AND NOT EXISTS (SELECT 1 FROM bk_operator_audit WHERE player_id=? AND action=?)",uuid(),player.id,REBUILD_GRANT_ACTION,'{}',now,player.id,player.id,REBUILD_GRANT_ACTION);
    granted=await rebuildEntitled(db,player.id);
    if(!granted)noAccess(fail);
  }
  return {ok:true,entitled:granted,...(granted?{deck:KIRAHARA_RECIPE,collection:requiredCards(),artwork:await privateRegaliaArt(db,player.id)}: {})};
}

// Rebuild is a separate, non-authoritative solo backup store. Nothing here writes
// legacy saves, inventory, profile names, ranked ratings, or operator grants.
async function rebuildBackupPublic(db,playerId){
 return savePublic(await first(db,'SELECT revision,data_json,updated_at FROM bk_rebuild_saves WHERE player_id=?',playerId));
}
async function rebuildSaveRoute(c,player){
 const {db,request,method,now,fail,bodyJSON}=c;
 const result=async extra=>({ok:true,accountId:player.id,save:await rebuildBackupPublic(db,player.id),...extra});
 if(method==='GET')return result({});
 if(method!=='POST')fail(405,'method_not_allowed','この操作は利用できません。');
 if(!await rateLimit(db,request,player.id,'rebuild-save',now,{ip:120,player:60,window:60000}))fail(429,'rate_limited','保存が続いています。少し待って再試行してください。');
 const body=await bodyJSON(request,MAX_REBUILD_BACKUP_BYTES+16384);
 check(plain(body)&&body.accountId===player.id&&integer(body.revision,0,Number.MAX_SAFE_INTEGER-1)&&identifier(body.mutationId),fail,'invalid_save','保存先のアカウントを確認してください。');
 let data;try{data=validateRebuildBackup(body.data)}catch{fail(400,'invalid_save','新生版の保存データを確認してください。')}
 if(data.suspendedMatch?.mode==='kirahara'){
  await assertRebuildDeckEntitlement({db,playerId:player.id,deckId:'kirahara',problem:fail});
  check(verifyOperatorSnapshot(data.suspendedMatch,{entitled:true,deck:KIRAHARA_RECIPE}),fail,'invalid_save','運営デッキの対戦状態を確認してください。');
 }
 const requestHash=await hash(canonical({revision:body.revision,data})),next=body.revision+1,writeToken=uuid(),encoded=JSON.stringify(data);
 const replay=async()=>{
  const old=await first(db,'SELECT request_hash,revision FROM bk_rebuild_save_mutations WHERE player_id=? AND mutation_id=?',player.id,body.mutationId);
  if(!old)return null;
  if(old.request_hash!==requestHash)fail(409,'mutation_id_reused','同じ保存番号を異なるデータに使用できません。');
  return result({replayed:true,appliedRevision:old.revision});
 };
 const prior=await replay();if(prior)return prior;
 const guard='EXISTS (SELECT 1 FROM bk_rebuild_saves WHERE player_id=? AND write_token=?)';
 const changes=await db.batch([
  statement(db,'INSERT INTO bk_rebuild_saves (player_id,revision,data_json,write_token,updated_at) SELECT ?,1,?,?,? WHERE ?=0 AND NOT EXISTS (SELECT 1 FROM bk_rebuild_saves WHERE player_id=?) AND NOT EXISTS (SELECT 1 FROM bk_rebuild_save_mutations WHERE player_id=? AND mutation_id=?)',player.id,encoded,writeToken,now,body.revision,player.id,player.id,body.mutationId),
  statement(db,'UPDATE bk_rebuild_saves SET revision=?,data_json=?,write_token=?,updated_at=? WHERE player_id=? AND revision=? AND ?>0 AND NOT EXISTS (SELECT 1 FROM bk_rebuild_save_mutations WHERE player_id=? AND mutation_id=?)',next,encoded,writeToken,now,player.id,body.revision,body.revision,player.id,body.mutationId),
  statement(db,'INSERT INTO bk_rebuild_save_mutations (player_id,mutation_id,request_hash,revision,created_at) SELECT ?,?,?,?,? WHERE '+guard,player.id,body.mutationId,requestHash,next,now,player.id,writeToken)
 ]);
 if(!changed(changes[0])&&!changed(changes[1])){const again=await replay();if(again)return again;fail(409,'save_conflict','別の端末で更新されています。保存先を再確認してください。');}
 return result({appliedRevision:next});
}

export async function handleAccountRoute(options){
  const c={...options,fail:options.problem}, {path,method,db,now,fail}=c;
  const paths=["/api/rebuild/status","/api/rebuild/cloud-save","/api/rebuild/operator-deck","/api/public-status","/api/cloud-save","/api/account/link-code","/api/account/link-claim","/api/account/sessions","/api/operator","/api/operator/activate","/api/operator/settings","/api/operator/messages","/api/operator/gifts","/api/operator/events","/api/operator/notices","/api/operator/records","/api/inbox","/api/events","/api/presence","/api/operator/deck","/api/operator/regalia/claim","/api/operator/artwork"];
  const sessionPath=path.match(/^\/api\/account\/sessions\/([A-Za-z0-9_-]{8,100})$/),inboxPath=path.match(/^\/api\/inbox\/([A-Za-z0-9_-]{8,100})\/(read|claim)$/),eventPath=path.match(/^\/api\/events\/([A-Za-z0-9_-]{8,100})\/claim$/);
  if(!paths.includes(path)&&!sessionPath&&!inboxPath&&!eventPath)return null;
  const expect=verb=>{if(method!==verb)fail(405,'method_not_allowed','この操作は利用できません。');};
  if(path==='/api/public-status'){expect('GET');return operatorPublicStatus(db,now);}
  if(path==='/api/account/link-claim'){expect('POST');return linkClaim(c);}
  if(path==='/api/rebuild/status'){expect('GET');await first(db,'SELECT revision FROM bk_rebuild_saves LIMIT 1');await first(db,'SELECT revision FROM bk_rebuild_save_mutations LIMIT 1');return {ok:true,cloudSaveVersion:1};}
  const player=await authenticateAccount(db,c.request,now,fail);
  if(path==='/api/rebuild/operator-deck')return rebuildOperatorDeck(c,player);
  if(path==='/api/rebuild/cloud-save')return rebuildSaveRoute(c,player);
  if(path==='/api/presence'){expect('POST');return presence(c,player);}
  if(path==='/api/cloud-save')return saveRoute(c,player);
  if(path==='/api/account/link-code'){expect('POST');return linkCreate(c,player);}
  if(path==='/api/account/sessions'||sessionPath)return sessions(c,player,sessionPath?.[1]);
  if(path==='/api/operator'){expect('GET');await requireOperator(c,player,{setup:true});return dashboard(db,now);}
  if(path==='/api/operator/records'){expect('GET');await requireOperator(c,player);const q=new URL(c.request.url).searchParams;return operatorRecords(db,now,{kind:q.get('kind')||'message',page:Number(q.get('page')||0),pageSize:Number(q.get('pageSize')||6),query:q.get('query')||'',itemId:q.get('itemId')||'',itemType:q.get('itemType')||'gift'},fail);}
  if(path==='/api/operator/deck'){expect('GET');return readOperatorDeck(c,player);}
  if(path==='/api/operator/artwork'){expect('POST');return replacePrivateRegaliaArtwork(c,player);}
  if(path==='/api/operator/activate'){expect('POST');return activate(c,player);}
  if(path==='/api/operator/regalia/claim'){expect('POST');return claimRegalia(c,player);}
  for(const [suffix,kind] of [['settings','settings'],['messages','message'],['gifts','gift'],['events','event'],['notices','notice']])if(path==='/api/operator/'+suffix){expect('POST');return operatorWrite(c,player,kind);}
  if(path==='/api/inbox'){expect('GET');return inbox(db,player,now,c.request,fail);}
  if(path==='/api/events'){expect('GET');return eventList(db,player,now,c.request,fail);}
  if(inboxPath){expect('POST');return inboxPath[2]==='read'?inboxRead(c,player,inboxPath[1]):claimReward(c,player,'gift',inboxPath[1]);}
  if(eventPath){expect('POST');return claimReward(c,player,'event',eventPath[1]);}
  return null;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createOnlineWorker} from '../server/worker.js';
import {STARTER_DECKS,getCard} from '../catalog.js';
import {newGame} from '../engine.js';
import {createStarterCollection} from '../shop.js';
import {createCampaignProgress} from '../campaign.js';
import {initialProfile,STARTERS,purchase} from '../rebuild/profile.js';

const BASE='https://beast-king.hisa-0128-1996.chatgpt.site';
const schema=readFileSync(new URL('../server/schema.sql',import.meta.url),'utf8');
// This value is a test fixture only. Production's environment secret is never read.
const FIXTURE_SECRET='fixture-operator-bootstrap-only';
class Statement{
  constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}
  bind(...args){return new Statement(this.db,this.sql,args);}
  execute(){const results=this.db.sqlite.prepare(this.sql).all(...this.args).map(row=>({...row}));return {success:true,results,meta:{changes:Number(this.db.sqlite.prepare('SELECT changes() AS n').get().n)}};}
  async first(column){const row=this.execute().results[0]??null;return column===undefined?row:row?.[column]??null;}
  async all(){return this.execute();}
  async run(){return this.execute();}
}
class D1{
  constructor(sqlite){this.sqlite=sqlite;}
  prepare(sql){return new Statement(this,sql);}
  async batch(statements){this.sqlite.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>s.execute());this.sqlite.exec('COMMIT');return result;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}
  withSession(){return this;}
  exec(){throw Error('No request-time migrations');}
}
function fixture(t,{secret=FIXTURE_SECRET}={}){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(schema);t.after(()=>sqlite.close());
  let time=1_800_000_000_000,worker=createOnlineWorker({now:()=>time}),sequence=0;
  const env={DB:new D1(sqlite),...(secret===undefined?{}:{BK_OPERATOR_BOOTSTRAP:secret})};
  async function api(method,path,token,body,{ip='192.0.2.10',raw=false}={}){
    const headers={Origin:'https://www.beast-king.com','CF-Connecting-IP':ip};if(token)headers.Authorization='Bearer '+token;if(body!==undefined)headers['Content-Type']='application/json';
    const response=await worker.fetch(new Request(BASE+path,{method,headers,...(body===undefined?{}:{body:raw?body:JSON.stringify(body)})}),env,{});
    return {status:response.status,data:await response.json()};
  }
  async function profile(name='旅する王'){const r=await api('POST','/api/profile',null,{nickname:name});assert.equal(r.status,200);return {...r.data.profile,token:r.data.token};}
  async function operator(){const p=await profile('運営用テスト');const r=await api('POST','/api/operator/activate',p.token,{code:FIXTURE_SECRET});assert.equal(r.status,200,JSON.stringify(r.data));return p;}
  async function link(p,name='新しい端末'){const r=await api('POST','/api/account/link-code',p.token,{});assert.equal(r.status,200);const joined=await api('POST','/api/account/link-claim',null,{code:r.data.link.code,deviceName:name});assert.equal(joined.status,200,JSON.stringify(joined.data));return joined.data;}
  const mutation=()=>`account-test-${++sequence}`;
  async function save(p,data=saveData(p),revision=0,id=mutation()){return api('POST','/api/cloud-save',p.token,{revision,data,mutationId:id});}
  async function send(p,kind,body){return api('POST','/api/operator/'+kind,p.token,{mutationId:mutation(),...body});}
  return {sqlite,env,api,profile,operator,link,mutation,save,send,now:()=>time,advance:ms=>{time+=ms;},reconnect:()=>{worker=createOnlineWorker({now:()=>time});}};
}
function saveData(p={nickname:'旅する王',origin:'mountain'}){
  const starter=STARTER_DECKS[0];return {version:6,playerName:p.nickname,profileOrigin:p.origin,campaignProgress:createCampaignProgress(),bgm:true,bgmVolume:.5,sound:false,motion:true,treasure:100,collection:createStarterCollection(),rewardedMatches:[],lastPack:null,deckName:starter.name,deckIds:[...starter.ids],specialIds:[...starter.specialIds],starter:starter.id,draft:null,stats:{played:0,won:0,drawn:0},game:null};
}
const deck=()=>({deck:[...STARTER_DECKS[0].ids],special:[...STARTER_DECKS[0].specialIds]});
const privateFields=['token','token_hash','tokenHash','_sessionId','role','operator'];
function publicProfile(p){for(const key of privateFields)assert.equal(p[key],undefined);}

test('King origin follows cloud saves and linked devices and remains correct in operator lists',async t=>{
  const f=fixture(t),p=await f.profile('王の保存テスト'),operator=await f.operator();
  const value=saveData(p);value.profileOrigin='king';
  const saved=await f.save(p,value);assert.equal(saved.status,200);assert.equal(saved.data.profile.origin,'king');
  const linked=await f.link(p);assert.equal(linked.profile.origin,'king');assert.equal(linked.save.data.profileOrigin,'king');
  const restored=await f.api('GET','/api/cloud-save',linked.token);assert.equal(restored.data.profile.origin,'king');assert.equal(restored.data.save.data.profileOrigin,'king');
  const dashboard=await f.api('GET','/api/operator',operator.token);assert.equal(dashboard.data.operator.recentPlayers.find(row=>row.id===p.id).origin,'king');
  const reverted={...value,profileOrigin:'river'};assert.equal((await f.save(p,reverted,1)).data.profile.origin,'river');
  assert.equal((await f.api('GET','/api/profile',linked.token)).data.profile.origin,'river');
  const created=await f.api('POST','/api/profile',null,{nickname:'新規の王',origin:'king'});assert.equal(created.status,200);assert.equal(created.data.profile.origin,'king');
});

test('the additive account migration preserves pre-existing profiles and creates no default operator',t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec(readFileSync(new URL('../drizzle/0000_beast_king_online.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../drizzle/0001_profile_origin.sql',import.meta.url),'utf8'));
  db.prepare('INSERT INTO bk_profiles (id,token_hash,nickname,rating,created_at,updated_at) VALUES (?,?,?,?,?,?)').run('existing','hash-before','以前の王',1300,1,1);
  db.exec(readFileSync(new URL('../drizzle/0002_accounts_and_operator.sql',import.meta.url),'utf8'));
  const old=db.prepare('SELECT * FROM bk_profiles WHERE id=?').get('existing');assert.equal(old.nickname,'以前の王');assert.equal(old.rating,1300);assert.equal(old.token_hash,'hash-before');
  assert.equal(db.prepare('SELECT count(*) AS n FROM bk_operator').get().n,0);assert.equal(db.prepare('SELECT count(*) AS n FROM bk_sessions').get().n,0);
});

test('one-time device linking issues a separate bearer for the same player and keeps the original usable',async t=>{
  const f=fixture(t),p=await f.profile(),issued=await f.api('POST','/api/account/link-code',p.token,{}),code=issued.data.link.code;
  assert.match(code,/^[A-Za-z0-9_-]{43}$/);assert.equal(Buffer.from(code,'base64url').length,32);assert.equal(issued.data.link.expiresAt,f.now()+600_000);
  const linked=await f.api('POST','/api/account/link-claim',null,{code,deviceName:'タブレット'});assert.equal(linked.status,200);assert.notEqual(linked.data.token,p.token);assert.equal(linked.data.profile.id,p.id);publicProfile(linked.data.profile);
  f.reconnect();for(const token of [p.token,linked.data.token])assert.equal((await f.api('GET','/api/profile',token)).data.profile.id,p.id);
  const repeated=await f.api('POST','/api/account/link-claim',null,{code});assert.equal(repeated.status,400);
  const sessions=(await f.api('GET','/api/account/sessions',linked.data.token)).data.sessions;assert.equal(sessions.length,2);assert.equal(sessions.filter(s=>s.isCurrent).length,1);assert.equal(sessions.find(s=>s.isCurrent).label,'タブレット');
  const stored=JSON.stringify(f.sqlite.prepare('SELECT * FROM bk_sessions').all());for(const secret of [p.token,linked.data.token,code])assert.equal(stored.includes(secret),false);
  assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM bk_link_codes').all()).includes(code),false);
  assert.equal(JSON.stringify(sessions).includes('token'),false);
});

test('link codes expire at ten minutes, replace earlier codes, and cannot be claimed concurrently twice',async t=>{
  const f=fixture(t),p=await f.profile();
  const a=(await f.api('POST','/api/account/link-code',p.token,{})).data.link.code,b=(await f.api('POST','/api/account/link-code',p.token,{})).data.link.code;
  assert.equal((await f.api('POST','/api/account/link-claim',null,{code:a})).status,400);
  f.advance(600_000);assert.equal((await f.api('POST','/api/account/link-claim',null,{code:b})).status,400);
  const c=(await f.api('POST','/api/account/link-code',p.token,{})).data.link.code;
  const responses=await Promise.all([f.api('POST','/api/account/link-claim',null,{code:c}),f.api('POST','/api/account/link-claim',null,{code:c})]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,400]);assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM bk_sessions WHERE kind='linked'").get().n,1);
});

test('session revocation is scoped to its owner and cannot be bypassed by the legacy token fallback',async t=>{
  const f=fixture(t),p=await f.profile(),stranger=await f.profile('別の王'),linked=await f.link(p);
  assert.equal((await f.api('DELETE','/api/account/sessions/'+linked.sessionId,stranger.token)).status,404);
  const original=(await f.api('GET','/api/account/sessions',p.token)).data.sessions.find(s=>s.isCurrent);
  const revoked=await f.api('DELETE','/api/account/sessions/'+original.id,linked.token);assert.equal(revoked.status,200);assert.equal(revoked.data.currentRevoked,false);
  assert.equal((await f.api('GET','/api/profile',p.token)).status,401);assert.equal((await f.api('GET','/api/profile',linked.token)).status,200);
  const self=await f.api('DELETE','/api/account/sessions/'+linked.sessionId,linked.token);assert.equal(self.data.currentRevoked,true);assert.equal((await f.api('GET','/api/cloud-save',linked.token)).status,401);
});

test('cloud saves preserve validated CPU and campaign data while stripping credentials, roles and other unlisted fields',async t=>{
  const f=fixture(t),p=await f.profile(),data=saveData(p);data.playerName='別端末の名前';data.profileOrigin='flower';data.game=newGame({seed:123});data.game.players[0].name=data.playerName;data.game.statsRecorded=false;
  data.game.players[0].token='must-not-persist';data.game.log[0].secret='must-not-persist';data.game.role='operator';data.token='must-not-persist';data.rating=99999;data.admin=true;data.online={token:'must-not-persist'};
  const created=await f.save(p,data);assert.equal(created.status,200,JSON.stringify(created.data));assert.equal(created.data.save.revision,1);assert.equal(created.data.profile.nickname,'別端末の名前');assert.equal(created.data.profile.origin,'flower');publicProfile(created.data.profile);
  const saved=created.data.save.data;assert.equal(saved.game.players[0].deck.length,28);assert.equal(saved.game.seed,data.game.seed);assert.equal(saved.game.statsRecorded,false);assert.equal(saved.game.log[0].turn,1);
  for(const key of ['token','rating','admin','online'])assert.equal(saved[key],undefined);assert.equal(JSON.stringify(saved).includes('must-not-persist'),false);assert.equal(saved.game.role,undefined);
  const linked=await f.link(p),restored=await f.api('GET','/api/cloud-save',linked.token);assert.deepEqual(restored.data.save,created.data.save);assert.equal(restored.data.profile.nickname,'別端末の名前');
});

test('invalid decks, copies, quantities, oversized content and redacted online games cannot become cloud saves',async t=>{
  const f=fixture(t),p=await f.profile();
  const bad=[];
  for(const alter of [d=>d.deckIds.pop(),d=>d.specialIds.pop(),d=>d.collection.B0001=4,d=>d.collection.UNKNOWN=1,d=>d.treasure=Number.MAX_SAFE_INTEGER+1,d=>d.stats.won=1,d=>d.playerName={normalize:'bad'},d=>d.bgmVolume=2,d=>d.profileOrigin='unknown',d=>{d.game=newGame({seed:1});d.game.players[1].hand=[null,null,null,null];},d=>{d.game=newGame({seed:1});d.game.players[0].grave.push('B0001');}]){const d=saveData(p);alter(d);bad.push(d);}
  for(const data of bad){const r=await f.save(p,data);assert.equal(r.status,400,JSON.stringify(r.data));}
  const large=await f.api('POST','/api/cloud-save',p.token,{revision:0,mutationId:f.mutation(),data:{...saveData(p),unlisted:'x'.repeat(1_020_000)}});assert.equal(large.status,413);
  assert.equal((await f.api('GET','/api/cloud-save',p.token)).data.save,null);
});

test('cloud CAS rejects stale writes without changing the profile and replays identical mutations exactly once',async t=>{
  const f=fixture(t),p=await f.profile(),linked=await f.link(p),data=saveData(p),id=f.mutation();
  const duplicates=await Promise.all([f.save(p,data,0,id),f.api('POST','/api/cloud-save',linked.token,{revision:0,data,mutationId:id})]);
  assert.ok(duplicates.every(r=>r.status===200));assert.ok(duplicates.some(r=>r.data.replayed));assert.equal((await f.api('GET','/api/cloud-save',p.token)).data.save.revision,1);
  const left={...data,playerName:'左端末'},right={...data,playerName:'右端末'};
  const races=await Promise.all([f.save(p,left,1),f.api('POST','/api/cloud-save',linked.token,{revision:1,data:right,mutationId:f.mutation()})]);
  assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);const current=(await f.api('GET','/api/cloud-save',p.token)).data;
  assert.equal(current.save.revision,2);assert.equal(current.profile.nickname,current.save.data.playerName);
  const failed=races.find(r=>r.status===409);assert.equal(failed.data.code,'save_conflict');assert.equal(failed.data.save.revision,2);
  const replay=await f.save(p,data,0,id);assert.equal(replay.status,200);assert.equal(replay.data.appliedRevision,1);assert.equal(replay.data.save.revision,2);
  assert.equal((await f.save(p,{...data,treasure:1234},0,id)).data.code,'mutation_id_reused');
  const stranger=await f.profile('別アカウント');assert.equal((await f.api('GET','/api/cloud-save',stranger.token)).data.save,null);assert.equal((await f.api('GET','/api/profile',stranger.token)).data.profile.nickname,'別アカウント');
});

test('cloud main, special and draft decks permit two copies while three owned cards remain valid inventory',async t=>{
  const f=fixture(t),p=await f.profile(),data=saveData(p),duplicate=data.deckIds[0];
  data.collection[duplicate]=3;data.collection.F0001=3;data.collection.F0002=3;
  data.specialIds=['F0001','F0001','F0002','F0002'];data.draft={name:'2枚ずつの編集中デッキ',ids:[duplicate,duplicate],specialIds:['F0001','F0001']};
  const valid=await f.save(p,data);assert.equal(valid.status,200,JSON.stringify(valid.data));assert.equal(valid.data.save.data.collection[duplicate],3);assert.equal(valid.data.save.data.collection.F0001,3);
  for(const alter of [d=>{d.deckIds[d.deckIds.findIndex(id=>id!==duplicate)]=duplicate;},d=>{d.specialIds=['F0001','F0001','F0001','F0002'];},d=>{d.draft.ids.push(duplicate);},d=>{d.draft.specialIds.push('F0001');}]){
    const invalid=structuredClone(data);alter(invalid);const response=await f.save(p,invalid,1);assert.equal(response.status,400,JSON.stringify(response.data));
  }
  assert.equal((await f.api('GET','/api/cloud-save',p.token)).data.save.revision,1);
});

test('operator activation fails closed without a secret and never adds role flags to public profiles',async t=>{
  const f=fixture(t,{secret:''}),p=await f.profile();
  const get=await f.api('GET','/api/operator',p.token),post=await f.api('POST','/api/operator/activate',p.token,{code:FIXTURE_SECRET});
  assert.equal(get.status,404);assert.equal(post.status,404);assert.equal(get.data.setupAvailable,undefined);assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_operator').get().n,0);
  publicProfile((await f.api('GET','/api/profile',p.token)).data.profile);
});

test('only the first valid bootstrap succeeds, and the operator role follows linked devices but is never public',async t=>{
  const f=fixture(t),a=await f.profile('最初の王'),b=await f.profile('次の王');
  assert.equal((await f.api('GET','/api/operator',a.token)).data.setupAvailable,true);
  const wrong=await f.api('POST','/api/operator/activate',a.token,{code:'incorrect-fixture'});assert.equal(wrong.status,404);assert.equal(wrong.data.setupAvailable,undefined);
  const results=await Promise.all([f.api('POST','/api/operator/activate',a.token,{code:FIXTURE_SECRET}),f.api('POST','/api/operator/activate',b.token,{code:FIXTURE_SECRET})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,404]);const winner=results[0].status===200?a:b,other=winner===a?b:a;
  const linked=await f.link(winner);assert.equal((await f.api('GET','/api/operator',linked.token)).status,200);assert.equal((await f.api('GET','/api/operator',other.token)).data.setupAvailable,undefined);
  assert.equal((await f.api('POST','/api/operator/activate',winner.token,{code:FIXTURE_SECRET})).status,404);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_operator').get().n,1);assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM bk_operator_audit WHERE action='operator.activated'").get().n,1);
  for(const person of [winner,other])publicProfile((await f.api('GET','/api/profile',person.token)).data.profile);
  for(const table of ['bk_operator','bk_operator_audit','bk_account_limits'])assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM '+table).all()).includes(FIXTURE_SECRET),false);
});

test('operator attempts are rate limited by player across IPs and by IP across players',async t=>{
  const f=fixture(t),p=await f.profile();
  for(let i=0;i<5;i++)assert.equal((await f.api('POST','/api/operator/activate',p.token,{code:'wrong'},{ip:'192.0.2.'+(20+i)})).status,404);
  assert.equal((await f.api('POST','/api/operator/activate',p.token,{code:FIXTURE_SECRET},{ip:'192.0.2.99'})).status,404);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_operator').get().n,0);
  for(let i=0;i<10;i++){const q=await f.profile('別の試行者');assert.equal((await f.api('POST','/api/operator/activate',q.token,{code:'wrong'},{ip:'192.0.2.200'})).status,404);}
  const final=await f.profile('最後の試行者');assert.equal((await f.api('POST','/api/operator/activate',final.token,{code:FIXTURE_SECRET},{ip:'192.0.2.200'})).status,404);
  assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM bk_account_limits').all()).includes('192.0.2.'),false);
  f.advance(900_000);assert.equal((await f.api('POST','/api/operator/activate',p.token,{code:FIXTURE_SECRET},{ip:'192.0.2.99'})).status,200);
});

test('maintenance blocks only new matchmaking, preserves existing matches, and audits protected settings',async t=>{
  const f=fixture(t),operator=await f.operator(),host=await f.profile('部屋主'),guest=await f.profile('参加者'),later=await f.profile('待機者');
  const room=(await f.api('POST','/api/rooms',host.token,deck())).data.room;
  const match=(await f.api('POST','/api/rooms/'+room.code+'/join',guest.token,deck())).data.match;
  const waiting=(await f.api('POST','/api/rooms',later.token,deck())).data.room;
  assert.equal((await f.api('POST','/api/operator/settings',guest.token,{notice:'不正変更',maintenance:true})).status,404);
  const set=await f.send(operator,'settings',{notice:'調整中です',maintenance:true});assert.equal(set.status,200);assert.ok(set.data.operator.audit.some(x=>x.action==='settings.updated'));
  assert.deepEqual((await f.api('GET','/api/public-status')).data,{ok:true,notice:'調整中です',maintenance:true});
  for(const path of ['/api/queue','/api/rooms','/api/rooms/'+waiting.code+'/join'])assert.equal((await f.api('POST',path,guest.token,deck())).data.code,'maintenance');
  const action=await f.api('POST','/api/matches/'+match.id+'/actions',host.token,{actionId:f.mutation(),revision:0,kind:'endTurn'});assert.equal(action.status,200,JSON.stringify(action.data));
  assert.equal((await f.api('GET','/api/matches/'+match.id,guest.token)).status,200);
});

test('system messages respect recipients and mark read per account across devices',async t=>{
  const f=fixture(t),operator=await f.operator(),p=await f.profile(),stranger=await f.profile('他の王'),linked=await f.link(p);
  const direct=await f.send(operator,'messages',{title:'個別のお知らせ',body:'本文\n二行目',target:p.id});assert.equal(direct.status,200);
  const global=await f.send(operator,'messages',{title:'全員へのお知らせ',body:'本文',target:'all'});assert.equal(global.status,200);
  const own=(await f.api('GET','/api/inbox',p.token)).data;assert.equal(own.messages.length,2);assert.equal(own.gifts.length,0);
  const other=(await f.api('GET','/api/inbox',stranger.token)).data;assert.equal(other.messages.length,1);assert.equal(other.messages[0].id,global.data.createdId);
  assert.equal((await f.api('POST','/api/inbox/'+direct.data.createdId+'/read',stranger.token,{})).status,404);
  const marked=await f.api('POST','/api/inbox/'+direct.data.createdId+'/read',linked.token,{});assert.equal(marked.status,200);
  assert.equal((await f.api('GET','/api/inbox',p.token)).data.messages.find(x=>x.id===direct.data.createdId).readAt,f.now());
});

test('operator mutations are idempotent under concurrent and lost-response retries',async t=>{
  const f=fixture(t),operator=await f.operator(),mutationId=f.mutation();
  const body={mutationId,title:'一度だけの配布',body:'配布文',target:'all',treasure:10,cards:[],expiresAt:f.now()+100};
  const pair=await Promise.all([f.api('POST','/api/operator/gifts',operator.token,body),f.api('POST','/api/operator/gifts',operator.token,body)]);
  assert.ok(pair.every(x=>x.status===200),JSON.stringify(pair));assert.equal(pair[0].data.createdId,pair[1].data.createdId);assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM bk_announcements WHERE kind='gift'").get().n,1);
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM bk_operator_audit WHERE action='gift.sent'").get().n,1);
  f.advance(101);assert.equal((await f.api('POST','/api/operator/gifts',operator.token,body)).data.replayed,true);
  assert.equal((await f.api('POST','/api/operator/gifts',operator.token,{...body,treasure:99})).status,409);
});

test('gift claims atomically update cloud inventory, convert extra copies and apply once per account across devices',async t=>{
  const f=fixture(t),operator=await f.operator(),p=await f.profile(),q=await f.profile('もう一人'),linked=await f.link(p),data=saveData(p);data.collection.B0001=3;
  assert.equal((await f.save(p,data)).status,200);assert.equal((await f.save(q)).status,200);
  const gift=await f.send(operator,'gifts',{title:'全員への贈り物',body:'秘宝とカード',target:'all',treasure:100,cards:[{cardId:'B0001',count:3}]});assert.equal(gift.status,200);const id=gift.data.createdId;
  const responses=await Promise.all([f.api('POST','/api/inbox/'+id+'/claim',p.token,{revision:1,treasure:99999}),f.api('POST','/api/inbox/'+id+'/claim',linked.token,{revision:1})]);
  assert.ok(responses.every(x=>x.status===200),JSON.stringify(responses));assert.ok(responses.some(x=>x.data.replayed));
  for(const r of responses){assert.equal(r.data.save.revision,2);assert.equal(r.data.save.data.treasure,215);assert.equal(r.data.save.data.collection.B0001,3);assert.equal(r.data.claim.treasure,100);assert.equal(r.data.claim.convertedTreasure,15);assert.deepEqual(r.data.claim.cards,[]);}
  const again=await f.api('POST','/api/inbox/'+id+'/claim',p.token,{revision:1});assert.equal(again.data.replayed,true);assert.equal(again.data.save.revision,2);
  assert.equal((await f.api('POST','/api/inbox/'+id+'/claim',q.token,{revision:1})).status,200);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_reward_claims WHERE item_id=?').get(id).n,2);
  const inbox=(await f.api('GET','/api/inbox',p.token)).data.gifts[0];assert.equal(inbox.claimable,false);assert.equal(inbox.claimedAt,f.now());assert.equal(inbox.readAt,f.now());
});

test('claims reject missing cloud data, stale revisions, expired gifts and another account recipient without partial rewards',async t=>{
  const f=fixture(t),operator=await f.operator(),p=await f.profile(),q=await f.profile('別人');
  const gift=await f.send(operator,'gifts',{title:'個別',body:'',target:p.id,treasure:10,cards:[],expiresAt:f.now()+500});const id=gift.data.createdId;
  assert.equal((await f.api('POST','/api/inbox/'+id+'/claim',q.token,{revision:0})).status,404);
  assert.equal((await f.api('POST','/api/inbox/'+id+'/claim',p.token,{revision:0})).data.code,'cloud_save_required');
  await f.save(p);assert.equal((await f.api('POST','/api/inbox/'+id+'/claim',p.token,{revision:0})).data.code,'save_conflict');
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_reward_claims').get().n,0);
  f.advance(500);assert.equal((await f.api('POST','/api/inbox/'+id+'/claim',p.token,{revision:1})).data.code,'reward_unavailable');
  assert.equal((await f.api('GET','/api/cloud-save',p.token)).data.save.data.treasure,100);assert.equal((await f.api('GET','/api/inbox',p.token)).data.gifts[0].claimable,false);
});

test('a concurrent device save and gift claim cannot overwrite each other or consume a failed claim',async t=>{
  const f=fixture(t),operator=await f.operator(),p=await f.profile();await f.save(p);
  const gift=await f.send(operator,'gifts',{title:'競合配布',body:'',target:'all',treasure:10,cards:[]});const id=gift.data.createdId;
  const results=await Promise.all([f.save(p,{...saveData(p),treasure:777},1),f.api('POST','/api/inbox/'+id+'/claim',p.token,{revision:1})]);
  assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);const latest=(await f.api('GET','/api/cloud-save',p.token)).data.save;assert.equal(latest.revision,2);
  if(results[1].status===409){assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_reward_claims').get().n,0);const retry=await f.api('POST','/api/inbox/'+id+'/claim',p.token,{revision:2});assert.equal(retry.data.save.data.treasure,787);}else assert.equal(latest.data.treasure,110);
});

test('published events list current and upcoming entries, honor exact time boundaries and reward each account once',async t=>{
  const f=fixture(t),operator=await f.operator(),p=await f.profile(),q=await f.profile('遅い参加者');await f.save(p);await f.save(q);
  const startAt=f.now()+100,endAt=f.now()+1000;
  const base={title:'期間限定イベント',body:'参加で秘宝',startAt,endAt,status:'draft',treasure:50,cards:[]};
  const created=await f.send(operator,'events',base);assert.equal(created.status,200);const id=created.data.createdId;
  assert.equal((await f.api('GET','/api/events',p.token)).data.events.length,0);assert.equal((await f.api('POST','/api/events/'+id+'/claim',p.token,{revision:1})).status,409);
  const published=await f.send(operator,'events',{...base,id,status:'published'});assert.equal(published.status,200);
  const upcoming=(await f.api('GET','/api/events',p.token)).data.events;assert.equal(upcoming.length,1);assert.equal(upcoming[0].claimable,false);
  f.advance(100);const claim=await f.api('POST','/api/events/'+id+'/claim',p.token,{revision:1});assert.equal(claim.status,200);assert.equal(claim.data.save.data.treasure,150);
  assert.equal((await f.api('GET','/api/events',p.token)).data.events[0].claimable,false);
  f.advance(900);assert.equal((await f.api('GET','/api/events',q.token)).data.events.length,0);assert.equal((await f.api('POST','/api/events/'+id+'/claim',q.token,{revision:1})).data.code,'reward_unavailable');
  assert.equal((await f.api('POST','/api/events/'+id+'/claim',p.token,{revision:1})).data.replayed,true);
});

test('an operator closing an event during claim preparation prevents stale reward delivery',async t=>{
  const f=fixture(t),operator=await f.operator(),p=await f.profile();await f.save(p);
  const event={title:'終了間際',body:'',startAt:f.now()-1,endAt:f.now()+1000,status:'published',treasure:50,cards:[]};const id=(await f.send(operator,'events',event)).data.createdId;
  const original=f.env.DB.batch.bind(f.env.DB);let intercepted=false;
  f.env.DB.batch=async statements=>{if(!intercepted&&statements.some(s=>s.sql.startsWith('UPDATE bk_cloud_saves')&&s.sql.includes('bk_reward_claims'))){intercepted=true;const closed=await f.send(operator,'events',{...event,id,status:'ended'});assert.equal(closed.status,200);}return original(statements);};
  const claim=await f.api('POST','/api/events/'+id+'/claim',p.token,{revision:1});assert.equal(claim.status,409);assert.equal(intercepted,true);assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_reward_claims').get().n,0);assert.equal((await f.api('GET','/api/cloud-save',p.token)).data.save.data.treasure,100);
});

test('operator content and reward validation rejects unknown cards, excess quantities and overlong text',async t=>{
  const f=fixture(t),operator=await f.operator(),p=await f.profile();
  for(const body of [{title:'x'.repeat(81),body:'',target:'all',treasure:1},{title:'x',body:'x'.repeat(1001),target:'all',treasure:1},{title:'x',body:'',target:'all',treasure:100001},{title:'x',body:'',target:'all',treasure:0,cards:[]},{title:'x',body:'',target:'all',cards:[{cardId:'missing',count:1}]},{title:'x',body:'',target:'all',cards:[{cardId:'B0001',count:4}]}])assert.equal((await f.send(operator,'gifts',body)).status,400);
  for(const route of ['messages','gifts','events','settings'])assert.equal((await f.api('POST','/api/operator/'+route,p.token,{})).status,404);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_announcements').get().n,0);assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_events').get().n,0);
});

test('presence uses server-clock ninety-second leases and ordinary players cannot obtain the operator lists',async t=>{
  const f=fixture(t),operator=await f.operator(),p=await f.profile(),other=await f.profile('他の人');
  const online=await f.api('POST','/api/presence',p.token,{online:true,login:true,playerId:other.id,sessionId:other.id,onlineUntil:9999999999999,lastLoginAt:1});
  assert.equal(online.status,200);assert.deepEqual(online.data.presence,{online:true,onlineUntil:f.now()+90_000,lastSeenAt:f.now(),lastLoginAt:f.now()});
  let status=(await f.api('GET','/api/operator',operator.token)).data.operator;
  assert.equal(status.stats.onlinePlayers,1);assert.equal(status.stats.recentLogins24h,1);assert.equal(status.onlinePlayers[0].id,p.id);assert.equal(status.recentLogins[0].online,true);
  assert.equal(status.onlinePlayers.some(x=>x.id===other.id),false);
  assert.equal((await f.api('GET','/api/operator',p.token)).status,404);assert.equal((await f.api('GET','/api/presence',p.token)).status,405);assert.equal((await f.api('POST','/api/presence',null,{online:true})).status,401);
  const profile=(await f.api('GET','/api/profile',p.token)).data;assert.equal(profile.onlinePlayers,undefined);assert.equal(profile.profile.onlinePlayers,undefined);
  f.advance(89_999);assert.equal((await f.api('GET','/api/operator',operator.token)).data.operator.stats.onlinePlayers,1);
  f.advance(1);status=(await f.api('GET','/api/operator',operator.token)).data.operator;assert.equal(status.stats.onlinePlayers,0);assert.equal(status.onlinePlayers.length,0);assert.equal(status.recentLogins[0].online,false);
});

test('going offline or revoking one device does not sign another device out of account presence',async t=>{
  const f=fixture(t),operator=await f.operator(),p=await f.profile(),linked=await f.link(p);
  await f.api('POST','/api/presence',p.token,{online:true,login:true});f.advance(1000);await f.api('POST','/api/presence',linked.token,{online:true,login:true});
  let status=(await f.api('GET','/api/operator',operator.token)).data.operator;assert.equal(status.stats.onlinePlayers,1);assert.equal(status.onlinePlayers.length,1);assert.equal(status.onlinePlayers[0].lastLoginAt,f.now());
  await f.api('POST','/api/presence',p.token,{online:false});status=(await f.api('GET','/api/operator',operator.token)).data.operator;assert.equal(status.stats.onlinePlayers,1);
  assert.equal((await f.api('POST','/api/presence',p.token,{online:false,login:true})).status,400);
  await f.api('DELETE','/api/account/sessions/'+linked.sessionId,p.token);status=(await f.api('GET','/api/operator',operator.token)).data.operator;assert.equal(status.stats.onlinePlayers,0);assert.equal(status.stats.recentLogins24h,1);
  assert.equal((await f.api('POST','/api/presence',linked.token,{online:true})).status,401);
});

test('the recent login list excludes the exact twenty-four-hour boundary and heartbeats do not manufacture new logins',async t=>{
  const f=fixture(t),operator=await f.operator(),old=await f.profile('境界のログイン'),recent=await f.profile('一秒新しいログイン');
  await f.api('POST','/api/presence',old.token,{online:true,login:true});f.advance(1);await f.api('POST','/api/presence',recent.token,{online:true,login:true});f.advance(86_399_999);
  const heartbeat=await f.api('POST','/api/presence',old.token,{online:true});assert.equal(heartbeat.data.presence.lastLoginAt,f.now()-86_400_000);
  const status=(await f.api('GET','/api/operator',operator.token)).data.operator;assert.equal(status.stats.recentLogins24h,1);assert.deepEqual(status.recentLogins.map(x=>x.id),[recent.id]);assert.equal(status.recentLogins[0].online,false);assert.equal(status.stats.onlinePlayers,1);assert.equal(status.onlinePlayers[0].id,old.id);
});

test('rebuild Regalia redemption requires the registered operator and server-only secret, survives device linking, and is idempotent',async t=>{
 const f=fixture(t),p=await f.operator(),ordinary=await f.profile('一般テスト'),route='/api/rebuild/operator-deck',secret='fixture-regalia-secret-only';
 f.env.BK_OPERATOR_REGALIA_CODE=secret;
 assert.equal((await f.api('GET',route,null)).status,401);
 assert.equal((await f.api('GET',route,ordinary.token)).status,404);
 assert.equal((await f.api('POST',route,ordinary.token,{code:secret})).status,404);
 assert.deepEqual((await f.api('GET',route,p.token)).data,{ok:true,entitled:false});
 assert.equal((await f.api('POST',route,p.token,{code:'wrong-code'})).status,404);
 delete f.env.BK_OPERATOR_REGALIA_CODE;
 assert.equal((await f.api('POST',route,p.token,{code:secret})).status,404);
 f.env.BK_OPERATOR_REGALIA_CODE=secret;
 const results=await Promise.all([f.api('POST',route,p.token,{code:secret}),f.api('POST',route,p.token,{code:secret})]);
 for(const r of results){
  assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.entitled,true);
  assert.equal(r.data.deck.main.length,32);assert.equal(r.data.deck.special.length,4);
  assert.equal(r.data.collection['B1024'],2);assert.equal(JSON.stringify(r.data).includes(secret),false);
 }
 assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM bk_operator_audit WHERE action='rebuild.regalia.granted'").get().n,1);
 assert.equal((await f.api('GET',route,ordinary.token)).status,404);
 const linked=await f.link(p);f.reconnect();
 assert.equal((await f.api('GET',route,linked.token)).data.collection['B1024'],2);
 assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM bk_cloud_saves").get().n,0);
 assert.equal(JSON.stringify(f.sqlite.prepare("SELECT * FROM bk_operator_audit WHERE action='rebuild.regalia.granted'").all()).includes(secret),false);
});
test('rebuild Regalia incorrect code attempts are rate limited by player even if the IP changes',async t=>{
 const f=fixture(t),p=await f.operator(),route='/api/rebuild/operator-deck';f.env.BK_OPERATOR_REGALIA_CODE='fixture-other-secret';
 for(let i=0;i<5;i++)assert.equal((await f.api('POST',route,p.token,{code:'wrong'},{ip:'192.0.2.'+(40+i)})).status,404);
 assert.equal((await f.api('POST',route,p.token,{code:f.env.BK_OPERATOR_REGALIA_CODE},{ip:'192.0.2.99'})).status,404);
 assert.equal((await f.api('GET',route,p.token)).data.entitled,false);
 f.advance(900_000);assert.equal((await f.api('POST',route,p.token,{code:f.env.BK_OPERATOR_REGALIA_CODE})).data.entitled,true);
});

test('Rebuild cloud backup is isolated, authenticated, revision checked, and restorable on a linked device',async t=>{
 const f=fixture(t),a=await f.profile('新生版検証'),b=await f.profile('別の人'),linked=await f.link(a);
 const path='/api/rebuild/cloud-save',data=purchase(initialProfile('新生版検証','king',STARTERS[0].id),()=>.2,'BK02');
 const legacy=await f.save(a);assert.equal(legacy.status,200);
 const status=await f.api('GET','/api/rebuild/status');assert.equal(status.status,200);assert.equal(status.data.cloudSaveVersion,1);
 assert.equal((await f.api('GET',path)).status,401);
 assert.equal((await f.api('GET',path,a.token)).data.save,null);
 const body={accountId:a.id,revision:0,mutationId:'rebuild-save-test-1',data:{...data,operator:true,token:'must-not-persist'}};
 const saved=await f.api('POST',path,a.token,body);assert.equal(saved.status,200,JSON.stringify(saved.data));assert.equal(saved.data.save.revision,1);
 assert.equal(saved.data.save.data.lastPackId,'BK02');assert.equal(saved.data.save.data.token,undefined);assert.equal(saved.data.save.data.operator,undefined);
 assert.equal((await f.api('POST',path,a.token,body)).data.replayed,true);
 assert.deepEqual((await f.api('GET',path,linked.token)).data.save,saved.data.save);
 assert.equal((await f.api('GET',path,b.token)).data.save,null);
 assert.equal((await f.api('POST',path,b.token,body)).status,400);
 assert.equal((await f.api('POST',path,linked.token,{...body,mutationId:'rebuild-save-test-2'})).status,409);
 assert.equal((await f.api('POST',path,a.token,{...body,revision:1,mutationId:'rebuild-save-test-3',data:{...data,collection:{...data.collection,OP_B1024:2}}})).status,400);
 const updated=await f.api('POST',path,linked.token,{...body,revision:1,mutationId:'rebuild-save-test-4',data:{...data,treasure:1234}});
 assert.equal(updated.status,200,JSON.stringify(updated.data));assert.equal(updated.data.save.revision,2);
 assert.equal(updated.data.save.data.treasure,1234);
 assert.deepEqual((await f.api('GET','/api/cloud-save',a.token)).data.save,legacy.data.save);
 assert.equal((await f.api('GET','/api/profile',a.token)).data.profile.nickname,'新生版検証');
});

test('operator deck code requires the stored role and grants the normal Regalia pair only once across devices',async t=>{
 const f=fixture(t),ordinary=await f.profile('一般の王'),operator=await f.operator();
 f.env.BK_OPERATOR_REGALIA_CODE='fixture-regalia-pair';
 const route='/api/operator/regalia/claim';
 assert.equal((await f.api('POST',route,ordinary.token,{code:f.env.BK_OPERATOR_REGALIA_CODE,revision:0})).status,404);
 assert.equal((await f.api('GET','/api/operator',ordinary.token)).status,404);
 assert.equal((await f.api('POST',route,operator.token,{code:f.env.BK_OPERATOR_REGALIA_CODE,revision:0})).status,409);
 assert.equal((await f.save(operator)).status,200);
 assert.equal((await f.api('POST',route,operator.token,{code:'wrong-code',revision:1})).status,404);
 const granted=await f.api('POST',route,operator.token,{code:f.env.BK_OPERATOR_REGALIA_CODE,revision:1});
 assert.equal(granted.status,200,JSON.stringify(granted.data));
 const {save,deck}=granted.data;
 assert.equal(save.data.collection.B0512,2);assert.equal(deck.name,'𠮷良原デッキ');
 assert.equal(deck.ids.length,32);assert.equal(deck.specialIds.length,4);
 const all=[...deck.ids,...deck.specialIds];
 assert.equal(all.filter(id=>id==='B0512').length,2);
 assert.equal(all.filter(id=>getCard(id).setId==='BK01').length,20);
 assert.equal(all.filter(id=>getCard(id).setId==='BK02').length,16);
 assert.ok(all.every(id=>save.data.collection[id]>=all.filter(x=>x===id).length));
 const linked=await f.link(operator);
 const replay=await f.api('POST',route,linked.token,{code:f.env.BK_OPERATOR_REGALIA_CODE,revision:1});
 assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);
 assert.deepEqual(replay.data.save,save);
 const read=await f.api('GET','/api/operator/deck',linked.token);
 assert.equal(read.status,200);assert.equal(read.data.deck.id,deck.id);
 assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM bk_reward_claims WHERE item_id='operator-regalia-v1'").get().n,1);
});

test('operator deck claim rejects an outdated save revision without losing newer inventory',async t=>{
 const f=fixture(t),operator=await f.operator();f.env.BK_OPERATOR_REGALIA_CODE='fixture-regalia-pair';
 await f.save(operator);
 const fresh=saveData(operator);fresh.treasure=777;fresh.collection.B1023=1;
 assert.equal((await f.save(operator,fresh,1)).status,200);
 const result=await f.api('POST','/api/operator/regalia/claim',operator.token,{code:f.env.BK_OPERATOR_REGALIA_CODE,revision:1});
 assert.equal(result.status,409);
 const saved=(await f.api('GET','/api/cloud-save',operator.token)).data.save;
 assert.equal(saved.data.treasure,777);assert.equal(saved.data.collection.B1023,1);assert.equal(saved.data.collection.B0512,undefined);
 assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_reward_claims').get().n,0);
});

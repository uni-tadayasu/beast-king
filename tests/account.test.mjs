import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createOnlineWorker} from '../server/worker.js';
import {CARDS,STARTER_DECKS,getCard} from '../catalog.js';
import {newGame,endTurn} from '../engine.js';
import {createStarterCollection} from '../shop.js';
import {createCampaignProgress,CAMPAIGN_BATTLES} from '../campaign.js';
import {OPERATOR_DECK,OPERATOR_DECK_REQUIRED} from '../operator-deck.js';
import {EVENT_BATTLES,createEventProgress,normalizeEventProgress} from '../event-battles.js';
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

test('event battle saves and bounded progress survive linked-device resumes without granting rewards or operator access',async t=>{
 const f=fixture(t),p=await f.profile('環境戦の旅人'),data=saveData(p),event=EVENT_BATTLES[0],other=EVENT_BATTLES[1];
 data.game=newGame({cpuDeck:event.ids,cpuSpecialDeck:event.specialIds,seed:31891,difficulty:'hard'});
 data.game.eventBattleId=event.id;data.game.eventMatchId='event-cloud-resume-1';data.game.operator=true;
 data.eventProgress={...createEventProgress(),clearedDeckIds:[event.id,event.id,'unknown-event'],operator:true,results:[
  {deckId:event.id,matchId:'event-cloud-won-1',result:'win',token:'must-not-persist'},
  {deckId:other.id,matchId:'event-cloud-won-1',result:'win'},
  {deckId:other.id,matchId:'event-cloud-loss-1',result:'loss'},
  {deckId:'unknown-event',matchId:'event-cloud-won-2',result:'win'},
  {deckId:other.id,matchId:'',result:'win'},
 ]};
 const saved=await f.save(p,data);assert.equal(saved.status,200,JSON.stringify(saved.data));
 assert.deepEqual(saved.data.save.data.eventProgress,normalizeEventProgress(data.eventProgress));
 assert.deepEqual(saved.data.save.data.eventProgress.clearedDeckIds,[event.id]);assert.equal(saved.data.save.data.eventProgress.results.length,2);
 assert.equal(saved.data.save.data.game.eventBattleId,event.id);assert.equal(saved.data.save.data.game.eventMatchId,'event-cloud-resume-1');
 assert.equal(saved.data.save.data.game.operator,undefined);assert.ok(!JSON.stringify(saved.data.save).includes('must-not-persist'));
 assert.equal(saved.data.save.data.treasure,data.treasure);assert.deepEqual(saved.data.save.data.collection,data.collection);
 const linked=await f.link(p);f.reconnect();const restored=await f.api('GET','/api/cloud-save',linked.token);assert.deepEqual(restored.data.save,saved.data.save);
 const resumed=restored.data.save.data;assert.equal(endTurn(resumed.game).ok,true);
 const continued=await f.save({token:linked.token},resumed,1);assert.equal(continued.status,200,JSON.stringify(continued.data));assert.equal(continued.data.save.data.game.eventMatchId,'event-cloud-resume-1');
 assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_reward_claims').get().n,0);assert.equal((await f.api('GET','/api/operator/deck',p.token)).status,404);
});

test('unknown event opponents, ambiguous battle modes and oversized progress cannot replace a valid cloud save',async t=>{
 const f=fixture(t),p=await f.profile(),data=saveData(p),event=EVENT_BATTLES[0];
 data.game=newGame({cpuDeck:event.ids,cpuSpecialDeck:event.specialIds,seed:53181});data.game.eventBattleId=event.id;data.game.eventMatchId='event-valid-match';
 data.eventProgress=createEventProgress();const saved=await f.save(p,data);assert.equal(saved.status,200);
 const invalid=[];
 let next=structuredClone(data);next.game.eventBattleId='missing-environment-deck';invalid.push(next);
 next=structuredClone(data);next.game.eventMatchId='';invalid.push(next);
 next=structuredClone(data);next.game.campaignBattleId=CAMPAIGN_BATTLES[0].id;next.game.campaignMatchId='campaign-event-collision';invalid.push(next);
 next=structuredClone(data);next.eventProgress.results=Array.from({length:201},(_,i)=>({deckId:event.id,matchId:'event-many-'+i,result:'win'}));invalid.push(next);
 next=structuredClone(data);next.eventProgress.clearedDeckIds=Array(EVENT_BATTLES.length+1).fill(event.id);invalid.push(next);
 for(const bad of invalid){const result=await f.save(p,bad,1);assert.equal(result.status,400,JSON.stringify(result.data));assert.equal(result.data.code,'invalid_save');}
 assert.deepEqual((await f.api('GET','/api/cloud-save',p.token)).data.save,saved.data.save);
});

test('cloud CPU saves retain the opening policy across linked-device resumes before and after its plateau',async t=>{
  const f=fixture(t),p=await f.profile(),data=saveData(p);data.game=newGame({seed:42317});
  assert.equal(data.game.openingRuleVersion,1);
  while(data.game.turn<5)assert.equal(endTurn(data.game).ok,true);
  assert.equal(data.game.players[1].maxEnergy,3);
  const saved=await f.save(p,data);assert.equal(saved.status,200,JSON.stringify(saved.data));
  assert.equal(saved.data.save.data.game.openingRuleVersion,1);
  const linked=await f.link(p);f.reconnect();
  const remote=await f.api('GET','/api/cloud-save',linked.token);assert.equal(remote.status,200);
  const resumed=remote.data.save.data;assert.equal(resumed.game.openingRuleVersion,1);
  assert.equal(endTurn(resumed.game).ok,true);assert.equal(resumed.game.turn,6);
  assert.equal(resumed.game.players[1].energy,3);assert.equal(resumed.game.players[1].maxEnergy,3);
  const plateau=await f.save({token:linked.token},resumed,1);assert.equal(plateau.status,200,JSON.stringify(plateau.data));
  f.reconnect();const after=(await f.api('GET','/api/cloud-save',p.token)).data.save;
  assert.equal(after.revision,2);assert.equal(after.data.game.openingRuleVersion,1);assert.equal(after.data.game.turn,6);
  assert.equal(endTurn(after.data.game).ok,true);assert.equal(endTurn(after.data.game).ok,true);
  assert.equal(after.data.game.turn,8);assert.equal(after.data.game.players[1].energy,4);assert.equal(after.data.game.players[1].maxEnergy,4);
});

test('cloud saves keep an absent opening marker absent and resume turn-one legacy games without the bonus',async t=>{
  const f=fixture(t),p=await f.profile(),data=saveData(p);data.game=newGame({seed:51832});delete data.game.openingRuleVersion;
  const saved=await f.save(p,data);assert.equal(saved.status,200,JSON.stringify(saved.data));
  assert.equal(Object.hasOwn(saved.data.save.data.game,'openingRuleVersion'),false);
  f.reconnect();const restored=(await f.api('GET','/api/cloud-save',p.token)).data.save.data;
  assert.equal(Object.hasOwn(restored.game,'openingRuleVersion'),false);
  assert.equal(endTurn(restored.game).ok,true);assert.equal(restored.game.turn,2);
  assert.equal(restored.game.players[1].energy,1);assert.equal(restored.game.players[1].maxEnergy,1);
  assert.equal(endTurn(restored.game).ok,true);assert.equal(endTurn(restored.game).ok,true);
  assert.equal(restored.game.turn,4);assert.equal(restored.game.players[1].energy,2);
  const again=await f.save(p,restored,1);assert.equal(again.status,200,JSON.stringify(again.data));
  assert.equal(Object.hasOwn(again.data.save.data.game,'openingRuleVersion'),false);
});

test('unsupported opening markers are rejected without replacing a valid cloud save',async t=>{
  const f=fixture(t),p=await f.profile(),data=saveData(p);data.game=newGame({seed:23816});
  const saved=await f.save(p,data);assert.equal(saved.status,200,JSON.stringify(saved.data));
  for(const marker of [null,0,2,'1',true,{}]){
    const invalid=structuredClone(data);invalid.game.openingRuleVersion=marker;
    const response=await f.save(p,invalid,1);
    assert.equal(response.status,400,`invalid marker ${JSON.stringify(marker)}`);assert.equal(response.data.code,'invalid_save');
  }
  const current=await f.api('GET','/api/cloud-save',p.token);assert.deepEqual(current.data.save,saved.data.save);
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
  const publicStatus=(await f.api('GET','/api/public-status')).data;assert.equal(publicStatus.ok,true);assert.equal(publicStatus.notice,'調整中です');assert.equal(publicStatus.maintenance,true);assert.deepEqual(publicStatus.notices,[]);assert.equal(publicStatus.serverTime,f.now());
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
  const published=await f.send(operator,'events',{...base,id,revision:1,status:'published'});assert.equal(published.status,200);
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
  f.env.DB.batch=async statements=>{if(!intercepted&&statements.some(s=>s.sql.startsWith('UPDATE bk_cloud_saves')&&s.sql.includes('bk_reward_claims'))){intercepted=true;const closed=await f.send(operator,'events',{...event,id,revision:1,status:'ended'});assert.equal(closed.status,200);}return original(statements);};
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
  assert.equal(r.data.collection['B1024'],2);assert.match(r.data.artwork,/^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/);assert.equal(JSON.stringify(r.data).includes(secret),false);
 }
 assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM bk_operator_audit WHERE action='rebuild.regalia.granted'").get().n,1);
 assert.equal((await f.api('GET',route,ordinary.token)).status,404);
 const linked=await f.link(p);f.reconnect();
 const linkedGrant=(await f.api('GET',route,linked.token)).data;assert.equal(linkedGrant.collection['B1024'],2);assert.equal(linkedGrant.artwork,results[0].data.artwork);
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
 assert.equal(save.data.collection.B0512,2);assert.equal(deck.name,'プレミアムデッキ');
 assert.equal(deck.ids.length,32);assert.equal(deck.specialIds.length,4);
 const all=[...deck.ids,...deck.specialIds];
 assert.equal(all.filter(id=>id==='B0512').length,2);
 assert.deepEqual(deck.ids,OPERATOR_DECK.ids);assert.deepEqual(deck.specialIds,OPERATOR_DECK.specialIds);
 assert.equal(deck.revision,OPERATOR_DECK.revision);
 assert.ok(all.every(id=>save.data.collection[id]>=all.filter(x=>x===id).length));
 const linked=await f.link(operator);
 const replay=await f.api('POST',route,linked.token,{code:f.env.BK_OPERATOR_REGALIA_CODE,revision:1});
 assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);
 assert.deepEqual(replay.data.save,save);
 const read=await f.api('GET','/api/operator/deck',linked.token);
 assert.equal(read.status,200);assert.equal(read.data.deck.id,deck.id);assert.match(deck.artwork,/^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/);assert.equal(read.data.deck.artwork,deck.artwork);assert.equal(replay.data.deck.artwork,deck.artwork);assert.equal((await f.api('GET','/api/operator/deck',ordinary.token)).data.deck,undefined);
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

test('multiple named decks survive cloud validation and device restoration independently',async t=>{
 const f=fixture(t),p=await f.profile(),data=saveData(p);
 for(const d of STARTER_DECKS)data.collection=createStarterCollection(data.collection,d.id);
 data.deckLibrary=STARTER_DECKS.map(d=>({id:'starter-'+d.id,name:d.name,ids:[...d.ids],specialIds:[...d.specialIds]}));
 data.activeDeckId=data.deckLibrary[0].id;data.editingDeckId=data.deckLibrary[1].id;
 data.deckLibrary[1].draft={name:'編集途中',ids:data.deckLibrary[1].ids.slice(1),specialIds:data.deckLibrary[1].specialIds};
 const saved=await f.save(p,data);assert.equal(saved.status,200,JSON.stringify(saved.data));assert.equal(saved.data.save.data.deckLibrary.length,4);assert.equal(saved.data.save.data.editingDeckId,data.editingDeckId);assert.equal(saved.data.save.data.deckLibrary[1].draft.ids.length,31);
 const linked=await f.link(p),restored=await f.api('GET','/api/cloud-save',linked.token);assert.deepEqual(restored.data.save.data.deckLibrary,saved.data.save.data.deckLibrary);
 const bad=structuredClone(data);bad.deckLibrary[1].ids=Array(32).fill('B0001');assert.equal((await f.save(p,bad,1)).status,400);
});

function seedOperatorDeckReceipt(f,p,id,{pair=true}={}){
 const claimedAt=f.now()-1000;
 const insert=f.sqlite.prepare("INSERT INTO bk_reward_claims (player_id,item_type,item_id,result_json,save_revision,claimed_at) VALUES (?,'gift',?,?,1,?)");
 insert.run(p.id,id,JSON.stringify({id,deckId:OPERATOR_DECK.id,cards:[],claimedAt}),claimedAt);
 if(pair){const key='operator-regalia-v1';insert.run(p.id,key,JSON.stringify({id:key,treasure:0,cards:[{cardId:'B0512',count:2}],convertedTreasure:0,claimedAt}),claimedAt);}
}

for(const legacyId of ['operator-kirahara-deck-v1','operator-kirahara-deck-v2','operator-kirahara-deck-v3'])test(`${legacyId} upgrades without a code, preserves artwork and grants only missing cards once across linked devices`,async t=>{
 const f=fixture(t),operator=await f.operator(),ordinary=await f.profile('一般'),path='/api/operator/regalia/claim';
 const data=saveData(operator),starterCards=new Set([...data.deckIds,...data.specialIds]);
 data.collection.B0512=2;data.treasure=777;
 const extras=Object.keys(OPERATOR_DECK_REQUIRED).filter(id=>id!=='B0512'&&!starterCards.has(id));
 assert.ok(extras.length>=2);data.collection[extras[0]]=3;data.collection[extras[1]]=1;
 const unrelated=CARDS.find(c=>!OPERATOR_DECK_REQUIRED[c.id]&&!starterCards.has(c.id)).id;data.collection[unrelated]=3;
 const saved=await f.save(operator,data);assert.equal(saved.status,200);seedOperatorDeckReceipt(f,operator,legacyId);
 const old=await f.api('GET','/api/operator/deck',operator.token);assert.equal(old.data.deck.upgradeRequired,true);
 assert.equal((await f.api('GET','/api/operator',operator.token)).data.operator.deck.upgradeRequired,true);
 const image='data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAEAdQ2v7Xo7SBiOh/AAA=';
 assert.equal((await f.api('POST','/api/operator/artwork',operator.token,{artwork:image})).status,200);
 assert.equal((await f.api('POST',path,ordinary.token,{upgrade:true,revision:0})).status,404);
 const linked=await f.link(operator);
 const results=await Promise.all([operator.token,linked.token].map(token=>f.api('POST',path,token,{upgrade:true,revision:1})));
 assert.ok(results.every(r=>r.status===200),JSON.stringify(results));assert.equal(results.filter(r=>r.data.replayed).length,1);
 const upgraded=results.find(r=>!r.data.replayed).data;
 assert.equal(upgraded.deck.revision,OPERATOR_DECK.revision);assert.equal(upgraded.deck.upgradeRequired,false);assert.equal(upgraded.deck.artwork,image);
 assert.equal(upgraded.save.revision,2);assert.equal(upgraded.save.data.treasure,777);assert.equal(upgraded.save.data.collection.B0512,2);
 const expected={...saved.data.save.data.collection};for(const [id,n] of Object.entries(OPERATOR_DECK_REQUIRED))expected[id]=Math.max(expected[id]||0,n);
 assert.deepEqual(upgraded.save.data.collection,expected);assert.equal(upgraded.save.data.collection[unrelated],3);
 const missing=Object.entries(OPERATOR_DECK_REQUIRED).filter(([id,n])=>(saved.data.save.data.collection[id]||0)<n).map(([cardId,n])=>({cardId,count:n-(saved.data.save.data.collection[cardId]||0)}));
 assert.deepEqual(upgraded.deckClaim.cards,missing);assert.equal(upgraded.deckClaim.recipeRevision,OPERATOR_DECK.revision);
 assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM bk_reward_claims WHERE item_id='operator-kirahara-deck-v4'").get().n,1);
 assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_reward_claims WHERE item_id=?').get(legacyId).n,1);
 assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM bk_reward_claims WHERE item_id='operator-regalia-v1'").get().n,1);
 assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM bk_operator_audit WHERE action='operator.deck_unlocked'").get().n,1);
 assert.equal((await f.api('GET','/api/operator',operator.token)).data.operator.deck.upgradeRequired,false);
 const edited=structuredClone(upgraded.save.data);delete edited.collection[extras[1]];edited.treasure=999;
 const later=await f.save(operator,edited,2);assert.equal(later.status,200,JSON.stringify(later.data));
 const replay=await f.api('POST',path,linked.token,{upgrade:true,revision:1});assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);
 assert.deepEqual(replay.data.save,later.data.save);assert.equal(replay.data.save.data.collection[extras[1]],undefined);assert.equal(replay.data.deck.artwork,image);
});

test('a legacy deck receipt without the original pair ledger still upgrades without duplicate Regalia or treasure',async t=>{
 const f=fixture(t),operator=await f.operator(),data=saveData(operator);data.collection.B0512=3;data.treasure=777;
 await f.save(operator,data);seedOperatorDeckReceipt(f,operator,'operator-kirahara-deck-v2',{pair:false});
 const result=await f.api('POST','/api/operator/regalia/claim',operator.token,{upgrade:true,revision:1});assert.equal(result.status,200,JSON.stringify(result.data));
 assert.equal(result.data.save.data.collection.B0512,3);assert.equal(result.data.save.data.treasure,777);assert.deepEqual(result.data.claim.cards,[]);assert.equal(result.data.claim.convertedTreasure,0);
 assert.equal((await f.api('POST','/api/operator/regalia/claim',operator.token,{upgrade:true,revision:1})).data.replayed,true);
});

test('recipe upgrades require the current stored role and an old entitlement and cannot commit after role revocation',async t=>{
 const f=fixture(t),operator=await f.operator(),ordinary=await f.profile('一般'),path='/api/operator/regalia/claim';
 const saved=await f.save(operator);await f.save(ordinary);
 assert.equal((await f.api('POST',path,operator.token,{upgrade:true,revision:1})).status,404);
 seedOperatorDeckReceipt(f,ordinary,'operator-kirahara-deck-v2');
 assert.equal((await f.api('POST',path,ordinary.token,{upgrade:true,revision:1})).status,404);
 assert.equal((await f.api('GET','/api/operator/deck',ordinary.token)).status,404);
 seedOperatorDeckReceipt(f,operator,'operator-kirahara-deck-v2');
 const batch=f.env.DB.batch.bind(f.env.DB);let revoked=false;
 f.env.DB.batch=async statements=>{if(!revoked&&statements.some(s=>s.sql.startsWith('UPDATE bk_cloud_saves')&&s.sql.includes('bk_reward_claims'))){revoked=true;f.sqlite.prepare('DELETE FROM bk_operator WHERE player_id=?').run(operator.id);}return batch(statements);};
 const result=await f.api('POST',path,operator.token,{upgrade:true,revision:1});assert.equal(result.status,404);assert.equal(revoked,true);
 assert.deepEqual((await f.api('GET','/api/cloud-save',operator.token)).data.save,saved.data.save);
 assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM bk_reward_claims WHERE item_id='operator-kirahara-deck-v4'").get().n,0);
});

test('legacy entitled operators recover private artwork; match slot metadata is viewer-only',async t=>{
 const f=fixture(t),p=await f.operator(),other=await f.profile('一般の王');
 f.env.BK_OPERATOR_REGALIA_CODE='fixture-art-repair';
 assert.equal((await f.save(p)).status,200);
 const claimed=await f.api('POST','/api/operator/regalia/claim',p.token,{code:f.env.BK_OPERATOR_REGALIA_CODE,revision:1});assert.equal(claimed.status,200);
 f.sqlite.prepare("DELETE FROM bk_operator_audit WHERE action='operator.activated'").run();
 const results=await Promise.all([f.api('GET','/api/operator/deck',p.token),f.api('GET','/api/operator/deck',p.token)]);
 assert.ok(results.every(r=>r.status===200&&r.data.deck.artwork.startsWith('data:image/svg+xml;base64,')));
 assert.equal(results[0].data.deck.artwork,results[1].data.deck.artwork);
 assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM bk_operator_audit WHERE action='operator.art_seed'").get().n,1);
 assert.equal((await f.api('GET','/api/operator/deck',other.token)).status,404);
 const preset=claimed.data.deck,slot='operator-kirahara-v1';
 const room=await f.api('POST','/api/rooms',p.token,{deck:preset.ids,special:preset.specialIds,deckSlotId:slot});assert.equal(room.status,200,JSON.stringify(room.data));
 const joined=await f.api('POST','/api/rooms/'+room.data.room.code+'/join',other.token,{...deck(),deckSlotId:slot});assert.equal(joined.status,200,JSON.stringify(joined.data));
 assert.equal(joined.data.match.ownDeckSlot,null);assert.equal(joined.data.match.state.deckSlots,undefined);
 const own=await f.api('GET','/api/matches/'+joined.data.match.id,p.token);assert.equal(own.status,200);assert.equal(own.data.match.ownDeckSlot,slot);
 assert.equal(own.data.match.state.deckSlots,undefined);
 assert.ok(!JSON.stringify(own.data.match).includes('data:image'));
 const linked=await f.link(p),linkedView=await f.api('GET','/api/matches/'+joined.data.match.id,linked.token);
 assert.equal(linkedView.data.match.ownDeckSlot,slot);
});

test('alternate raster Regalia is replaceable only by the authenticated entitled operator',async t=>{
 const f=fixture(t),operator=await f.operator(),ordinary=await f.profile('一般の王');
 const image='data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAEAdQ2v7Xo7SBiOh/AAA=',route='/api/operator/artwork';
 assert.equal((await f.api('POST',route,ordinary.token,{artwork:image})).status,404);
 assert.equal((await f.api('POST',route,operator.token,{artwork:image})).status,404);
 f.env.BK_OPERATOR_REGALIA_CODE='fixture-private-raster';
 const saved=await f.save(operator);assert.equal(saved.status,200);
 const claim=await f.api('POST','/api/operator/regalia/claim',operator.token,{code:f.env.BK_OPERATOR_REGALIA_CODE,revision:saved.data.save.revision});assert.equal(claim.status,200);
 assert.equal((await f.api('POST',route,operator.token,{artwork:'data:image/svg+xml;base64,PHN2Zy8+'})).status,400);
 const accepted=await f.api('POST',route,operator.token,{artwork:image});assert.equal(accepted.status,200,JSON.stringify(accepted.data));assert.equal(accepted.data.deck.artwork,image);
 assert.equal((await f.api('POST',route,operator.token,{artwork:image})).status,200);
 assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM bk_operator_audit WHERE action='operator.artwork'").get().n,1);
 const linked=await f.link(operator);assert.equal((await f.api('GET','/api/operator/deck',linked.token)).data.deck.artwork,image);
 assert.equal((await f.api('GET','/api/operator/deck',ordinary.token)).status,404);
 assert.equal((await f.api('GET','/api/cloud-save',operator.token)).data.save.revision,claim.data.save.revision);
 assert.ok(!JSON.stringify((await f.api('GET','/api/cloud-save',operator.token)).data).includes(image));
 assert.ok(!JSON.stringify((await f.api('GET','/api/public-status',null)).data).includes(image));
});

test('operator lifecycle migration preserves existing deliveries, receipts, saves and roles',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 for(const name of ['0000_beast_king_online','0001_profile_origin','0002_accounts_and_operator','0003_king_origin','0004_rebuild_saves'])db.exec(readFileSync(new URL('../drizzle/'+name+'.sql',import.meta.url),'utf8'));
 db.prepare('INSERT INTO bk_profiles (id,token_hash,nickname,created_at,updated_at) VALUES (?,?,?,?,?)').run('legacy-operator','old-hash','運営',1,1);
 db.prepare('INSERT INTO bk_operator VALUES (1,?,?)').run('legacy-operator',1);
 db.prepare("INSERT INTO bk_announcements (id,kind,title,body,cards_json,created_at,created_by) VALUES (?,'message',?,?,'[]',?,?)").run('legacy-mail','従来のメール','本文',2,'legacy-operator');
 db.prepare('INSERT INTO bk_inbox_reads VALUES (?,?,?)').run('legacy-operator','legacy-mail',3);
 db.exec(readFileSync(new URL('../drizzle/0005_operator_lifecycle.sql',import.meta.url),'utf8'));
 const row=db.prepare('SELECT * FROM bk_announcements WHERE id=?').get('legacy-mail');
 assert.equal(row.title,'従来のメール');assert.equal(row.status,'published');assert.equal(row.publish_at,0);assert.equal(row.revision,1);
 assert.equal(db.prepare('SELECT read_at FROM bk_inbox_reads').get().read_at,3);
 assert.equal(db.prepare('SELECT player_id FROM bk_operator').get().player_id,'legacy-operator');
 assert.equal(db.prepare('SELECT count(*) AS n FROM bk_notices').get().n,0,'no real notices are created by a migration');
});

test('draft and scheduled mail stay private until server time, then retain per-account reads after withdrawal',async t=>{
 const f=fixture(t),op=await f.operator(),a=await f.profile('配信対象'),other=await f.profile('対象外');
 const body={title:'予約メール',body:'本文',target:a.id,status:'draft',publishAt:f.now()+1000};
 const made=await f.send(op,'messages',body);assert.equal(made.status,200);const id=made.data.createdId;
 for(const who of [a,other])assert.equal((await f.api('GET','/api/inbox',who.token)).data.messages.length,0);
 assert.equal((await f.api('POST',`/api/inbox/${id}/read`,a.token,{})).status,404);
 const scheduled=await f.send(op,'messages',{...body,id,revision:1,status:'published'});assert.equal(scheduled.status,200);assert.equal(scheduled.data.operator.messages[0].phase,'scheduled');
 f.advance(999);assert.equal((await f.api('GET','/api/inbox',a.token)).data.messages.length,0);
 f.advance(1);const inbox=(await f.api('GET','/api/inbox?kind=message&pageSize=4',a.token)).data;assert.equal(inbox.messages[0].id,id);assert.equal(inbox.counts.unread,1);
 assert.equal((await f.api('GET','/api/inbox',other.token)).data.messages.length,0);
 assert.equal((await f.api('POST',`/api/inbox/${id}/read`,a.token,{})).status,200);
 const ended=await f.send(op,'messages',{...body,id,revision:2,status:'ended'});assert.equal(ended.status,200);
 const history=(await f.api('GET','/api/inbox',a.token)).data;assert.equal(history.messages[0].phase,'ended');assert.equal(history.counts.unread,0);
 const receipts=await f.api('GET',`/api/operator/records?kind=reads&itemId=${id}&itemType=message`,op.token);assert.equal(receipts.data.total,1);assert.equal(receipts.data.items[0].id,a.id);
 assert.equal((await f.api('GET','/api/operator/records?kind=message',a.token)).status,404);
});

test('mail expires at its exact end time for unread recipients while preserving existing read history',async t=>{
 const f=fixture(t),op=await f.operator(),read=await f.profile('既読の王'),unread=await f.profile('未読の王');
 const expiry=f.now()+1000;
 const id=(await f.send(op,'messages',{title:'期間限定のメール',body:'終了時刻までの案内',target:'all',status:'published',expiresAt:expiry})).data.createdId;
 assert.equal((await f.api('GET','/api/inbox?kind=message',unread.token)).data.counts.unread,1);
 f.advance(999);
 const firstRead=await f.api('POST',`/api/inbox/${id}/read`,read.token,{});assert.equal(firstRead.status,200);
 f.advance(1);
 const unreadInbox=(await f.api('GET','/api/inbox?kind=message',unread.token)).data;
 assert.equal(unreadInbox.messages.length,0);assert.equal(unreadInbox.counts.unread,0);assert.equal(unreadInbox.pagination.total,0);
 assert.equal((await f.api('POST',`/api/inbox/${id}/read`,unread.token,{})).status,404);
 const history=(await f.api('GET','/api/inbox?kind=message',read.token)).data;
 assert.equal(history.messages[0].id,id);assert.equal(history.messages[0].phase,'expired');assert.equal(history.counts.unread,0);
 assert.equal((await f.api('POST',`/api/inbox/${id}/read`,read.token,{})).data.readAt,firstRead.data.readAt);
 assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_inbox_reads WHERE item_id=?').get(id).n,1);
});

test('scheduled gifts accept catalog-driven rewards, reconcile receipts, and lock rewards and targets after publication',async t=>{
 const f=fixture(t),op=await f.operator(),a=await f.profile(),other=await f.profile('他の王');await f.save(a);
 const cardId=CARDS.at(-1).id,body={title:'予約ギフト',body:'配信テスト',target:a.id,status:'published',publishAt:f.now()+100,expiresAt:f.now()+1000,treasure:50,cards:[{cardId,count:3}]};
 const made=await f.send(op,'gifts',body);assert.equal(made.status,200,JSON.stringify(made.data));const id=made.data.createdId;
 assert.equal((await f.api('POST',`/api/inbox/${id}/claim`,a.token,{revision:1})).data.code,'reward_unavailable');
 f.advance(100);
 assert.equal((await f.send(op,'gifts',{...body,id,revision:1,treasure:500})).data.code,'delivery_locked');
 assert.equal((await f.send(op,'gifts',{...body,id,revision:1,target:other.id})).data.code,'delivery_locked');
 const linked=await f.link(a);
 const attempts=await Promise.all([a.token,linked.token].map(token=>f.api('POST',`/api/inbox/${id}/claim`,token,{revision:1})));
 assert.ok(attempts.every(r=>r.status===200));assert.equal(attempts.filter(r=>r.data.replayed).length,1);
 const saved=(await f.api('GET','/api/cloud-save',a.token)).data.save;assert.equal(saved.revision,2);assert.equal(saved.data.collection[cardId],3);assert.equal(saved.data.treasure,150);
 const ended=await f.send(op,'gifts',{...body,id,revision:1,status:'ended'});assert.equal(ended.status,200);
 const history=(await f.api('GET','/api/inbox?kind=gift&pageSize=4',a.token)).data.gifts[0];assert.equal(history.claimable,false);assert.equal(history.claim.contentRevision,1);assert.equal(history.claim.cards[0].cardId,cardId);
 const records=(await f.api('GET',`/api/operator/records?kind=claims&itemId=${id}&itemType=gift`,op.token)).data;assert.equal(records.total,1);assert.equal(records.items[0].saveRevision,2);assert.equal(records.items[0].claim.treasure,50);
 assert.equal((await f.api('POST',`/api/inbox/${id}/claim`,a.token,{revision:1})).data.replayed,true);
});

test('editing requires a revision and concurrent edits produce one resource, one audit and one mutation receipt',async t=>{
 const f=fixture(t),op=await f.operator();
 const body={title:'下書き',body:'元の本文',target:'all',status:'draft'};
 const made=await f.send(op,'messages',body),id=made.data.createdId;
 assert.equal((await f.send(op,'messages',{...body,id})).data.code,'revision_required');
 const before=f.sqlite.prepare('SELECT count(*) AS n FROM bk_operator_audit').get().n;
 const edits=await Promise.all(['編集A','編集B'].map(title=>f.send(op,'messages',{...body,id,revision:1,title})));
 assert.deepEqual(edits.map(r=>r.status).sort(),[200,409]);
 assert.equal(f.sqlite.prepare('SELECT revision FROM bk_announcements WHERE id=?').get(id).revision,2);
 assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_operator_audit').get().n,before+1);
 assert.equal((await f.send(op,'messages',{...body,id,revision:1})).data.code,'content_conflict');
 const unchanged=f.sqlite.prepare('SELECT count(*) AS n FROM bk_operator_mutations').get().n;
 assert.equal(unchanged,2,'creation plus exactly one accepted edit');
});

test('gift withdrawal racing a claim blocks the reward without writing a claim or losing the save',async t=>{
 const f=fixture(t),op=await f.operator(),a=await f.profile();await f.save(a);
 const gift={title:'取り下げテスト',body:'',target:'all',treasure:40,cards:[],status:'published'};
 const id=(await f.send(op,'gifts',gift)).data.createdId,original=f.env.DB.batch.bind(f.env.DB);let intercepted=false;
 f.env.DB.batch=async statements=>{if(!intercepted&&statements.some(s=>s.sql.startsWith('UPDATE bk_cloud_saves')&&s.sql.includes('bk_reward_claims'))){intercepted=true;assert.equal((await f.send(op,'gifts',{...gift,id,revision:1,status:'ended'})).status,200);}return original(statements);};
 const claim=await f.api('POST',`/api/inbox/${id}/claim`,a.token,{revision:1});assert.equal(claim.status,409);assert.equal(claim.data.code,'save_conflict');
 assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_reward_claims WHERE item_id=?').get(id).n,0);
 assert.equal((await f.api('GET','/api/cloud-save',a.token)).data.save.data.treasure,100);
});

test('targeted events expose only their audience, preserve receipt history and cannot mutate issued rewards',async t=>{
 const f=fixture(t),op=await f.operator(),a=await f.profile('参加対象'),other=await f.profile('対象外');await f.save(a);
 const event={title:'個別イベント',body:'参加案内',target:a.id,startAt:f.now(),endAt:f.now()+1000,status:'published',treasure:20,cards:[]};
 const created=await f.send(op,'events',event),id=created.data.createdId;assert.equal(created.status,200);
 assert.equal((await f.api('GET','/api/events',other.token)).data.events.length,0);assert.equal((await f.api('POST',`/api/events/${id}/claim`,other.token,{revision:1})).status,404);
 assert.equal((await f.api('POST',`/api/events/${id}/claim`,a.token,{revision:1})).status,200);
 assert.equal((await f.send(op,'events',{...event,id,revision:1,treasure:21})).data.code,'delivery_locked');
 f.advance(1000);const history=(await f.api('GET','/api/events',a.token)).data.events[0];assert.equal(history.phase,'expired');assert.equal(history.claimable,false);assert.equal(history.claim.treasure,20);
});

test('notices publish from drafts on exact server boundaries, order by priority and remain editable with revision checks',async t=>{
 const f=fixture(t),op=await f.operator();
 const base={title:'予告',body:'本文',status:'draft',startAt:f.now()+100,endAt:f.now()+1000,priority:2};
 const draft=await f.send(op,'notices',base);assert.equal(draft.status,200);const id=draft.data.createdId;
 assert.deepEqual((await f.api('GET','/api/public-status')).data.notices,[]);
 assert.equal((await f.send(op,'notices',{...base,id,revision:1,status:'published'})).status,200);
 f.advance(99);assert.equal((await f.api('GET','/api/public-status')).data.notices.length,0);
 f.advance(1);assert.equal((await f.api('GET','/api/public-status')).data.notice,'予告');
 const urgent=await f.send(op,'notices',{...base,title:'重要',startAt:f.now(),status:'published',priority:9});assert.equal(urgent.status,200);
 assert.deepEqual((await f.api('GET','/api/public-status')).data.notices.map(r=>r.title),['重要','予告']);
 const edit=await f.send(op,'notices',{...base,id,revision:2,title:'予告の補足',status:'published'});assert.equal(edit.status,200);
 f.advance(900);assert.equal((await f.api('GET','/api/public-status')).data.notices.length,0);
 const history=(await f.api('GET','/api/operator/records?kind=notice',op.token)).data;assert.equal(history.total,2);assert.ok(history.items.every(r=>r.phase==='expired'));
});

test('scheduled maintenance pauses waiting human and BOT matchmaking, permits ongoing actions and ends automatically',async t=>{
 const f=fixture(t),op=await f.operator(),waiting=await f.profile('待機'),host=await f.profile('先攻'),guest=await f.profile('後攻');
 const room=(await f.api('POST','/api/rooms',host.token,deck())).data.room;
 const match=(await f.api('POST','/api/rooms/'+room.code+'/join',guest.token,deck())).data.match;
 assert.equal((await f.api('POST','/api/queue',waiting.token,deck())).data.status,'waiting');
 const settings={notice:'',maintenance:true,maintenanceMessage:'定期点検です',maintenanceStartAt:f.now()+60000,maintenanceEndAt:f.now()+61000};
 assert.equal((await f.send(op,'settings',settings)).status,200);
 const before=(await f.api('GET','/api/public-status')).data;assert.equal(before.maintenance,false);assert.equal(before.upcomingMaintenance.startAt,settings.maintenanceStartAt);
 f.advance(60000);const active=(await f.api('GET','/api/public-status')).data;assert.equal(active.maintenance,true);assert.equal(active.maintenanceMessage,'定期点検です');
 const paused=await f.api('GET','/api/queue',waiting.token);assert.equal(paused.data.status,'waiting');assert.equal(paused.data.queue.paused,true);assert.equal(paused.data.match,null);
 assert.equal((await f.api('POST','/api/rooms',waiting.token,deck())).data.code,'maintenance');
 assert.equal((await f.api('POST',`/api/matches/${match.id}/actions`,host.token,{kind:'endTurn',revision:0,actionId:f.mutation()})).status,200);
 f.advance(1000);assert.equal((await f.api('GET','/api/public-status')).data.maintenance,false);
 assert.equal((await f.api('GET','/api/queue',waiting.token)).data.status,'matched');
});

test('atomic maintenance guard blocks a match if the operator stops reception after the initial check',async t=>{
 const f=fixture(t),op=await f.operator(),host=await f.profile('待つ王'),guest=await f.profile('入る王');
 const room=(await f.api('POST','/api/rooms',host.token,deck())).data.room;
 const original=f.env.DB.batch.bind(f.env.DB);let intercepted=false;
 f.env.DB.batch=async statements=>{if(!intercepted&&statements.some(s=>s.sql.startsWith('INSERT INTO bk_matches'))){intercepted=true;assert.equal((await f.send(op,'settings',{notice:'点検',maintenance:true})).status,200);}return original(statements);};
 const join=await f.api('POST','/api/rooms/'+room.code+'/join',guest.token,deck());assert.notEqual(join.status,200);assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_matches').get().n,0);
});

test('paginated operator histories do not truncate old items and omit credentials and private artwork payloads',async t=>{
 const f=fixture(t),op=await f.operator(),ordinary=await f.profile();
 for(let index=0;index<9;index++)assert.equal((await f.send(op,'messages',{title:'履歴 '+index,body:'',target:'all',status:'draft'})).status,200);
 const ids=[];for(let page=0;page<3;page++){const data=(await f.api('GET',`/api/operator/records?kind=message&page=${page}&pageSize=4`,op.token)).data;assert.equal(data.total,9);ids.push(...data.items.map(row=>row.id));}
 assert.equal(new Set(ids).size,9);assert.equal(ids.length,9);
 const path='/api/operator/records?kind=player&query='+encodeURIComponent(ordinary.id),players=(await f.api('GET',path,op.token)).data;assert.equal(players.total,1);assert.equal(players.items[0].id,ordinary.id);
 assert.equal((await f.api('GET','/api/operator/records?kind=message&page=-1',op.token)).status,400);
 f.sqlite.prepare('INSERT INTO bk_operator_audit VALUES (?,?,?,?,?)').run('test-private-audit',op.id,'operator.artwork',JSON.stringify({artwork:'private-raster-fixture',token:'private-bearer-fixture'}),f.now()+1);
 const audit=await f.api('GET','/api/operator/records?kind=audit',op.token);assert.equal(JSON.stringify(audit.data).includes('private-raster-fixture'),false);assert.equal(JSON.stringify(audit.data).includes('private-bearer-fixture'),false);
 assert.equal((await f.api('GET','/api/operator/records?kind=audit',ordinary.token)).status,404);
});

test('scheduled reward edits cannot race a claim across the publication boundary for gifts or events',async t=>{
 for(const kind of ['gift','event']){
  const f=fixture(t),op=await f.operator(),a=await f.profile('先の受取'),b=await f.profile('後の受取');await f.save(a);await f.save(b);
  const body={title:'予約報酬',body:'',target:'all',status:'published',treasure:10,cards:[],...(kind==='gift'?{publishAt:f.now()+100,expiresAt:f.now()+1000}:{startAt:f.now()+100,endAt:f.now()+1000})};
  const created=await f.send(op,kind==='gift'?'gifts':'events',body),id=created.data.createdId,original=f.env.DB.batch.bind(f.env.DB);let intercepted=false;
  const route=kind==='gift'?`/api/inbox/${id}/claim`:`/api/events/${id}/claim`;
  f.env.DB.batch=async statements=>{if(!intercepted&&statements.some(s=>s.sql.startsWith('UPDATE '+(kind==='gift'?'bk_announcements':'bk_events')))){
   intercepted=true;f.advance(100);const claimed=await f.api('POST',route,a.token,{revision:1});assert.equal(claimed.status,200);assert.equal(claimed.data.claim.treasure,10);
  }return original(statements);};
  const auditBefore=f.sqlite.prepare('SELECT count(*) AS n FROM bk_operator_audit').get().n;
  const edited=await f.send(op,kind==='gift'?'gifts':'events',{...body,id,revision:1,treasure:20});assert.equal(edited.status,409);assert.equal(edited.data.code,'content_conflict');
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_operator_audit').get().n,auditBefore,'the rejected edit cannot produce a false audit entry');
  const claimed=await f.api('POST',route,b.token,{revision:1});assert.equal(claimed.status,200);assert.equal(claimed.data.claim.treasure,10);
 }
});

test('a scheduled message recipient cannot change after another request has opened it at the start boundary',async t=>{
 const f=fixture(t),op=await f.operator(),a=await f.profile('既読の王'),b=await f.profile('別の王');
 const body={title:'予約メールの対象',body:'',target:a.id,status:'published',publishAt:f.now()+100};
 const id=(await f.send(op,'messages',body)).data.createdId,original=f.env.DB.batch.bind(f.env.DB);let intercepted=false;
 f.env.DB.batch=async statements=>{if(!intercepted&&statements.some(s=>s.sql.startsWith('UPDATE bk_announcements'))){intercepted=true;f.advance(100);assert.equal((await f.api('POST',`/api/inbox/${id}/read`,a.token,{})).status,200);}return original(statements);};
 assert.equal((await f.send(op,'messages',{...body,id,revision:1,target:b.id})).status,409);
 assert.equal((await f.api('GET','/api/inbox',a.token)).data.messages[0].id,id);assert.equal((await f.api('GET','/api/inbox',b.token)).data.messages.length,0);
});

test('a claim completed between the receipt and save reads replays across linked devices for gifts and events',async t=>{
 for(const kind of ['gift','event']){
  const f=fixture(t),op=await f.operator(),player=await f.profile('連携受取');await f.save(player);const linked=await f.link(player);
  const body={title:'同時受取',body:'',target:player.id,status:'published',treasure:30,cards:[],...(kind==='gift'?{}:{startAt:f.now(),endAt:f.now()+1000})};
  const id=(await f.send(op,kind==='gift'?'gifts':'events',body)).data.createdId;
  const route=kind==='gift'?`/api/inbox/${id}/claim`:`/api/events/${id}/claim`;
  const prepare=f.env.DB.prepare.bind(f.env.DB);let intercepted=false;
  f.env.DB.prepare=sql=>{
   const statement=prepare(sql),bind=statement.bind.bind(statement);
   statement.bind=(...args)=>{
    const bound=bind(...args),first=bound.first.bind(bound);
    if(sql==='SELECT revision,data_json,updated_at FROM bk_cloud_saves WHERE player_id=?')bound.first=async(...columns)=>{
     if(!intercepted){intercepted=true;const firstClaim=await f.api('POST',route,player.token,{revision:1});assert.equal(firstClaim.status,200);}
     return first(...columns);
    };
    return bound;
   };
   return statement;
  };
  const retried=await f.api('POST',route,linked.token,{revision:1});
  assert.equal(retried.status,200,JSON.stringify(retried.data));assert.equal(retried.data.replayed,true);
  assert.equal(retried.data.save.revision,2);assert.equal(retried.data.save.data.treasure,130);assert.equal(retried.data.claim.treasure,30);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_reward_claims WHERE item_id=?').get(id).n,1);
 }
});

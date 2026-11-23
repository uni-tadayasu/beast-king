import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createOnlineWorker} from '../server/worker.js';
import {CARDS, ORIGINS, STARTER_DECKS, getCard} from '../catalog.js';

const ORIGIN='https://www.beast-king.com';
const BASE='https://beast-king.hisa-0128-1996.chatgpt.site';
const schema=readFileSync(new URL('../server/schema.sql',import.meta.url),'utf8');

// Exercise the actual SQL and its constraints. D1 batches execute transactionally;
// a zero-row UPDATE succeeds, while a constraint error rolls back the whole batch.
class D1Statement {
  constructor(adapter,sql,args=[]){this.adapter=adapter;this.sql=sql;this.args=args;}
  bind(...args){return new D1Statement(this.adapter,this.sql,args);}
  execute(){
    const rows=this.adapter.sqlite.prepare(this.sql).all(...this.args).map(row=>({...row}));
    const changes=Number(this.adapter.sqlite.prepare('SELECT changes() AS n').get().n);
    return {success:true,results:rows,meta:{changes,last_row_id:Number(this.adapter.sqlite.prepare('SELECT last_insert_rowid() AS n').get().n),rows_read:rows.length,rows_written:changes,duration:0}};
  }
  async first(column){const row=this.execute().results[0]??null;return column===undefined?row:row?.[column]??null;}
  async all(){return this.execute();}
  async run(){return this.execute();}
  async raw(){return this.execute().results.map(Object.values);}
}
class D1Adapter {
  constructor(sqlite){this.sqlite=sqlite;}
  prepare(sql){return new D1Statement(this,sql);}
  async batch(statements){
    this.sqlite.exec('BEGIN IMMEDIATE');
    try{const results=statements.map(statement=>statement.execute());this.sqlite.exec('COMMIT');return results;}
    catch(error){this.sqlite.exec('ROLLBACK');throw error;}
  }
  withSession(){return this;}
  exec(){throw new Error('Schema migrations must not execute inside an HTTP request.');}
}
function fixture(t){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(schema);sqlite.exec('PRAGMA foreign_keys=ON');
  t.after(()=>sqlite.close());
  let timestamp=1_800_000_000_000;
  const env={DB:new D1Adapter(sqlite)};
  let worker=createOnlineWorker({now:()=>timestamp});
  async function api(method,path,token,body,{origin=ORIGIN,headers={}}={}){
    const requestHeaders={...headers};
    if(origin!==null)requestHeaders.Origin=origin;
    if(token)requestHeaders.Authorization=`Bearer ${token}`;
    if(body!==undefined)requestHeaders['Content-Type']='application/json';
    const background=[];
    const response=await worker.fetch(new Request(BASE+path,{method,headers:requestHeaders,...(body===undefined?{}:{body:JSON.stringify(body)})}),env,{waitUntil:p=>background.push(p)});
    const text=await response.text();
    const data=text?JSON.parse(text):null;
    await Promise.all(background);
    return {status:response.status,headers:response.headers,data};
  }
  async function profile(nickname='山の旅人'){
    const response=await api('POST','/api/profile',null,{nickname});
    assert.ok([200,201].includes(response.status),JSON.stringify(response.data));
    assert.equal(response.data.ok,true);assert.ok(response.data.token);assert.ok(response.data.profile?.id);
    return {...response.data.profile,token:response.data.token};
  }
  let actionSequence=0;
  async function action(person,match,kind,extra={}){
    return api('POST',`/api/matches/${match.id}/actions`,person.token,{actionId:`action-test-${++actionSequence}`,revision:match.revision,kind,...extra});
  }
  return {sqlite,env,api,profile,action,now:()=>timestamp,setNow:value=>{timestamp=value;},advance:ms=>{timestamp+=ms;},reconnect:()=>{worker=createOnlineWorker({now:()=>timestamp});}};
}
function deck(index=0){return {deck:[...STARTER_DECKS[index].ids],special:[...STARTER_DECKS[index].specialIds]};}
function matchFrom(response){assert.ok([200,201].includes(response.status),JSON.stringify(response.data));assert.equal(response.data.ok,true);assert.ok(response.data.match?.id,JSON.stringify(response.data));return response.data.match;}
async function roomPair(f,host,guest){
  const created=await f.api('POST','/api/rooms',host.token,deck());
  assert.ok([200,201].includes(created.status),JSON.stringify(created.data));
  assert.equal(created.data.status,'waiting');assert.match(created.data.room.code,/^[A-Z0-9]{6}$/);
  const joined=await f.api('POST',`/api/rooms/${created.data.room.code}/join`,guest.token,deck());
  const guestMatch=matchFrom(joined);
  const hostMatch=matchFrom(await f.api('GET',`/api/matches/${guestMatch.id}`,host.token));
  return {code:created.data.room.code,hostMatch,guestMatch};
}
async function rankedPair(f,one,two){
  const first=await f.api('POST','/api/queue',one.token,deck());
  assert.equal(first.data.status,'waiting');
  await f.api('POST','/api/queue',two.token,deck(1));
  const a=matchFrom(await f.api('GET','/api/queue',one.token));
  const b=matchFrom(await f.api('GET','/api/queue',two.token));
  assert.equal(a.id,b.id);return {a,b};
}
function rawState(f,id){return JSON.parse(f.sqlite.prepare('SELECT state_json FROM bk_matches WHERE id=?').get(id).state_json);}
function saveState(f,id,state){f.sqlite.prepare('UPDATE bk_matches SET state_json=? WHERE id=?').run(JSON.stringify(state),id);}
function pull(player,predicate){
  for(const zone of ['hand','deck']){const index=player[zone].findIndex(id=>predicate(getCard(id)));if(index>=0)return player[zone].splice(index,1)[0];}
  throw new Error('Fixture card is not available.');
}
function fieldUnit(state,who){
  const cardId=pull(state.players[who],card=>card.type==='beast'),card=getCard(cardId);
  const unit={uid:`u${state.nextUid++}`,cardId,owner:who,attack:card.attack,hp:card.hp,maxHp:card.hp,keywords:[...card.keywords],ready:true};
  state.players[who].field.push(unit);return unit;
}
function arrangeHand(player,ids){
  const pool=[...player.hand,...player.deck],hand=[];
  for(const id of ids){const index=pool.indexOf(id);assert.notEqual(index,-1,`Missing fixture card ${id}`);hand.push(...pool.splice(index,1));}
  while(hand.length<4)hand.push(pool.shift());player.hand=hand;player.deck=pool;
}

// Authentication and request boundary behavior.
test('guest profiles use 32 random bytes, store only token hashes, and reconnect by the same bearer token',async t=>{
  const f=fixture(t),a=await f.profile('川の王'),b=await f.profile('草の王');
  assert.match(a.token,/^[A-Za-z0-9_-]{43}$/);assert.equal(Buffer.from(a.token,'base64url').length,32);assert.notEqual(a.token,b.token);
  const stored=f.sqlite.prepare('SELECT * FROM bk_profiles WHERE id=?').get(a.id);
  assert.match(stored.token_hash,/^[a-f0-9]{64}$/);assert.notEqual(stored.token_hash,a.token);assert.equal(stored.rating,1000);
  assert.equal(JSON.stringify(stored).includes(a.token),false);
  f.reconnect();const resumed=await f.api('GET','/api/profile',a.token);
  assert.equal(resumed.status,200);assert.equal(resumed.data.profile.id,a.id);assert.equal(resumed.data.profile.nickname,'川の王');assert.equal(resumed.data.token,undefined);
  const renamed=await f.api('POST','/api/profile',a.token,{nickname:'種の王'});
  assert.equal(renamed.data.profile.id,a.id);assert.equal(renamed.data.profile.nickname,'種の王');assert.equal(renamed.data.token,undefined);
});

test('profile origins default to mountain, persist all six choices, and reject invalid changes atomically',async t=>{
  const f=fixture(t),person=await f.profile('山の旅人');assert.equal(person.origin,'mountain');
  for(const {id:origin} of ORIGINS){
    const changed=await f.api('POST','/api/profile',person.token,{origin});
    assert.equal(changed.status,200);assert.equal(changed.data.profile.origin,origin);assert.equal(changed.data.profile.nickname,person.nickname);assert.equal(changed.data.token,undefined);
    f.reconnect();const resumed=await f.api('GET','/api/profile',person.token);
    assert.equal(resumed.data.profile.origin,origin);assert.equal(resumed.data.profile.id,person.id);assert.equal(JSON.stringify(resumed.data).includes(person.token),false);
  }
  for(const origin of ['dawn','',null,17]){
    const rejected=await f.api('POST','/api/profile',person.token,{nickname:'変更しない',origin});
    assert.equal(rejected.status,400);assert.equal(rejected.data.code,'invalid_origin');
    const current=(await f.api('GET','/api/profile',person.token)).data.profile;
    assert.equal(current.origin,'tree');assert.equal(current.nickname,person.nickname);
  }
  const before=f.sqlite.prepare('SELECT count(*) AS n FROM bk_profiles').get().n;
  assert.equal((await f.api('POST','/api/profile',null,{nickname:'作成しない',origin:'invalid'})).status,400);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_profiles').get().n,before);
  const fresh=await f.api('POST','/api/profile',null,{nickname:'川の旅人',origin:'river'});
  assert.equal(fresh.data.profile.origin,'river');assert.equal(fresh.data.profile.rating,1000);
});

test('the appended origin migration preserves existing accounts and enforces its six-value constraint',t=>{
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
  sqlite.exec(readFileSync(new URL('../drizzle/0000_beast_king_online.sql',import.meta.url),'utf8'));
  sqlite.prepare('INSERT INTO bk_profiles (id,token_hash,nickname,rating,created_at,updated_at) VALUES (?,?,?,?,?,?)').run('legacy','saved-hash','以前の旅人',1234,1,2);
  const old=sqlite.prepare('SELECT * FROM bk_profiles WHERE id=?').get('legacy');
  sqlite.exec(readFileSync(new URL('../drizzle/0001_profile_origin.sql',import.meta.url),'utf8'));
  const updated=sqlite.prepare('SELECT * FROM bk_profiles WHERE id=?').get('legacy');
  assert.equal(updated.origin,'mountain');delete updated.origin;assert.deepEqual(updated,old);
  assert.throws(()=>sqlite.prepare('UPDATE bk_profiles SET origin=? WHERE id=?').run('aether','legacy'),/CHECK/i);
});

test('CORS is exact, preflight supports bearer requests, and authentication and nickname bounds are enforced',async t=>{
  const f=fixture(t);
  const preflight=await f.api('OPTIONS','/api/queue',null,undefined,{headers:{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),ORIGIN);
  assert.match(preflight.headers.get('access-control-allow-headers')||'',/authorization/i);
  for(const origin of ['https://www.beast-king.com.evil.example','https://evil.example','null']){
    const denied=await f.api('POST','/api/profile',null,{nickname:'侵入'}, {origin});
    assert.equal(denied.status,403);assert.notEqual(denied.headers.get('access-control-allow-origin'),origin);
  }
  assert.equal((await f.api('GET','/api/queue')).status,401);
  assert.equal((await f.api('GET','/api/queue','not-a-real-token')).status,401);
  for(const nickname of ['', 'あ'.repeat(17)])assert.equal((await f.api('POST','/api/profile',null,{nickname})).status,400);
  assert.ok([200,201].includes((await f.api('POST','/api/profile',null,{nickname:'あ'.repeat(16)})).status));
});

test('illegal deck size, types, special deck, and copy counts cannot occupy a room or queue',async t=>{
  const f=fixture(t),person=await f.profile();
  const third=deck().deck,duplicate=third[0];third[third.findIndex(id=>id!==duplicate)]=duplicate;
  const invalid=[
    {...deck(),deck:deck().deck.slice(1)},
    {...deck(),deck:[...deck().deck.slice(1),'F0001']},
    {...deck(),special:deck().special.slice(1)},
    {...deck(),special:['F0001','F0001','F0001','F0001']},
    {...deck(),special:['F0001','F0001','F0001','F0002']},
    {...deck(),deck:third},
    {...deck(),deck:Array(32).fill('B0001')}
  ];
  for(const body of invalid){
    const response=await f.api('POST','/api/queue',person.token,body);
    assert.equal(response.status,400,JSON.stringify(response.data));assert.equal(response.data.ok,false);
  }
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_occupancy').get().n,0);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_queue').get().n,0);
  const room=await f.api('POST','/api/rooms',person.token,{...deck(),special:['F0001','F0001','F0002','F0002']});assert.equal(room.data.status,'waiting');
});

test('rooms create real two-player matches and snapshots hide identities and shuffle state for both seats',async t=>{
  const f=fixture(t),host=await f.profile('山の王'),guest=await f.profile('花の王'),stranger=await f.profile('見知らぬ王');
  const {code,hostMatch}=await roomPair(f,host,guest);
  const state=rawState(f,hostMatch.id);fieldUnit(state,0);fieldUnit(state,1);
  for(let who=0;who<2;who++){const cardId=pull(state.players[who],card=>card.type==='gimmick');state.players[who].traps.push({uid:`g${state.nextUid++}`,cardId});}
  saveState(f,hostMatch.id,state);
  for(const [viewer,other,seat] of [[host,guest,0],[guest,host,1]]){
    const snapshot=matchFrom(await f.api('GET',`/api/rooms/${code}`,viewer.token));
    assert.equal(snapshot.mode,'room');assert.equal(snapshot.roomCode,code);assert.equal(snapshot.opponent.kind,'human');assert.equal(snapshot.opponent.name,other.nickname);
    assert.equal(snapshot.state.players[0].name,viewer.nickname);assert.equal(snapshot.state.players[1].name,other.nickname);
    assert.equal(snapshot.state.active,seat===0?0:1);assert.equal(snapshot.state.seed,undefined);
    assert.equal(snapshot.state.players[0].field[0].owner,0);assert.equal(snapshot.state.players[1].field[0].owner,1);
    assert.ok(snapshot.state.players[0].hand.every(id=>typeof id==='string'));
    assert.ok(snapshot.state.players[0].special.every(id=>typeof id==='string'));
    for(const player of snapshot.state.players)assert.ok(player.deck.every(id=>id===null),'Neither deck may expose draw order.');
    for(const zone of ['hand','special'])assert.ok(snapshot.state.players[1][zone].every(id=>id===null));
    assert.ok(snapshot.state.players[1].traps.every(trap=>Object.keys(trap).join(',')==='uid'));
    assert.equal(snapshot.state.players[1].hand.length,state.players[1-seat].hand.length);
    assert.equal(snapshot.state.players[1].special.length,4);
    assert.ok(snapshot.state.log.every(event=>!event.text.includes('あなた')&&!event.text.includes('CPU')));
    assert.ok(snapshot.state.log.some(event=>event.text.includes(host.nickname)));
  }
  const unauthorized=await f.api('GET',`/api/matches/${hostMatch.id}`,stranger.token);
  assert.ok([403,404].includes(unauthorized.status));assert.equal(unauthorized.data.match,undefined);
});

test('both match viewers see the opponent public origin without exposing private identity or changing the board',async t=>{
  const f=fixture(t),host=await f.profile('花の王'),guest=await f.profile('草の王');
  await f.api('POST','/api/profile',host.token,{origin:'flower'});await f.api('POST','/api/profile',guest.token,{origin:'grass'});
  const {hostMatch,guestMatch}=await roomPair(f,host,guest);
  assert.equal(hostMatch.opponent.origin,'grass');assert.equal(guestMatch.opponent.origin,'flower');
  const board=f.sqlite.prepare('SELECT state_json FROM bk_matches WHERE id=?').get(hostMatch.id).state_json;
  await f.api('POST','/api/profile',guest.token,{origin:'tree'});
  const refreshed=matchFrom(await f.api('GET',`/api/matches/${hostMatch.id}`,host.token));
  assert.equal(refreshed.opponent.origin,'tree');assert.equal(refreshed.revision,hostMatch.revision);
  assert.equal(f.sqlite.prepare('SELECT state_json FROM bk_matches WHERE id=?').get(hostMatch.id).state_json,board);
  assert.equal(JSON.stringify(refreshed).includes(guest.token),false);assert.equal(refreshed.opponent.token_hash,undefined);
  assert.ok(refreshed.state.players[1].hand.every(id=>id===null));assert.ok(refreshed.state.players[1].special.every(id=>id===null));
});

test('online effect history preserves turns and real source names without revealing draws or an untriggered gimmick',async t=>{
  const f=fixture(t),host=await f.profile('記録の王'),guest=await f.profile('相手の王');
  const selected=deck(),drawCard=CARDS.find(card=>card.type==='miracle'&&card.effect.kind==='draw');
  selected.deck[selected.deck.findIndex(id=>getCard(id).type==='miracle')]=drawCard.id;
  const created=await f.api('POST','/api/rooms',host.token,selected);
  const joined=matchFrom(await f.api('POST',`/api/rooms/${created.data.room.code}/join`,guest.token,deck()));
  const server=rawState(f,joined.id),p=server.players[0];
  const trapId=[...p.hand,...p.deck].find(id=>getCard(id).effect.kind==='ambush');
  arrangeHand(p,[trapId,drawCard.id]);p.energy=10;p.maxEnergy=10;
  const hiddenDraw=p.deck[0],attacker=fieldUnit(server,1);attacker.hp=5000;attacker.maxHp=5000;attacker.ready=false;
  saveState(f,joined.id,server);
  let mine=matchFrom(await f.api('GET',`/api/matches/${joined.id}`,host.token));
  mine=matchFrom(await f.action(host,mine,'play',{handIndex:mine.state.players[0].hand.indexOf(trapId)}));
  mine=matchFrom(await f.action(host,mine,'play',{handIndex:mine.state.players[0].hand.indexOf(drawCard.id)}));
  let opponent=matchFrom(await f.api('GET',`/api/matches/${joined.id}`,guest.token));
  assert.deepEqual(opponent.state.log,mine.state.log);
  assert.ok(opponent.state.log.every(event=>Number.isInteger(event.turn)&&event.turn===1));
  assert.ok(opponent.state.log.some(event=>event.type==='draw'&&event.text.includes(drawCard.name)));
  assert.ok(opponent.state.log.every(event=>!event.text.includes(getCard(trapId).name)&&!event.text.includes(getCard(hiddenDraw).name)));
  for(const id of p.special)assert.ok(opponent.state.log.every(event=>!event.text.includes(getCard(id).name)));
  mine=matchFrom(await f.action(host,mine,'endTurn'));
  opponent=matchFrom(await f.api('GET',`/api/matches/${joined.id}`,guest.token));
  opponent=matchFrom(await f.action(guest,opponent,'attack',{attackerUid:attacker.uid,target:{player:1,core:true}}));
  assert.ok(opponent.state.log.some(event=>event.type==='gimmick'&&event.turn===2&&event.text.includes(getCard(trapId).name)));
  assert.ok(opponent.state.log.some(event=>event.type==='damage'&&event.turn===2&&event.text.includes(getCard(trapId).name)));
});

test('ranked matchmaking pairs actual waiting people and both reconnect to one match',async t=>{
  const f=fixture(t),one=await f.profile('木の王'),two=await f.profile('川の王');
  const {a,b}=await rankedPair(f,one,two);
  assert.equal(a.mode,'ranked');assert.equal(a.opponent.kind,'human');assert.equal(b.opponent.kind,'human');
  assert.equal(a.opponent.name,two.nickname);assert.equal(b.opponent.name,one.nickname);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_matches').get().n,1);
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM bk_occupancy WHERE kind='match'").get().n,2);
  f.reconnect();assert.equal(matchFrom(await f.api('GET','/api/queue',one.token)).id,a.id);
  assert.equal(matchFrom(await f.api('GET',`/api/matches/${a.id}`,two.token)).id,a.id);
});

test('BOT fallback never starts before 60 seconds and executes its turn on the server',async t=>{
  const f=fixture(t),one=await f.profile('待機する王');
  const started=await f.api('POST','/api/queue',one.token,deck());assert.equal(started.data.status,'waiting');
  f.advance(59_999);const early=await f.api('GET','/api/queue',one.token);assert.equal(early.data.status,'waiting');assert.equal(early.data.match,null);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_matches').get().n,0);
  f.advance(1);const match=matchFrom(await f.api('GET','/api/queue',one.token));
  assert.equal(match.opponent.kind,'bot');assert.match(match.opponent.name,/CPU\s*1|BOT/i);assert.equal(match.mode,'ranked');assert.equal(match.state.active,0);
  const stored=rawState(f,match.id);assert.ok(ORIGINS.some(origin=>origin.id===match.opponent.origin));assert.equal(match.opponent.origin,stored.botOrigin);assert.equal(match.state.botOrigin,undefined);
  delete stored.botOrigin;saveState(f,match.id,stored);assert.equal(matchFrom(await f.api('GET',`/api/matches/${match.id}`,one.token)).opponent.origin,'mountain');
  const after=matchFrom(await f.action(one,match,'endTurn'));
  assert.equal(after.state.active,0);assert.equal(after.state.turn,3);assert.equal(after.revision,match.revision+1);
});

test('a human candidate takes priority when another player has reached the 60-second threshold',async t=>{
  const f=fixture(t),one=await f.profile('先に待つ王'),two=await f.profile('後から来る王');
  await f.api('POST','/api/queue',one.token,deck());f.advance(59_999);await f.api('GET','/api/queue',one.token);f.advance(1);
  await f.api('POST','/api/queue',two.token,deck(1));
  const first=matchFrom(await f.api('GET','/api/queue',one.token));const second=matchFrom(await f.api('GET','/api/queue',two.token));
  assert.equal(first.id,second.id);assert.equal(first.opponent.kind,'human');assert.equal(second.opponent.kind,'human');
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_matches WHERE bot=1').get().n,0);
});

test('concurrent joins create exactly one match and the rejected guest has no orphan occupancy',async t=>{
  const f=fixture(t),host=await f.profile('部屋主'),one=await f.profile('参加者一'),two=await f.profile('参加者二');
  const room=await f.api('POST','/api/rooms',host.token,deck()),code=room.data.room.code;
  const results=await Promise.all([one,two].map(person=>f.api('POST',`/api/rooms/${code}/join`,person.token,deck())));
  const successes=results.map((response,i)=>({response,person:[one,two][i]})).filter(({response})=>response.data.ok);
  assert.equal(successes.length,1,JSON.stringify(results.map(r=>r.data)));
  const failedIndex=results.findIndex(response=>!response.data.ok);assert.equal(results[failedIndex].status,409);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_matches').get().n,1);
  const retry=await f.api('POST','/api/queue',[one,two][failedIndex].token,deck());assert.equal(retry.data.status,'waiting');
});

test('one profile cannot enter a room and the ranked queue concurrently',async t=>{
  const f=fixture(t),person=await f.profile('一人の王');
  const results=await Promise.all([f.api('POST','/api/rooms',person.token,deck()),f.api('POST','/api/queue',person.token,deck())]);
  assert.equal(results.filter(r=>r.data.ok).length,1,JSON.stringify(results.map(r=>r.data)));
  assert.equal(results.filter(r=>r.status===409).length,1);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_occupancy WHERE player_id=?').get(person.id).n,1);
  const occupied=f.sqlite.prepare('SELECT kind FROM bk_occupancy WHERE player_id=?').get(person.id);
  assert.ok(['room','queue'].includes(occupied.kind));
});

test('simultaneous ranked requests reserve each person once and leave the unmatched person waiting',async t=>{
  const f=fixture(t),people=await Promise.all(['山の挑戦者','川の挑戦者','種の挑戦者'].map(name=>f.profile(name)));
  const results=await Promise.all(people.map(person=>f.api('POST','/api/queue',person.token,deck())));
  assert.ok(results.every(response=>response.data.ok),JSON.stringify(results.map(r=>r.data)));
  const polls=await Promise.all(people.map(person=>f.api('GET','/api/queue',person.token)));
  assert.equal(polls.filter(r=>r.data.status==='matched').length,2,JSON.stringify(polls.map(r=>r.data)));
  assert.equal(polls.filter(r=>r.data.status==='waiting').length,1);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_matches').get().n,1);
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM bk_occupancy WHERE kind='match'").get().n,2);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_queue').get().n,1);
});

test('cancelling after queue reservation but before its response leaves an idle profile without a server error',async t=>{
  const f=fixture(t),person=await f.profile('キャンセルする王');
  const batch=f.env.DB.batch.bind(f.env.DB);let intercepted=false,cancelled;
  // A second tab cancels after the first transaction commits, before the first
  // request performs its follow-up read. The SQL still runs unchanged.
  f.env.DB.batch=async statements=>{
    const result=await batch(statements);
    if(!intercepted&&statements.some(statement=>statement.sql.startsWith('INSERT INTO bk_queue'))){
      intercepted=true;cancelled=await f.api('DELETE','/api/queue',person.token);
    }
    return result;
  };
  const queued=await f.api('POST','/api/queue',person.token,deck());
  assert.equal(cancelled.status,200);assert.equal(cancelled.data.status,'idle');
  assert.equal(queued.status,200,JSON.stringify(queued.data));assert.equal(queued.data.status,'idle');
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_occupancy WHERE player_id=?').get(person.id).n,0);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_queue').get().n,0);
});

test('revision CAS accepts one concurrent action and action IDs are idempotent, including mismatched-body rejection',async t=>{
  const f=fixture(t),host=await f.profile('先手'),guest=await f.profile('後手');const {hostMatch}=await roomPair(f,host,guest);
  const path=`/api/matches/${hostMatch.id}/actions`;
  const request={actionId:'duplicate-action',revision:hostMatch.revision,kind:'endTurn'};
  const duplicates=await Promise.all([f.api('POST',path,host.token,request),f.api('POST',path,host.token,request)]);
  assert.ok(duplicates.every(r=>r.status===200),JSON.stringify(duplicates.map(r=>r.data)));
  assert.ok(duplicates.every(r=>r.data.match.revision===hostMatch.revision+1));
  assert.equal(rawState(f,hostMatch.id).turn,2);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM bk_actions WHERE match_id=?').get(hostMatch.id).n,1);
  const mismatch=await f.api('POST',path,host.token,{...request,kind:'surrender'});assert.equal(mismatch.status,409);
  const stale=await f.api('POST',path,host.token,{...request,actionId:'stale-action-other'});assert.equal(stale.status,409);
  const guestMatch=matchFrom(await f.api('GET',`/api/matches/${hostMatch.id}`,guest.token));
  const competing=await Promise.all(['competing-one','competing-two'].map(actionId=>f.api('POST',path,guest.token,{actionId,revision:guestMatch.revision,kind:'endTurn'})));
  assert.equal(competing.filter(r=>r.status===200).length,1);assert.equal(competing.filter(r=>r.status===409).length,1);
  assert.equal(rawState(f,hostMatch.id).turn,3);
});

test('seat-one actions rotate targets and fusion ownership while rejecting an out-of-turn opponent',async t=>{
  const f=fixture(t),host=await f.profile('先手の王'),guest=await f.profile('後手の王');const {hostMatch}=await roomPair(f,host,guest);
  await f.action(host,hostMatch,'endTurn');
  const state=rawState(f,hostMatch.id),player=state.players[1];player.energy=10;player.maxEnergy=10;
  arrangeHand(player,['M0001','M0004','M0256']);const unit=fieldUnit(state,1);
  player.grave.push(pull(player,card=>card.type==='beast'));saveState(f,hostMatch.id,state);
  let current=matchFrom(await f.api('GET',`/api/matches/${hostMatch.id}`,guest.token));
  assert.equal(current.state.active,0);assert.equal(current.state.players[0].field[0].owner,0);
  const deadline=current.turnDeadline;f.advance(60_000);
  const rejected=await f.action(host,{...hostMatch,revision:current.revision},'endTurn');assert.ok([400,403,409].includes(rejected.status));
  const before=state.players[0].core;
  current=matchFrom(await f.action(guest,current,'attack',{attackerUid:unit.uid,target:{player:1,core:true}}));
  assert.equal(current.state.players[1].core,before-unit.attack);
  assert.equal(current.turnDeadline,deadline,'Playing cards or attacking must not extend a turn indefinitely.');
  current=matchFrom(await f.action(guest,current,'play',{handIndex:current.state.players[0].hand.indexOf('M0001'),target:{player:1,core:true}}));
  assert.equal(current.state.players[1].core,before-unit.attack-getCard('M0001').effect.value);
  current=matchFrom(await f.action(guest,current,'play',{handIndex:current.state.players[0].hand.indexOf('M0004'),target:{player:0,uid:unit.uid}}));
  assert.equal(current.state.players[0].field[0].attack,unit.attack+getCard('M0004').effect.value);
  const own=current.state.players[0],graveId=own.grave.find(id=>getCard(id)?.type==='beast');
  const graveIndex=own.grave.indexOf(graveId),fusion={player:0,specialIndex:0,materials:[{zone:'grave',index:graveIndex,cardId:graveId,player:0,owner:0},{zone:'field',index:0,uid:unit.uid,player:0,owner:0}]};
  current=matchFrom(await f.action(guest,current,'play',{handIndex:own.hand.indexOf('M0256'),fusion}));
  assert.equal(current.state.players[0].field.length,1);assert.equal(current.state.players[0].field[0].owner,0);
  assert.equal(getCard(current.state.players[0].field[0].cardId).type,'fusion');assert.equal(current.state.players[0].banished.length,2);
  const server=rawState(f,hostMatch.id);assert.equal(server.players[1].field[0].owner,1);assert.equal(server.players[0].core,current.state.players[1].core);
});

test('ranked timeout occurs at 120 seconds and rating settlement happens once under concurrent polling',async t=>{
  const f=fixture(t),one=await f.profile('時間切れの王'),two=await f.profile('待つ王');const {a}=await rankedPair(f,one,two);
  const row=f.sqlite.prepare('SELECT player0,player1 FROM bk_matches WHERE id=?').get(a.id);
  const current=row.player0===one.id?one:two,other=current.id===one.id?two:one;
  const initial=matchFrom(await f.api('GET',`/api/matches/${a.id}`,current.token));
  const history=rawState(f,a.id);history.log=Array.from({length:1000},(_,i)=>({text:`公開履歴${i}`,type:'info',turn:1}));saveState(f,a.id,history);
  f.setNow(initial.turnDeadline-1);assert.equal(matchFrom(await f.api('GET',`/api/matches/${a.id}`,current.token)).status,'active');
  f.advance(1);
  const settled=await Promise.all([current,other,current,other].map(person=>f.api('GET',`/api/matches/${a.id}`,person.token)));
  assert.ok(settled.every(r=>r.status===200),JSON.stringify(settled.map(r=>r.data)));
  const loser=settled[0].data.match,winner=settled[1].data.match;
  assert.equal(loser.status,'finished');assert.equal(loser.result,'loss');assert.equal(winner.result,'win');assert.equal(loser.reason,'timeout');
  assert.equal(loser.state.log.length,1000);assert.equal(loser.state.log[0].text,'公開履歴1');assert.equal(loser.state.log.at(-1).turn,loser.state.turn);
  assert.ok(loser.ratingDelta<0);assert.equal(winner.ratingDelta,-loser.ratingDelta);
  const profiles=f.sqlite.prepare('SELECT id,rating,wins,losses FROM bk_profiles ORDER BY id').all().map(row=>({...row}));
  assert.equal(profiles.reduce((sum,p)=>sum+p.rating,0),2000);assert.equal(profiles.reduce((sum,p)=>sum+p.wins,0),1);assert.equal(profiles.reduce((sum,p)=>sum+p.losses,0),1);
  assert.equal(f.sqlite.prepare('SELECT rating_applied FROM bk_matches WHERE id=?').get(a.id).rating_applied,1);
  const repeated=matchFrom(await f.api('GET',`/api/matches/${a.id}`,current.token));assert.equal(repeated.revision,loser.revision);assert.equal(repeated.ratingDelta,loser.ratingDelta);
  assert.deepEqual(f.sqlite.prepare('SELECT id,rating,wins,losses FROM bk_profiles ORDER BY id').all().map(row=>({...row})),profiles);
  assert.equal((await f.action(current,repeated,'endTurn')).status,409);
});

test('room surrender finishes without rating changes and old-room deletion cannot release a new queue',async t=>{
  const f=fixture(t),host=await f.profile('部屋の王'),guest=await f.profile('客の王');const {code,hostMatch}=await roomPair(f,host,guest);
  const request={actionId:'surrender-repeat',revision:hostMatch.revision,kind:'surrender'};
  const path=`/api/matches/${hostMatch.id}/actions`;
  const lost=matchFrom(await f.api('POST',path,host.token,request));assert.equal(lost.result,'loss');assert.equal(lost.ratingDelta,0);assert.equal(lost.selfRating,1000);
  assert.equal(lost.state.log.at(-1).turn,lost.state.turn);
  const won=matchFrom(await f.api('GET',`/api/matches/${hostMatch.id}`,guest.token));assert.equal(won.result,'win');assert.equal(won.ratingDelta,0);assert.equal(won.selfRating,1000);
  const repeat=matchFrom(await f.api('POST',path,host.token,request));assert.equal(repeat.revision,lost.revision);
  f.reconnect();assert.equal(matchFrom(await f.api('GET',`/api/matches/${hostMatch.id}`,host.token)).result,'loss');
  const queued=await f.api('POST','/api/queue',host.token,deck());assert.equal(queued.data.status,'waiting');
  await f.api('DELETE',`/api/rooms/${code}`,host.token);
  assert.equal(f.sqlite.prepare('SELECT kind FROM bk_occupancy WHERE player_id=?').get(host.id)?.kind,'queue');
  assert.equal((await f.api('GET','/api/queue',host.token)).data.status,'waiting');
});

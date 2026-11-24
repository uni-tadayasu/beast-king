import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {EXPANSION_DECKS,STARTER_DECKS,getCard} from '../catalog.js';
import {createStarterCollection,grantDeckCollection,openPack} from '../shop.js';
import {createCampaignProgress} from '../campaign.js';
import {newGame,runAutomatedTurn} from '../engine.js';
import {validateCloudData} from '../server/account.js';
import {createOnlineWorker} from '../server/worker.js';

const recipes=EXPANSION_DECKS.filter(deck=>deck.setId==='BK05');
const player={nickname:'夢界のテスト王',origin:'flower'};
const invalid=(status,code,message)=>{throw Object.assign(new Error(message),{status,code});};
function saveData(deck=recipes[0]){
 let collection=createStarterCollection();
 for(const recipe of recipes)collection=grantDeckCollection(collection,[...recipe.ids,...recipe.specialIds]);
 let seed=51753;const randomFn=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const pack=openPack({treasure:1000,collection},{packId:'BK05',randomFn});assert.equal(pack.ok,true);
 const deckLibrary=recipes.map(recipe=>({id:'custom-dream-'+recipe.family,name:recipe.name,ids:[...recipe.ids],specialIds:[...recipe.specialIds]}));
 const active=deckLibrary.find(entry=>entry.id==='custom-dream-'+deck.family);
 return {version:6,playerName:player.nickname,profileOrigin:player.origin,campaignProgress:createCampaignProgress(),bgm:true,bgmVolume:.5,sound:false,motion:true,
  treasure:pack.treasure,collection:pack.collection,rewardedMatches:[],lastPack:{packId:'BK05',pulls:pack.pulls,bonusTreasure:pack.bonusTreasure,openedAt:1800000000000},
  deckName:active.name,deckIds:[...active.ids],specialIds:[...active.specialIds],starter:STARTER_DECKS[0].id,freeStarterId:STARTER_DECKS[0].id,
  deckLibrary,activeDeckId:active.id,editingDeckId:active.id,draft:null,stats:{played:0,won:0,drawn:0},game:null};
}

test('fifth-pack purchases and all four 32+4 recipes survive the server cloud allowlist without mutation',()=>{
 assert.equal(recipes.length,4);
 for(const recipe of recipes){
  const raw=saveData(recipe);raw.game=newGame({playerDeck:recipe.ids,playerSpecialDeck:recipe.specialIds,cpuDeck:recipe.ids,cpuSpecialDeck:recipe.specialIds,seed:51619});
  assert.equal(runAutomatedTurn(raw.game,'hard').ok,true);
  const before=structuredClone(raw),validated=validateCloudData(raw,player,invalid);
  assert.deepEqual(raw,before,'server validation does not mutate submitted data');
  assert.deepEqual(validated,raw);assert.deepEqual(validateCloudData(JSON.parse(JSON.stringify(validated)),player,invalid),validated);
  assert.equal(validated.deckIds.length,32);assert.equal(validated.specialIds.length,4);
  assert.ok(validated.lastPack.pulls.every(pull=>getCard(pull.cardId)?.setId==='BK05'));
  const resumed=structuredClone(validated.game);assert.equal(runAutomatedTurn(resumed,'hard').ok,true,'saved fifth-pack battle resumes');
 }
});

test('fifth-pack receipts reject unknown packs and foreign or forged pool IDs without changing submitted saves',()=>{
 const valid=saveData();
 const edits=[
  raw=>{raw.lastPack.packId='BK99';},
  raw=>{raw.lastPack.packId='BK01';},
  raw=>{raw.lastPack.pulls[0].cardId='B0001';},
  raw=>{raw.lastPack.pulls[0].cardId='B9999';},
  raw=>{raw.lastPack.pulls.pop();},
  raw=>{raw.collection.B9999=1;},
  raw=>{raw.collection[recipes[0].ids[0]]=0;},
 ];
 for(const edit of edits){
  const raw=structuredClone(valid);edit(raw);const before=structuredClone(raw);
  assert.throws(()=>validateCloudData(raw,player,invalid),error=>error.status===400&&error.code==='invalid_save');
  assert.deepEqual(raw,before);
 }
});

// A local in-memory D1 adapter runs the actual Worker routes and SQL. Requests
// are passed directly to worker.fetch; this fixture never makes network calls.
class Statement{
 constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}
 bind(...args){return new Statement(this.db,this.sql,args);}
 execute(){const results=this.db.prepare(this.sql).all(...this.args).map(row=>({...row}));return {success:true,results,meta:{changes:Number(this.db.prepare('SELECT changes() AS n').get().n)}};}
 async first(column){const row=this.execute().results[0]??null;return column===undefined?row:row?.[column]??null;}
 async all(){return this.execute();}
 async run(){return this.execute();}
}
class D1{
 constructor(db){this.db=db;}
 prepare(sql){return new Statement(this.db,sql);}
 async batch(statements){this.db.exec('BEGIN IMMEDIATE');try{const rows=statements.map(statement=>statement.execute());this.db.exec('COMMIT');return rows;}catch(error){this.db.exec('ROLLBACK');throw error;}}
 withSession(){return this;}
 exec(){throw Error('No request-time migrations');}
}

test('the real account API saves BK05 and restores it on a linked device; a forged receipt cannot replace it',async t=>{
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../server/schema.sql',import.meta.url),'utf8'));t.after(()=>db.close());
 const env={DB:new D1(db)},worker=createOnlineWorker({now:()=>1800000000000});
 async function api(method,path,token,body){
  const headers={Origin:'https://www.beast-king.com','CF-Connecting-IP':'192.0.2.51'};
  if(token)headers.Authorization='Bearer '+token;if(body!==undefined)headers['Content-Type']='application/json';
  const response=await worker.fetch(new Request('https://beast-king.test'+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})}),env,{});
  return {status:response.status,data:await response.json()};
 }
 const created=await api('POST','/api/profile',null,{nickname:player.nickname,origin:player.origin});assert.equal(created.status,200);
 const token=created.data.token,data=saveData(),before=structuredClone(data);
 const saved=await api('POST','/api/cloud-save',token,{revision:0,mutationId:'fifth-save-first',data});
 assert.equal(saved.status,200,JSON.stringify(saved.data));assert.equal(saved.data.save.revision,1);assert.deepEqual(saved.data.save.data,data);assert.deepEqual(data,before);
 const link=await api('POST','/api/account/link-code',token,{});assert.equal(link.status,200);
 const claimed=await api('POST','/api/account/link-claim',null,{code:link.data.link.code,deviceName:'夢界テスト端末'});assert.equal(claimed.status,200);
 const restored=await api('GET','/api/cloud-save',claimed.data.token);assert.equal(restored.status,200);assert.deepEqual(restored.data.save,saved.data.save);
 const forged=structuredClone(data);forged.lastPack.pulls[0].cardId='B0001';
 const rejected=await api('POST','/api/cloud-save',claimed.data.token,{revision:1,mutationId:'fifth-save-forged',data:forged});
 assert.equal(rejected.status,400);assert.equal(rejected.data.code,'invalid_save');
 const unchanged=await api('GET','/api/cloud-save',token);assert.deepEqual(unchanged.data.save,saved.data.save);
});

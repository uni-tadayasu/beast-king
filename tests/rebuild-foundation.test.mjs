import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {getCard,CARDS,FIRST_CARDS,SECOND_CARDS,SECOND_REGALIA_ID,REGALIA_ART_ASSET,validateDeck,validateSpecialDeck} from '../rebuild/catalog.js';
import {PACK_CARD_IDS_BY_SET,openPack,normalizeCollection,grantDeckCollection} from '../rebuild/shop.js';
import {KIRAHARA_RECIPE,requiredCards} from '../rebuild/operator-deck.js';
import {newGame,runCpuTurn,endTurn} from '../rebuild/engine.js';
import {STARTERS,STORAGE_KEY,validateName,initialProfile,loadProfile,persistProfile,checkDeck,saveDeck,chooseStarter,purchase,settle,recordSolo,endSuspendedSolo} from '../rebuild/profile.js';
const fresh=()=>initialProfile('新しい王','king',STARTERS[0].id);
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}};
test('rebuild source syntax',()=>{for(const p of ['app.js','profile.js','catalog.js','engine.js','shop.js','operator-deck.js','operator-client.js','solo-save.js'])execFileSync(process.execPath,['--check',fileURLToPath(new URL('../rebuild/'+p,import.meta.url))])});
test('four starters, 2304 compatible cards, exact deck composition',()=>{
 assert.equal(CARDS.length,2304);assert.equal(STARTERS.length,4);
 for(const s of STARTERS){const p=initialProfile('王','king',s.id);assert.equal(p.main.length,32);assert.equal(p.special.length,4);assert.equal(checkDeck(p,p.main,p.special).valid,true);
 for(const [t,n] of [['beast',16],['miracle',8],['gimmick',8]])assert.equal(p.main.filter(id=>getCard(id).type===t).length,n)}
});
test('initial setup, separate save key and one-time local identity',()=>{
 assert.equal(validateName('  新しい王  '),'新しい王');assert.equal(validateName(''),null);assert.equal(validateName('a'.repeat(17)),null);
 const storage=memory();storage.setItem('beast-king-v6','legacy');assert.equal(loadProfile(storage),null);
 persistProfile(storage,fresh());assert.equal(loadProfile(storage).name,'新しい王');assert.equal(storage.getItem('beast-king-v6'),'legacy');assert.ok(storage.getItem(STORAGE_KEY));
});
test('deck rules reject missing, excessive and unowned cards',()=>{
 const p=fresh();assert.equal(checkDeck(p,p.main.slice(1),p.special).valid,false);
 const unowned=CARDS.find(c=>c.type==='beast'&&!p.collection[c.id]);assert.ok(unowned);
 assert.throws(()=>saveDeck(p,[unowned.id,...p.main.slice(1)],p.special));
 for(const s of STARTERS){if(s.id===p.starterId)assert.equal(checkDeck(p,chooseStarter(p,s.id).main,s.specialIds).valid,true);else assert.throws(()=>chooseStarter(p,s.id));}
 assert.equal(Object.values(p.collection).reduce((a,b)=>a+b,0),36);
});
test('purchase is atomic and guarantees a rare',()=>{
 const p=fresh();const next=purchase(p,()=>0.1);assert.equal(next.lastPack.length,12);assert.notEqual(getCard(next.lastPack[11].cardId).rarity,'N');
 assert.equal(p.treasure,100);assert.throws(()=>purchase({...p,treasure:0}));
});
test('settlement credits once and unlocks the next chapter only',()=>{
 const p=fresh();const win=settle(p,'match-1','win',0);assert.equal(win.treasure,160);assert.equal(win.completed,1);assert.equal(win.wins,1);assert.equal(settle(win,'match-1','win',0),win);
 const loss=settle(win,'match-2','loss',1);assert.equal(loss.treasure,180);assert.equal(loss.completed,1);
 assert.equal(settle(loss,'match-3','forfeit',1).treasure,180);assert.equal(settle(loss,'match-4','draw',1).treasure,210);
});
test('shared engine can initialize and advance a new-foundation duel',()=>{
 const p=fresh(),cpu=STARTERS[2],g=newGame({playerDeck:p.main,playerSpecialDeck:p.special,cpuDeck:cpu.ids,cpuSpecialDeck:cpu.specialIds,seed:99});
 assert.equal(g.players[0].core,5000);assert.equal(g.players[0].hand.length,4);assert.equal(g.players[0].special.length,4);
 assert.equal(endTurn(g).ok,true);assert.equal(runCpuTurn(g).ok,true);assert.ok(g.winner!==null||g.active===0);
});

test('two independent 1152-card expansions preserve types, model counts and ID uniqueness',()=>{
 assert.equal(new Set(CARDS.map(c=>c.id)).size,2304);
 for(const list of [FIRST_CARDS,SECOND_CARDS]){
  assert.equal(list.length,1152);
  for(const [type,n] of [['beast',512],['fusion',128],['miracle',256],['gimmick',256]])assert.equal(list.filter(c=>c.type===type).length,n);
  for(const model of ['attack','defense'])assert.equal(list.filter(c=>c.type==='beast'&&c.model===model).length,256);
  assert.equal(list.filter(c=>c.effect.kind==='fusion').length,1);
  for(const rarity of ['N','R','KR','KKR','GR','GGR'])assert.ok(list.some(c=>c.rarity===rarity));
 }
});
test('both packs contain every public card in their own set, exclude the retired print',()=>{
 const p=fresh();
 for(const pack of ['BK01','BK02']){
  const ids=PACK_CARD_IDS_BY_SET[pack];
  assert.equal(ids.length,1152);assert.ok(!ids.includes('OP-B1024'));
  const pull=openPack(p,()=>0.9999,pack);assert.equal(pull.ok,true);
  assert.equal(pull.pulls.length,12);assert.ok(pull.pulls.every(x=>getCard(x.cardId).pack===pack));
  assert.notEqual(getCard(pull.pulls[11].cardId).rarity,'N');
 }
 assert.ok(PACK_CARD_IDS_BY_SET.BK02.includes(SECOND_REGALIA_ID));
 assert.equal(openPack(p,Math.random,'OP').ok,false);
});
test('normal Regalia has the original artwork, is collectible, and the old alternate print is invalid',()=>{
 const first=getCard('B0512'),normal=getCard(SECOND_REGALIA_ID);
 for(const prop of ['type','cost','rarity','attack','hp','model','effect','text','keywords'])assert.deepEqual(normal[prop],first[prop]);
 assert.equal(first.origin,'grass');assert.equal(first.name,'霊極機精 エトリア');assert.equal(first.artSourceId,'B1024');assert.equal(first.artAsset,undefined);
 assert.equal(normal.origin,'king');assert.equal(normal.artAsset,REGALIA_ART_ASSET);assert.equal(normal.artStatus,'existing');
 assert.equal(getCard('OP-B1024'),undefined);assert.equal(CARDS.length,2304);
 assert.deepEqual(CARDS.filter(c=>c.name.includes('レガリア')).map(c=>c.id),[SECOND_REGALIA_ID]);
 assert.deepEqual(CARDS.filter(c=>c.origin==='king').map(c=>c.id),[SECOND_REGALIA_ID]);
 assert.deepEqual(['mountain','river','seed','grass','flower','tree'].map(o=>CARDS.filter(c=>c.origin===o).length),[384,384,384,384,383,384]);
 for(const [pack,expected] of [['BK01',[192,192,192,192,192,192]],['BK02',[192,192,192,192,191,192]]])assert.deepEqual(['mountain','river','seed','grass','flower','tree'].map(o=>CARDS.filter(c=>c.pack===pack&&c.origin===o).length),expected);
 assert.deepEqual(normalizeCollection({[normal.id]:2,'OP-B1024':2}),{[normal.id]:2});
 assert.deepEqual(grantDeckCollection({},[normal.id,normal.id]),{[normal.id]:2});
 assert.deepEqual(grantDeckCollection({},['OP-B1024']),{});
 const p=fresh(),main=[normal.id,...p.main.slice(1)],owned={...p,collection:{...p.collection,[normal.id]:2}};
 assert.equal(checkDeck(owned,main,p.special).valid,true);
 assert.equal(checkDeck(p,main,p.special).valid,false);
 assert.equal(validateDeck(['OP-B1024',...p.main.slice(1)]).valid,false);
 const storage=memory();persistProfile(storage,{...owned,collection:{...owned.collection,'OP-B1024':2}});
 assert.equal(loadProfile(storage).collection[normal.id],2);assert.equal(loadProfile(storage).collection['OP-B1024'],undefined);
});
test('Kirahara recipe has two normal Regalia cards, legal 20/16 expansion split, and mixed duel support',()=>{
 const {main,special}=KIRAHARA_RECIPE,all=[...main,...special];
 assert.equal(main.length,32);assert.equal(special.length,4);
 assert.equal(all.filter(id=>getCard(id).pack==='BK01').length,20);
 assert.equal(all.filter(id=>getCard(id).pack==='BK02').length,16);
 assert.equal(requiredCards()[SECOND_REGALIA_ID],2);assert.equal(requiredCards()['OP-B1024'],undefined);
 assert.equal(validateDeck(main).valid,true);assert.equal(validateSpecialDeck(special).valid,true);
 const i=main.findIndex(id=>id!==SECOND_REGALIA_ID),excess=[...main];excess[i]=SECOND_REGALIA_ID;assert.equal(validateDeck(excess).valid,false);
 const p=fresh(),g=newGame({playerDeck:main,playerSpecialDeck:special,cpuDeck:p.main,cpuSpecialDeck:p.special,seed:122});
 assert.equal(g.players[0].core,5000);assert.equal(endTurn(g).ok,true);assert.equal(runCpuTurn(g).ok,true);
});

test('operator transport rechecks the server, rejects fake local flags and never stores grants',async()=>{
 const {createOperatorClient}=await import('../rebuild/operator-client.js');
 const {ONLINE_STORAGE_KEY,ONLINE_API_BASE}=await import('../online.js');
 const storage=memory(),token='a'.repeat(43),calls=[];
 storage.setItem('beast-king-rebuild-v1',JSON.stringify({operator:true,entitled:true}));
 const client=createOperatorClient({storage,fetchImpl:async(url,init)=>{calls.push({url,init});return {ok:true,json:async()=>({ok:true,entitled:true,deck:KIRAHARA_RECIPE,collection:requiredCards()})}}});
 await assert.rejects(client.status());assert.equal(calls.length,0);
 storage.setItem(ONLINE_STORAGE_KEY,JSON.stringify({token}));
 const granted=await client.status();assert.equal(granted.entitled,true);assert.equal(granted.collection[SECOND_REGALIA_ID],2);
 assert.equal(calls[0].url,ONLINE_API_BASE+'/rebuild/operator-deck');assert.equal(calls[0].init.headers.Authorization,'Bearer '+token);assert.equal(calls[0].init.method,'GET');
 await client.activate('fixture-code');assert.equal(JSON.parse(calls[1].init.body).code,'fixture-code');
 assert.equal(storage.getItem(ONLINE_STORAGE_KEY),JSON.stringify({token}));
 storage.setItem(ONLINE_STORAGE_KEY,JSON.stringify({token,authInvalidated:true}));await assert.rejects(client.status());
});

test('solo checkpoint preserves the exact game and CPU turn across reload, rejecting corrupted or obsolete IDs',async()=>{
 const {normalizeSoloSnapshot}=await import('../rebuild/solo-save.js');
 const p=fresh(),cpu=STARTERS[2],g=newGame({playerDeck:p.main,playerSpecialDeck:p.special,cpuDeck:cpu.ids,cpuSpecialDeck:cpu.specialIds,seed:44});
 assert.equal(endTurn(g).ok,true);const raw={id:'checkpoint-001',mode:'normal',chapter:null,game:g};
 const storage=memory(),saved=recordSolo(p,raw);persistProfile(storage,saved);
 const restored=loadProfile(storage).suspendedMatch;
 assert.deepEqual(restored.game,g);assert.equal(restored.game.active,1);
 assert.equal(runCpuTurn(restored.game).ok,true);assert.ok(recordSolo(saved,restored).suspendedMatch);
 const malformed=structuredClone(raw);malformed.game.players[0].deck[0]='OP-B1024';assert.equal(normalizeSoloSnapshot(malformed,p),null);
 const duplicate=structuredClone(raw);duplicate.game.players[0].grave.push(duplicate.game.players[0].deck[0]);assert.equal(normalizeSoloSnapshot(duplicate,p),null);
 const unauthorized=structuredClone(raw);unauthorized.chapter=19;assert.equal(normalizeSoloSnapshot(unauthorized,p),null);
 const privateData=structuredClone(raw);privateData.token='secret';privateData.game.credential='secret';privateData.game.players[0].admin=true;assert.equal(JSON.stringify(normalizeSoloSnapshot(privateData,p)).includes('secret'),false);
});
test('final battle snapshot settles rewards exactly once, and discard does not pay or double-count',()=>{
 const p=fresh(),cpu=STARTERS[2],g=newGame({playerDeck:p.main,playerSpecialDeck:p.special,cpuDeck:cpu.ids,cpuSpecialDeck:cpu.specialIds,seed:24});
 const raw={id:'settled-checkpoint-01',mode:'normal',chapter:null,game:g};
 const ongoing=recordSolo(p,raw);const forfeited=endSuspendedSolo(ongoing);
 assert.equal(forfeited.treasure,100);assert.equal(forfeited.losses,1);assert.equal(forfeited.suspendedMatch,null);
 g.players[1].core=0;g.winner=0;
 const won=recordSolo(ongoing,raw);assert.equal(won.treasure,160);assert.equal(won.wins,1);
 const storage=memory();persistProfile(storage,won);const again=loadProfile(storage);
 assert.equal(recordSolo(again,again.suspendedMatch).treasure,160);
 const closed=endSuspendedSolo(again);assert.equal(closed.wins,1);assert.equal(closed.losses,0);assert.equal(closed.suspendedMatch,null);
});
test('operator checkpoint needs the current server grant for exactly that deck',async()=>{
 const {normalizeSoloSnapshot,verifyOperatorSnapshot}=await import('../rebuild/solo-save.js');
 const p=fresh(),cpu=STARTERS[2],g=newGame({playerDeck:KIRAHARA_RECIPE.main,playerSpecialDeck:KIRAHARA_RECIPE.special,cpuDeck:cpu.ids,cpuSpecialDeck:cpu.specialIds,seed:222});
 const raw={id:'operator-checkpoint',mode:'kirahara',chapter:null,game:g,grant:{entitled:true}};
 const s=normalizeSoloSnapshot(raw,p);assert.ok(s);assert.equal(s.grant,undefined);assert.equal(verifyOperatorSnapshot(s,{entitled:false}),false);
 assert.equal(verifyOperatorSnapshot(s,{entitled:true,deck:KIRAHARA_RECIPE}),true);
 assert.equal(verifyOperatorSnapshot(s,{entitled:true,deck:{id:'kirahara',main:p.main,special:p.special}}),false);
 assert.equal(normalizeSoloSnapshot({...raw,mode:'normal'},p),null);
});
test('BGM settings survive save and danger threshold switches exactly at 2500 HP',async()=>{
 const {musicScene,normalizeAudioSettings}=await import('../rebuild/solo-save.js');
 const p=fresh(),storage=memory();assert.deepEqual(normalizeAudioSettings({bgm:'bad',bgmVolume:NaN}),{bgm:true,bgmVolume:.5});
 persistProfile(storage,{...p,bgm:false,bgmVolume:.35});assert.equal(loadProfile(storage).bgm,false);assert.equal(loadProfile(storage).bgmVolume,.35);
 const g=newGame();assert.equal(musicScene('home',g),'menu');assert.equal(musicScene('battle',g),'battle');
 g.players[1].core=2500;assert.equal(musicScene('battle',g),'battle-danger');g.players[1].core=2501;assert.equal(musicScene('battle',g),'battle');g.winner=0;assert.equal(musicScene('battle',g),'menu');
});

test('rebuild starter ownership survives reload without grants of other starters',()=>{
 for(const s of STARTERS){const storage=memory(),p=initialProfile('王','king',s.id);persistProfile(storage,p);assert.deepEqual(loadProfile(storage).collection,p.collection);assert.equal(Object.values(p.collection).reduce((a,b)=>a+b,0),36);}
});

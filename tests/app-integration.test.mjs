import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import {BRAND_ICONS} from '../brand-icons.js';
import {CARD_ART_CROPS} from '../card-art-layouts.js';
import * as catalog from '../catalog.js';
import * as engine from '../engine.js';
import * as shop from '../shop.js';
import {battleLogView} from '../battle-log.js';
import {handInspectorView} from '../hand-inspector.js';
import {soloView} from '../mode-views.js';
import * as campaign from '../campaign.js';
import * as product from '../product-views.js';
import {rulebookView} from '../rules-view.js';
import {calculateCardLayout,calculateFittedCardLayout} from '../viewport.js';

// Load the production script unchanged apart from ES-module imports. The suffix exposes
// existing helpers only inside this isolated VM; no test hooks are added to the app.
const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8').replace(/^import\s+[^;]+;\s*$/gm, '');
const expose = `
globalThis.__appIntegration = {
  baseData, validSavedGame, validSavedPool, restoreData, restoreGame, persist, startGame, finishGame, currentMusicScene, inspectHand, handInspectionSelection, restoreDeckCopies, editDeck, transferCard, operatorRegaliaArt, artStyle, cardMarkup, cardDetails, promoteLegacyKirahara, inspectOptions, replaceInspectedCard, removeInspectedCard, initializeDeckBank, loadBankEntry, saveDeck, createBankDeck,
  enterOnlineMatch, acceptOnlineMatch, recordOnlineResult, navigate,
  beginOnlineMembership, cancelOnlineWaiting, receiveOnlineUpdate,
  get workingDeck(){return workingDeck}, get data(){return data}, get game(){return game}, get cpuGame(){return cpuGame},
  get online(){return online}, get onlineBattle(){return onlineBattle}, get page(){return page},
  setState(values){
    if('data' in values)data=values.data;
    if('game' in values)game=values.game;
    if('cpuGame' in values)cpuGame=values.cpuGame;
    if('page' in values)page=values.page;
    if('entered' in values)entered=values.entered;
    if('onlineBattle' in values)onlineBattle=values.onlineBattle;
    if(values.online)Object.assign(online,values.online);
  }
};`;
const plain = value => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 24; i += 1) await Promise.resolve(); };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function element() {
  return {
    innerHTML: '', textContent: '', style: {}, dataset: {}, children: [], isConnected: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    append(child) { this.children.push(child); }, appendChild(child) { this.children.push(child); },
    contains() { return false; }, querySelector() { return null; }, querySelectorAll() { return []; },
    focus() {}, click() {}, remove() {}, scrollIntoView() {},
  };
}
function boot({ hooks = {}, stored = {} } = {}) {
  const nodes = new Map([['#app', element()], ['#modal-root', element()], ['#toasts', element()]]);
  const document = {
    body: element(), activeElement: element(), title: '', hidden: false, visibilityState: 'visible',
    querySelector: selector => nodes.get(selector) || null, querySelectorAll: () => [], getElementById: id => nodes.get('#'+id) || null,
    createElement: () => element(), addEventListener() {}, removeEventListener() {},
  };
  const storage = new Map(Object.entries(stored));
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const scheduled = new Map();
  let timerId = 0, callbacks;
  const calls = [];
  const profile = { id: 'guest-test', nickname: '旅人', origin: 'mountain', rating: 1000, wins: 0, losses: 0, draws: 0 };
  const client = {
    profile,
    getStatus: () => ({ polling: false, target: null }),
    startPolling(target) { calls.push({ method: 'startPolling', target }); return () => {}; },
    stopPolling() { calls.push({ method: 'stopPolling' }); },
    ensureProfile: async () => ({ ok: true, profile, activity: null }),
    refreshProfile: async () => ({ ok: true, profile, activity: null }),
    updateProfile: async values => ({ ok: true, profile: { ...profile, ...values }, activity: null }),
    updateNickname: async nickname => ({ ok: true, profile: { ...profile, nickname }, activity: null }),
    createRoom(deck, special) { calls.push({ method: 'createRoom', deck, special }); return hooks.createRoom?.(deck, special) || Promise.resolve({ ok: true }); },
    joinRoom(code, deck, special) { calls.push({ method: 'joinRoom', code, deck, special }); return hooks.joinRoom?.(code, deck, special) || Promise.resolve({ ok: true }); },
    startRanked(deck, special) { calls.push({ method: 'startRanked', deck, special }); return hooks.startRanked?.(deck, special) || Promise.resolve({ ok: true }); },
    async leaveRoom(code) {
      calls.push({ method: 'leaveRoom', code });
      const payload = { ok: true, status: 'closed', room: null, queue: null, match: null };
      callbacks.onUpdate({ phase: 'room', payload, source: 'request' });
      return payload;
    },
    async cancelRanked() {
      calls.push({ method: 'cancelRanked' });
      const payload = { ok: true, status: 'idle', room: null, queue: null, match: null };
      callbacks.onUpdate({ phase: 'queue', payload, source: 'request' });
      return payload;
    },
    getRoom: async () => ({ ok: true }), getQueue: async () => ({ ok: true }), getMatch: async () => ({ ok: true }),
    sendAction: async () => ({ ok: true }),
  };
  const context = vm.createContext({
    ...catalog, ...engine, ...shop, ...campaign, ...product, rulebookView, calculateCardLayout, calculateFittedCardLayout, battleLogView, handInspectorView, soloView, BRAND_ICONS, CARD_ART_CROPS,
    createOnlineClient: options => { callbacks = options; return client; },
    createCloudSync: () => ({ getState: () => ({phase:'synced',revision:1,dirty:false}), start: async () => ({phase:'synced',revision:1,dirty:false}), markDirty() {}, flush: async () => ({revision:1}), refresh: async () => ({revision:1}) }),
    createAccountUi: () => ({getOperatorDeck:()=>hooks.operatorDeck||null,onCloudState() {},handleAction:()=>false,touchBrand:()=>false,clearIdentity(){},onModalClosed(){}}),
    setPublicNotice() {},
    createPresenceController: () => ({start:async()=>{},stop:async()=>{}}),
    createMusicController: () => ({ sync() {}, unlock() {}, getState: () => ({ scene: 'menu', blocked: false }) }),
    entryView: () => '<main>Entry</main>', document, localStorage, crypto: webcrypto,
    window: { addEventListener() {}, removeEventListener() {}, scrollTo() {} },
    location: { hash: '' }, history: { replaceState() {} }, navigator: {},
    setTimeout(callback, delay) { const id = ++timerId; scheduled.set(id, { callback, delay }); return id; },
    clearTimeout(id) { scheduled.delete(id); }, setInterval: () => ++timerId, clearInterval() {},
    requestAnimationFrame:()=>0, cancelAnimationFrame(){}, URL, Blob, structuredClone, console,
  });
  vm.runInContext(appSource + expose, context, { filename: 'app.js', timeout: 2000 });
  return { app: context.__appIntegration, storage, calls, nodes, client };
}
function cpuGame(seed = 17) {
  const starter = catalog.STARTER_DECKS[0];
  return engine.newGame({ playerDeck: starter.ids, cpuDeck: starter.ids, playerSpecialDeck: starter.specialIds, cpuSpecialDeck: starter.specialIds, seed });
}
function onlineSnapshot() {
  const state = cpuGame(101);
  delete state.seed;
  for (const player of state.players) player.deck = player.deck.map(() => null);
  state.players[1].hand = state.players[1].hand.map(() => null);
  state.players[1].special = state.players[1].special.map(() => null);
  return { id: 'online-match-test', revision: 1, mode: 'ranked', state, opponent: { name: '相手', kind: 'human', rating: 1000 }, status: 'active', result: null, selfRating: 1000, ratingDelta: 0, serverTime: Date.now(), turnDeadline: Date.now() + 120000 };
}

test('online snapshots and rewards preserve the paused CPU save and settle a match only once', () => {
  const { app, storage } = boot();
  const cpu = cpuGame();
  cpu.playerDeckName = '中断中のソロ';
  const expected = plain(cpu);
  const data = app.baseData();
  data.playerName = '旅人';
  data.game = cpu;
  app.setState({ data, game: cpu, cpuGame: cpu, entered: true, page: 'home' });
  const match = onlineSnapshot();
  app.enterOnlineMatch(match);
  assert.equal(app.onlineBattle, true);
  app.persist(true);
  const saved = JSON.parse(storage.get('beast-king-v6'));
  assert.deepEqual(saved.game, expected);
  assert.equal(app.validSavedGame(saved.game), true);
  assert.equal(saved.game.players.some(player => player.deck.includes(null)), false);
  const finished = { ...match, revision: 2, status: 'finished', result: 'win', selfRating: 1016, ratingDelta: 16, reason: 'battle', state: { ...match.state, winner: 0 } };
  app.acceptOnlineMatch(finished);
  app.acceptOnlineMatch(finished);
  assert.equal(app.data.treasure, shop.STARTING_TREASURE + 60);
  assert.equal(app.data.stats.played, 1);
  assert.equal(app.data.stats.won, 1);
  assert.deepEqual(JSON.parse(storage.get('beast-king-v6')).game, expected);
  app.navigate('home');
  assert.equal(app.onlineBattle, false);
  assert.equal(app.game, cpu);
  assert.equal(app.cpuGame, cpu);
});

test('saved games require all physical 32 plus 4 cards and reject legacy games without specials', () => {
  const { app } = boot();
  const valid = cpuGame();
  assert.equal(app.validSavedGame(valid), true);
  for (const change of [
    state => state.players[0].deck.pop(),
    state => state.players[0].deck.push(state.players[0].deck[0]),
    state => state.players[0].special.pop(),
  ]) {
    const broken = structuredClone(valid);
    change(broken);
    assert.equal(app.validSavedGame(broken), false);
    assert.equal(app.restoreGame(broken, 6), null);
  }
  const moved = structuredClone(valid), player = moved.players[0];
  const id = player.special.pop(), card = catalog.getCard(id);
  player.field.push({ uid: 'u100', cardId: id, attack: card.attack, hp: card.hp, maxHp: card.hp, keywords: [...card.keywords], owner: 0 });
  player.lastMiracle = 'M0256';
  assert.equal(app.validSavedGame(moved), true, 'a summoned fusion and a display-only last miracle must not change the physical pool');
  for (const version of [3, 4, 5]) {
    const saved = plain(app.baseData());
    saved.version = version;
    saved.stats = { played: 5, won: 2, drawn: 1 };
    saved.game = structuredClone(valid);
    if (version < 5) {
      delete saved.game.rulesVersion;
      for (const p of saved.game.players) { p.core = 30; p.shield = 0; }
    }
    if (version === 3) {
      delete saved.specialIds;
      for (const p of saved.game.players) { delete p.special; delete p.banished; delete p.specialSize; }
    }
    const restored = app.restoreData(saved);
    assert.equal(restored.version, 6);
    assert.equal(restored.deckIds.length, 32);
    assert.equal(restored.specialIds.length, 4);
    assert.deepEqual(plain(restored.stats), saved.stats);
    if (version === 3) assert.equal(restored.game, null);
    else { assert.equal(app.validSavedGame(restored.game), true); assert.equal(restored.game.players[0].core, 5000); }
  }
});

test('leaving while room or ranked creation is pending cancels despite the busy flag', async () => {
  for (const kind of ['room', 'ranked']) {
    const pending = deferred();
    const hooks = kind === 'room' ? { createRoom: () => pending.promise } : { startRanked: () => pending.promise };
    const { app, calls } = boot({ hooks });
    app.setState({ page: 'online', entered: true });
    const starting = app.beginOnlineMembership(kind);
    assert.equal(app.online.phase, 'joining');
    assert.equal(app.online.busy, true);
    app.navigate('home');
    const cancel = calls.find(call => call.method === (kind === 'room' ? 'leaveRoom' : 'cancelRanked'));
    assert.ok(cancel, `${kind} must be cancelled during the request`);
    if (kind === 'room') assert.equal(cancel.code, undefined, 'the client queues room cleanup until its code is known');
    pending.reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
    await starting;
    await flush();
    assert.equal(app.page, 'home');
    assert.equal(app.onlineBattle, false);
    assert.equal(app.online.phase, 'idle');
    assert.equal(app.online.busy, false);
    assert.equal(app.online.cancelling, false);
    assert.equal(calls.some(call => call.method === 'startPolling'), false);
  }
});

test('a waiting update received outside the online lobby is cancelled without starting background polling', async () => {
  const { app, calls } = boot();
  app.setState({ page: 'home', entered: true });
  app.receiveOnlineUpdate({ phase: 'queue', source: 'request', payload: { ok: true, status: 'waiting', queue: { id: 'queue-test', elapsedSeconds: 0 }, match: null } });
  await flush();
  assert.ok(calls.some(call => call.method === 'cancelRanked'));
  assert.equal(calls.some(call => call.method === 'startPolling'), false);
  assert.equal(app.online.phase, 'idle');
  assert.equal(app.page, 'home');
});


test('chapter battles persist only wins, retain retry after a loss, and reject locked battles', () => {
  const {app,storage}=boot();
  app.setState({entered:true,page:'solo'});
  const first=campaign.CAMPAIGN_BATTLES[0],last=campaign.CAMPAIGN_BATTLES.at(-1);
  app.startGame(first.id);
  assert.equal(app.game.campaignBattleId,first.id);
  assert.equal(app.game.difficulty,first.difficulty);
  const firstMatch=app.game.campaignMatchId;
  app.game.winner=1;app.finishGame();
  assert.equal(app.data.campaignProgress.clearedBattleIds.length,0);
  app.startGame(first.id);
  assert.notEqual(app.game.campaignMatchId,firstMatch);
  app.game.winner=0;app.finishGame();app.finishGame();
  assert.deepEqual(plain(app.data.campaignProgress.clearedBattleIds),[first.id]);
  assert.equal(app.data.stats.played,2);
  const saved=JSON.parse(storage.get('beast-king-v6'));
  assert.deepEqual(plain(app.restoreData(saved).campaignProgress),plain(app.data.campaignProgress));
  const current=app.game;
  app.startGame(last.id);
  assert.equal(app.game,current);
});


test('battle BGM switches at 2500 HP for either player and returns after both recover', () => {
 const {app}=boot();const state=cpuGame();
 app.setState({game:state,cpuGame:state,entered:true,page:'duel'});
 for(const onlineBattle of [false,true]){
  app.setState({onlineBattle});
  for(const [self,opponent,expected] of [[5000,5000,'battle'],[2501,2501,'battle'],[2500,5000,'battle-danger'],[5000,2500,'battle-danger'],[1,4999,'battle-danger'],[0,5000,'battle-danger'],[2600,2600,'battle']]){
   state.players[0].core=self;state.players[1].core=opponent;assert.equal(app.currentMusicScene(),expected);
  }
 }
 state.players[1].core=1;app.setState({page:'home'});assert.equal(app.currentMusicScene(),'menu');
 app.setState({page:'duel',entered:false});assert.equal(app.currentMusicScene(),'menu');
});


test('own hand inspection is local-only during the opponent turn and survives online refresh', () => {
  const { app, calls, nodes } = boot();
  const match = onlineSnapshot();
  match.state.active = 1;
  const data = app.baseData(); data.playerName = '旅人';
  app.setState({ data, entered: true });
  app.enterOnlineMatch(match);
  app.setState({ online: { busy: true, syncRequired: true } });
  const before = plain(app.game), requestCount = calls.length;
  const card = catalog.getCard(match.state.players[0].hand[2]);
  app.inspectHand(2);
  assert.deepEqual(plain(app.game), before);
  assert.equal(calls.length, requestCount, 'inspection must not send any online mutation');
  assert.equal(app.handInspectionSelection().index, 2);
  assert.match(nodes.get('#app').innerHTML, /id="hand-effects-panel"[^>]+data-open="true"/);
  assert.ok(nodes.get('#app').innerHTML.includes(card.text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')));
  const refreshed = { ...match, revision: 2, state: structuredClone(match.state) };
  app.acceptOnlineMatch(refreshed);
  assert.equal(app.handInspectionSelection().index, 2, 'polling does not forget the inspected hand card');
  assert.deepEqual(plain(app.game.players), before.players);
});


test('old three-copy decks migrate to owned two-copy decks while card ownership and pack timestamps remain intact', () => {
  const { app }=boot();const saved=plain(app.baseData());
  const beast=saved.deckIds.find(id=>catalog.getCard(id).type==='beast');
  const otherIndex=saved.deckIds.findIndex(id=>id!==beast&&catalog.getCard(id).type==='beast');
  saved.deckIds[otherIndex]=beast;saved.collection[beast]=3;
  const fusion=saved.specialIds[0],otherFusion=saved.specialIds[1];
  saved.specialIds=[fusion,fusion,fusion,otherFusion];saved.collection[fusion]=3;
  saved.draft={ids:[beast,beast,beast],specialIds:[fusion,fusion,fusion],name:'編集中'};
  saved.lastPack={pulls:Array.from({length:12},()=>({cardId:beast,isNew:false,converted:false,guaranteed:false})),bonusTreasure:0,openedAt:1800000000000};
  const before=plain(saved),restored=app.restoreData(saved);
  assert.equal(catalog.validateDeck(restored.deckIds).valid,true);
  assert.equal(catalog.validateSpecialDeck(restored.specialIds).valid,true);
  assert.equal(restored.deckIds.filter(id=>id===beast).length,2);
  assert.equal(restored.specialIds.filter(id=>id===fusion).length,2);
  assert.equal(restored.collection[beast],3);assert.equal(restored.collection[fusion],3);
  assert.equal(restored.draft.ids.length,2);assert.equal(restored.draft.specialIds.length,2);
  assert.equal(restored.lastPack.openedAt,saved.lastPack.openedAt);
  assert.deepEqual(saved,before);
});

test('the editor blocks a third deck copy even when three copies are owned',()=>{
  const {app}=boot();const data=app.baseData();
  const id=app.workingDeck.find(id=>app.workingDeck.filter(x=>x===id).length===2);
  data.collection[id]=3;app.setState({data});
  const before=[...app.workingDeck];app.editDeck(id,true);
  assert.deepEqual([...app.workingDeck],before);
});

test('optional physical-card editor preserves the grouped editor and validates atomic replacements',()=>{
 const {app}=boot();
 const before=[...app.workingDeck],original=before[0],candidate=app.inspectOptions('main',0)[0];
 // All candidates are owned, of the correct zone and not the same card.
 assert.ok(app.inspectOptions('main',0).every(c=>c.type!=='fusion'&&c.id!==original&&app.data.collection[c.id]>0));
 if(candidate){
  assert.equal(app.replaceInspectedCard('main',0,original,candidate.id),true);
  assert.equal(app.workingDeck.length,32);assert.equal(app.workingDeck[0],candidate.id);
  assert.deepEqual([...app.workingDeck].slice(1),before.slice(1));
  assert.equal(app.replaceInspectedCard('main',0,original,candidate.id),false);
 }
 const first=app.workingDeck[0];
 assert.equal(app.replaceInspectedCard('main',0,first,'F0001'),false);
 assert.equal(app.removeInspectedCard('main',0,first),true);
 assert.equal(app.workingDeck.length,31);
 assert.deepEqual([...app.workingDeck],before.slice(1));
});

test('deck library keeps starter edits, active deck and drafts independent',()=>{
 const {app}=boot();const first=catalog.STARTER_DECKS[0],second=catalog.STARTER_DECKS[1];
 assert.equal(app.data.deckLibrary.length,4);
 assert.equal(app.loadBankEntry('starter-'+second.id),true);
 assert.deepEqual([...app.workingDeck],[...second.ids]);assert.deepEqual([...app.data.deckIds],[...first.ids]);
 const before=[...app.workingDeck],candidate=app.inspectOptions('main',0)[0];assert.ok(candidate);
 assert.equal(app.replaceInspectedCard('main',0,before[0],candidate.id),true);
 assert.equal(app.loadBankEntry('starter-'+first.id),true);assert.deepEqual([...app.workingDeck],[...first.ids]);
 assert.equal(app.loadBankEntry('starter-'+second.id),true);assert.equal(app.workingDeck[0],candidate.id);
 assert.equal(app.saveDeck(false),true);assert.deepEqual([...app.data.deckIds],[...first.ids]);
 const restored=app.restoreData(plain(app.data));assert.equal(restored.deckLibrary.find(d=>d.id==='starter-'+second.id).ids[0],candidate.id);
 assert.equal(app.saveDeck(true),true);assert.equal(app.data.activeDeckId,'starter-'+second.id);
 assert.equal(app.createBankDeck(),true);assert.equal(app.data.deckLibrary.length,5);
});

test('returning a card to the shared pool does not change inventory or a different saved deck',()=>{
 const {app}=boot();const first=catalog.STARTER_DECKS[0],second=catalog.STARTER_DECKS[1];
 assert.equal(app.loadBankEntry('starter-'+first.id),true);
 const cardId=app.workingDeck[0],before=plain(app.data.collection),other=plain(app.data.deckLibrary.find(d=>d.id==='starter-'+second.id));
 const count=app.workingDeck.filter(id=>id===cardId).length;
 app.editDeck(cardId,false);assert.equal(app.workingDeck.filter(id=>id===cardId).length,count-1);assert.equal(app.workingDeck.length,31);
 assert.deepEqual(plain(app.data.collection),before);
 app.editDeck(cardId,true);assert.equal(app.workingDeck.length,32);assert.equal(app.workingDeck.filter(id=>id===cardId).length,count);
 assert.deepEqual(plain(app.data.collection),before);assert.deepEqual(plain(app.data.deckLibrary.find(d=>d.id==='starter-'+second.id)),other);
});

test('physical card layout uses the measured free canvas, including transfer controls',()=>{
 for(const edit of [false,true])for(const [width,height] of [[1800,650],[970,380],[540,260],[330,180]]){
  const layout=calculateFittedCardLayout({width,height,edit,compact:width<800});
  assert.ok(layout.pageSize===layout.columns*layout.rows&&layout.cardWidth>0);
  const gap=width<800?8:14,caption=edit?76:28;
  if(height>=260){
   assert.ok(layout.columns*layout.cardWidth+(layout.columns-1)*gap<=width);
   assert.ok(layout.rows*(layout.cardWidth*520/360+caption)+(layout.rows-1)*gap<=height);
  }
 }
 const roomy=calculateFittedCardLayout({width:1600,height:660,edit:true});
 const narrow=calculateFittedCardLayout({width:600,height:300,edit:true,compact:true});
 assert.ok(roomy.cardWidth>=narrow.cardWidth);
});

test('deck transfer uses ownership and exact deck-slot validation',()=>{
 const {app}=boot();app.setState({page:'deck'});const before=[...app.workingDeck],id=before[0],bank=app.data.editingDeckId,inventory=plain(app.data.collection);
 assert.equal(app.transferCard({side:'deck',id,index:0,section:'main',bank},{side:'pool'}),true);assert.equal(app.workingDeck.length,31);
 assert.equal(app.transferCard({side:'pool',id,bank},{side:'deck'}),true);assert.equal(app.workingDeck.length,32);assert.deepEqual(plain(app.data.collection),inventory);
 assert.equal(app.transferCard({side:'pool',id,bank:'other-deck'},{side:'deck'}),false);
});

test('Regalia artwork is scoped to the authenticated deck instance and the clicked card detail',()=>{
 const regalia=catalog.getCard('B0512'),privateArt='data:image/svg+xml;base64,PHN2Zy8+';
 const grant={id:'operator-kirahara-v1',name:'𠮷良原デッキ',artwork:privateArt};
 const hooks={operatorDeck:grant}, {app,nodes}=boot({hooks});
 const data=app.data;const main=[...catalog.STARTER_DECKS[0].ids];main[0]='B0512';data.collection.B0512=2;
 data.deckLibrary.push({id:grant.id,name:grant.name,ids:main,specialIds:[...data.specialIds]});
 app.setState({page:'deck',entered:true});
 assert.equal(app.loadBankEntry(grant.id),true);
 assert.ok(app.artStyle(regalia,'editor').includes(privateArt));
 assert.ok(app.artStyle(regalia,'public').includes('king.webp'));
 assert.ok(app.cardMarkup(regalia,{artContext:'editor'}).includes('data-art-context="editor"'));
 app.cardDetails('B0512','editor');assert.ok(nodes.get('#modal-root').innerHTML.includes(privateArt));
 app.cardDetails('B0512');assert.ok(!nodes.get('#modal-root').innerHTML.includes(privateArt));
 app.loadBankEntry(data.activeDeckId);assert.ok(app.artStyle(regalia,'editor').includes('king.webp'));
 data.activeDeckId=grant.id;data.deckIds=main;app.setState({page:'home'});
 assert.ok(app.artStyle(regalia,'active').includes(privateArt));
 assert.ok(!app.artStyle(regalia,'public').includes(privateArt));
 app.setState({page:'duel',game:{playerDeckId:grant.id}});
 data.activeDeckId='starter-star-crown';
 assert.ok(app.artStyle(regalia,'battle').includes(privateArt));
 app.setState({game:{playerDeckId:null}});
 assert.ok(app.artStyle(regalia,'battle').includes('king.webp'));
 app.setState({game:{playerDeckId:grant.id}});hooks.operatorDeck={...grant,artwork:null};
 assert.ok(app.artStyle(regalia,'battle').includes('radial-gradient'));
 assert.ok(!app.artStyle(regalia,'battle').includes('king.webp'));
 assert.ok(!JSON.stringify(data).includes(privateArt));
});

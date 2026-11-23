import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {getCard,CARDS} from '../catalog.js';
import {newGame,runCpuTurn,endTurn} from '../engine.js';
import {STARTERS,STORAGE_KEY,validateName,initialProfile,loadProfile,persistProfile,checkDeck,saveDeck,chooseStarter,purchase,settle} from '../rebuild/profile.js';
const fresh=()=>initialProfile('新しい王','king',STARTERS[0].id);
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}};
test('rebuild source syntax',()=>{for(const p of ['app.js','profile.js'])execFileSync(process.execPath,['--check',fileURLToPath(new URL('../rebuild/'+p,import.meta.url))])});
test('four starters, 1152 compatible cards, exact deck composition',()=>{
 assert.equal(CARDS.length,1152);assert.equal(STARTERS.length,4);
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
 for(const s of STARTERS)assert.equal(checkDeck(p,chooseStarter(p,s.id).main,s.specialIds).valid,true);
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

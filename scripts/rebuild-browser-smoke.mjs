/** Dependency-free real-browser smoke test for the separate rebuilt frontend.
 * Node 24 + Chrome/Chromium. Never connects to the production game or touches
 * a player's browser data. The temporary browser profile is destroyed on exit.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchSmokeChrome,stopSmokeChrome} from './chrome-smoke-launch.mjs';
import {setTimeout as delay} from 'node:timers/promises';
assert.ok(process.argv.length<=3,'Usage: node scripts/rebuild-browser-smoke.mjs [public-directory]');
const root=process.argv[2]?resolve(process.argv[2]):fileURLToPath(new URL('../',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1'),path=resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
  if(!path.startsWith(resolve(root)+sep))throw Error('invalid path');
  const info=await stat(path);if(!info.isFile())throw Error('not a file');
  res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Length',info.size);createReadStream(path).on('error',()=>res.destroy()).pipe(res);
 }catch{res.writeHead(404);res.end('Not found')}
});
let browser,ws;const pending=new Map(),exceptions=[];let sequence=0;
async function until(fn,label,ms=8000){
 const end=Date.now()+ms;
 while(Date.now()<end){try{const result=await fn();if(result)return result}catch{}await delay(100)}
 throw Error('Timed out: '+label);
}
function send(method,params={}){
 return new Promise((resolve,reject)=>{
  const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},10000);
  pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));
 });
}
async function evaluate(expression){
 const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
 return r.result.value;
}
const exists=s=>'Boolean(document.querySelector('+JSON.stringify(s)+'))';
async function click(selector){
 assert.equal(await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');if(!e||e.disabled)return false;e.click();return true})()'),true,'Click: '+selector);
}
async function waitElement(selector){await until(()=>evaluate(exists(selector)),selector)}
async function viewport(width,height){
 await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
 await delay(250);
}
async function assertFits(){
 const dimensions=await evaluate('({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight})');
 assert.ok(dimensions.sw<=dimensions.w+1,'Horizontal overflow: '+JSON.stringify(dimensions));assert.ok(dimensions.sh<=dimensions.h+1,'Vertical overflow: '+JSON.stringify(dimensions));
}
const saved='JSON.parse(localStorage.getItem("beast-king-rebuild-v1"))';
try{
 await new Promise((res,rej)=>{server.once('error',rej);server.listen(0,'127.0.0.1',res)});
 const url='http://127.0.0.1:'+server.address().port+'/rebuild/';
 browser=await launchSmokeChrome();ws=browser.ws;
 ws.addEventListener('message',event=>{
  const m=JSON.parse(event.data);
  if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result);return}
  if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  if(m.method==='Page.javascriptDialogOpening')void send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});
 });
 await send('Runtime.enable');await send('Page.enable');await send('Page.bringToFront');await viewport(1280,720);
 await send('Network.enable');await send('Network.setBlockedURLs',{urls:['*chatgpt.site/*']});
 await send('Page.navigate',{url});await waitElement('#onboard');
 assert.equal(await evaluate('document.querySelectorAll("input[name=starter]").length'),4);
 assert.equal(await evaluate('document.querySelectorAll(".origins img").length'),7);
 assert.equal(await evaluate('document.querySelector("meta[name=robots]").content'),'noindex,follow');
 assert.ok(await evaluate('Array.from(document.querySelectorAll("meta[property]")).some(m=>m.getAttribute("property")==="og:image")'));
 await evaluate('document.querySelector("input[name=name]").value="ブラウザ検証";document.querySelector("#onboard").requestSubmit();true');await waitElement('.shell');await assertFits();
 assert.equal(await evaluate(saved+'.name'),'ブラウザ検証');
 assert.equal(await evaluate('Object.values('+saved+'.collection).reduce((a,b)=>a+b,0)'),36);
 assert.equal(await evaluate('document.querySelectorAll("nav .bk-icon").length'),6);
 assert.equal(await evaluate('new URL(document.querySelector("link[rel=manifest]").href).pathname'),'/rebuild/manifest.webmanifest');
 await click('[data-act=bgm-toggle]');
 assert.equal(await evaluate(saved+'.bgm'),false);
 await evaluate('(()=>{const e=document.querySelector("#bgm-volume");e.value="35";e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));return true})()');
 assert.equal(await evaluate(saved+'.bgmVolume'),.35);
 await click('nav [data-page=catalog]');
 await evaluate('(()=>{const f=document.querySelector("#filters");f.elements.q.value="レガリア";f.elements.pack.value="BK02";f.requestSubmit();return true})()');
 assert.equal(await evaluate('document.querySelectorAll(".card-grid .card").length'),1);
 assert.equal(await evaluate('document.querySelector(".card-grid .card").dataset.id'),'B1024');
 assert.ok((await evaluate('document.querySelector(".card-grid .art").style.backgroundImage')).includes('king.webp'));
 const square=await evaluate('(()=>{const r=document.querySelector(".card-grid .art").getBoundingClientRect();return {w:r.width,h:r.height}})()');assert.ok(square.w>0&&Math.abs(square.w-square.h)<2,'Square art window '+JSON.stringify(square));
 await click('.card-grid .card');await waitElement('dialog[open]');await click('dialog [data-act=close]');
 await click('nav [data-page=shop]');await click('[data-act=select-pack][data-pack=BK02]');await click('[data-act=purchase]');
 assert.equal(await evaluate(saved+'.lastPack.length'),12);assert.equal(await evaluate(saved+'.lastPackId'),'BK02');
 await click('nav [data-page=deck]');assert.ok((await evaluate('document.querySelector(".deck-list").innerText')).includes('32/32'));
 await click('nav [data-page=solo]');await click('[data-act=practice][data-level=normal]');await waitElement('.arena');
 assert.ok((await evaluate('getComputedStyle(document.querySelector(".table")).backgroundImage')).includes('solo-illustrated.webp'));
 await click('[data-act=zone-list][data-player="1"]');await waitElement('dialog[open]');assert.ok((await evaluate('document.querySelector("dialog").innerText')).includes('カードの内容は非公開'));await click('dialog [data-act=close]');
 const initial=await evaluate(saved+'.suspendedMatch');assert.equal(initial.game.players[0].core,5000);assert.equal(initial.game.players[0].hand.length,4);
 await click('[data-act=end-turn]');
 await until(async()=>{const m=await evaluate(saved+'.suspendedMatch');return m.game.active===0||m.game.winner!==null},'CPU finishes turn');
 const checkpoint=await evaluate(saved+'.suspendedMatch');assert.ok(checkpoint.game.turn>initial.game.turn);
 await send('Page.reload');await waitElement('[data-act=resume]');
 assert.equal(await evaluate(exists('#onboard')),false);assert.equal(await evaluate(saved+'.bgmVolume'),.35);assert.equal(await evaluate(saved+'.bgm'),false);
 assert.deepEqual(await evaluate(saved+'.suspendedMatch'),checkpoint);
 await click('[data-act=resume]');await waitElement('.arena');assert.deepEqual(await evaluate(saved+'.suspendedMatch'),checkpoint);
 if(checkpoint.game.winner===null)await click('[data-act=pause-match]');else await click('[data-act=leave]');
 if(checkpoint.game.winner===null){await waitElement('[data-act=resume]');await click('[data-act=discard-match]');await until(()=>evaluate(saved+'.suspendedMatch===null'),'abandoned match is cleared');assert.equal(await evaluate(saved+'.suspendedMatch'),null)}
 for(const [width,height] of [[390,844],[844,390],[1280,720]]){
  await viewport(width,height);await click('nav [data-page=catalog]');await assertFits();
  assert.ok(await evaluate('document.querySelectorAll(".card-grid .card").length>0'));
  await click('nav [data-page=home]');await assertFits();
 }
 assert.deepEqual(exceptions,[],'No uncaught browser errors');
 console.log('Browser smoke passed: four starters, normal Regalia artwork, both packs, deck, CPU duel, reload/resume, BGM settings, 3 viewports');
}finally{
 for(const p of pending.values())clearTimeout(p.timer);
 server.close();server.closeAllConnections();
 await stopSmokeChrome(browser);
}

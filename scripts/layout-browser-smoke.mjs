/** Dependency-free real-browser smoke test for the integrated main frontend.
 * Node 24 + Chrome/Chromium. Never connects to the production game or touches
 * a player's browser data. The temporary browser profile is destroyed on exit.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
assert.ok(process.argv.length<=3,'Usage: node scripts/layout-browser-smoke.mjs [public-directory]');
const root=process.argv[2]?resolve(process.argv[2]):fileURLToPath(new URL('../',import.meta.url));
const chrome=[process.env.CHROME_BIN,'google-chrome','google-chrome-stable','chromium','chromium-browser'].filter(Boolean).find(bin=>spawnSync(bin,['--version'],{stdio:'ignore',timeout:5000}).status===0);
assert.ok(chrome,'Chrome/Chromium must be installed for the smoke test');
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
let proc,ws,profileDir;const pending=new Map(),exceptions=[];let sequence=0;
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
try{
 await new Promise((res,rej)=>{server.once('error',rej);server.listen(0,'127.0.0.1',res)});
 const url='http://127.0.0.1:'+server.address().port+'/';
 profileDir=await mkdtemp(join(tmpdir(),'bk-browser-'));
 proc=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--no-default-browser-check','--mute-audio','--remote-debugging-port=0','--user-data-dir='+profileDir,'about:blank'],{stdio:'ignore'});
 const debug=await until(async()=>{if(proc.exitCode!==null)throw Error('Browser exited');return (await readFile(join(profileDir,'DevToolsActivePort'),'utf8')).split('\n')[0]},'DevTools port',15000);
 const target=await until(async()=>{const list=await (await fetch('http://127.0.0.1:'+debug+'/json/list')).json();return list.find(x=>x.type==='page')},'browser page');
 ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
 ws.addEventListener('message',event=>{
  const m=JSON.parse(event.data);
  if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result);return}
  if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  if(m.method==='Page.javascriptDialogOpening')void send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});
 });
 await send('Runtime.enable');await send('Page.enable');await send('Page.bringToFront');await viewport(1280,720);

 // No production writes: the test runs against a temporary local server/profile.
 await send('Network.enable');await send('Network.setBlockedURLs',{urls:['*chatgpt.site/*']});
 await send('Page.navigate',{url});await waitElement('#entry-start-form');
 await evaluate('document.querySelector("#entry-player-name").value="画面表示テスト十二文字";true');
 await click('[data-action=name-start]');await waitElement('.product-home');
 const inspect=`(selectors)=>{const out=[];for(const selector of selectors){const els=[...document.querySelectorAll(selector)].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'});for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){const a=els[i].getBoundingClientRect(),b=els[j].getBoundingClientRect();const w=Math.min(a.right,b.right)-Math.max(a.left,b.left),h=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);if(w>2&&h>2)out.push({selector,i,j,w:Math.round(w),h:Math.round(h)});}}return out}`;
 async function check(label,selectors=[]){
  const v=await evaluate('({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight})');assert.ok(v.sw<=v.w+2&&v.sh<=v.h+2,label+' viewport overflow '+JSON.stringify(v));
  const fit=await evaluate(`(()=>{const shell=document.querySelector('#app>.bk-native-screen'),frame=shell?.querySelector('.bk-native-pane'),pane=frame?.firstElementChild;if(!shell||!frame||!pane)return null;const s=shell.getBoundingClientRect(),f=frame.getBoundingClientRect(),p=pane.getBoundingClientRect(),a=document.querySelector('#app').getBoundingClientRect();return {native:getComputedStyle(shell).transform==='none',shellWidth:s.width,appWidth:a.width,shellHeight:s.height,appHeight:a.height,frameWidth:f.width,paneWidth:p.width,frameHeight:f.height,paneHeight:p.height,scale:Number(pane.dataset.fitScale)}})()`);
  if(fit){assert.ok(fit.native&&Math.abs(fit.shellWidth-fit.appWidth)<3&&Math.abs(fit.shellHeight-fit.appHeight)<3,label+' native screen '+JSON.stringify(fit));assert.ok(fit.paneWidth>=fit.frameWidth*.97&&fit.paneHeight>=fit.frameHeight*.97,label+' full content pane '+JSON.stringify(fit));}
  const errors=await evaluate('('+inspect+')('+JSON.stringify(selectors)+')');
  assert.deepEqual(errors,[],label+' overlapping controls '+JSON.stringify(errors));
 }
 const general=['.navigation-dock>.dock-link','.site-controls>button'];
 for(const [width,height] of [[1920,1080],[1366,768],[1024,600],[768,1024],[390,844],[320,568],[844,390]]){
  await viewport(width,height);
  for(const [page,selectors] of [['home',['.home-mode-rail>.home-mode','.home-card-fan>.game-card']],['deck',['.deck-panel-head,.deck-zone-tabs,.deck-list,.deck-panel-foot','#card-results>.results-meta,#card-results>.cards-grid,#card-results>.pagination','.transfer-card>.transfer-counts,.transfer-card>.transfer-actions']],['collection',['.filter-bar>.search-field,.filter-bar>.tabs,.filter-bar>.filters-secondary','#card-results>.results-meta,#card-results>.cards-grid,#card-results>.pagination']],['shop',['.product-section-tabs>button']],['rules',['.rulebook-tabs>button']]]){
   await click('.navigation-dock [data-nav='+page+']');await waitElement('main[data-page='+page+']');await waitElement('.bk-native-pane>.bk-fit-pane[data-fit-scale]');await delay(200);
   if(page==='home'){const modeVisibility=await evaluate('(()=>{const p=document.querySelector(".home-page").getBoundingClientRect();return [...document.querySelectorAll(".home-mode-rail>.home-mode")].map(e=>{const r=e.getBoundingClientRect();return r.top>=p.top-2&&r.bottom<=p.bottom+2&&r.left>=p.left-2&&r.right<=p.right+2})})()');assert.deepEqual(modeVisibility,[true,true,true],width+'x'+height+' all three mode controls fully visible');}
   // Card ownership/action pairs are tested per card, not between distinct tiles.
   await check(width+'x'+height+' '+page,[...general,...selectors]);
  }
  await click('.navigation-dock [data-nav=deck]');assert.equal(await evaluate('document.querySelectorAll("#deck-bank-select option").length'),4);
  assert.ok(await evaluate('Boolean(document.querySelector(".transfer-source .transfer-card")&&document.querySelector(".deck-panel .deck-row"))'));
  assert.equal(await evaluate('document.querySelector("[data-action=deck-filter-scope][data-scope=owned]").getAttribute("aria-pressed")'),'true');
  const transferId=await evaluate('document.querySelector(".deck-row [data-action=deck-remove]").dataset.id');
  const before=await evaluate('document.querySelector(".deck-zone-tabs [data-section=main] b").textContent');
  await click('.deck-row [data-action=deck-remove][data-id='+transferId+']');
  assert.equal(await evaluate('document.querySelector(".deck-zone-tabs [data-section=main] b").textContent'),'31/32');
  await evaluate('(()=>{const e=document.querySelector("#card-search");e.value='+JSON.stringify(transferId)+';e.dispatchEvent(new Event("input",{bubbles:true}));return true})()');
  await until(()=>evaluate('Boolean(document.querySelector(".transfer-add[data-id='+transferId+']:not(:disabled)"))'),'returned card is available again');
  await click('.transfer-add[data-id='+transferId+']');
  assert.equal(await evaluate('document.querySelector(".deck-zone-tabs [data-section=main] b").textContent'),before);
  await evaluate('(()=>{const e=document.querySelector("#card-search");e.value="";e.dispatchEvent(new Event("input",{bubbles:true}));return true})()');
  await click('[data-action=deck-list-mode][data-mode=images]');assert.equal(await evaluate('Number(document.querySelector(".deck-image-grid").dataset.total)'),32);await click('[data-action=deck-list-mode][data-mode=list]');
  await click('[data-action=deck-inspect-open]');await waitElement('.deck-inspector .inspect-slot-nav');assert.ok((await evaluate('document.querySelector(".inspect-slot-nav strong").textContent')).includes('1 / 32'));await click('[data-action=deck-inspect-next]');assert.ok((await evaluate('document.querySelector(".inspect-slot-nav strong").textContent')).includes('2 / 32'));await click('[data-action=deck-inspect-all]');assert.equal(await evaluate('Number(document.querySelector(".inspect-gallery").dataset.total)'),32);await click('[data-action=deck-inspect-zone][data-section=special]');assert.equal(await evaluate('Number(document.querySelector(".inspect-gallery").dataset.total)'),4);await click('.modal-close');assert.ok(await evaluate('Boolean(document.querySelector(".deck-row .qty-btn"))'));
  await click('.navigation-dock [data-nav=home]');await click('[data-action=solo-mode]');await waitElement('.solo-mode');await check(width+'x'+height+' solo',general);
  await click('[data-action=solo-section][data-section=practice]');await check(width+'x'+height+' practice',['.solo-level-grid>.solo-level']);
  await click('.navigation-dock [data-nav=home]');await click('[data-action=multi-mode]');await waitElement('.mode-lobby');await check(width+'x'+height+' room',general);
  await click('.navigation-dock [data-nav=home]');await click('[data-action=rank-mode]');await waitElement('.mode-lobby');await check(width+'x'+height+' rank',general);
  await click('.navigation-dock [data-nav=collection]');await click('#card-results .game-card');await waitElement('.modal');await check(width+'x'+height+' card detail',['.modal-close,.modal>.detail-layout']);await click('.modal-close');
 }
 await click('.navigation-dock [data-nav=home]');await click('[data-action=solo-mode]');await click('[data-action=solo-section][data-section=practice]');await click('[data-action=start-game]');await waitElement('.duel-shell');
 for(const [width,height] of [[1920,1080],[1366,768],[1024,600],[768,1024],[390,844],[320,568],[844,390]]){
  await viewport(width,height);
  await waitElement('.bk-native-pane>.bk-fit-pane[data-fit-scale]');await delay(120);await check(width+'x'+height+' duel',['.duel-top-actions>button','.arena>.duelist,.arena>.field-row,.arena>.hand-section,.arena>.zone-strip,.midline>.turn-label,.midline>.end-turn,.midline>.arcana-zone-row,.own-zone-row>.arcana-zone-row,.own-zone-row>.zone-strip','.hand-cards>.hand-card']);
 }
 await send('Page.navigate',{url:url+'about.html'});await waitElement('body.about-page');await waitElement('.bk-fit-article .bk-fit-target[data-fit-scale]');await delay(150);await check('about page');
 assert.deepEqual(exceptions,[],'No uncaught browser errors');
 console.log('Layout smoke passed: root home, deck, collection, shop, rules, solo, practice, room, rank, details, battle, about; seven viewports');
}finally{
 try{ws?.close()}catch{}
 for(const p of pending.values())clearTimeout(p.timer);
 if(proc&&proc.exitCode===null){proc.kill('SIGTERM');await Promise.race([new Promise(r=>proc.once('exit',r)),delay(3000)]);if(proc.exitCode===null)proc.kill('SIGKILL')}
 server.close();server.closeAllConnections();
 if(profileDir)await rm(profileDir,{recursive:true,force:true,maxRetries:5,retryDelay:150});
}

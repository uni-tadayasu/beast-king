/** Dependency-free real-browser smoke test for the integrated main frontend.
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
assert.ok(process.argv.length<=3,'Usage: node scripts/layout-browser-smoke.mjs [public-directory]');
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
try{
 await new Promise((res,rej)=>{server.once('error',rej);server.listen(0,'127.0.0.1',res)});
 const url='http://127.0.0.1:'+server.address().port+'/';
 browser=await launchSmokeChrome();ws=browser.ws;
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
 const inspect=`(selectors)=>{const out=[];for(const selector of selectors){const els=[...document.querySelectorAll(selector)].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'});for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){const a=els[i].getBoundingClientRect(),b=els[j].getBoundingClientRect();const w=Math.min(a.right,b.right)-Math.max(a.left,b.left),h=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);if(w>2&&h>2)out.push({selector,i,j,a:els[i].getAttribute('aria-label')||els[i].className,b:els[j].getAttribute('aria-label')||els[j].className,w:Math.round(w),h:Math.round(h)});}}return out}`;
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
  for(const [page,selectors] of [['home',['.home-mode-rail>.home-mode','.home-card-fan>.game-card']],['deck',['.deck-panel>.workshop-tools,.deck-panel>.deck-list','.deck-panel>.workshop-tools>*','.transfer-source>.workshop-tools,.transfer-source>#card-results','.transfer-source>.workshop-tools>*','.deck-list>.results-meta,.deck-list>.deck-image-grid,.deck-list>.deck-list-pagination','#card-results>.results-meta,#card-results>.cards-grid,#card-results>.pagination','.transfer-card>.transfer-counts,.transfer-card>.transfer-actions','.deck-bank-actions>.btn','.deck-display-tabs>.btn','.deck-scope-tabs>.btn','.deck-source-tools>.deck-scope-tabs,.deck-source-tools>.btn,.deck-source-tools>.text-button']],['collection',['.filter-bar>.search-field,.filter-bar>.tabs,.filter-bar>.filters-secondary','#card-results>.results-meta,#card-results>.cards-grid,#card-results>.pagination']],['shop',['.product-section-tabs>button']],['rules',['.rulebook-tabs>button']]]){
   await click('.navigation-dock [data-nav='+page+']');await waitElement('main[data-page='+page+']');await waitElement('.bk-native-pane>.bk-fit-pane[data-fit-scale]');await delay(200);
   if(page==='home'){const modeVisibility=await evaluate('(()=>{const p=document.querySelector(".home-page").getBoundingClientRect();return [...document.querySelectorAll(".home-mode-rail>.home-mode")].map(e=>{const r=e.getBoundingClientRect();return r.top>=p.top-2&&r.bottom<=p.bottom+2&&r.left>=p.left-2&&r.right<=p.right+2})})()');assert.deepEqual(modeVisibility,[true,true,true],width+'x'+height+' all three mode controls fully visible');}
   // Card ownership/action pairs are tested per card, not between distinct tiles.
   await check(width+'x'+height+' '+page,[...general,...selectors]);
  }
  const fixture=await evaluate(`(async()=>{const {operatorDashboardView}=await import('./account-views.js');const snapshot={stats:{totalPlayers:4,activeBattles:0,onlinePlayers:1,recentLogins24h:4},settings:{notice:'検証用',maintenance:false},onlinePlayers:[{id:'fixture-test',nickname:'検証ユーザー',origin:'river',rating:1000,lastLoginAt:Date.now(),lastSeenAt:Date.now()}],recentLogins:[],recentPlayers:[],events:[],audit:[{action:'fixture',createdAt:Date.now()}],messages:[],gifts:[],deck:{unlockedAt:Date.now()}};const root=document.querySelector('#modal-root');root.innerHTML='<div class="modal-backdrop"><section class="modal wide" role="dialog"><button class="icon-btn modal-close" data-action="close-modal">×</button>'+operatorDashboardView({snapshot})+'</section></div>';return true})()`);
  assert.equal(fixture,true);await waitElement('.operator-fullscreen .operator-console-nav');await delay(120);
  const operatorBox=await evaluate(`(()=>{const r=document.querySelector('.operator-fullscreen').getBoundingClientRect(),s=document.querySelector('.operator-workspace').getBoundingClientRect(),nav=document.querySelector('.operator-console-nav').getBoundingClientRect(),pane=document.querySelector('.operator-console-content').getBoundingClientRect();return {w:innerWidth,h:innerHeight,r:r.toJSON(),s:s.toJSON(),nav:nav.toJSON(),pane:pane.toJSON(),transform:getComputedStyle(document.querySelector('.operator-fullscreen')).transform}})()`);
  assert.ok(operatorBox.transform==='none'&&operatorBox.r.width>=operatorBox.w-20&&operatorBox.r.height>=operatorBox.h-20&&operatorBox.r.left<=10&&operatorBox.r.right>=operatorBox.w-10,width+'x'+height+' operator fills viewport '+JSON.stringify(operatorBox));
  await click('.operator-console-tab:nth-child(4)');await delay(120);
  assert.equal(await evaluate('document.querySelectorAll(".operator-console-content>.operator-section:not([hidden])").length'),1);
  assert.equal(await evaluate('document.querySelector("#operator-notice").closest("details").hidden'),false);
  await click('.operator-console-tab:nth-child(1)');await delay(120);
  assert.ok(await evaluate('!document.querySelector("[data-action=operator-artwork-open]").closest("details").hidden'));
  await evaluate('document.querySelector("#modal-root").innerHTML="";true');
  await click('.navigation-dock [data-nav=deck]');assert.equal(await evaluate('document.querySelectorAll("#deck-bank-select option").length'),4);
  assert.ok(await evaluate('Boolean(document.querySelector(".transfer-source .transfer-card")&&document.querySelector(".deck-panel .deck-image-slot"))'));
  await waitElement('.bk-native-pane>.bk-fit-pane[data-fit-scale]');await delay(180);
  const panes=await evaluate(`(()=>{const frame=document.querySelector('.bk-native-pane').getBoundingClientRect(),left=document.querySelector('.transfer-source').getBoundingClientRect(),right=document.querySelector('.deck-panel').getBoundingClientRect();return {left:left.toJSON(),right:right.toJSON(),frame:frame.toJSON()}})()`);
  assert.ok(Math.abs(panes.left.width-panes.right.width)<=2&&panes.left.width>0&&panes.right.width>0&&panes.left.right<=panes.right.left+2,width+'x'+height+' separate left and right panes '+JSON.stringify(panes));
  assert.ok(panes.left.top>=panes.frame.top-2&&panes.right.top>=panes.frame.top-2&&panes.left.bottom<=panes.frame.bottom+3&&panes.right.bottom<=panes.frame.bottom+3,width+'x'+height+' both panes within the content frame '+JSON.stringify(panes));
  assert.equal(await evaluate('Number(document.querySelector(".results-meta").dataset.resultTotal)'),2304);
  const cardGeometry=await evaluate(`(()=>{const failures=[];for(const [grid,selector] of [['.transfer-source .cards-grid','.transfer-card'],['.deck-image-grid','.deck-image-slot']]){const container=document.querySelector(grid);if(!container){failures.push(grid);continue}const bounds=container.getBoundingClientRect();for(const tile of container.querySelectorAll(selector)){const r=tile.getBoundingClientRect(),parts=[...tile.children].map(e=>e.getBoundingClientRect());if(r.left<bounds.left-2||r.right>bounds.right+2||r.top<bounds.top-2||r.bottom>bounds.bottom+2||parts.some((p,i)=>i>0&&p.top<parts[i-1].bottom-2))failures.push({grid,id:tile.dataset.transferId,tile:r.toJSON(),bounds:bounds.toJSON()});}}return failures})()`);
  assert.deepEqual(cardGeometry,[],width+'x'+height+' card art, counts, buttons and grid bounds');
  const symmetric=await evaluate(`(()=>{const q=s=>document.querySelector(s).getBoundingClientRect(),a=q('.transfer-source .cards-grid'),b=q('.deck-image-grid'),c=q('.transfer-card>.game-card'),d=q('.deck-image-slot>.game-card'),p=q('.deck-list-pagination'),l=q('#card-results>.pagination'),foot=q('.deck-panel-foot');return {a:a.toJSON(),b:b.toJSON(),c:c.toJSON(),d:d.toJSON(),p:p.toJSON(),l:l.toJSON(),foot:foot.toJSON()}})()`);
  assert.ok(Math.abs(symmetric.a.top-symmetric.b.top)<=2&&Math.abs(symmetric.a.bottom-symmetric.b.bottom)<=2&&Math.abs(symmetric.c.width-symmetric.d.width)<=2&&Math.abs(symmetric.c.height-symmetric.d.height)<=2,width+'x'+height+' symmetric card grids '+JSON.stringify(symmetric));
  assert.ok(symmetric.foot.bottom<=symmetric.b.top+2&&symmetric.p.top>=symmetric.b.bottom-2&&Math.abs(symmetric.p.top-symmetric.l.top)<=2&&symmetric.p.bottom<=panes.right.bottom+2,width+'x'+height+' save and pager separated '+JSON.stringify(symmetric));
  await click('[data-action=deck-advanced-filters]');await delay(200);await check(width+'x'+height+' expanded deck filters',['.transfer-source>.transfer-heading,.transfer-source>.deck-source-tools,.transfer-source>.filter-bar,.transfer-source>#card-results','.filter-bar>.search-field,.filter-bar>.tabs,.filter-bar>.filters-secondary','.filters-secondary>select']);
  await click('[data-action=deck-advanced-filters]');await delay(160);
  await click('[data-action=deck-filter-scope][data-scope=owned]');
  const ownedTotal=await evaluate('Number(document.querySelector(".results-meta").dataset.resultTotal)');assert.ok(ownedTotal>0&&ownedTotal<2304);
  assert.equal(await evaluate('document.querySelector(".deck-zone-tabs [data-section=main] b").textContent'),'32/32');
  await click('[data-action=deck-filter-scope][data-scope=all]');
  assert.equal(await evaluate('Number(document.querySelector(".results-meta").dataset.resultTotal)'),2304);
  assert.equal(await evaluate('document.querySelector("[data-action=deck-filter-scope][data-scope=all]").getAttribute("aria-pressed")'),'true');
  const transferId=await evaluate('document.querySelector(".deck-image-slot [data-action=deck-return-slot]").dataset.id');
  const before=await evaluate('document.querySelector(".deck-zone-tabs [data-section=main] b").textContent');
  await click('.deck-image-slot [data-action=deck-return-slot][data-id='+transferId+']');
  assert.equal(await evaluate('document.querySelector(".deck-zone-tabs [data-section=main] b").textContent'),'31/32');
  await evaluate('(()=>{const e=document.querySelector("#card-search");e.value='+JSON.stringify(transferId)+';e.dispatchEvent(new Event("input",{bubbles:true}));return true})()');
  await until(()=>evaluate('Boolean(document.querySelector(".transfer-add[data-id='+transferId+']:not(:disabled)"))'),'returned card is available again');
  await click('.transfer-add[data-id='+transferId+']');
  assert.equal(await evaluate('document.querySelector(".deck-zone-tabs [data-section=main] b").textContent'),before);
  await evaluate('(()=>{const e=document.querySelector("#card-search");e.value="";e.dispatchEvent(new Event("input",{bubbles:true}));return true})()');
  assert.equal(await evaluate('Number(document.querySelector(".deck-image-grid").dataset.total)'),32);assert.equal(await evaluate('document.querySelectorAll(".deck-visible-rows,[data-action=deck-list-mode]").length'),0);
  await click('[data-action=deck-inspect-open]');await waitElement('.deck-inspector .inspect-slot-nav');assert.ok((await evaluate('document.querySelector(".inspect-slot-nav strong").textContent')).includes('1 / 32'));await click('[data-action=deck-inspect-next]');assert.ok((await evaluate('document.querySelector(".inspect-slot-nav strong").textContent')).includes('2 / 32'));await click('[data-action=deck-inspect-all]');assert.equal(await evaluate('Number(document.querySelector(".inspect-gallery").dataset.total)'),32);await click('[data-action=deck-inspect-zone][data-section=special]');assert.equal(await evaluate('Number(document.querySelector(".inspect-gallery").dataset.total)'),4);await click('.modal-close');assert.ok(await evaluate('Boolean(document.querySelector(".deck-image-slot [data-action=deck-return-slot]"))'));
  await click('.navigation-dock [data-nav=home]');await click('[data-action=solo-mode]');await waitElement('.solo-mode');await check(width+'x'+height+' solo',general);
  await click('[data-action=solo-section][data-section=practice]');await check(width+'x'+height+' practice',['.solo-level-grid>.solo-level']);
  await click('.navigation-dock [data-nav=home]');await click('[data-action=multi-mode]');await waitElement('.mode-lobby');await check(width+'x'+height+' room',general);
  await click('.navigation-dock [data-nav=home]');await click('[data-action=rank-mode]');await waitElement('.mode-lobby');await check(width+'x'+height+' rank',general);
  await click('.navigation-dock [data-nav=collection]');await click('#card-results .game-card');await waitElement('.modal');await check(width+'x'+height+' card detail',['.modal-close,.modal>.detail-layout']);await click('.modal-close');
 }
 await click('.navigation-dock [data-nav=home]');await click('[data-action=solo-mode]');await click('[data-action=solo-section][data-section=practice]');await click('[data-action=start-game]');await waitElement('.duel-shell');
 for(const [width,height] of [[1920,1080],[1366,768],[1024,600],[768,1024],[390,844],[320,568],[844,390]]){
  await viewport(width,height);
  await waitElement('.bk-native-pane>.bk-fit-pane[data-fit-scale]');await delay(120);
  const tracks=await evaluate(`(()=>{const a=document.querySelector('.arena'),s=['.arena>.zone-strip','.midline>.arcana-zone-row','.own-zone-row>.arcana-zone-row','.own-zone-row>.zone-strip'];return {rows:s.map(q=>getComputedStyle(document.querySelector(q)).gridRowStart),columns:s.map(q=>getComputedStyle(document.querySelector(q)).gridColumnStart),hand:getComputedStyle(a.querySelector('.hand-section')).gridRowStart}})()`);
  assert.deepEqual(tracks.rows,['1','2','4','5'],width+'x'+height+' public zones have distinct rows');assert.deepEqual(tracks.columns,['2','2','2','2'],width+'x'+height+' zone column');assert.equal(tracks.hand,height<=570&&width>height?'1':'6');
  await check(width+'x'+height+' duel',['.duel-top-actions>button','.arena>.duelist,.arena>.field-row,.arena>.hand-section,.arena>.zone-strip,.midline>.turn-label,.midline>.end-turn,.midline>.arcana-zone-row,.own-zone-row>.arcana-zone-row,.own-zone-row>.zone-strip','.hand-cards>.hand-card']);
 }
 await send('Page.navigate',{url:url+'about.html'});await waitElement('body.about-page');await waitElement('.bk-fit-article .bk-fit-target[data-fit-scale]');await delay(150);await check('about page');
 assert.deepEqual(exceptions,[],'No uncaught browser errors');
 console.log('Layout smoke passed: root home, deck, collection, shop, rules, solo, practice, room, rank, details, battle, about; seven viewports');
}finally{
 for(const p of pending.values())clearTimeout(p.timer);
 server.close();server.closeAllConnections();
 await stopSmokeChrome(browser);
}

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
const viewports=[
 {width:1920,height:1080,mobile:false},{width:1902,height:800,mobile:false},
 {width:1366,height:768,mobile:false},{width:1024,height:600,mobile:false},
 {width:768,height:1024,mobile:true},{width:390,height:844,mobile:true},
 {width:320,height:568,mobile:true},{width:844,height:390,mobile:true},
];
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
const geometryHelpers=`const layoutViewport=()=>window.BeastKingViewport?.get()||{width:innerWidth,height:innerHeight,rotated:false};
const layoutRect=node=>{const raw=node.getBoundingClientRect(),r=window.BeastKingViewport?.toLocalRect(raw)||raw;const box={x:r.x,y:r.y,left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};return {...box,toJSON:()=>box}};`;
async function evaluate(expression){
 // Block scope avoids creating persistent globals between Runtime.evaluate calls.
 const r=await send('Runtime.evaluate',{expression:'{'+geometryHelpers+'\n'+expression+'\n}',returnByValue:true,awaitPromise:true});
 if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
 return r.result.value;
}
const exists=s=>'Boolean(document.querySelector('+JSON.stringify(s)+'))';
async function click(selector){
 assert.equal(await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');if(!e||e.disabled)return false;e.click();return true})()'),true,'Click: '+selector);
}
async function waitElement(selector){await until(()=>evaluate(exists(selector)),selector)}
async function assertCompleteTextReader(selector,measureOverflow,label){
 const read=()=>evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)});return {source:r.dataset.opText,text:r.querySelector('.op-reader-text').textContent,page:Number(r.dataset.opReaderPage),count:Number(r.dataset.opPageCount),visiblePage:Number(r.querySelector('[data-op-page-label]').textContent.split(' / ')[0]),nextDisabled:r.querySelector('[data-op-page-step="1"]').disabled}})()`);
 const first=await read(),parts=[];
 assert.ok(first.source.split('\n').length>20,label+' uses actual multiline content');
 assert.ok(first.count>0&&first.count<=Array.from(first.source).length,label+' has a finite page count');
 for(let page=0;page<first.count;page++){
  const row=await read();
  assert.deepEqual([row.page,row.visiblePage,row.count],[page,page+1,first.count],label+' visits page '+(page+1));
  assert.deepEqual(await measureOverflow(),[],label+' page '+(page+1)+' fits completely');
  parts.push(row.text);
  assert.equal(row.nextDisabled,page===first.count-1,label+' last-page navigation');
  if(!row.nextDisabled){await click(selector+' [data-op-page-step="1"]');await until(async()=>{const next=await read();return next.visiblePage===page+2;},label+' next text page');}
 }
 assert.equal(parts.join(''),first.source,label+' preserves every character and line break exactly once');
}
async function viewport(width,height,mobile=false){
 await send('Network.setUserAgentOverride',{userAgent:mobile?'Mozilla/5.0 (Linux; Android 14; LayoutSmoke) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',platform:mobile?'Android':'Linux x86_64'});
 await send('Emulation.setTouchEmulationEnabled',mobile?{enabled:true,maxTouchPoints:5}:{enabled:false});
 await send('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width,screenHeight:height,deviceScaleFactor:1,mobile,screenOrientation:{type:height>width?'portraitPrimary':'landscapePrimary',angle:height>width?0:90}});
 await delay(250);
 const canvas=await evaluate(`(()=>{const v=window.BeastKingViewport?.get();if(!v)return null;const s=document.querySelector('#orientation-stage').getBoundingClientRect();return {...v,count:document.querySelectorAll('#orientation-stage').length,physicalBox:s.toJSON(),touch:navigator.maxTouchPoints}})()`);
 if(canvas){
  assert.equal(canvas.rotated,mobile&&height>width,'Portrait touch uses virtual landscape: '+JSON.stringify(canvas));
  assert.deepEqual([Math.round(canvas.width),Math.round(canvas.height)],mobile&&height>width?[height,width]:[width,height]);
  assert.equal(canvas.count,1,'Exactly one live landscape canvas');
  if(mobile)assert.ok(canvas.touch>0,'Mobile coverage must include touch emulation');
  assert.ok(canvas.physicalBox.left>=-1&&canvas.physicalBox.top>=-1&&canvas.physicalBox.right<=width+1&&canvas.physicalBox.bottom<=height+1,'Rotated stage stays inside physical screen');
 }
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
 for(const {width,height,mobile} of [{width:1280,height:720,mobile:false},...viewports.filter(v=>v.mobile&&v.height>v.width)]){
  await viewport(width,height,mobile);await waitElement('.bk-entry-native');
  const entry=await evaluate(`(()=>{const p=layoutRect(document.querySelector('#app'));return [...document.querySelectorAll('#entry-start-form,#entry-player-name,.entry-profile-option,#entry-starter,.entry-start-button,.entry-footer a')].filter(e=>{const r=layoutRect(e);return r.width<=0||r.height<=0||r.left<p.left-2||r.right>p.right+2||r.top<p.top-2||r.bottom>p.bottom+2}).map(e=>e.id||e.className)})()`);
  assert.deepEqual(entry,[],width+'x'+height+' complete entry controls inside the live canvas');await assertFits();
 }
 await viewport(1280,720);
 await evaluate('document.querySelector("#entry-player-name").value="画面表示テスト十二文字";true');
 assert.equal(await evaluate('document.querySelectorAll("#entry-starter option").length'),4);
 await click('[data-action=name-start]');await waitElement('.product-home');
 assert.equal(await evaluate('Object.values(JSON.parse(localStorage.getItem("beast-king-v6")).collection).reduce((a,b)=>a+b,0)'),36);
 await click('.navigation-dock [data-nav=shop]');await click('[data-action=shop-section][data-section=starters]');assert.equal(await evaluate('document.querySelectorAll("[data-action=starter-buy]").length'),4);assert.equal(await evaluate('document.querySelectorAll("[data-action=starter-load]:disabled").length'),3);await click('.navigation-dock [data-nav=home]');
 const inspect=`(selectors)=>{const out=[];for(const selector of selectors){const els=[...document.querySelectorAll(selector)].filter(e=>{const r=layoutRect(e);return r.width>0&&r.height>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'});for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){const a=layoutRect(els[i]),b=layoutRect(els[j]);const w=Math.min(a.right,b.right)-Math.max(a.left,b.left),h=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);if(w>2&&h>2)out.push({selector,i,j,a:els[i].getAttribute('aria-label')||els[i].className,b:els[j].getAttribute('aria-label')||els[j].className,w:Math.round(w),h:Math.round(h)});}}return out}`;
 async function check(label,selectors=[]){
  const v=await evaluate('({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight})');assert.ok(v.sw<=v.w+2&&v.sh<=v.h+2,label+' viewport overflow '+JSON.stringify(v));
  const fit=await evaluate(`(()=>{const shell=document.querySelector('#app>.bk-native-screen'),frame=shell?.querySelector('.bk-native-pane'),pane=frame?.firstElementChild;if(!shell||!frame||!pane)return null;const s=layoutRect(shell),f=layoutRect(frame),p=layoutRect(pane),a=layoutRect(document.querySelector('#app'));return {native:getComputedStyle(shell).transform==='none',shellWidth:s.width,appWidth:a.width,shellHeight:s.height,appHeight:a.height,frameWidth:frame.clientWidth,paneWidth:p.width,frameHeight:f.height,paneHeight:p.height,scale:Number(pane.dataset.fitScale)}})()`);
  if(fit){assert.ok(fit.scale>0&&fit.scale<=1,label+' finite fitted scale '+JSON.stringify(fit));if(v.w>=1366&&v.h>=720&&/ (home|deck|collection)$/.test(label))assert.ok(fit.scale>=.85,label+' readable desktop scale '+JSON.stringify(fit));assert.ok(fit.native&&Math.abs(fit.shellWidth-fit.appWidth)<3&&Math.abs(fit.shellHeight-fit.appHeight)<3,label+' native screen '+JSON.stringify(fit));assert.ok(fit.paneWidth>=fit.frameWidth*.97&&fit.paneHeight>=fit.frameHeight*.97,label+' full content pane '+JSON.stringify(fit));}
  const scrolling=await evaluate(`(()=>[...document.querySelectorAll('.bk-native-pane,.bk-fit-frame,.bk-fit-article,.operator-content-frame,.bk-fit-modal,.battle-log-scroll,.hand-inspector-scroll')].filter(e=>layoutRect(e).width>0&&['auto','scroll'].includes(getComputedStyle(e).overflowY)).map(e=>e.className))()`);assert.deepEqual(scrolling,[],label+' no scrollable panes');
  const errors=await evaluate('('+inspect+')('+JSON.stringify(selectors)+')');
  assert.deepEqual(errors,[],label+' overlapping controls '+JSON.stringify(errors));
 }
 const general=['.navigation-dock>.dock-link','.site-controls>button'];
 for(const {width,height,mobile} of viewports){
  await viewport(width,height,mobile);
  for(const [page,selectors] of [['home',['.home-mode-rail>.home-mode']],['deck',['.deck-panel>.workshop-tools,.deck-panel>.deck-list','.deck-panel>.workshop-tools>*','.transfer-source>.workshop-tools,.transfer-source>#card-results','.transfer-source>.workshop-tools>*','.deck-list>.results-meta,.deck-list>.deck-image-grid,.deck-list>.deck-list-pagination','#card-results>.results-meta,#card-results>.cards-grid,#card-results>.pagination','.transfer-card>.transfer-counts,.transfer-card>.transfer-actions','.deck-bank-actions>.btn','.deck-display-tabs>.btn','.deck-scope-tabs>.btn','.deck-source-tools>.deck-scope-tabs,.deck-source-tools>.btn,.deck-source-tools>.text-button']],['collection',['.filter-bar>.search-field,.filter-bar>.tabs,.filter-bar>.filters-secondary','#card-results>.results-meta,#card-results>.cards-grid,#card-results>.pagination']],['shop',['.product-section-tabs>button']],['rules',['.rulebook-tabs>button']]]){
   await click('.navigation-dock [data-nav='+page+']');await waitElement('main[data-page='+page+']');await waitElement('.bk-native-pane>.bk-fit-pane[data-fit-scale]');await delay(200);
   if(page==='home'){
    const modeVisibility=await evaluate('(()=>{const p=layoutRect(document.querySelector(".home-page"));return [...document.querySelectorAll(".home-mode-rail>.home-mode")].map(e=>{const r=layoutRect(e);return r.top>=p.top-2&&r.bottom<=p.bottom+2&&r.left>=p.left-2&&r.right<=p.right+2})})()');assert.deepEqual(modeVisibility,[true,true,true],width+'x'+height+' all three mode controls fully visible');
    // The feature cards deliberately form an overlapping fan; each complete
    // transformed card must nevertheless remain inside the content pane.
    const fan=await evaluate('(()=>{const p=layoutRect(document.querySelector(".bk-native-pane"));return {frame:p.toJSON(),cards:[...document.querySelectorAll(".home-card-fan>.game-card")].map(e=>{const r=layoutRect(e);return {visible:r.width>0&&r.height>0&&r.top>=p.top-2&&r.bottom<=p.bottom+2&&r.left>=p.left-2&&r.right<=p.right+2,box:r.toJSON()}})}})()');assert.deepEqual(fan.cards.map(c=>c.visible),[true,true,true],width+'x'+height+' all three featured cards fully visible '+JSON.stringify(fan));
   }
   if(page==='shop'){
    assert.equal(await evaluate('document.querySelectorAll("[data-action=pack-select]").length'),4);
    for(const pack of ['BK03','BK04']){
     await click('[data-action=pack-select][data-pack='+pack+']');await delay(160);
     assert.equal(await evaluate('document.querySelector(".pack-cover-art").complete&&document.querySelector(".pack-cover-art").naturalWidth>0'),true,pack+' illustrated cover loads');
     assert.equal(await evaluate('document.querySelectorAll(".recipe-launchers>button").length'),4);
     await check(width+'x'+height+' '+pack,['.product-section-tabs>button','.pack-offer>.pack-buy,.pack-offer>.pack-assurance,.pack-offer>.pack-collection']);
     const recipeId=await evaluate('document.querySelector(".recipe-launchers>button").dataset.id');
     await click('[data-action=expansion-recipe][data-id='+recipeId+']');await waitElement('.recipe-card-list');await delay(120);
     assert.equal(await evaluate('document.querySelector("[data-action=recipe-load]").disabled'),true,'Unowned recipes are not granted');
     await check(width+'x'+height+' '+pack+' recipe',['.recipe-card-list>.recipe-card-row','.modal-actions>button']);
     await click('[data-action=recipe-next]');await check(width+'x'+height+' '+pack+' recipe page2',['.recipe-card-list>.recipe-card-row']);
     await click('.modal-close');
    }
   }
   // Card ownership/action pairs are tested per card, not between distinct tiles.
   await check(width+'x'+height+' '+page,[...general,...selectors]);
  }
  // Long scheduled operator content is rendered locally; never sent to live players.
  await evaluate(`(async()=>{const {setPublicNotice}=await import('./news.js?v=20261124-28');setPublicNotice({ok:true,notice:'長文の運営告知',notices:[{id:'fixture-long-notice',title:'長文の運営告知',body:'【検証用】改行を含む長いお知らせ。<script>を文字として表示します。\\n'.repeat(40),status:'published',phase:'active',startAt:Date.now()}],maintenance:false,upcomingMaintenance:{startAt:Date.now()+3600000,endAt:Date.now()+7200000,message:'予約メンテナンスの表示検証'}});return true})()`);
  // Real native news dialog, not a synthetic layout. Every notice must
  // appear exactly once, fully within the viewport and outside the controls.
  await click('.news-open');await waitElement('#news-dialog[open]');await delay(120);
  const newsSeen=[];let newsPageCount=0;
  while(true){
   const news=await evaluate(`(()=>{const d=document.querySelector('#news-dialog'),g=d.querySelector('.news-items'),f=d.querySelector('.news-dialog-footer'),h=d.querySelector('.news-dialog-header'),box=layoutRect(d),grid=layoutRect(g),footer=layoutRect(f),header=layoutRect(h);return {w:layoutViewport().width,h:layoutViewport().height,rotated:layoutViewport().rotated,box:box.toJSON(),grid:grid.toJSON(),header:header.toJSON(),footer:footer.toJSON(),transform:getComputedStyle(d).transform,rotation:(()=>{const t=getComputedStyle(d).transform,m=new DOMMatrix(t==='none'?undefined:t);return {a:m.a,b:m.b,c:m.c,d:m.d}})(),total:g.children.length,indices:[...g.querySelectorAll('article:not([hidden])')].map(e=>Number(e.dataset.newsIndex)),bad:[...g.querySelectorAll('article:not([hidden])')].filter(e=>{const r=layoutRect(e);return r.top<grid.top-2||r.bottom>grid.bottom+2||r.left<grid.left-2||r.right>grid.right+2||e.scrollHeight>e.clientHeight+2}).map(e=>e.dataset.newsIndex),next:d.querySelector('.news-next').disabled}})()`);
   assert.ok((news.rotated?Math.abs(news.rotation.a)<.001&&Math.abs(news.rotation.b-1)<.001&&Math.abs(news.rotation.c+1)<.001&&Math.abs(news.rotation.d)<.001:news.transform==='none')&&news.box.width>=news.w-20&&news.box.height>=news.h-20&&news.box.left<=10,width+'x'+height+' full-screen news '+JSON.stringify(news));
   assert.ok(news.header.bottom<=news.grid.top+2&&news.grid.bottom<=news.footer.top+2,width+'x'+height+' separate news rows');
   assert.deepEqual(news.bad,[],width+'x'+height+' complete news articles');
   newsSeen.push(...news.indices);newsPageCount++;
   if(news.next){assert.equal(new Set(newsSeen).size,news.total);assert.equal(newsSeen.length,news.total);break;}
   assert.ok(newsPageCount<=news.total,'News pagination terminates');
   await click('#news-dialog .news-next');
  }
  await click('#news-dialog .news-return');assert.equal(await evaluate('document.querySelector("#news-dialog").open'),false);
  const fixture=await evaluate(`(async()=>{const {operatorDashboardView}=await import('./account-views.js');const {getCard}=await import('./catalog.js');const snapshot={stats:{totalPlayers:4,activeBattles:0,onlinePlayers:1,recentLogins24h:4},settings:{notice:'検証用',maintenance:false,revision:0},onlinePlayers:[],recentLogins:[],recentPlayers:[],events:[],audit:[],messages:[],gifts:[],notices:[],deck:{unlockedAt:Date.now()}};const root=document.querySelector('#modal-root');const state={snapshot,tab:'overview',getCard};window.__opFixtureRender=(values={})=>{Object.assign(state,values);root.innerHTML='<div class="modal-backdrop"><section class="modal wide" role="dialog"><button class="icon-btn modal-close" data-action="close-modal">×</button>'+operatorDashboardView(state)+'</section></div>';};window.__opFixtureClick=event=>{const button=event.target.closest('[data-action="operator-tab"]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();window.__opFixtureRender({tab:button.dataset.tab,draft:null});};root.addEventListener('click',window.__opFixtureClick,true);window.__opFixtureRender();return true})()`);
  assert.equal(fixture,true);await waitElement('.operator-fullscreen .op-nav');await delay(120);
  const operatorBox=await evaluate(`(()=>{const r=layoutRect(document.querySelector('.operator-fullscreen')),s=layoutRect(document.querySelector('.op-workspace')),nav=layoutRect(document.querySelector('.op-nav')),pane=layoutRect(document.querySelector('.op-main'));return {w:layoutViewport().width,h:layoutViewport().height,r:r.toJSON(),s:s.toJSON(),nav:nav.toJSON(),pane:pane.toJSON(),transform:getComputedStyle(document.querySelector('.operator-fullscreen')).transform}})()`);
  assert.ok(operatorBox.transform==='none'&&operatorBox.r.width>=operatorBox.w-20&&operatorBox.r.height>=operatorBox.h-20&&operatorBox.r.left<=10&&operatorBox.r.right>=operatorBox.w-10,width+'x'+height+' operator fills viewport '+JSON.stringify(operatorBox));
  await click('.op-nav [data-tab=maintenance]');await delay(120);
  assert.equal(await evaluate('document.querySelectorAll(".op-main>.op-maintenance").length'),1);
  assert.equal(await evaluate('Boolean(document.querySelector("#operator-notice")&&document.querySelector("#operator-maintenance-start"))'),true);
  await click('.op-nav [data-tab=overview]');await delay(120);
  assert.ok(await evaluate('(()=>{const section=document.querySelector(".op-regalia");return section.textContent.includes("認証後に自動で適用")&&!section.querySelector("[data-action=operator-artwork-open],input[type=file]")})()'));
  // Maximum permitted author content and twelve reward types must remain
  // readable through bounded pages, never through hidden overflowing panels.
  const measureOperatorOverflow=()=>evaluate(`(()=>{const pane=document.querySelector('.op-main'),b=layoutRect(pane);return [...pane.querySelectorAll('.op-surface,.op-field,.op-editor-footer,.op-steps,.op-copy-reader>p,.op-rewards')].filter(e=>{const r=layoutRect(e);return r.width>0&&(r.left<b.left-2||r.right>b.right+2||r.top<b.top-2||r.bottom>b.bottom+2||e.matches('.op-surface,.op-copy-reader>p')&&e.scrollHeight>e.clientHeight+2)}).map(e=>({tag:e.tagName,class:e.className,width:e.clientWidth,height:e.clientHeight,scrollHeight:e.scrollHeight,scrollWidth:e.scrollWidth,bounds:layoutRect(e).toJSON(),paneBounds:b.toJSON(),parent:{class:e.parentElement.className,bounds:layoutRect(e.parentElement).toJSON(),rows:getComputedStyle(e.parentElement).gridTemplateRows},text:e.textContent.slice(0,35)}))})()`);
  for(const step of [0,1,2,3]){
   await evaluate(`(async()=>{const {CARDS}=await import('./catalog.js');window.__opFixtureRender({tab:'gift',draft:{kind:'gift',title:'長い配信タイトルの表示を確認します。'.repeat(5).slice(0,80),body:'改行を含む運営からの長いお知らせを、すべて確認できるか検証します。\\n'.repeat(30).slice(0,1000),target:'all',status:'draft',treasure:100000,cards:CARDS.slice(-12).map(card=>({cardId:card.id,count:3})),publishAt:Date.now()+3600000,expiresAt:Date.now()+86400000},step:${step},rewardMatches:CARDS.slice(-3)});return true})()`);
   await delay(300);
   const overflow=await measureOperatorOverflow();
   assert.deepEqual(overflow,[],width+'x'+height+' operator editor step '+step+' has no clipped content');
   if(step===3){
    await assertCompleteTextReader('.op-main [data-op-panel-content="0"] [data-op-text]',measureOperatorOverflow,width+'x'+height+' operator review body');
    for(const panel of [1,2]){await click('.op-reading-tabs [data-op-panel="'+panel+'"]');await delay(120);assert.deepEqual(await measureOperatorOverflow(),[],width+'x'+height+' operator review panel '+panel+' has no clipped content');}
   }
  }
  await evaluate(`(async()=>{const {playerInboxView}=await import('./account-views.js');const {CARDS,getCard}=await import('./catalog.js');const gift={id:'fixture-inbox-long',title:'長い受信タイトルの全文確認。'.repeat(6).slice(0,80),body:'受け取った便りの本文をページ送りで最後まで確認します。\\n'.repeat(40).slice(0,1000),status:'published',phase:'active',publishAt:Date.now(),treasure:100000,cards:CARDS.slice(-12).map(card=>({cardId:card.id,count:3})),claimable:true};document.querySelector('#modal-root').innerHTML='<div class="modal-backdrop"><section class="modal wide" role="dialog"><button class="icon-btn modal-close">×</button>'+playerInboxView({gifts:[gift],selected:gift.id,tab:'gift',getCard})+'</section></div>';return true})()`);
  await delay(300);
  const measureInboxOverflow=()=>evaluate(`(()=>{const pane=document.querySelector('.op-inbox-main'),b=layoutRect(pane);return [...pane.querySelectorAll('.op-surface,.op-editor-footer,.op-copy-reader>p,.op-rewards')].filter(e=>{const r=layoutRect(e);return r.width>0&&(r.left<b.left-2||r.right>b.right+2||r.top<b.top-2||r.bottom>b.bottom+2||e.matches('.op-surface,.op-copy-reader>p')&&e.scrollHeight>e.clientHeight+2)}).map(e=>({tag:e.tagName,class:e.className,width:e.clientWidth,height:e.clientHeight,scrollHeight:e.scrollHeight,scrollWidth:e.scrollWidth,bounds:layoutRect(e).toJSON(),paneBounds:b.toJSON(),parent:{class:e.parentElement.className,bounds:layoutRect(e.parentElement).toJSON(),rows:getComputedStyle(e.parentElement).gridTemplateRows},text:e.textContent.slice(0,35)}))})()`);
  const inboxOverflow=await measureInboxOverflow();
  assert.deepEqual(inboxOverflow,[],width+'x'+height+' inbox long message and twelve-card reward fit');
  await assertCompleteTextReader('.op-inbox-main [data-op-panel-content="0"] [data-op-text]',measureInboxOverflow,width+'x'+height+' inbox body');
  for(const panel of [1,2]){await click('.op-reading-tabs [data-op-panel="'+panel+'"]');await delay(120);assert.deepEqual(await measureInboxOverflow(),[],width+'x'+height+' inbox detail panel '+panel+' has no clipped content');}
  await evaluate('document.querySelector("#modal-root").removeEventListener("click",window.__opFixtureClick,true);document.querySelector("#modal-root").innerHTML="";delete window.__opFixtureRender;delete window.__opFixtureClick;true');
  await click('.navigation-dock [data-nav=deck]');assert.equal(await evaluate('document.querySelectorAll("#deck-bank-select option").length'),1);
  assert.ok(await evaluate('Boolean(document.querySelector(".transfer-source .transfer-card")&&document.querySelector(".deck-panel .deck-image-slot"))'));
  await waitElement('.bk-native-pane>.bk-fit-pane[data-fit-scale]');await delay(180);
  const panes=await evaluate(`(()=>{const frame=layoutRect(document.querySelector('.bk-native-pane')),left=layoutRect(document.querySelector('.transfer-source')),right=layoutRect(document.querySelector('.deck-panel'));return {left:left.toJSON(),right:right.toJSON(),frame:frame.toJSON(),scrollHeight:document.querySelector('.bk-native-pane').scrollHeight,clientHeight:document.querySelector('.bk-native-pane').clientHeight,overflow:getComputedStyle(document.querySelector('.bk-native-pane')).overflowY}})()`);
  assert.ok(Math.abs(panes.left.width-panes.right.width)<=2&&panes.left.width>0&&panes.right.width>0&&panes.left.right<=panes.right.left+2,width+'x'+height+' separate left and right panes '+JSON.stringify(panes));
  assert.ok(panes.left.top>=panes.frame.top-2&&panes.right.top>=panes.frame.top-2&&panes.left.bottom<=panes.frame.bottom+3&&panes.right.bottom<=panes.frame.bottom+3&&['hidden','clip'].includes(panes.overflow),width+'x'+height+' both panes within the content frame '+JSON.stringify(panes));
  assert.equal(await evaluate('Number(document.querySelector(".results-meta").dataset.resultTotal)'),4608);
  const cardGeometry=await evaluate(`(()=>{const failures=[];for(const [grid,selector] of [['.transfer-source .cards-grid','.transfer-card'],['.deck-image-grid','.deck-image-slot']]){const container=document.querySelector(grid);if(!container){failures.push(grid);continue}const bounds=layoutRect(container);for(const tile of container.querySelectorAll(selector)){const r=layoutRect(tile),parts=[...tile.children].map(e=>layoutRect(e));if(r.left<bounds.left-2||r.right>bounds.right+2||r.top<bounds.top-2||r.bottom>bounds.bottom+2||parts.some((p,i)=>i>0&&p.top<parts[i-1].bottom-2))failures.push({grid,id:tile.dataset.transferId,tile:r.toJSON(),bounds:bounds.toJSON()});}}return failures})()`);
  assert.deepEqual(cardGeometry,[],width+'x'+height+' card art, counts, buttons and grid bounds');
  const symmetric=await evaluate(`(()=>{const q=s=>layoutRect(document.querySelector(s)),a=q('.transfer-source .cards-grid'),b=q('.deck-image-grid'),c=q('.transfer-card>.game-card'),d=q('.deck-image-slot>.game-card'),p=q('.deck-list-pagination'),l=q('#card-results>.pagination'),foot=q('.deck-panel-foot');return {a:a.toJSON(),b:b.toJSON(),c:c.toJSON(),d:d.toJSON(),p:p.toJSON(),l:l.toJSON(),foot:foot.toJSON()}})()`);
  assert.ok(Math.abs(symmetric.a.top-symmetric.b.top)<=2&&Math.abs(symmetric.a.bottom-symmetric.b.bottom)<=2&&Math.abs(symmetric.c.width-symmetric.d.width)<=2&&Math.abs(symmetric.c.height-symmetric.d.height)<=2,width+'x'+height+' symmetric card grids '+JSON.stringify(symmetric));
  assert.ok(symmetric.foot.bottom<=symmetric.b.top+2&&symmetric.p.top>=symmetric.b.bottom-2&&Math.abs(symmetric.p.top-symmetric.l.top)<=2&&symmetric.p.bottom<=panes.right.bottom+2,width+'x'+height+' save and pager separated '+JSON.stringify(symmetric));
  // Exercise the operator status/actions in the visible settings tab without
  // accessing a live account. Hidden card-mode rows cannot prove their fit.
  await click('[data-bk-screen-tab=settings]');await delay(120);
  await evaluate(`(()=>{const head=document.querySelector('.deck-panel-head'),row=document.createElement('div');row.className='operator-deck-preset';row.dataset.layoutFixture='true';row.innerHTML='<span>運営構築 · 開放済み</span><button class="text-button" data-action="operator-deck-use">𠮷良原デッキを使う</button><small class="operator-art-auto">専用イラストを自動適用</small><small class="operator-art-status">専用イラスト未受信</small><button class="text-button" data-action="operator-art-refresh">再取得</button>';head.append(row);return true})()`);
  await delay(180);
  await check(width+'x'+height+' visible operator deck settings',['.deck-panel>.workshop-tools>*','[data-layout-fixture]>*']);
  const operatorSettingsFit=await evaluate(`(()=>{const row=document.querySelector('[data-layout-fixture]'),frame=layoutRect(document.querySelector('.bk-native-pane')),bounds=layoutRect(row),nodes=[row,...row.children],inside=(r,b)=>r.left>=b.left-2&&r.right<=b.right+2&&r.top>=b.top-2&&r.bottom<=b.bottom+2;return {mode:document.querySelector('.dual-workshop').dataset.bkWorkshopMode,visible:nodes.every(e=>{const r=layoutRect(e);return r.width>0&&r.height>0}),inside:nodes.every(e=>inside(layoutRect(e),frame)),contained:[...row.children].every(e=>inside(layoutRect(e),bounds))}})()`);
  assert.deepEqual(operatorSettingsFit,{mode:'settings',visible:true,inside:true,contained:true},width+'x'+height+' complete operator settings controls');
  await evaluate('document.querySelector("[data-layout-fixture]").remove();true');await delay(120);
  await click('[data-bk-screen-tab=filter]');await delay(120);await click('[data-action=deck-advanced-filters]');await delay(200);await check(width+'x'+height+' expanded deck filters',['.transfer-source>.transfer-heading,.transfer-source>.deck-source-tools,.transfer-source>.filter-bar,.transfer-source>#card-results','.filter-bar>.search-field,.filter-bar>.tabs,.filter-bar>.filters-secondary','.filters-secondary>select']);
  await click('[data-action=deck-advanced-filters]');await delay(120);await click('[data-bk-screen-tab=cards]');await delay(160);
  await click('[data-action=deck-filter-scope][data-scope=owned]');
  const ownedTotal=await evaluate('Number(document.querySelector(".results-meta").dataset.resultTotal)');assert.ok(ownedTotal>0&&ownedTotal<4608);
  assert.equal(await evaluate('document.querySelector(".deck-zone-tabs [data-section=main] b").textContent'),'32/32');
  await click('[data-action=deck-filter-scope][data-scope=all]');
  assert.equal(await evaluate('Number(document.querySelector(".results-meta").dataset.resultTotal)'),4608);
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
  await waitElement('[data-bk-screen-tab=settings]');await click('[data-bk-screen-tab=settings]');await delay(120);await click('[data-action=deck-inspect-open]');await waitElement('.deck-inspector .inspect-slot-nav');assert.ok((await evaluate('document.querySelector(".inspect-slot-nav strong").textContent')).includes('1 / 32'));await click('[data-action=deck-inspect-next]');assert.ok((await evaluate('document.querySelector(".inspect-slot-nav strong").textContent')).includes('2 / 32'));await click('[data-action=deck-inspect-all]');assert.equal(await evaluate('Number(document.querySelector(".inspect-gallery").dataset.total)'),32);await click('[data-action=deck-inspect-zone][data-section=special]');assert.equal(await evaluate('Number(document.querySelector(".inspect-gallery").dataset.total)'),4);await click('.modal-close');assert.ok(await evaluate('Boolean(document.querySelector(".deck-image-slot [data-action=deck-return-slot]"))'));
  await click('.navigation-dock [data-nav=home]');await click('[data-action=solo-mode]');await waitElement('.solo-mode');await check(width+'x'+height+' solo',general);
  await click('[data-action=solo-section][data-section=practice]');await check(width+'x'+height+' practice',['.solo-level-grid>.solo-level']);
  await click('.navigation-dock [data-nav=home]');await click('[data-action=multi-mode]');await waitElement('.mode-lobby');await check(width+'x'+height+' room',general);
  await click('.navigation-dock [data-nav=home]');await click('[data-action=rank-mode]');await waitElement('.mode-lobby');await check(width+'x'+height+' rank',general);
  await click('.navigation-dock [data-nav=collection]');await click('#card-results .game-card');await waitElement('.modal');await check(width+'x'+height+' card detail',['.modal-close,.modal>.detail-layout']);await click('.modal-close');
 }
 await click('.navigation-dock [data-nav=home]');await click('[data-action=solo-mode]');await click('[data-action=solo-section][data-section=practice]');await click('[data-action=start-game]');await waitElement('.duel-shell');
 for(const {width,height,mobile} of viewports){
  await viewport(width,height,mobile);
  await waitElement('.bk-native-pane>.bk-fit-pane[data-fit-scale]');await delay(120);
  const tracks=await evaluate(`(()=>{const a=document.querySelector('.arena'),s=['.arena>.zone-strip','.midline>.arcana-zone-row','.own-zone-row>.arcana-zone-row','.own-zone-row>.zone-strip'];return {rows:s.map(q=>getComputedStyle(document.querySelector(q)).gridRowStart),columns:s.map(q=>getComputedStyle(document.querySelector(q)).gridColumnStart),hand:getComputedStyle(a.querySelector('.hand-section')).gridRowStart}})()`);
  const logical=await evaluate('layoutViewport()');
  assert.deepEqual(tracks.rows,['1','2','4','5'],width+'x'+height+' public zones have distinct rows');assert.deepEqual(tracks.columns,['2','2','2','2'],width+'x'+height+' zone column');assert.equal(tracks.hand,logical.height<=570&&logical.width>logical.height?'1':'6');
  await check(width+'x'+height+' duel',['.duel-top-actions>button','.arena>.duelist,.arena>.field-row,.arena>.hand-section,.arena>.zone-strip,.midline>.turn-label,.midline>.end-turn,.midline>.arcana-zone-row,.own-zone-row>.arcana-zone-row,.own-zone-row>.zone-strip','.hand-cards>.hand-card']);
 }
 for(const path of ['about.html','rebuild/about.html']){
  await send('Page.navigate',{url:url+path});await waitElement('body.about-page');await waitElement('.bk-fit-article .bk-fit-target[data-fit-scale]');await waitElement('[data-guide-select]:not(:disabled)');
  const chapterCount=await evaluate('document.querySelectorAll("#about-main > section").length');assert.ok(chapterCount>=4,path+' has complete chapter navigation');
  assert.equal(await evaluate('document.querySelector("[data-guide-select]").options.length'),chapterCount);
  for(const {width,height,mobile} of [{width:1366,height:768,mobile:false},...viewports.filter(v=>v.mobile&&v.height>v.width)]){
   await viewport(width,height,mobile);
   for(let chapter=0;chapter<chapterCount;chapter++){
    await evaluate('(()=>{const s=document.querySelector("[data-guide-select]");s.value='+chapter+';s.dispatchEvent(new Event("change",{bubbles:true}));return true})()');await delay(100);
    const guide=await evaluate('(()=>{const f=layoutRect(document.querySelector(".bk-fit-article")),sections=[...document.querySelectorAll("#about-main > section:not([hidden])")];return {visible:sections.length,bad:sections.flatMap(s=>[s,...s.querySelectorAll("h1,h2,h3,p,a,dl,article")]).filter(e=>{const r=layoutRect(e);return r.width>0&&r.height>0&&(r.left<f.left-2||r.right>f.right+2||r.top<f.top-2||r.bottom>f.bottom+2)}).map(e=>e.id||e.className||e.tagName)}})()');
    if(guide.bad.length){
     const geometry=await evaluate('(()=>{const main=document.querySelector("#about-main"),frame=document.querySelector(".bk-fit-article");return {frame:layoutRect(frame).toJSON(),main:layoutRect(main).toJSON(),scale:main.dataset.fitScale,sections:[...main.querySelectorAll(":scope > section:not([hidden])")].map(e=>({id:e.id,box:layoutRect(e).toJSON(),offsetHeight:e.offsetHeight,scrollHeight:e.scrollHeight,minHeight:getComputedStyle(e).minHeight}))}})()');
     console.error('Guide chapter geometry',JSON.stringify({path,width,height,chapter:chapter+1,...geometry}));
    }
    assert.deepEqual(guide,{visible:1,bad:[]},path+' '+width+'x'+height+' complete chapter '+(chapter+1));
   }
   await check(path+' '+width+'x'+height,['.guide-header>*','.bk-fit-pager>*']);
  }
 }
 assert.deepEqual(exceptions,[],'No uncaught browser errors');
 console.log('Layout smoke passed: entry, home, deck, collection, shop, rules, solo, practice, room, rank, details, battle and every chapter in both guides; eight desktop/mobile viewports including portrait touch landscape fallback');
}finally{
 for(const p of pending.values())clearTimeout(p.timer);
 server.close();server.closeAllConnections();
 await stopSmokeChrome(browser);
}

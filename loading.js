/** Shared, bounded loading presentation. Progress counts real visible assets;
 * saves, purchases and match clocks are never owned by this controller. */
export function loadingLabel(screen){
 return ({entry:'七つの源を呼び覚ましています',home:'王庭を開いています',deck:'デッキ工房を準備しています',collection:'カード図鑑を開いています',shop:'秘宝を並べています',solo:'ソロの旅を準備しています',online:'闘技場に接続しています',duel:'バトルステージを展開しています',battle:'バトルステージを展開しています',rules:'遊び方を開いています',guide:'ガイドを開いています'})[screen]||'画面を準備しています';
}

const ART_SURFACES='.card-art,.game-card,.starter-box-art,.pack-illustration,.entry-scene,.home-scenery,.onboard,.hero,.arena,.about-hero,.guide-hero,.card .art';
const ASSET_NODES='img,'+ART_SURFACES;
const ROUTE_NODES='main[data-page],.duel-shell,.entry-screen,.onboard,.shell,.boot,.loading';
const LOADING_IGNORED='#bk-loading-layer,.bk-network-status,.bk-experience-layer,.bk-pack-ceremony';

export function visibleAssetUrls(scope,readStyle=globalThis.getComputedStyle,view=scope?.ownerDocument?.defaultView??globalThis.window){
 if(!scope)return [];
 const urls=new Set();
 const styleOf=(node,pseudo)=>{try{return readStyle?.(node,pseudo);}catch{return null;}};
 const visible=node=>{
  if(node.closest?.(LOADING_IGNORED))return false;
  if(node.closest?.('[hidden],[data-bk-page-hidden]'))return false;
  const style=styleOf(node);
  if(style?.display==='none'||['hidden','collapse'].includes(style?.visibility))return false;
  if(node.getClientRects&&!node.getClientRects().length)return false;
  const rect=node.getBoundingClientRect?.();
  if(rect&&(!(rect.width>0&&rect.height>0)||rect.bottom<=0||rect.right<=0||view?.innerWidth>0&&rect.left>=view.innerWidth||view?.innerHeight>0&&rect.top>=view.innerHeight))return false;
  return true;
 };
 const add=value=>{
  if(!value||value.startsWith('data:'))return;
  try{urls.add(new URL(value,scope.ownerDocument?.baseURI||view?.location?.href).href);}catch{urls.add(value);}
 };
 const imgs=[...(scope.matches?.('img')?[scope]:[]),...scope.querySelectorAll('img')];
 for(const img of imgs)if(visible(img))add(img.currentSrc||img.getAttribute('src')&&img.src);
 const surfaces=[...(scope.matches?.(ART_SURFACES)?[scope]:[]),...scope.querySelectorAll(ART_SURFACES)];
 for(const node of surfaces){
  if(!visible(node))continue;
  for(const pseudo of [undefined,'::before','::after']){
   const style=styleOf(node,pseudo);
   if(pseudo&&(!style||['none','normal'].includes(style.content)))continue;
   const background=style?.backgroundImage||(!pseudo?node.style?.backgroundImage:'')||'';
   for(const match of background.matchAll(/url\(["']?([^"')]+)["']?\)/g))add(match[1]);
  }
 }
 return [...urls];
}

export function createLoadingController(options={}){
 const doc=options.document??globalThis.document,win=options.window??globalThis.window;
 if(!doc?.body||!win)return null;
 if(doc.__beastKingLoading)return doc.__beastKingLoading;
 const layer=doc.createElement('div');layer.id='bk-loading-layer';layer.className='bk-loading-layer';layer.hidden=true;
 const root=doc.querySelector('#orientation-stage')||doc.body;
 layer.innerHTML='<section class="bk-loading-card" role="status" aria-live="polite"><div class="bk-loading-orbit" aria-hidden="true"><i></i><i></i><img src="'+(win.location?.pathname?.includes('/rebuild/')?'../':'')+'assets/design-v2/brand/crest.svg?v=20261125-37" width="88" height="88" alt=""></div><span class="bk-loading-eyebrow" aria-hidden="true">ORIGINAL CARD BATTLE</span><span class="bk-loading-brand">BEAST KING</span><span class="bk-loading-rule" aria-hidden="true"></span><p data-loading-label></p><div class="bk-loading-track" role="progressbar" aria-label="画像の読み込み" aria-valuemin="0" aria-valuemax="100"><i></i></div><small data-loading-count></small></section><span class="bk-loading-motto" aria-hidden="true">その一手に、王の意志を。</span>';
 root.append(layer);
 const label=layer.querySelector('[data-loading-label]'),count=layer.querySelector('[data-loading-count]'),bar=layer.querySelector('.bk-loading-track'),fill=bar.querySelector('i');
 const busy=doc.createElement('div');busy.className='bk-network-status';busy.hidden=true;busy.setAttribute('role','status');busy.setAttribute('aria-live','polite');root.append(busy);
 let generation=0,lastScreen='',lastAssets='',pendingFrame=0,closed=false,suspended=false,deadlineTimer=null,bootTimer=null;
 const pending=new Map(),timers=new Set(),assets=new Set(),cache=new Set(),cleanups=[];
 const delay=(fn,ms)=>{const id=win.setTimeout(()=>{timers.delete(id);fn();},ms);timers.add(id);return id;};
 const clear=id=>{if(id!==null){win.clearTimeout(id);timers.delete(id);}};
 function finish(token){if(token!==generation||closed)return;layer.hidden=true;layer.classList.remove('is-loading');if(layer.parentNode!==root)root.append(layer);}
 function cancelScreen(){
  clear(deadlineTimer);deadlineTimer=null;
  for(const cancel of [...assets])cancel();
 }
 function loadAsset(url){
  if(cache.has(url))return Promise.resolve(true);
  return new Promise(resolve=>{
   let image,timeout=null,settled=false;
   const complete=ok=>{if(settled)return;settled=true;clear(timeout);if(image)image.onload=image.onerror=null;assets.delete(cancel);if(ok)cache.add(url);resolve(ok);};
   const cancel=()=>complete(false);assets.add(cancel);
   try{
    image=new win.Image();image.onload=()=>complete(true);image.onerror=()=>complete(false);
    timeout=delay(()=>complete(false),3500);image.src=url;
    if(image.complete)complete(image.naturalWidth>0);
   }catch{complete(false);}
  });
 }
 function screen(id,{force=false,scope,refresh=false}={}){
  if(closed||suspended)return;
  if(id==='catalog')id='collection';
  const sameScreen=id===lastScreen;
  if(!force&&sameScreen&&!refresh)return;
  let visibleUrls;
  try{
   const scopes=new Set([scope||doc.querySelector('#app')||doc.body,doc.getElementById('modal-root'),doc.getElementById('detail')]);
   visibleUrls=[...new Set([...scopes].filter(Boolean).flatMap(node=>visibleAssetUrls(node,options.readStyle||win.getComputedStyle?.bind(win),win)))];
  }catch{generation++;finish(generation);cancelScreen();return;}
  // A filter, page switch or detail dialog can change the art without changing
  // the route. Compare actual sources; typing and repeated FX cannot restart it.
  const signature=[...visibleUrls].sort().join('\n');
  if(!force&&sameScreen&&signature===lastAssets)return;
  lastScreen=id;lastAssets=signature;const token=++generation;cancelScreen();
  const urls=visibleUrls.filter(url=>!cache.has(url));
  label.textContent=sameScreen?'カードのイラストを読み込んでいます':loadingLabel(id);count.textContent='';fill.style.width='0%';bar.removeAttribute('aria-valuenow');
  if(!urls.length){finish(token);return;}
  // Incremental art keeps the controls and battle table readable. Native modal
  // dialogs live in the top layer, so their compact status must be inside them.
  const dialog=doc.querySelector('dialog[open]');
  if(sameScreen||dialog)layer.classList.add('is-compact');else layer.classList.remove('is-compact');
  const host=dialog||root;if(layer.parentNode!==host)host.append(layer);
  layer.hidden=false;layer.classList.add('is-loading');
  // This final bound is independent of image callbacks and Promise completion.
  deadlineTimer=delay(()=>{if(token!==generation||closed)return;finish(token);cancelScreen();},3750);
  bar.setAttribute('aria-valuenow','0');
  count.textContent='0 / '+urls.length+' 画像を読み込み';
  let loaded=0,failed=0;
  const progress=ok=>{
   if(token!==generation||closed||suspended)return;
   if(ok)loaded++;else failed++;
   const percent=Math.round(loaded/urls.length*100);fill.style.width=percent+'%';bar.setAttribute('aria-valuenow',String(percent));
   count.textContent=loaded+' / '+urls.length+' 画像を読み込み'+(failed?' · '+failed+'件を省略':'');
  };
  Promise.all(urls.map(url=>loadAsset(url).then(progress))).then(()=>{
   if(token!==generation||closed||suspended)return;
   clear(deadlineTimer);deadlineTimer=null;
   // No minimum duration: browser cache hits finish before the next paint.
   finish(token);
  },()=>{if(token===generation){finish(token);cancelScreen();}});
 }
 function inferScreen(){
  if(doc.querySelector('.bk-pack-ceremony')){generation++;finish(generation);cancelScreen();lastAssets='';return;}
  const app=doc.getElementById('app');
  if(app?.querySelector('.boot,.loading')){watchBoot();return;}
  clear(bootTimer);bootTimer=null;
  // Rebuild navigation buttons also carry data-page; only main owns the route.
  const pane=app?.querySelector('#main[data-page],.shell > main[data-page],main[data-page]');
  const id=pane?.dataset.page||(app?.querySelector('.duel-shell')?'duel':app?.querySelector('.entry-screen,.onboard')?'entry':app?.querySelector('.shell .battle')?'battle':app?.querySelector('.shell')?'home':doc.querySelector('.about-page')?'guide':'');
  if(id)screen(id,{scope:app||doc.body,refresh:true});
 }
 function schedule(){if(pendingFrame||closed||suspended)return;pendingFrame=win.requestAnimationFrame(()=>{pendingFrame=0;if(!closed&&!suspended)inferScreen();});}
 const app=doc.getElementById('app');
 const Observer=options.MutationObserver||win.MutationObserver;
 const has=(node,selector)=>!!(node?.nodeType===1&&(node.matches?.(selector)||node.querySelector?.(selector)));
 const ignored=node=>!!node?.closest?.(LOADING_IGNORED);
 const sourceStyle=value=>(String(value||'').match(/url\([^)]*\)/g)||[]).join('|');
 function changed(records=[]){
  if(!records.length){schedule();return;}
  for(const record of records){
   if(ignored(record.target))continue;
   if(record.type==='attributes'){
    const node=record.target,name=record.attributeName;
    if((name==='data-page'&&node.matches?.('main[data-page]'))||(name==='open'&&node.tagName==='DIALOG')){schedule();return;}
    if(name==='style'){
     if(node.matches?.(ASSET_NODES)&&sourceStyle(record.oldValue)!==sourceStyle(node.getAttribute('style'))){schedule();return;}
    }else if(has(node,ASSET_NODES)){schedule();return;}
   }else if(record.type==='childList'){
    for(const node of [...record.addedNodes,...record.removedNodes])if(!ignored(node)&&(has(node,ASSET_NODES)||has(node,ROUTE_NODES))){schedule();return;}
   }
  }
 }
 const observer=Observer?new Observer(changed):null;
 const observerOptions={childList:true,subtree:true,attributes:true,attributeOldValue:true,attributeFilter:['data-page','hidden','data-bk-page-hidden','src','srcset','style','open']};
 for(const node of new Set([app,doc.getElementById('modal-root'),doc.getElementById('detail')]))if(node)observer?.observe(node,observerOptions);
 function setBusy({key='network',active=false,label='通信しています'}={}){
  if(closed||suspended)return;
  if(active)pending.set(key,label);else pending.delete(key);
  busy.hidden=!pending.size;busy.textContent=pending.size?[...pending.values()].at(-1):'';
 }
 const pageHide=()=>{
  suspended=true;generation++;finish(generation);cancelScreen();clear(bootTimer);bootTimer=null;
  if(pendingFrame)win.cancelAnimationFrame(pendingFrame);pendingFrame=0;
  pending.clear();busy.hidden=true;
 };
 const pageShow=()=>{suspended=false;lastScreen='';lastAssets='';schedule();};
 win.addEventListener('pagehide',pageHide);win.addEventListener('pageshow',pageShow);
 cleanups.push(()=>win.removeEventListener('pagehide',pageHide),()=>win.removeEventListener('pageshow',pageShow));
 const renderEvent=event=>screen(event.detail?.screen||'home',{force:!!event.detail?.force});
 win.addEventListener('beastking:loading-screen',renderEvent);cleanups.push(()=>win.removeEventListener('beastking:loading-screen',renderEvent));
 function watchBoot(){
  const boot=app?.querySelector('.boot,.loading');
  if(bootTimer!==null||!boot||boot.querySelector('[data-boot-retry]')||closed||suspended)return;
  bootTimer=delay(()=>{
   bootTimer=null;
   const boot=app.querySelector('.boot,.loading');if(!boot||closed||suspended||boot.querySelector('[data-boot-retry]'))return;
   const note=boot.querySelector('[data-boot-message]')||boot.querySelector('p');if(note)note.textContent='読み込みに時間がかかっています。接続を確認して、再読み込みしてください。';
   const retry=doc.createElement('button');retry.className='btn';retry.textContent='再読み込み';retry.setAttribute('data-boot-retry','');retry.addEventListener('click',()=>win.location.reload());boot.append(retry);
  },12000);
 }
 watchBoot();
 schedule();
 const controller={screen,busy:setBusy,destroy(){closed=true;generation++;cancelScreen();observer?.disconnect();if(pendingFrame)win.cancelAnimationFrame(pendingFrame);for(const id of timers)win.clearTimeout(id);timers.clear();pending.clear();for(const cleanup of cleanups)cleanup();layer.remove();busy.remove();delete doc.__beastKingLoading;}};
 doc.__beastKingLoading=controller;return controller;
}

if(typeof document!=='undefined'&&document.body&&typeof window!=='undefined')window.BeastKingLoading=createLoadingController();

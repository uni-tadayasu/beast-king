/* Paged viewport: no document or nested scrolling. Display fewer things at a
   time at physical size; fit an indivisible panel only after reflow and paging. */
const doc=document,root=doc.documentElement;
root.classList.add('bk-fit');
const layoutWidth=()=>window.BeastKingViewport?.get().width||window.innerWidth;
const layoutHeight=()=>window.BeastKingViewport?.get().height||window.innerHeight;
const layoutRect=node=>{const r=node.getBoundingClientRect();return window.BeastKingViewport?.toLocalRect(r)||r;};
let pending=false,running=false,lastRoot=null,lastModal=null,about=null;
let lastCardMetrics='';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const children=node=>[...node.children];
function directFrame(host,target){
 if(target.parentElement?.classList.contains('bk-fit-frame'))return target.parentElement;
 const frame=doc.createElement('div');frame.className='bk-fit-frame';host.insertBefore(frame,target);frame.append(target);return frame;
}
function naturalSize(node){
 const bounds=layoutRect(node);
 return {w:Math.max(node.offsetWidth,node.scrollWidth,1),h:Math.max(node.offsetHeight,node.scrollHeight,1),bounds};
}
function setCanvas(node,width,height,fill){
 node.style.setProperty('width',Math.max(1,width)+'px','important');
 node.style.setProperty('height',node.dataset.page==='deck'&&fill?Math.max(1,height)+'px':'auto','important');
 node.style.setProperty('min-height',fill?Math.max(1,height)+'px':'0px','important');
 node.style.setProperty('--bk-canvas-h',Math.max(1,height)+'px');
 node.style.setProperty('--bk-canvas-w',Math.max(1,width)+'px');
}
function measureCardPane(node,height){
 const result=node.querySelector('#card-results');if(!result)return;
 const bounds=layoutRect(node),r=layoutRect(result);
 const meta=result.querySelector('.results-meta'),pager=result.querySelector('.pagination');
 const footer=(meta?.offsetHeight||22)+(pager?.offsetHeight||38)+22;
 const pad=Number.parseFloat(getComputedStyle(node).paddingBottom)||0;
 const dual=node.dataset.page==='deck'&&!!node.querySelector('.dual-workshop');
 const leftGrid=result.querySelector('.cards-grid');
 const available=Math.max(1,dual?(leftGrid?.clientHeight||1):height-(r.top-bounds.top)-pad-footer);
 const list=node.querySelector('.deck-list'),foot=node.querySelector('.deck-panel-foot');
 const pagerRight=list?.querySelector('.deck-list-pagination'),rightPadding=20;
 const imageGrid=list?.querySelector('.deck-image-grid');
 const deckHeight=list?Math.max(0,dual?(imageGrid?.clientHeight||list.clientHeight-(pagerRight?.offsetHeight||34)-rightPadding):height-(layoutRect(list).top-bounds.top)-pad-(foot?.offsetHeight||48)-40):0;
 const metrics={width:Math.max(1,Math.floor(dual?(leftGrid?.clientWidth||result.clientWidth):result.clientWidth)),height:Math.floor(available),deckHeight:Math.floor(deckHeight),deckWidth:list?Math.max(1,imageGrid?.clientWidth||list.clientWidth-10):0};
 const key=[node.dataset.page,metrics.width,metrics.height,metrics.deckHeight,metrics.deckWidth].join(':');
 // A replaced app render needs the current calculation even if geometry is identical.
 if(key!==lastCardMetrics||!node.dataset.bkMetricsApplied){lastCardMetrics=key;node.dataset.bkMetricsApplied='true';window.dispatchEvent(new CustomEvent('bk-fit-card-metrics',{detail:metrics}));}
}
// The editor has two real grids, with measured shared tracks. An auto-sized
// subgrid row can shrink below its intrinsic controls when the viewport is
// short. Measure the controls themselves, reserve their full height, and only
// then calculate the remaining identical image rectangles.
function measureWorkshopTracks(node,logicalHeight){
 const workspace=node.querySelector('.dual-workshop>.transfer-workspace');
 if(!workspace)return null;
 const panels=[workspace.querySelector('.transfer-source'),workspace.querySelector('.deck-panel')];
 if(panels.some(p=>!p))return null;
 const maxHeight=selector=>Math.ceil(Math.max(0,...panels.map(panel=>{
  const el=panel.querySelector(selector);return el&&el.getClientRects().length?Math.max(el.offsetHeight,el.scrollHeight):0;
 })));
 const tools=maxHeight('.workshop-tools'),meta=maxHeight('.results-meta'),pager=Math.max(36,maxHeight('.pagination,.deck-list-pagination'));
 workspace.style.setProperty('--workshop-tools-height',tools+'px');
 workspace.style.setProperty('--workshop-meta-height',meta+'px');
 workspace.style.setProperty('--workshop-pager-height',pager+'px');
 const num=(style,key)=>Number.parseFloat(style[key])||0;
 const chrome=Math.max(...panels.map(panel=>{
  const s=getComputedStyle(panel),list=panel.querySelector('#card-results,.deck-list'),l=getComputedStyle(list);
  return num(s,'paddingTop')+num(s,'paddingBottom')+num(s,'borderTopWidth')+num(s,'borderBottomWidth')+num(s,'rowGap')+2*num(l,'rowGap')+num(l,'paddingTop')+num(l,'paddingBottom')+num(l,'borderTopWidth')+num(l,'borderBottomWidth');
 }));
 // A shallow landscape canvas needs smaller artwork, not smaller controls.
 // Short screens use a horizontal tile and 40px action footer; taller screens
 // reserve 64px for separate readable count/action rows.
 // CSS uses the same minimum instead of the previous unconditional 145px.
 const minImageHeight=layoutHeight()<=350?80:layoutHeight()<=400?120:layoutHeight()<=540?155:layoutWidth()>=1000?235:165;
 workspace.style.setProperty('--workshop-min-image-height',minImageHeight+'px');
 const required=Math.ceil(tools+meta+pager+chrome+minImageHeight+3);
 workspace.style.setProperty('min-height',required+'px','important');
 const bounds=layoutRect(node),box=layoutRect(workspace),style=getComputedStyle(node);
 const outside=Math.ceil(box.top-bounds.top+num(style,'paddingBottom')+num(style,'borderBottomWidth'));
 // Reserve exactly the same full logical panel and image heights. A grid
 // item's legacy intrinsic/percentage height must never shorten one side.
 const panelHeight=Math.max(required,Math.floor(logicalHeight-outside));
 const imageHeight=Math.max(minImageHeight,Math.floor(panelHeight-tools-meta-pager-chrome));
 const listHeight=Math.ceil(meta+imageHeight+pager+2*Math.max(...panels.map(panel=>num(getComputedStyle(panel.querySelector('#card-results,.deck-list')),'rowGap'))));
 workspace.style.setProperty('height',panelHeight+'px','important');
 workspace.style.setProperty('--workshop-panel-height',panelHeight+'px');
 workspace.style.setProperty('--workshop-image-height',imageHeight+'px');
 workspace.style.setProperty('--workshop-list-height',listHeight+'px');
 return {workspace,requiredHeight:outside+required};
}
function fitDeckWorkshop(node,width,height){
 if(width<1||height<1)return;
 node.style.transform='none';node.style.setProperty('left','0px','important');node.style.setProperty('top','0px','important');
 function trial(scale){
  const w=width/scale,h=height/scale;
  setCanvas(node,w,h,true);
  const tracks=measureWorkshopTracks(node,h);
  return {w,h,needed:tracks?.requiredHeight||h,ok:(tracks?.requiredHeight||h)<=h+0.5};
 }
 let scale=1,result=trial(1);
 if(!result.ok){
  let high=1,low=0;
  // Only scale the central deck workspace when the full control area and
  // minimum complete tile genuinely cannot fit. Header/navigation stay native.
  for(let n=0;n<9;n++){
   high=scale;scale=Math.max(.08,Math.min(scale-.005,scale*result.h/result.needed*.99));
   result=trial(scale);if(result.ok){low=scale;break;}
  }
  if(low){
   for(let n=0;n<6;n++){
    const candidate=(low+high)/2,r=trial(candidate);
    if(r.ok)low=candidate;else high=candidate;
   }
   scale=low;result=trial(scale);
  }
 }
 // Recalculate the actual shared tile budget once, at the final scale.
 // Never use an outdated card's overflow to determine the control height.
 measureCardPane(node,result.h);
 node.style.transform=scale>=.999?'none':'scale('+scale+')';
 node.dataset.fitScale=scale.toFixed(4);node.dataset.fitWidth=String(Math.round(result.w*scale));node.dataset.fitHeight=String(Math.round(result.h*scale));
}

function fit(node,width,height,{modal=false,logicalMin=0,center=false,fill=false,measureCards=false,tolerance=2}={}){
 if(!node||width<1||height<1)return;
 node.style.transform='none';node.style.setProperty('left','0px','important');node.style.setProperty('top','0px','important');
 // Try physical pixel dimensions first. If content is exceptionally tall,
 // reflow at a wider logical width AND a taller logical height. Unlike the
 // old letterboxed fit, the selected canvas always covers both dimensions.
 let scale=1;
 const minimum=fill?0:logicalMin;
 function trial(s,measure=false){
  const w=fill?width/s:Math.max(width,minimum),h=height/s;
  setCanvas(node,w,h,fill);
  if(measureCards&&(measure||node.dataset.page==='deck'))measureCardPane(node,h);
  const n=naturalSize(node);
  return {fits:n.w*s<=width+tolerance&&n.h*s<=height+tolerance,ratio:Math.min(1,width/n.w,height/n.h),w,h,n};
 }
 let result=trial(1,true);
 if(fill){
  if(!result.fits){
   let hi=1,lo=0;
   // Find a usable candidate, then maximize readable scale.
   scale=Math.max(.20,Math.min(.985,result.ratio));
   for(let i=0;i<7;i++){
    result=trial(scale);
    if(result.fits){lo=scale;break;}
    hi=scale;scale=Math.max(.08,Math.min(scale-.005,result.ratio));
   }
   if(lo>0){for(let i=0;i<5;i++){const middle=(lo+hi)/2;const r=trial(middle);if(r.fits)lo=middle;else hi=middle;}scale=lo;}
   result=trial(scale);
   // Ensure a previously overflowing descendant cannot extend outside the pane.
   if(!result.fits){scale=Math.max(.025,Math.min(scale,result.ratio));result=trial(scale);}
  }
  node.style.transform=scale>=.999?'none':'scale('+scale+')';
  node.dataset.fitScale=scale.toFixed(4);
  node.dataset.fitWidth=String(Math.round(result.n.w*scale));
  node.dataset.fitHeight=String(Math.round(result.n.h*scale));
  if(modal&&center){
   node.style.setProperty('left',Math.max(0,(width-result.n.w*scale)/2)+'px','important');
   node.style.setProperty('top',Math.max(0,(height-result.n.h*scale)/2)+'px','important');
  }
 }else{
  // Dialogs keep their own reading layout; a wide dialog may occupy the entire
  // available width without altering the native application frame behind it.
  scale=clamp(result.ratio,.025,1);
  const n=result.n;
  node.style.transform=scale>=.999?'none':'scale('+scale+')';
  node.style.setProperty('left',Math.max(0,(width-n.w*scale)/2)+'px','important');
  node.style.setProperty('top',(center?Math.max(0,(height-n.h*scale)/2):0)+'px','important');
  node.dataset.fitScale=scale.toFixed(4);
 }
}
function fitBattlePane(pane,width,height){
 // Camera targets are absolute projections of the previous fitted canvas.
 // Their old pixel coordinates must not enlarge scrollWidth/scrollHeight
 // while fit() tries a new canvas size. The two normal-flow grid rows still
 // reserve the board space; only their already-positioned overlays are hidden.
 const projected=[...pane.querySelectorAll('.arena[data-battle-camera="angled"]>.field-row>.field-slot[data-camera-placed="true"]')].map(node=>({
  node,display:node.style.getPropertyValue('display'),priority:node.style.getPropertyPriority('display')
 }));
 for(const {node} of projected)node.style.setProperty('display','none','important');
 try{fit(pane,width,height,{fill:true});}
 finally{
  for(const {node,display,priority} of projected){
   if(display)node.style.setProperty('display',display,priority);
   else node.style.removeProperty('display');
  }
 }
 // Motion-off scenes also need fresh targets after the final scale is set.
 window.dispatchEvent(new Event('bk-battle-layout'));
}
function paginateAbout(){
 if(about)return;
 const main=doc.querySelector('body.about-page main')||(!doc.querySelector('#app')?doc.querySelector('body>main'):null);
 if(!main)return;
 doc.body.classList.add('bk-about');
 const sections=children(main).flatMap(el=>el.tagName==='SECTION'?[el]:children(el).filter(x=>x.tagName==='SECTION').length?children(el).filter(x=>x.tagName==='SECTION'):[el]);
 if(!sections.length)return;
 const frame=doc.createElement('div');frame.className='bk-fit-article';
 const pager=doc.createElement('nav');pager.className='bk-fit-pager';pager.setAttribute('aria-label','紹介ページの切り替え');
 const prev=doc.createElement('button'),next=doc.createElement('button'),count=doc.createElement('span');prev.type=next.type='button';prev.textContent='前のページ';next.textContent='次のページ';pager.append(prev,count,next);
 main.parentElement.insertBefore(frame,main);frame.append(main);main.classList.add('bk-fit-target');frame.after(pager);
 about={frame,main,sections,index:0,prev,next,count};
 function update(){const {sections,index,prev,next,count}=about;sections.forEach((e,i)=>e.hidden=i!==index);prev.disabled=index<=0;next.disabled=index>=sections.length-1;count.textContent=(index+1)+' / '+sections.length;main.dispatchEvent(new CustomEvent('bk-guide-page',{detail:{index,total:sections.length}}));schedule();}
 main.addEventListener('bk-guide-jump',event=>{const value=Number(event.detail?.index);if(Number.isInteger(value)){about.index=clamp(value,0,sections.length-1);update();}});
 prev.addEventListener('click',()=>{about.index=Math.max(0,about.index-1);update()});next.addEventListener('click',()=>{about.index=Math.min(sections.length-1,about.index+1);update()});
 update();
}
// Keep existing elements and delegated game actions: these are alternate views
// of the same editor, never copies of cards, controls or saved data.
let workshopMode='cards',homeMode='showcase',catalogMode='cards',shopMode='pack',lastPage='';
function screenTabs(host,anchor,items,key,current,change){
 let bar=host.querySelector(':scope > .bk-screen-tabs[data-bk-tab-kind="'+key+'"]');
 if(!bar){
  bar=doc.createElement('nav');bar.className='bk-screen-tabs';bar.dataset.bkTabKind=key;bar.setAttribute('aria-label','画面切り替え');
  for(const [id,label] of items){const button=doc.createElement('button');button.type='button';button.dataset.bkScreenTab=id;button.textContent=label;button.addEventListener('click',()=>{change(id);schedule();});bar.append(button);}
  if(anchor)anchor.after(bar);else host.prepend(bar);
 }
 for(const button of children(bar))button.setAttribute('aria-pressed',String(button.dataset.bkScreenTab===current));
 return bar;
}
function preparePage(pane){
 const page=pane.dataset.page||'duel';
 if(lastPage!==page){if(page==='deck')workshopMode='cards';if(page==='home')homeMode='showcase';if(page==='collection')catalogMode='cards';if(page==='shop')shopMode='pack';lastPage=page;}
 if(page==='deck'){
  const workshop=pane.querySelector('.dual-workshop');if(!workshop)return;
  workshop.dataset.bkWorkshopMode=workshopMode;
  screenTabs(workshop,workshop.querySelector(':scope > .page-title'),[['cards','カード編成'],['filter','検索・絞り込み'],['settings','デッキ設定']],'workshop',workshopMode,id=>{workshopMode=id;workshop.dataset.bkWorkshopMode=id;});
  if(workshopMode!=='cards'){
   const workspace=workshop.querySelector('.transfer-workspace');
   if(workspace){workspace.style.removeProperty('height');workspace.style.removeProperty('min-height');}
  }
 }
 if(page==='home'){
  const home=pane.querySelector('.product-home');if(!home)return;
  const compact=layoutWidth()<1100||layoutHeight()<800;
  home.dataset.bkHomeMode=compact?homeMode:'all';
  const existing=home.querySelector(':scope > .bk-screen-tabs');
  if(compact){
   const bar=screenTabs(home,home.querySelector(':scope > .home-mode-rail'),[['showcase','ホーム'],['command','デッキ・戦績'],['origins','オリジン']],'home',homeMode,id=>{homeMode=id;home.dataset.bkHomeMode=id;});bar.hidden=false;
  }else if(existing)existing.hidden=true;
 }
 if(page==='collection'){
  const compact=layoutWidth()<900||layoutHeight()<630;
  if(!compact)catalogMode='cards';
  pane.dataset.bkCatalogMode=compact?catalogMode:'all';
  const existing=pane.querySelector(':scope > .bk-screen-tabs');
  if(compact){const bar=screenTabs(pane,pane.querySelector(':scope > .page-title'),[['cards','カード一覧'],['filter','検索・絞り込み']],'catalog',catalogMode,id=>{catalogMode=id;pane.dataset.bkCatalogMode=id;});bar.hidden=false;}
  else if(existing)existing.hidden=true;
 }
 if(page==='shop'){
  const shop=pane.querySelector('.product-shop');if(!shop)return;
  const compact=layoutWidth()<1100||layoutHeight()<800;
  const booster=shop.querySelector('.booster-layout');
  shop.dataset.bkShopMode=booster?(compact?shopMode:'all'):'starters';
  const existing=shop.querySelector(':scope > .bk-screen-tabs[data-bk-tab-kind="shop"]');
  if(compact&&booster){
   const bar=screenTabs(shop,shop.querySelector(':scope > .product-section-tabs'),[['pack','パック'],['recipes','構築例'],['details','収録・詳細']],'shop',shopMode,id=>{shopMode=id;shop.dataset.bkShopMode=id;});
   bar.setAttribute('aria-label','ショップの表示');bar.hidden=false;
  }else if(existing)existing.hidden=true;
 }
}
function fitApp(){
 const app=doc.getElementById('app');if(!app)return;
 const target=app.querySelector(':scope > .royal-shell,:scope > .duel-shell,:scope > .entry-screen,:scope > .shell,:scope > .onboard,:scope > .bk-fit-frame > .bk-fit-target');
 if(!target)return;
 if(target.matches('.royal-shell,.duel-shell')){
  // Keep the actual application header, footer and navigation at 100% size.
  // Only the content between those fixed tracks may reflow or fit locally.
  target.classList.add('bk-native-screen');
  target.classList.remove('bk-fit-target');
  if(target.parentElement!==app){const old=target.parentElement;app.insertBefore(target,old);old.remove();}
  for(const key of ['transform','left','top','width','height','min-height'])target.style.removeProperty(key);
  const pane=target.querySelector(target.matches('.royal-shell')?'main.page':'.duel-layout');
  if(!pane)return;
  let frame=pane.parentElement;
  if(!frame.classList.contains('bk-native-pane')){
   const host=frame;frame=doc.createElement('div');frame.className='bk-native-pane';host.insertBefore(frame,pane);frame.append(pane);
   pane.classList.add('bk-fit-pane');lastCardMetrics='';
  }
  preparePage(pane);
  const w=frame.clientWidth,h=frame.clientHeight;
  if(pane.dataset.page==='deck'&&pane.querySelector('.dual-workshop')&&workshopMode==='cards')fitDeckWorkshop(pane,w,h);
  else if(pane.matches('.duel-layout'))fitBattlePane(pane,w,h);
  else fit(pane,w,h,{fill:true,measureCards:pane.dataset.page==='collection'&&pane.dataset.bkCatalogMode!=='filter'});
  target.dataset.fitScale='1.0000';target.dataset.fitWidth=String(target.clientWidth);target.dataset.fitHeight=String(target.clientHeight);
  lastRoot=target;return;
 }
 if(target.matches('.shell,.entry-screen')){
  target.classList.remove('bk-fit-target');target.classList.add(target.matches('.shell')?'bk-rebuild-native':'bk-entry-native');
  if(target.parentElement!==app){const old=target.parentElement;app.insertBefore(target,old);old.remove();}
  for(const key of ['transform','left','top','width','height','min-height'])target.style.removeProperty(key);
  lastRoot=target;return;
 }
 // The entry canvas retains its own layout.
 // The entire logical canvas fills the viewport rather than a narrow centered strip.
 if(target!==lastRoot){target.classList.add('bk-fit-target');directFrame(app,target);lastRoot=target;}
 const frame=target.parentElement;frame.style.height=app.clientHeight+'px';frame.style.flex='none';
 fit(target,frame.clientWidth,frame.clientHeight,{fill:true});
}
const pagedLists=new WeakMap();
function pageItems(list){return children(list).filter(el=>!el.hidden);}
function paginateList(list,size,label='一覧'){
 const items=pageItems(list);
 let state=pagedLists.get(list);
 if(!state&&items.length<=size)return;
 if(!state){
  const bar=doc.createElement('div'),prev=doc.createElement('button'),next=doc.createElement('button'),count=doc.createElement('span');
  bar.className='bk-fit-inline-pager';bar.setAttribute('aria-label',label+'のページ');
  prev.type=next.type='button';prev.textContent='前へ';next.textContent='次へ';count.setAttribute('aria-live','polite');bar.append(prev,count,next);const scroll=list.closest('.battle-log-scroll');if(scroll&&list.parentElement===scroll)scroll.after(bar);else list.after(bar);
  state={bar,prev,next,label:count,index:0,size};pagedLists.set(list,state);list.dataset.fitPaged='true';
  prev.addEventListener('click',()=>{state.index--;updatePagedList(list,state);schedule();});next.addEventListener('click',()=>{state.index++;updatePagedList(list,state);schedule();});
 }
 state.size=size;updatePagedList(list,state);
}
function paginateLongLists(){
 const short=layoutHeight()<650,phone=layoutWidth()<600,tight=layoutHeight()<=400;
 const general=tight?1:layoutHeight()<=540?2:layoutHeight()<=750?3:5;
 const groups=[
  ['.starter-shelf',phone||tight?1:layoutWidth()<1100||short?2:4,'スターター'],
  ['.pack-result-grid',phone||tight?2:short?3:4,'開封カード'],
  ['.rulebook-spread',phone||short?1:2,'ルール'],
  ['.campaign-chapters',phone||tight?1:short?2:4,'章'],
  ['.battle-log-panel .battle-log-entries',1,'対戦履歴'],
  ['.battle-log-drawer .battle-log-entries',short?2:4,'対戦履歴'],
  ['.operator-player-list,.operator-audit,.account-device-list:not([data-account-paged]),.zone-card-list,.special-deck-list',general,'一覧'],
  ['.operator-event-list,.operator-delivery-history',general,'履歴'],
  ['.shell .deck-rows',phone||short?3:6,'編成カード'],
  ['.shell .side .log',general,'対戦履歴'],
  ['.rebuild-starter-offers',phone||tight?1:short?2:4,'スターター']
 ];
 for(const [selector,size,label] of groups)for(const list of doc.querySelectorAll(selector))paginateList(list,size,label);
}
function updatePagedList(list,state){
 const items=pageItems(list),pages=Math.max(1,Math.ceil(items.length/state.size));state.index=clamp(state.index,0,pages-1);
 items.forEach((el,i)=>el.toggleAttribute('data-bk-page-hidden',Math.floor(i/state.size)!==state.index));
 const label=(state.index+1)+' / '+pages+' · '+items.length+'件';if(state.label.textContent!==label)state.label.textContent=label;
 state.prev.disabled=state.index===0;state.next.disabled=state.index===pages-1;state.bar.hidden=pages===1;
 list.style.setProperty('--bk-visible-items',String(Math.max(1,Math.min(state.size,items.length-state.index*state.size))));
}
function fitOperatorConsole(modal){
 const view=modal.querySelector('.operator-view');if(!view)return false;
 modal.classList.add('operator-fullscreen');
 for(const key of ['width','height','min-height','max-width','max-height','left','top','right','bottom','transform'])modal.style.removeProperty(key);
 modal.dataset.fitScale='1.0000';
 if(!view.querySelector('.operator-workspace')){
  const sections=children(view).filter(e=>e.matches('details.operator-section'));
  if(!sections.length)return false;
  const header=doc.createElement('div');header.className='operator-console-header';
  for(const e of children(view).filter(e=>!e.matches('details.operator-section')))header.append(e);
  const workspace=doc.createElement('div');workspace.className='operator-workspace';
  const nav=doc.createElement('nav');nav.className='operator-console-nav';nav.setAttribute('aria-label','運営管理メニュー');
  const content=doc.createElement('div');content.className='operator-console-content';
  const preferred=sections.findIndex(e=>e.open&&e.dataset.operatorSection==='events');
  const initial=preferred>=0?preferred:Math.max(0,sections.findIndex(e=>e.open));
  const tabs=[];
  function select(index){
   sections.forEach((section,i)=>{section.hidden=i!==index;section.open=i===index;tabs[i].setAttribute('aria-pressed',String(i===index));});
   view.dataset.operatorActive=String(index);schedule();
  }
  sections.forEach((section,index)=>{
   const summary=section.querySelector('summary'),body=section.querySelector('.operator-section-body');
   const button=doc.createElement('button');button.type='button';button.className='operator-console-tab';
   button.textContent=summary?.querySelector('span')?.textContent||summary?.textContent||'項目 '+(index+1);
   button.addEventListener('click',()=>select(index));tabs.push(button);nav.append(button);
   if(summary)summary.addEventListener('click',e=>e.preventDefault());
   if(body){const frame=doc.createElement('div');frame.className='operator-content-frame';section.insertBefore(frame,body);frame.append(body);}
   content.append(section);
  });
  workspace.append(nav,content);view.append(header,workspace);select(initial);
 }
 const active=view.querySelector('.operator-section:not([hidden]) .operator-content-frame');
 if(active?.firstElementChild){
  const body=active.firstElementChild;
  fit(body,active.clientWidth,active.clientHeight,{fill:true});
 }
 return true;
}
function fitPagedInbox(modal){
 if(!modal.querySelector(':scope > .player-inbox.op-inbox'))return false;
 // Paged readers need a definite height. The generic auto-height dialog fit
 // collapses their remaining grid track before text can be measured.
 modal.classList.add('inbox-fullscreen');
 for(const key of ['width','height','min-height','max-width','max-height','left','top','right','bottom','transform'])modal.style.removeProperty(key);
 modal.dataset.fitScale='1.0000';
 return true;
}
function fitAccountWorkspace(modal){
 if(!modal.querySelector(':scope > .account-workspace'))return false;
 modal.classList.add('account-fullscreen');
 for(const key of ['width','height','min-height','max-width','max-height','left','top','right','bottom','transform'])modal.style.removeProperty(key);
 modal.dataset.fitScale='1.0000';
 modal.dataset.fitWidth=String(modal.offsetWidth);
 modal.dataset.fitHeight=String(modal.offsetHeight);
 return true;
}
function fitModal(){
 const modal=doc.querySelector('#modal-root .modal,dialog[open]:not(.news-dialog)');
 if(!modal)return;
 const w=Math.max(1,layoutWidth()-20),h=Math.max(1,layoutHeight()-20);
 if(modal!==lastModal){lastModal=modal;modal.classList.add('bk-fit-modal');}
 if(fitAccountWorkspace(modal)||fitOperatorConsole(modal)||fitPagedInbox(modal))return;
 const wrap=modal.parentElement;
 const inBackdrop=wrap?.classList.contains('modal-backdrop');
 // A logical fit canvas may be wider than its parent before scaling. A legacy
 // max-width:100% cap otherwise shrinks the text while leaving half the screen
 // blank. Remove both caps before measuring the real content box.
 modal.style.setProperty('max-width','none','important');
 modal.style.setProperty('max-height','none','important');
 // Native dialogs remain in the top layer and use its centered positioning.
 if(!inBackdrop){modal.style.setProperty('max-height','none','important');modal.style.setProperty('overflow','visible','important');modal.style.width=Math.min(w,960)+'px';modal.style.height='auto';modal.style.setProperty('--bk-dialog-scale','1');modal.style.transform='none';const n=naturalSize(modal);const factor=Math.min(1,w/n.w,h/n.h);modal.style.setProperty('--bk-dialog-scale',String(factor));modal.style.transform='scale('+factor+')';modal.style.transformOrigin='center center';return;}
 const wide=modal.classList.contains('wide');
 const readingWidth=modal.querySelector('.cyber-card-detail')?1400:modal.querySelector('.settings-tabs,.deck-insight-layout')?1280:modal.querySelector('#online-nickname')?1120:960;
 const targetWidth=wide?w:Math.min(w,readingWidth);
 fit(modal,targetWidth,h,{modal:true,logicalMin:0,center:true,fill:wide});
 if(!wide)modal.style.setProperty('left',(Number.parseFloat(modal.style.left||'0')+(w-targetWidth)/2)+'px','important');
 modal.style.setProperty('left',(Number.parseFloat(modal.style.left||'0')+10)+'px','important');modal.style.setProperty('top',(Number.parseFloat(modal.style.top||'0')+10)+'px','important');
}
// Block native scroll containers left by older component styles. Clip only
// those containers, not card artwork or absolute decorative layers.
function fitAuxiliary(){
 for(const frame of doc.querySelectorAll('.battle-log-scroll,.hand-inspector-scroll')){
  const content=frame.firstElementChild;
  if(!content||frame.clientWidth<1||frame.clientHeight<1)continue;
  frame.classList.add('bk-reading-frame');content.classList.add('bk-reading-content');
  fit(content,frame.clientWidth,frame.clientHeight,{fill:true});
 }
}
function lockOverflow(){
 const scopes=[doc.getElementById('app'),doc.getElementById('modal-root'),doc.querySelector('dialog[open]'),doc.querySelector('.bk-fit-article')].filter(Boolean);
 for(const scope of scopes)for(const el of [scope,...scope.querySelectorAll('*')]){
  if(!el.clientHeight||el.matches('input,select,textarea,svg,svg *'))continue;
  const s=getComputedStyle(el);
  if(/^(auto|scroll)$/.test(s.overflowY)||/^(auto|scroll)$/.test(s.overflowX)){
   el.style.setProperty('overflow','clip','important');el.scrollTop=0;el.scrollLeft=0;
  }
 }
}
function run(){
 pending=false;if(running)return;running=true;
 // Guide section boxes must also fit, including fractional CSS pixels rounded
 // by offsetHeight/scrollHeight. Keep their allowance below the visible edge.
 try{paginateAbout();paginateLongLists();fitApp();if(about){const {frame,main}=about;fit(main,frame.clientWidth,frame.clientHeight,{fill:true,tolerance:.5});}fitModal();fitAuxiliary();lockOverflow();}finally{running=false;}
}
function schedule(){if(pending)return;pending=true;requestAnimationFrame(run);}
new MutationObserver(records=>{if(records.some(r=>r.type==='childList'&&(r.addedNodes.length||r.removedNodes.length)))schedule();}).observe(doc.body,{childList:true,subtree:true});
doc.addEventListener('wheel',event=>{if(!event.target?.closest?.('input,select,textarea'))event.preventDefault();},{capture:true,passive:false});
doc.addEventListener('toggle',schedule,true);window.addEventListener('resize',schedule,{passive:true});window.visualViewport?.addEventListener('resize',schedule,{passive:true});window.addEventListener('bk-fit-layout',schedule);document.fonts?.ready.then(schedule);schedule();

window.addEventListener('beastking:viewport',schedule);

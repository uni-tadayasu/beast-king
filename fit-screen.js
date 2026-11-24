/* Native-pixel viewport controller. Reflow and paginate before using a local
   overflow pane. Never shrink a screen, browser zoom, or game data. */
const doc=document,root=doc.documentElement;
root.classList.add('bk-fit');
let pending=false,running=false,lastRoot=null,lastModal=null,about=null;
let lastCardMetrics='';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const children=node=>[...node.children];
function directFrame(host,target){
 if(target.parentElement?.classList.contains('bk-fit-frame'))return target.parentElement;
 const frame=doc.createElement('div');frame.className='bk-fit-frame';host.insertBefore(frame,target);frame.append(target);return frame;
}
function naturalSize(node){
 const bounds=node.getBoundingClientRect();
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
 const bounds=node.getBoundingClientRect(),r=result.getBoundingClientRect();
 const meta=result.querySelector('.results-meta'),pager=result.querySelector('.pagination');
 const footer=(meta?.offsetHeight||18)+(pager?.offsetHeight||36)+22;
 const pad=Number.parseFloat(getComputedStyle(node).paddingBottom)||0;
 const dual=node.dataset.page==='deck'&&!!node.querySelector('.dual-workshop');
 const leftGrid=result.querySelector('.cards-grid');
 const available=Math.max(1,dual?(leftGrid?.clientHeight||1):height-(r.top-bounds.top)-pad-footer);
 const list=node.querySelector('.deck-list'),foot=node.querySelector('.deck-panel-foot');
 const pagerRight=list?.querySelector('.deck-list-pagination'),rightPadding=20;
 const imageGrid=list?.querySelector('.deck-image-grid');
 const deckHeight=list?Math.max(0,dual?(imageGrid?.clientHeight||list.clientHeight-(pagerRight?.offsetHeight||34)-rightPadding):height-(list.getBoundingClientRect().top-bounds.top)-pad-(foot?.offsetHeight||48)-40):0;
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
  const el=panel.querySelector(selector);return el?Math.max(el.offsetHeight,el.scrollHeight):0;
 })));
 const tools=maxHeight('.workshop-tools'),meta=maxHeight('.results-meta'),pager=Math.max(33,maxHeight('.pagination,.deck-list-pagination'));
 workspace.style.setProperty('--workshop-tools-height',tools+'px');
 workspace.style.setProperty('--workshop-meta-height',meta+'px');
 workspace.style.setProperty('--workshop-pager-height',pager+'px');
 const num=(style,key)=>Number.parseFloat(style[key])||0;
 const chrome=Math.max(...panels.map(panel=>{
  const s=getComputedStyle(panel),list=panel.querySelector('#card-results,.deck-list'),l=getComputedStyle(list);
  return num(s,'paddingTop')+num(s,'paddingBottom')+num(s,'borderTopWidth')+num(s,'borderBottomWidth')+num(s,'rowGap')+2*num(l,'rowGap')+num(l,'paddingTop')+num(l,'paddingBottom')+num(l,'borderTopWidth')+num(l,'borderBottomWidth');
 }));
 // At least one complete illustrated card plus counts and actions.
 const minImageHeight=innerWidth>=1000?240:185;
 const required=Math.ceil(tools+meta+pager+chrome+minImageHeight+3);
 workspace.style.setProperty('min-height',required+'px','important');
 const bounds=node.getBoundingClientRect(),box=workspace.getBoundingClientRect(),style=getComputedStyle(node);
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
// Keep every interactive screen at physical pixel size. If a very short
// viewport cannot contain the minimum card and its controls, extend only the
// inner pane. The fixed navigation and document never scroll or shrink.
function resetNative(node){
 node.style.setProperty('transform','none','important');
 node.style.setProperty('left','0px','important');
 node.style.setProperty('top','0px','important');
 node.dataset.fitScale='1.0000';
}
function finishNative(node,width,height){
 node.dataset.fitWidth=String(Math.round(width));
 node.dataset.fitHeight=String(Math.round(Math.max(height,node.offsetHeight)));
}
function fitDeckWorkshop(node,width,height){
 if(width<1||height<1)return;
 resetNative(node);
 setCanvas(node,width,height,true);
 let tracks=measureWorkshopTracks(node,height);
 const logicalHeight=Math.max(height,tracks?.requiredHeight||height);
 if(logicalHeight!==height){
  setCanvas(node,width,logicalHeight,true);
  tracks=measureWorkshopTracks(node,logicalHeight);
 }
 measureCardPane(node,logicalHeight);
 finishNative(node,width,logicalHeight);
}
function fit(node,width,height,{fill=false,measureCards=false}={}){
 if(!node||width<1||height<1)return;
 resetNative(node);
 setCanvas(node,width,height,fill);
 let logicalHeight=height;
 if(measureCards&&node.dataset.page==='collection'){
  const result=node.querySelector('#card-results');
  if(result){
   const r=result.getBoundingClientRect(),b=node.getBoundingClientRect();
   const footer=(result.querySelector('.results-meta')?.offsetHeight||18)+(result.querySelector('.pagination')?.offsetHeight||36)+22;
   const padding=Number.parseFloat(getComputedStyle(node).paddingBottom)||0;
   // The page size, rather than a transform on all the UI, adjusts to the
   // remaining card budget. Keep a complete illustrated card even on tiny screens.
   logicalHeight=Math.max(height,Math.ceil(r.top-b.top+footer+padding+(innerWidth>=1000?225:175)));
   if(logicalHeight!==height)setCanvas(node,width,logicalHeight,fill);
  }
  measureCardPane(node,logicalHeight);
 }
 finishNative(node,width,logicalHeight);
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
 function update(){const {sections,index,prev,next,count}=about;sections.forEach((e,i)=>e.hidden=i!==index);prev.disabled=index<=0;next.disabled=index>=sections.length-1;count.textContent=(index+1)+' / '+sections.length;schedule();}
 prev.addEventListener('click',()=>{about.index=Math.max(0,about.index-1);update()});next.addEventListener('click',()=>{about.index=Math.min(sections.length-1,about.index+1);update()});
 update();
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
  const w=frame.clientWidth,h=frame.clientHeight;
  if(pane.dataset.page==='deck'&&pane.querySelector('.dual-workshop'))fitDeckWorkshop(pane,w,h);
  else fit(pane,w,h,{fill:true,measureCards:pane.matches('.page')});
  target.dataset.fitScale='1.0000';target.dataset.fitWidth=String(target.clientWidth);target.dataset.fitHeight=String(target.clientHeight);
  lastRoot=target;return;
 }
 // Entry and the separately preserved rebuild client retain their own layouts.
 // The entire logical canvas fills the viewport rather than a narrow centered strip.
 if(target!==lastRoot){target.classList.add('bk-fit-target');directFrame(app,target);lastRoot=target;}
 const frame=target.parentElement;frame.style.height=app.clientHeight+'px';frame.style.flex='none';
 fit(target,frame.clientWidth,frame.clientHeight,{fill:true});
}
const pagedLists=new WeakMap();
function paginateLongLists(){
 const size=innerHeight<=500?3:innerHeight<=750?5:8;
 for(const selector of ['.battle-log-drawer:not([hidden]) .battle-log-entries','.operator-player-list','.operator-audit','.account-device-list','.zone-card-list']){
  for(const list of doc.querySelectorAll(selector)){
   let state=pagedLists.get(list);if(!state&&list.children.length<=size)continue;
   if(!state){
    const bar=doc.createElement('div'),prev=doc.createElement('button'),next=doc.createElement('button'),label=doc.createElement('span');
    bar.className='bk-fit-inline-pager';bar.setAttribute('aria-label','一覧ページ');
    prev.type=next.type='button';prev.textContent='前へ';next.textContent='次へ';bar.append(prev,label,next);list.after(bar);
    state={bar,prev,next,label,index:0,size};pagedLists.set(list,state);list.dataset.fitPaged='true';
    prev.addEventListener('click',()=>{state.index--;updatePagedList(list,state);schedule();});next.addEventListener('click',()=>{state.index++;updatePagedList(list,state);schedule();});
   }
   state.size=size;updatePagedList(list,state);
  }
 }
}
function updatePagedList(list,state){
 const items=children(list),pages=Math.max(1,Math.ceil(items.length/state.size));state.index=clamp(state.index,0,pages-1);
 items.forEach((el,i)=>{el.hidden=Math.floor(i/state.size)!==state.index;});
 const label=(state.index+1)+' / '+pages+' · '+items.length+'件';if(state.label.textContent!==label)state.label.textContent=label;
 state.prev.disabled=state.index===0;state.next.disabled=state.index===pages-1;state.bar.hidden=pages===1;
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
function fitModal(){
 const modal=doc.querySelector('#modal-root .modal,dialog[open]:not(.news-dialog)');
 if(!modal)return;
 const w=Math.max(1,innerWidth-20),h=Math.max(1,(window.visualViewport?.height||innerHeight)-20);
 if(modal!==lastModal){lastModal=modal;modal.classList.add('bk-fit-modal');}
 if(fitOperatorConsole(modal))return;
 const wide=modal.classList.contains('wide'),inBackdrop=modal.parentElement?.classList.contains('modal-backdrop');
 const width=Math.min(w,wide?w:760);
 resetNative(modal);
 modal.style.setProperty('box-sizing','border-box','important');
 modal.style.setProperty('width',width+'px','important');
 modal.style.setProperty('min-width','0px','important');
 modal.style.setProperty('min-height','0px','important');
 modal.style.setProperty('max-height',h+'px','important');
 modal.style.setProperty('height','auto','important');
 modal.style.setProperty('overflow-y','auto','important');
 modal.style.setProperty('overflow-x','hidden','important');
 if(inBackdrop){
  modal.style.setProperty('left',Math.max(10,(innerWidth-width)/2)+'px','important');
  modal.style.setProperty('top',Math.max(10,(innerHeight-modal.offsetHeight)/2)+'px','important');
 }else{
  modal.style.setProperty('position','fixed','important');
  modal.style.setProperty('inset','0','important');
  modal.style.setProperty('margin','auto','important');
 }
 finishNative(modal,width,modal.offsetHeight);
}
function run(){
 pending=false;if(running)return;running=true;
 try{paginateAbout();paginateLongLists();fitApp();if(about){const {frame,main}=about;fit(main,frame.clientWidth,frame.clientHeight,{fill:true});}fitModal();}finally{running=false;}
}
function schedule(){if(pending)return;pending=true;requestAnimationFrame(run);}
new MutationObserver(records=>{if(records.some(r=>r.type==='childList'&&(r.addedNodes.length||r.removedNodes.length)))schedule();}).observe(doc.body,{childList:true,subtree:true});
doc.addEventListener('toggle',schedule,true);window.addEventListener('resize',schedule,{passive:true});window.visualViewport?.addEventListener('resize',schedule,{passive:true});window.addEventListener('bk-fit-layout',schedule);document.fonts?.ready.then(schedule);schedule();

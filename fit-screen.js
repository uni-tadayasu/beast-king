/* Viewport-fit controller. One screen, no wheel/touch-scroll dependence.
   It never rewrites game data, changes the device zoom or intercepts clicks. */
const doc=document,root=doc.documentElement;
root.classList.add('bk-fit');
let pending=false,running=false,lastRoot=null,lastModal=null,about=null;
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
function fit(node,width,height,{modal=false,logicalMin=0,center=false}={}){
 if(!node||width<1||height<1)return;
 width=Math.max(1,width);height=Math.max(1,height);
 node.style.transform='none';node.style.left='0px';node.style.top='0px';node.style.height='auto';
 // On narrow portrait devices retain workable two-column controls instead of
 // compressing a tall stack. Responsive rules still apply to the viewport.
 const logicalWidth=Math.max(width,logicalMin);
 node.style.width=logicalWidth+'px';
 node.style.minHeight='0px';
 const natural=naturalSize(node);
 let factor=Math.min(1,width/natural.w,height/natural.h);
 // Reflow wider at the same physical width when this makes controls larger
 // and reduces line wraps, bounded to avoid huge canvases.
 if(!modal&&factor<.78){
  const alternate=Math.min(logicalWidth*1.45,Math.max(logicalWidth,1440));
  if(alternate>logicalWidth+30){
   node.style.width=alternate+'px';const next=naturalSize(node),f=Math.min(1,width/next.w,height/next.h);
   if(f>=factor){factor=f;}else{node.style.width=logicalWidth+'px';}
  }
 }
 const size=naturalSize(node);
 factor=clamp(Math.min(1,width/size.w,height/size.h),.01,1);
 // Leave a little breathing room for fractional pixel borders.
 const scaledW=size.w*factor,scaledH=size.h*factor;
 node.style.transform='scale('+factor+')';
 node.style.left=Math.max(0,(width-scaledW)/2)+'px';
 node.style.top=(center?Math.max(0,(height-scaledH)/2):0)+'px';
 node.dataset.fitScale=String(factor.toFixed(4));
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
 let target=app.querySelector(':scope > .royal-shell,:scope > .duel-shell,:scope > .entry-screen,:scope > .shell,:scope > .onboard,:scope > .bk-fit-frame > .bk-fit-target');
 if(!target)return;
 if(target!==lastRoot){target.classList.add('bk-fit-target');directFrame(app,target);lastRoot=target;}
 const frame=target.parentElement;
 // app is the fixed physical content area; its frame must fill even with
 // absolutely positioned logical content.
 frame.style.height=app.clientHeight+'px';frame.style.flex='none';
 const w=frame.clientWidth,h=frame.clientHeight;
 const portrait=w<650&&h>w;
 fit(target,w,h,{logicalMin:portrait&&target.matches('.royal-shell')?640:0});
}
function fitModal(){
 const modal=doc.querySelector('#modal-root .modal,dialog[open],.news-dialog');
 if(!modal)return;
 const w=Math.max(1,innerWidth-20),h=Math.max(1,(window.visualViewport?.height||innerHeight)-20);
 if(modal!==lastModal){lastModal=modal;modal.classList.add('bk-fit-modal');}
 const wrap=modal.parentElement;
 const inBackdrop=wrap?.classList.contains('modal-backdrop');
 // Native dialogs remain in the top layer and use its centered positioning.
 if(!inBackdrop){modal.style.maxHeight='none';modal.style.width=Math.min(w,680)+'px';modal.style.height='auto';modal.style.transform='none';const n=naturalSize(modal);const factor=Math.min(1,w/n.w,h/n.h);modal.style.transform='scale('+factor+')';modal.style.transformOrigin='center center';return;}
 const wide=modal.classList.contains('wide');
 fit(modal,w,h,{modal:true,logicalMin:Math.min(wide?850:560,Math.max(w,wide?560:400)),center:true});
 modal.style.left=(Number.parseFloat(modal.style.left||'0')+10)+'px';modal.style.top=(Number.parseFloat(modal.style.top||'0')+10)+'px';
}
function run(){
 pending=false;if(running)return;running=true;
 try{paginateAbout();fitApp();if(about){const {frame,main}=about;fit(main,frame.clientWidth,frame.clientHeight,{logicalMin:Math.min(640,frame.clientWidth)});}fitModal();}finally{running=false;}
}
function schedule(){if(pending)return;pending=true;requestAnimationFrame(run);}
new MutationObserver(records=>{if(records.some(r=>r.type==='childList'&&(r.addedNodes.length||r.removedNodes.length)))schedule();}).observe(doc.body,{childList:true,subtree:true});
window.addEventListener('resize',schedule,{passive:true});window.visualViewport?.addEventListener('resize',schedule,{passive:true});window.addEventListener('bk-fit-layout',schedule);document.fonts?.ready.then(schedule);schedule();

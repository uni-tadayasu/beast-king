/** Chapter navigation shares fit-screen's pager; it never creates a second
 * article state or scrolls a hidden chapter into view. */
export function guideSectionIndex(ids,hash){
 let id;try{id=decodeURIComponent(String(hash||'').replace(/^#/,''));}catch{return 0;}
 const index=ids.indexOf(id);return index<0?0:index;
}

function startGuideNavigation(){
 const main=document.querySelector('.guide-page #about-main'),select=document.querySelector('[data-guide-select]');
 if(!main||!select)return;
 const sections=[...main.querySelectorAll(':scope > section')],ids=sections.map(section=>section.id);
 let initialised=false,current=0;
 const jump=index=>main.dispatchEvent(new CustomEvent('bk-guide-jump',{detail:{index}}));
 function sync(event){
  const next=Math.max(0,Math.min(sections.length-1,Number(event.detail?.index)||0));current=next;select.value=String(next);
  main.setAttribute('aria-label',sections[next].dataset.guideTitle||'ゲームガイド');
  if(initialised){const url=new URL(location.href);url.hash=next===0?'':ids[next];history.replaceState(null,'',url);}
 }
 main.addEventListener('bk-guide-page',sync);
 select.addEventListener('change',()=>jump(Number(select.value)));
 main.addEventListener('click',event=>{
  const link=event.target.closest('a[data-guide-jump]');if(!link)return;
  const index=ids.indexOf(link.dataset.guideJump);if(index<0)return;
  event.preventDefault();jump(index);
 });
 window.addEventListener('hashchange',()=>{if(initialised)jump(guideSectionIndex(ids,location.hash));});
 document.addEventListener('keydown',event=>{
  if(!initialised||event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||event.target.closest('input,select,textarea,button,a,summary'))return;
  const direction=event.key==='ArrowRight'||event.key==='PageDown'?1:event.key==='ArrowLeft'||event.key==='PageUp'?-1:0;
  if(direction){event.preventDefault();jump(Math.max(0,Math.min(sections.length-1,current+direction)));}
 });
 function ready(){
  const pager=document.querySelector('.bk-fit-pager');if(!pager)return false;
  const count=pager.querySelector('span');count?.setAttribute('aria-live','polite');count?.setAttribute('aria-atomic','true');
  const initial=guideSectionIndex(ids,location.hash);initialised=true;select.disabled=false;jump(initial);return true;
 }
 if(!ready()){const observer=new MutationObserver(()=>{if(ready())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});}
}
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startGuideNavigation,{once:true});
 else startGuideNavigation();
}

/** Readers keep every character and reward while fitting the available panel.
 * Their navigation changes only local presentation; it never sends a request. */
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function splitMeasuredText(value,fits){
 const chars=Array.from(String(value??'')),result=[];
 if(!chars.length)return [''];
 for(let start=0;start<chars.length;){
  let low=1,high=chars.length-start,best=0;
  while(low<=high){const size=Math.floor((low+high)/2);if(fits(chars.slice(start,start+size).join(''))){best=size;low=size+1;}else high=size-1;}
  // A panel always reserves at least one line. Keep data intact even while a
  // resize briefly reports zero height; the next layout pass measures again.
  const length=Math.max(1,best);result.push(chars.slice(start,start+length).join(''));start+=length;
 }
 return result;
}

export function splitMeasuredItems(items,fits){
 const result=[];
 for(let start=0;start<items.length;){
  let end=start+1;
  while(end<items.length&&fits(items.slice(start,end+1)))end++;
  result.push(items.slice(start,end));start=end;
 }
 return result.length?result:[[]];
}

export function operatorRewardPageSize(viewport=globalThis.window?.BeastKingViewport?.get?.()||{height:globalThis.window?.innerHeight??900}){
 return viewport.height<=400?1:viewport.height<=550?2:4;
}

const pager=()=>'<div class="op-pagination op-reader-pagination" aria-label="内容のページ"><button type="button" class="op-button" data-op-page-step="-1" aria-label="内容の前のページ" disabled>前へ</button><span aria-live="polite"><b data-op-page-label>1 / 1</b></span><button type="button" class="op-button" data-op-page-step="1" aria-label="内容の次のページ" disabled>次へ</button></div>';

export function operatorTextReader(value,{page=0,label='本文'}={}){
 const text=String(value||'本文はありません。');
 return `<div class="op-copy-reader" data-op-text="${escape(text)}" data-op-reader-page="${page}" aria-label="${escape(label)}"><p class="op-reader-text">${escape(text)}</p>${pager()}</div>`;
}

export function operatorRewardReader(markup,{page=0}={}){
 return `<div class="op-reward-reader" data-op-reader-page="${page}" aria-label="報酬の内容"><div class="op-rewards" data-op-items>${markup}</div>${pager()}</div>`;
}

export function operatorReadingPanels(panels,{active=0}={}){
 const selected=clamp(active,0,panels.length-1);
 return `<div class="op-reading-view" data-op-panel-active="${selected}"><nav class="op-reading-tabs" aria-label="確認する内容">${panels.map((panel,index)=>`<button type="button" class="op-button" data-op-panel="${index}" aria-pressed="${index===selected}">${escape(panel.label)}</button>`).join('')}</nav><div class="op-reading-panels">${panels.map((panel,index)=>`<section class="op-surface" data-op-panel-content="${index}"${index===selected?'':' hidden'} aria-label="${escape(panel.label)}">${panel.content}</section>`).join('')}</div></div>`;
}

function mountOperatorPaging(doc,win){
 if(doc.documentElement.dataset.opPagingMounted)return;
 doc.documentElement.dataset.opPagingMounted='true';
 const textCache=new Map(),itemCache=new WeakMap();let pending=false;
 const shown=node=>!!(node.clientWidth&&node.clientHeight)&&!node.closest('[hidden]');
 const setText=(node,value)=>{if(node&&node.textContent!==value)node.textContent=value;};
 function navigation(reader,count){
  const index=clamp(Number(reader.dataset.opReaderPage)||0,0,count-1);reader.dataset.opReaderPage=String(index);reader.dataset.opPageCount=String(count);
  setText(reader.querySelector('[data-op-page-label]'),`${index+1} / ${count}`);
  for(const button of reader.querySelectorAll('[data-op-page-step]'))button.disabled=Number(button.dataset.opPageStep)<0?index===0:index===count-1;
  return index;
 }
 function textReader(reader){
  const paragraph=reader.querySelector('.op-reader-text');if(!paragraph||!shown(paragraph))return;
  const style=getComputedStyle(paragraph),value=reader.dataset.opText;
  const key=[value,paragraph.clientWidth,paragraph.clientHeight,style.font,style.lineHeight,style.letterSpacing,style.whiteSpace].join('|');
  let pages=textCache.get(key);
  if(!pages){
   pages=splitMeasuredText(value,text=>{paragraph.textContent=text;return paragraph.scrollHeight<=paragraph.clientHeight&&paragraph.scrollWidth<=paragraph.clientWidth;});
   if(textCache.size>40)textCache.clear();textCache.set(key,pages);
  }
  setText(paragraph,pages[navigation(reader,pages.length)]);
 }
 function rewardReader(reader){
  const box=reader.querySelector('[data-op-items]');if(!box||!shown(box))return;
  const items=[...box.children],style=getComputedStyle(box),key=[box.clientWidth,box.clientHeight,style.gridTemplateColumns,style.font].join('|');
  let cached=itemCache.get(box);
  if(!cached||cached.key!==key){
   const pages=splitMeasuredItems(items,visible=>{for(const item of items)item.hidden=!visible.includes(item);return box.scrollHeight<=box.clientHeight&&box.scrollWidth<=box.clientWidth;});
   cached={key,pages};itemCache.set(box,cached);
  }
  const visible=cached.pages[navigation(reader,cached.pages.length)];for(const item of items)item.hidden=!visible.includes(item);
 }
 function panels(view){
  const active=Number(view.dataset.opPanelActive)||0;
  for(const button of view.querySelectorAll(':scope>.op-reading-tabs>[data-op-panel]'))button.setAttribute('aria-pressed',String(Number(button.dataset.opPanel)===active));
  for(const panel of view.querySelectorAll(':scope>.op-reading-panels>[data-op-panel-content]'))panel.hidden=Number(panel.dataset.opPanelContent)!==active;
 }
 function run(){pending=false;for(const view of doc.querySelectorAll('.op-reading-view'))panels(view);for(const reader of doc.querySelectorAll('[data-op-text]'))textReader(reader);for(const reader of doc.querySelectorAll('.op-reward-reader'))rewardReader(reader);}
 function schedule(){if(pending)return;pending=true;win.requestAnimationFrame(()=>win.requestAnimationFrame(run));}
 doc.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-op-page-step],[data-op-panel]');if(!button||button.disabled)return;
  event.preventDefault();event.stopPropagation();
  if(button.hasAttribute('data-op-panel')){const view=button.closest('.op-reading-view');view.dataset.opPanelActive=button.dataset.opPanel;panels(view);}
  else {const reader=button.closest('[data-op-reader-page]');reader.dataset.opReaderPage=String(Math.max(0,(Number(reader.dataset.opReaderPage)||0)+Number(button.dataset.opPageStep)));}
  schedule();
 },true);
 new MutationObserver(records=>{if(records.some(record=>record.type==='childList'))schedule();}).observe(doc.body,{childList:true,subtree:true});
 win.addEventListener('resize',schedule,{passive:true});win.addEventListener('beastking:viewport',schedule);win.addEventListener('bk-operator-page-layout',schedule);doc.fonts?.ready.then(schedule);schedule();
}

if(typeof document!=='undefined'&&typeof window!=='undefined'){
 if(document.body)mountOperatorPaging(document,window);
 else document.addEventListener('DOMContentLoaded',()=>mountOperatorPaging(document,window),{once:true});
}

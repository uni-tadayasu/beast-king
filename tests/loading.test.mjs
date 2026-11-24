import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoadingController,visibleAssetUrls} from '../loading.js';

const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
class Element extends EventTarget{
 constructor(tag='div'){super();this.nodeType=1;this.tagName=tag.toUpperCase();this.children=[];this.style={};this.dataset={};this.attrs=new Map();this.hidden=false;this.nodes=new Map();const classes=new Set();this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)};}
 setAttribute(name,value){this.attrs.set(name,String(value));}
 getAttribute(name){return this.attrs.get(name)??null;}
 removeAttribute(name){this.attrs.delete(name);}
 append(node){node.remove();node.parentNode=this;this.children.push(node);}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;}
 matches(selector){return selector.split(',').some(value=>value==='img'?this.tagName==='IMG':value==='main[data-page]'?this.tagName==='MAIN'&&!!this.dataset.page:value[0]==='#'?this.id===value.slice(1):value[0]==='.'&&!value.includes(' ')?(this.className||'').split(' ').includes(value.slice(1)):false);}
 closest(selector){return this.matches(selector)?this:this.parentNode?.closest(selector)||null;}
 set innerHTML(text){
  if(!text.includes('bk-loading-card'))return;
  for(const selector of ['[data-loading-label]','[data-loading-count]','.bk-loading-track'])this.nodes.set(selector,new Element());
  this.nodes.get('.bk-loading-track').nodes.set('i',new Element('i'));
 }
 querySelector(selector){return this.nodes.get(selector)||this.children.find(node=>selector==='[data-boot-retry]'?node.attrs.has('data-boot-retry'):node.matches(selector))||null;}
 querySelectorAll(){return [];}
}
function visual({url='',hidden=false,display='block',rect={left:10,top:10,right:110,bottom:110,width:100,height:100},pseudo}={}){
 const node=new Element();node.className='card-art';node.style.backgroundImage=url?`url("${url}")`:'none';node.currentSrc='';node.src='';
 const closest=node.closest.bind(node);node.closest=selector=>hidden&&selector.includes('[hidden]')?{}:closest(selector);node.getClientRects=()=>display==='none'?[]:[rect];node.getBoundingClientRect=()=>rect;
 node.computed={display,visibility:'visible',backgroundImage:node.style.backgroundImage};node.pseudo=pseudo;
 return node;
}
function setup({throwSource=false,boot=false,modal=false,nativeDialog=false,cached=false}={}){
 const doc=new EventTarget(),win=new EventTarget();
 let time=0,next=0;const timers=new Map(),frames=new Map(),images=[],observers=[];
 win.innerWidth=1200;win.innerHeight=800;win.location={pathname:'/',href:'https://game.example/',reload(){win.reloaded=true;}};
 doc.baseURI=win.location.href;doc.defaultView=win;doc.body=new Element('body');doc.createElement=tag=>new Element(tag);
 const app=new Element();app.ownerDocument=doc;app.surfaces=[];app.imgs=[];app.main=new Element('main');app.main.dataset.page='home';app.boot=boot?new Element():null;
 if(app.boot)app.boot.nodes.set('p',new Element('p'));
 app.querySelector=selector=>selector==='.boot,.loading'?app.boot:selector.includes('main[data-page]')?app.main:selector==='[data-page]'?{dataset:{page:'home'}}:null;
 app.querySelectorAll=selector=>selector==='img'?app.imgs:app.surfaces;
 const modalRoot=modal?new Element():null,dialog=nativeDialog?new Element('dialog'):null;
 for(const node of [modalRoot,dialog].filter(Boolean)){node.ownerDocument=doc;node.surfaces=[];node.querySelectorAll=selector=>selector==='img'?[]:node.surfaces;}
 doc.querySelector=selector=>selector==='#app'?app:selector==='dialog[open]'&&dialog?.open?dialog:null;
 doc.getElementById=id=>id==='app'?app:id==='modal-root'?modalRoot:id==='detail'?dialog:null;
 win.getComputedStyle=(node,pseudo)=>pseudo?(node.pseudo?.[pseudo]||{content:'none',backgroundImage:'none'}):node.computed||{display:'block',visibility:'visible',backgroundImage:'none'};
 win.setTimeout=(fn,ms=0)=>{const id=++next;timers.set(id,{at:time+ms,fn});return id;};win.clearTimeout=id=>timers.delete(id);
 win.requestAnimationFrame=fn=>{const id=++next;frames.set(id,fn);return id;};win.cancelAnimationFrame=id=>frames.delete(id);
 win.Image=class{
  constructor(){this.complete=false;this.naturalWidth=0;images.push(this);}
  set src(url){if(throwSource)throw Error('image unavailable');this.url=url;if(cached){this.complete=true;this.naturalWidth=100;}}
  succeed(){this.complete=true;this.naturalWidth=100;this.onload?.();}
  fail(){this.complete=true;this.onerror?.();}
 };
 win.MutationObserver=class{
  constructor(fn){this.fn=fn;this.targets=[];observers.push(this);}
  observe(node,options){this.node=node;this.options=options;this.targets.push(node);}
  disconnect(){this.disconnected=true;}
 };
 const controller=createLoadingController({document:doc,window:win,now:()=>time});
 const layer=doc.body.children.find(node=>node.id==='bk-loading-layer'),bar=layer.querySelector('.bk-loading-track');
 const scope=url=>{app.surfaces=[visual({url})];return app;};
 return {doc,win,app,modalRoot,dialog,controller,layer,bar,images,timers,frames,observers,scope,count:layer.querySelector('[data-loading-count]'),label:layer.querySelector('[data-loading-label]'),
  async frame(){for(const [id,fn] of [...frames]){frames.delete(id);fn();}await flush();},
  async advance(ms){const until=time+ms;for(;;){const due=[...timers].filter(([,item])=>item.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;time=due[1].at;timers.delete(due[0]);due[1].fn();await flush();}time=until;await flush();}
 };
}

test('asset progress includes only visible images, computed artwork and visible frame backgrounds',()=>{
 const d=setup(),loaded=visual(),hidden=visual({hidden:true}),offscreen=visual({rect:{left:1300,top:20,right:1400,bottom:120,width:100,height:100}});
 loaded.currentSrc='https://game.example/card.webp';hidden.src='https://game.example/hidden.webp';hidden.setAttribute('src','hidden.webp');offscreen.src='https://game.example/offscreen.webp';offscreen.setAttribute('src','offscreen.webp');
 d.app.imgs=[loaded,hidden,offscreen];
 d.app.surfaces=[visual({url:'card.webp',pseudo:{'::before':{content:'""',backgroundImage:'url("frame.svg")'}}}),visual({url:'hidden-css.webp',display:'none'}),visual({url:'data:image/png;base64,AA'})];
 assert.deepEqual(visibleAssetUrls(d.app,d.win.getComputedStyle,d.win),['https://game.example/card.webp','https://game.example/frame.svg']);
 d.controller.destroy();
});

test('late completion from a replaced screen cannot update or dismiss the new screen',async()=>{
 const d=setup();
 d.controller.screen('collection',{scope:d.scope('old.webp')});const stale=d.images[0].onload;
 d.controller.screen('deck',{scope:d.scope('new.webp')});
 stale();await flush();await d.advance(250);
 assert.equal(d.layer.hidden,false);assert.match(d.label.textContent,/デッキ/);assert.equal(d.bar.getAttribute('aria-valuenow'),'0');
 d.images[1].succeed();await flush();await d.advance(0);
 assert.equal(d.layer.hidden,true);assert.match(d.count.textContent,/1 \/ 1/);assert.equal(d.bar.getAttribute('aria-valuenow'),'100');
 d.controller.destroy();
});

test('failed and timed-out assets do not count as loaded and never leave the screen covered',async()=>{
 const d=setup();d.app.surfaces=['ok.webp','broken.webp','slow.webp'].map(url=>visual({url}));
 d.controller.screen('home',{scope:d.app});d.images[0].succeed();d.images[1].fail();await flush();
 assert.equal(d.bar.getAttribute('aria-valuenow'),'33');assert.match(d.count.textContent,/1 \/ 3.*1件を省略/);
 await d.advance(3500);
 assert.equal(d.layer.hidden,true);assert.equal(d.bar.getAttribute('aria-valuenow'),'33');assert.match(d.count.textContent,/2件を省略/);
 assert.equal(d.timers.size,0);d.controller.destroy();
});

test('Image errors and DOM extraction errors fail open; empty screens do not invent progress',async()=>{
 const d=setup({throwSource:true});
 assert.doesNotThrow(()=>d.controller.screen('shop',{scope:d.scope('fail.webp')}));
 await flush();await d.advance(200);assert.equal(d.layer.hidden,true);assert.equal(d.bar.getAttribute('aria-valuenow'),'0');
 d.controller.screen('rules',{scope:{querySelectorAll(){throw Error('detached view');}}});assert.equal(d.layer.hidden,true);
 d.app.surfaces=[];d.controller.screen('home',{scope:d.app});assert.equal(d.layer.hidden,true);assert.equal(d.bar.getAttribute('aria-valuenow'),null);
 assert.equal(d.timers.size,0);d.controller.destroy();
});

test('pagehide cancels image handlers, timers and queued frames; pageshow starts a fresh screen',async()=>{
 const d=setup();d.controller.screen('collection',{scope:d.scope('card.webp')});const stale=d.images[0].onload;
 d.controller.busy({active:true});d.win.dispatchEvent(new Event('pagehide'));
 assert.equal(d.layer.hidden,true);assert.equal(d.timers.size,0);assert.equal(d.frames.size,0);assert.equal(d.images[0].onload,null);
 d.observers[0].fn();stale();await d.advance(10000);assert.equal(d.frames.size,0);assert.equal(d.layer.hidden,true);
 d.app.main.dataset.page='catalog';d.win.dispatchEvent(new Event('pageshow'));await d.frame();
 assert.equal(d.images.length,2);assert.equal(d.layer.hidden,false);assert.match(d.label.textContent,/図鑑/);
 d.images[1].succeed();await flush();await d.advance(200);assert.equal(d.layer.hidden,true);d.controller.destroy();
});

test('route inference reads rebuild main, deduplicates catalog alias and notices nested route swaps',async()=>{
 const d=setup();d.app.main.dataset.page='catalog';d.controller.screen('collection',{scope:d.scope('card.webp')});
 await d.frame();assert.equal(d.images.length,1,'navigation home button does not overwrite the explicit collection route');
 d.app.main.dataset.page='deck';d.scope('deck.webp');d.observers[0].fn();await d.frame();
 assert.equal(d.images.length,2);assert.match(d.label.textContent,/デッキ/);assert.equal(d.observers[0].options.subtree,true);
 d.controller.destroy();assert.equal(d.images[1].onload,null);assert.equal(d.timers.size,0);assert.equal(d.frames.size,0);assert.equal(d.observers[0].disconnected,true);
});

test('boot recovery is restored after pagehide and does not append duplicate retry buttons',async()=>{
 const d=setup({boot:true});d.win.dispatchEvent(new Event('pagehide'));assert.equal(d.timers.size,0);
 d.win.dispatchEvent(new Event('pageshow'));await d.frame();await d.advance(12000);
 assert.equal(d.app.boot.children.length,1);assert.match(d.app.boot.nodes.get('p').textContent,/再読み込み/);
 d.observers[0].fn();await d.frame();await d.advance(12000);assert.equal(d.app.boot.children.length,1);
 d.controller.destroy();
});

test('same-page pagination tracks new artwork, counts only uncached sources and leaves cached results immediate',async()=>{
 const d=setup();d.app.main.dataset.page='collection';d.scope('first.webp');await d.frame();
 d.images[0].succeed();await flush();assert.equal(d.layer.hidden,true);
 const next=visual({url:'second.webp'});d.app.surfaces=[visual({url:'first.webp'}),next];
 d.observers[0].fn([{type:'childList',target:d.app,addedNodes:[next],removedNodes:[]}]);await d.frame();
 assert.equal(d.images.length,2);assert.equal(d.layer.hidden,false);assert.equal(d.layer.classList.contains('is-compact'),true);assert.match(d.count.textContent,/0 \/ 1/);
 const stale=d.images[1].onload;
 d.app.surfaces=[visual({url:'first.webp'})];
 d.observers[0].fn([{type:'childList',target:d.app,addedNodes:d.app.surfaces,removedNodes:[next]}]);await d.frame();
 assert.equal(d.layer.hidden,true);assert.equal(d.images.length,2);assert.equal(d.images[1].onload,null);assert.equal(d.timers.size,0);
 stale();await flush();assert.equal(d.layer.hidden,true);
 d.controller.screen('deck',{scope:d.app});assert.equal(d.layer.hidden,true,'a route with known cached art also stays immediate');d.controller.destroy();
});

test('text changes, effect particles and geometry changes do not schedule asset work; changed image sources do',async()=>{
 const d=setup();d.scope('first.webp');await d.frame();d.images[0].succeed();await flush();
 const art=d.app.surfaces[0],particle=new Element();particle.className='bk-spark';
 art.setAttribute('style','background-image:url("first.webp");--height:240px');
 d.observers[0].fn([
  {type:'childList',target:d.app,addedNodes:[{nodeType:3}],removedNodes:[]},
  {type:'childList',target:d.app,addedNodes:[particle],removedNodes:[]},
  {type:'attributes',target:art,attributeName:'style',oldValue:'background-image:url("first.webp");--height:200px'}
 ]);
 assert.equal(d.frames.size,0);assert.equal(d.layer.hidden,true);
 art.setAttribute('style','background-image:url("different.webp")');art.computed.backgroundImage='url("different.webp")';
 d.observers[0].fn([{type:'attributes',target:art,attributeName:'style',oldValue:'background-image:url("first.webp")'}]);await d.frame();
 assert.equal(d.images.length,2);assert.equal(d.layer.hidden,false);d.controller.destroy();
});

test('card detail modal outside app reports its artwork and closing cancels stale progress',async()=>{
 const d=setup({modal:true});d.scope('page.webp');await d.frame();d.images[0].succeed();await flush();
 assert.ok(d.observers[0].targets.includes(d.modalRoot));
 const art=visual({url:'detail.webp'});d.modalRoot.surfaces=[art];
 d.observers[0].fn([{type:'childList',target:d.modalRoot,addedNodes:[art],removedNodes:[]}]);await d.frame();
 assert.equal(d.images.length,2);assert.equal(d.layer.hidden,false);assert.equal(d.layer.classList.contains('is-compact'),true);
 const stale=d.images[1].onload;d.modalRoot.surfaces=[];
 d.observers[0].fn([{type:'childList',target:d.modalRoot,addedNodes:[],removedNodes:[art]}]);await d.frame();
 assert.equal(d.layer.hidden,true);assert.equal(d.timers.size,0);stale();await flush();assert.equal(d.layer.hidden,true);d.controller.destroy();
});

test('native dialog progress stays inside its top layer and browser-cached images have no artificial delay',async()=>{
 const d=setup({nativeDialog:true});d.scope('page.webp');await d.frame();d.images[0].succeed();await flush();
 d.dialog.open=true;d.dialog.surfaces=[visual({url:'dialog.webp'})];
 d.observers[0].fn([{type:'attributes',target:d.dialog,attributeName:'open'}]);await d.frame();
 assert.equal(d.layer.parentNode,d.dialog);assert.equal(d.layer.hidden,false);
 d.images[1].succeed();await flush();assert.equal(d.layer.hidden,true);assert.equal(d.layer.parentNode,d.doc.body);assert.equal(d.timers.size,0);d.controller.destroy();
 const c=setup({cached:true});c.scope('already-in-browser-cache.webp');await c.frame();
 assert.equal(c.layer.hidden,true);assert.equal(c.timers.size,0);c.controller.destroy();
});

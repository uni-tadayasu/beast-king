/** Dependency-free real-browser smoke test for the integrated main frontend.
 * Node 24 + Chrome/Chromium. Never connects to the production game or touches
 * a player's browser data. The temporary browser profile is destroyed on exit.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {mkdir,stat,writeFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchSmokeChrome,stopSmokeChrome} from './chrome-smoke-launch.mjs';
import {setTimeout as delay} from 'node:timers/promises';
const args=process.argv.slice(2),cameraOnly=args.includes('--camera-only'),reliefOnly=args.includes('--relief-only'),foregroundOnly=args.includes('--foreground-only'),directories=args.filter(arg=>!['--camera-only','--relief-only','--foreground-only'].includes(arg));
assert.ok(directories.length<=1&&!directories.some(arg=>arg.startsWith('--'))&&[cameraOnly,reliefOnly,foregroundOnly].filter(Boolean).length<=1,'Usage: node scripts/layout-browser-smoke.mjs [public-directory] [--camera-only | --relief-only | --foreground-only]');
const root=directories[0]?resolve(directories[0]):fileURLToPath(new URL('../',import.meta.url));
const viewports=[
 {width:1920,height:1080,mobile:false},{width:1902,height:800,mobile:false},
 {width:1366,height:768,mobile:false},{width:1024,height:600,mobile:false},
 {width:768,height:1024,mobile:true},{width:390,height:844,mobile:true},
 {width:320,height:568,mobile:true},{width:844,height:390,mobile:true},
];
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.mp3':'audio/mpeg','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1'),path=resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
  if(!path.startsWith(resolve(root)+sep))throw Error('invalid path');
  const info=await stat(path);if(!info.isFile())throw Error('not a file');
  res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Length',info.size);createReadStream(path).on('error',()=>res.destroy()).pipe(res);
 }catch{res.writeHead(404);res.end('Not found')}
});
let browser,ws,foregroundNetwork=null;const pending=new Map(),exceptions=[];let sequence=0;
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
async function assertReadableModal(label,{fullViewport=false,controls=[],body=[],labels=[]}={}){
 const result=await evaluate(`(()=>{
  const modal=document.querySelector('#modal-root .modal'),viewport=layoutViewport(),box=layoutRect(modal),scale=box.width/modal.offsetWidth;
  const visible=node=>{const r=layoutRect(node),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
  const identify=node=>node.id||node.dataset.action||node.className||node.tagName;
  const inside=r=>r.left>=box.left-2&&r.right<=box.right+2&&r.top>=box.top-2&&r.bottom<=box.bottom+2;
  const controlSelectors=${JSON.stringify(controls)},missing=controlSelectors.filter(selector=>{const nodes=[...modal.querySelectorAll(selector)];return !nodes.length||nodes.some(node=>!visible(node))});
  const nodes=[...modal.querySelectorAll('h2,h3,p,small,label,input,button,output,code')].filter(visible);
  const clipped=nodes.filter(node=>{const r=layoutRect(node),s=getComputedStyle(node);return !inside(r)||(s.display!=='inline'&&node.clientHeight>0&&(node.scrollHeight>node.clientHeight+2||node.scrollWidth>node.clientWidth+2))}).map(node=>({node:identify(node),box:layoutRect(node).toJSON(),client:[node.clientWidth,node.clientHeight],scroll:[node.scrollWidth,node.scrollHeight]}));
  const fontChecks=[...${JSON.stringify(body)}.map(selector=>({selector,min:16})),...${JSON.stringify(labels)}.map(selector=>({selector,min:14}))];
  const small=fontChecks.flatMap(({selector,min})=>[...modal.querySelectorAll(selector)].filter(visible).map(node=>({node:identify(node),size:parseFloat(getComputedStyle(node).fontSize)*scale,min}))).filter(item=>item.size<item.min-.25);
  const buttons=[...modal.querySelectorAll('button,input:not([type=hidden]),select')].filter(visible),overlaps=[];
  for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){
   const a=layoutRect(buttons[i]),b=layoutRect(buttons[j]);
   if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2)overlaps.push([identify(buttons[i]),identify(buttons[j])]);
  }
  const close=modal.querySelector('.modal-close'),closeBox=layoutRect(close),closeText=[],walker=document.createTreeWalker(modal,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
   const text=walker.currentNode,parent=text.parentElement;if(!text.textContent.trim()||parent.closest('button,input,select,textarea,svg')||!visible(parent))continue;
   const range=document.createRange();range.selectNodeContents(text);
   if([...range.getClientRects()].some(raw=>{const r=layoutRect({getBoundingClientRect:()=>raw});return Math.min(r.right,closeBox.right)-Math.max(r.left,closeBox.left)>2&&Math.min(r.bottom,closeBox.bottom)-Math.max(r.top,closeBox.top)>2}))closeText.push(text.textContent.trim().slice(0,40));
  }
  return {viewport,box:box.toJSON(),scale,fitScale:Number(modal.dataset.fitScale),missing,clipped,small,overlaps,closeText,scrolling:[...modal.querySelectorAll('*'),modal].filter(visible).filter(node=>['auto','scroll'].includes(getComputedStyle(node).overflowY)).map(identify)};
 })()`);
 assert.ok(result.box.left>=-2&&result.box.top>=-2&&result.box.right<=result.viewport.width+2&&result.box.bottom<=result.viewport.height+2,label+' modal inside viewport '+JSON.stringify(result));
 assert.ok(Math.abs(result.box.left-(result.viewport.width-result.box.right))<=3,label+' centered modal '+JSON.stringify(result));
 if(fullViewport)assert.ok(result.scale>=.98&&result.fitScale>=.98&&result.box.width>=result.viewport.width*.92&&result.box.height>=result.viewport.height*.92,label+' readable full-size workspace '+JSON.stringify(result));
 for(const key of ['missing','clipped','small','overlaps','closeText','scrolling'])assert.deepEqual(result[key],[],label+' '+key+' '+JSON.stringify(result[key]));
 await assertFits();
}
/** Send real browser input at the visible model's screen position. The raw
 * rectangle deliberately stays in physical screen coordinates for rotated
 * portrait play; layoutRect is only used for logical geometry assertions. */
async function cameraLayoutDiagnostic(){
 return evaluate(`(()=>{
  const describe=node=>{if(!node)return null;const s=getComputedStyle(node);return {rect:node.getBoundingClientRect().toJSON(),logical:layoutRect(node).toJSON(),client:[node.clientWidth,node.clientHeight],scroll:[node.scrollWidth,node.scrollHeight],fitScale:node.dataset.fitScale,style:node.getAttribute('style'),rows:s.gridTemplateRows,columns:s.gridTemplateColumns,padding:s.padding,margin:s.margin}};
  return {viewport:layoutViewport(),pane:describe(document.querySelector('.duel-layout')),arena:describe(document.querySelector('.arena')),rows:[...document.querySelectorAll('.arena>.field-row')].map(row=>({owner:row.dataset.owner,...describe(row)})),canvas:{...document.querySelector('.bk-summon-canvas')?.dataset},slots:[...document.querySelectorAll('.field-slot[data-camera-placed]')].map(slot=>({owner:slot.dataset.owner,index:slot.dataset.slot,...describe(slot)})),modal:describe(document.querySelector('#modal-root .modal')),modalBlocks:[...document.querySelectorAll('#modal-root .modal>* ,#modal-root .settings-section>*')].filter(node=>node.clientHeight>0).map(node=>({node:node.dataset.action||node.className||node.tagName,...describe(node)}))};
 })()`);
}
async function pointerClick(selector,mobile,label){
 await evaluate(`(()=>{
  const identify=e=>e?{tag:e.tagName,action:e.closest?.('[data-action]')?.dataset.action,uid:e.closest?.('[data-uid]')?.dataset.uid,player:e.closest?.('[data-player]')?.dataset.player}:null;
  const probe={label:${JSON.stringify(label)},selector:${JSON.stringify(selector)},events:[]};window.__bkPointerProbe=probe;
  window.__bkPointerProbeCleanup?.();
  const trace=event=>{
   const target=document.querySelector(probe.selector),point=document.elementFromPoint(event.clientX,event.clientY);
   const entry={type:event.type,trusted:event.isTrusted,x:event.clientX,y:event.clientY,target:identify(event.target),hit:identify(point),requested:target?.getBoundingClientRect().toJSON(),selected:document.querySelector('.field-unit.selected')?.dataset.uid,targets:[...document.querySelectorAll('.field-unit.targetable')].map(e=>e.dataset.uid)};probe.events.push(entry);
   queueMicrotask(()=>{entry.after={targetConnected:event.target.isConnected,selected:document.querySelector('.field-unit.selected')?.dataset.uid,targets:[...document.querySelectorAll('.field-unit.targetable')].map(e=>e.dataset.uid)};});
   if(probe.events.length>20)probe.events.shift();
  };
  const types=['pointerdown','mousedown','pointerup','mouseup','click'];
  types.forEach(type=>document.addEventListener(type,trace,true));
  window.__bkPointerProbeCleanup=()=>types.forEach(type=>document.removeEventListener(type,trace,true));
  return true;
 })()`);
 // Closing settings starts the fitted layout and then the camera's next-frame
 // projection. A ready texture alone does not mean the hitbox has settled.
 let point=null,previous=null,stable=0;
 await until(async()=>{
  const current=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return null;const r=e.getBoundingClientRect(),x=r.x+r.width*.5,y=r.y+r.height*.36,hit=document.elementFromPoint(x,y);return {x,y,width:r.width,height:r.height,unobstructed:!!hit&&(hit===e||e.contains(hit))}})()`);
  const usable=current&&current.width>=24&&current.height>=24&&current.unobstructed;
  const unchanged=previous&&current&&['x','y','width','height'].every(key=>Math.abs(current[key]-previous[key])<=.5);
  stable=usable?(unchanged?stable+1:1):0;previous=current;point=current;
  return stable>=3;
 },label+' reaches a stable visible hit target');
 assert.ok(point&&point.width>=24&&point.height>=24,label+' has a usable visible hit target '+JSON.stringify(point));
 assert.equal(point.unobstructed,true,label+' target is not covered by another control');
 await evaluate('window.__bkPointerProbe.point='+JSON.stringify(point)+';true');
 if(mobile){
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y,radiusX:1,radiusY:1,force:1,id:1}]});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }else{
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:point.x,y:point.y});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:point.x,y:point.y});
 }
}
async function assertCameraGeometry(label){
 const result=await evaluate(`(()=>{
  const arena=document.querySelector('.arena'),field=layoutRect(arena),viewport=layoutViewport(),canvas=arena.querySelector('.bk-summon-canvas');
  const units=[...arena.querySelectorAll('.field-unit')].map(unit=>{const slot=unit.closest('.field-slot'),r=layoutRect(unit),name=layoutRect(unit.querySelector('.unit-name')),stats=layoutRect(unit.querySelector('.unit-stats'));return {owner:Number(unit.dataset.player),uid:unit.dataset.uid,placed:slot.dataset.cameraPlaced==='true',box:r.toJSON(),name:name.toJSON(),stats:stats.toJSON()}});
  const overlaps=[];
  const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2;
  for(let i=0;i<units.length;i++)for(let j=i+1;j<units.length;j++)if(overlap(units[i].box,units[j].box)||[units[i].name,units[i].stats].some(a=>[units[j].name,units[j].stats].some(b=>overlap(a,b))))overlaps.push([units[i].uid,units[j].uid]);
  const inside=(r,b)=>r.width>0&&r.height>0&&r.left>=b.left-2&&r.right<=b.right+2&&r.top>=b.top-2&&r.bottom<=b.bottom+2;
  return {camera:arena.dataset.battleCamera,bodyHeight:Number(canvas?.dataset.cameraBodyHeight),cameraRectHeight:Number(canvas?.dataset.cameraRectHeight),units,overlaps,allPlaced:arena.querySelectorAll('.field-slot[data-camera-placed="true"]').length===8,inside:units.every(u=>inside(u.box,field)&&inside(u.box,{left:0,top:0,right:viewport.width,bottom:viewport.height})&&inside(u.name,u.box)&&inside(u.stats,u.box)),canvasCount:document.querySelectorAll('.bk-summon-canvas').length};
 })()`);
 assert.equal(result.camera,'angled',label+' uses the own-side angled battle camera');
 assert.ok(result.bodyHeight>.5,label+' gives the upright painting real height '+JSON.stringify({bodyHeight:result.bodyHeight,cameraRectHeight:result.cameraRectHeight}));
 assert.equal(result.allPlaced,true,label+' places all eight ground sockets in the camera');
 assert.ok(result.units.every(u=>u.placed),label+' aligns every model with its interactive target');
 assert.equal(result.inside,true,label+' keeps model controls and labels inside the field and viewport '+JSON.stringify(result));
 assert.deepEqual(result.overlaps,[],label+' keeps targets and nameplates separate '+JSON.stringify(result));
 const average=owner=>{const rows=result.units.filter(u=>u.owner===owner);return rows.reduce((sum,u)=>sum+u.box.width,0)/rows.length;};
 if(result.units.some(u=>u.owner===0)&&result.units.some(u=>u.owner===1))assert.ok(average(0)>average(1)*1.03,label+' makes near creatures visibly larger than far creatures '+JSON.stringify(result.units));
}
async function assertSummonScene(expected,label){
 await until(()=>evaluate(`(()=>{const c=document.querySelector('.bk-summon-canvas');return c&&Number(c.dataset.summonCount)===${expected.length}&&document.querySelectorAll('.field-slot[data-summon-ready="true"]').length===${expected.length}})()`),label+' loaded summon artwork',90000);
 const result=await evaluate(`(async()=>{
  const {getCard}=await import('./catalog.js?v=20261125-35');
  const {resolveSummonArt}=await import('./summon-art.js?v=20261125-35');
  const canvas=document.querySelector('.bk-summon-canvas'),rect=layoutRect(canvas),style=getComputedStyle(canvas);
  const slots=[...document.querySelectorAll('.field-slot[data-summon-ready="true"]')].map(slot=>{
   const unit=slot.querySelector('.field-unit'),painting=unit.querySelector('.summon-card-floor .card-art');
   const background=painting&&getComputedStyle(painting).backgroundImage;
   const actual=background?.match(/^url\\(["']?(.*?)["']?\\)$/)?.[1];
   const source=resolveSummonArt(getCard(unit.dataset.cardId));
   return {uid:unit.dataset.uid,cardId:unit.dataset.cardId,owner:Number(unit.dataset.player),sameCard:slot.dataset.cardId===unit.dataset.cardId&&source?.cardId===unit.dataset.cardId,originalSource:!!actual&&!!source&&new URL(actual,document.baseURI).pathname===new URL(source.src,document.baseURI).pathname,maskCoverage:Number(slot.dataset.summonMaskCoverage),meshDepth:Number(slot.dataset.summonMeshDepth)};
  });
  return {canvases:document.querySelectorAll('.bk-summon-canvas').length,count:Number(canvas.dataset.summonCount),foreground:canvas.dataset.summonForeground,renderer:canvas.closest('.arena')?.dataset.summonRenderer,visible:rect.width>0&&rect.height>0&&canvas.width>0&&canvas.height>0&&style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0,pointerEvents:style.pointerEvents,slots};
 })()`);
 assert.equal(result.canvases,1,label+' has one shared summon canvas');
 assert.equal(result.count,expected.length,label+' keeps every living field creature visible');
 assert.ok(['webgl','canvas'].includes(result.renderer),label+' has a working renderer');
 assert.equal(result.visible,true,label+' keeps the scene visible');
 assert.equal(result.pointerEvents,'none',label+' does not cover battle controls');
 assert.equal(result.foreground,'transparent',label+' uses the background-free presentation');
 assert.deepEqual(result.slots.map(({uid,cardId,owner})=>({uid,cardId,owner})).sort((a,b)=>a.uid.localeCompare(b.uid)),[...expected].sort((a,b)=>a.uid.localeCompare(b.uid)),label+' mirrors both public fields');
 assert.ok(result.slots.every(slot=>slot.sameCard&&slot.originalSource),label+' uses each slot’s exact published card illustration');
 assert.ok(result.slots.every(slot=>slot.maskCoverage>0&&slot.maskCoverage<.9995&&slot.meshDepth>0),label+' supplies a nonrectangular alpha mask and positive mesh thickness '+JSON.stringify(result.slots));
 await assertCameraGeometry(label);
}
async function runSummonSmoke(){
 // Both modes use the test's temporary local profile. Move owned cards from
 // their existing piles into the field; each complete pool remains 32 + 4.
 const savedProfile=await evaluate('localStorage.getItem("beast-king-v6")');
 async function loadFixture(count,{width,height,mobile}){
  // Let debounced saves settle so pagehide cannot overwrite the new fixture.
  await delay(250);
  const expected=await evaluate(`(async()=>{
   const {newGame}=await import('./engine.js?v=20261125-35');
   const {getCard}=await import('./catalog.js?v=20261125-35');
   const saved=JSON.parse(${JSON.stringify(savedProfile)});
   const battle=newGame({playerDeck:saved.deckIds,cpuDeck:saved.deckIds,playerSpecialDeck:saved.specialIds,cpuSpecialDeck:saved.specialIds,seed:33});
   for(const [owner,player] of battle.players.entries())for(let i=0;i<${count};i++){
    const chosen=new Set(player.field.map(unit=>unit.cardId)),piles=[player.deck,player.hand];
    const unique=piles.find(pile=>pile.some(id=>getCard(id).type==='beast'&&!chosen.has(id)));
    const pile=unique||piles.find(pile=>pile.some(id=>getCard(id).type==='beast'));
    const index=pile?.findIndex(id=>getCard(id).type==='beast'&&(!unique||!chosen.has(id)));if(index===undefined||index<0)throw Error('Fixture needs owned beasts');
    const card=getCard(pile.splice(index,1)[0]);
    player.field.push({uid:'u'+battle.nextUid++,cardId:card.id,owner,attack:owner===0?1200:card.attack,hp:owner===0?card.hp:100,maxHp:owner===0?card.hp:100,ready:true,keywords:[...card.keywords]});
   }
   saved.game=battle;saved.motion=true;saved.sound=false;saved.bgm=false;
   localStorage.setItem('beast-king-v6',JSON.stringify(saved));
   return battle.players.flatMap((player,owner)=>player.field.map(unit=>({uid:unit.uid,cardId:unit.cardId,owner})));
  })()`);
  await send('Page.reload',{ignoreCache:true});await waitElement('.home-resume');
  await viewport(width,height,mobile);await click('[data-action=resume]');await waitElement('.duel-shell');
  await until(()=>evaluate(`Number(document.querySelector('.bk-summon-canvas')?.dataset.summonCount)===${expected.length}`),'fixture models are loaded',90000);
  return expected;
 }
 for(const size of [{width:1366,height:768,mobile:false},{width:390,height:844,mobile:true}]){
  const {width,height,mobile}=size,label=width+'x'+height+' persistent summons';
  const crowded=await loadFixture(4,size);
  // Capture the full board before geometry assertions, so a failed placement
  // still supplies a useful real-browser image for the next implementation fix.
  await evaluate('document.fonts.ready.then(()=>true)');
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await mkdir('artifacts/layout',{recursive:true});
  await writeFile(`artifacts/layout/summons-${width}x${height}.png`,Buffer.from(screenshot.data,'base64'));
  await writeFile(`artifacts/layout/summons-${width}x${height}.json`,JSON.stringify(await cameraLayoutDiagnostic(),null,2));
  await assertSummonScene(crowded,label+' with all eight slots occupied');
  const expected=await loadFixture(2,size);
  await assertSummonScene(expected,label);
  await click('[data-action=toggle-hand-effects]');await click('[data-action=toggle-hand-effects]');
  await assertSummonScene(expected,label+' after rerender');
  await click('.duel-top [data-action=settings]');await click('[data-action=settings-tab][data-tab=motion]');
  assert.equal(await evaluate('document.querySelector("[data-action=motion]").getAttribute("aria-checked")'),'true');
  await click('[data-action=motion]');await click('.modal-close');
  await assertSummonScene(expected,label+' with animation disabled');
  assert.equal(await evaluate('document.querySelector(".bk-summon-canvas").dataset.summonMotion'),'off',label+' stops movement rather than hiding creatures');
  const attacker=expected.find(unit=>unit.owner===0);
  await pointerClick('.field-unit[data-player="0"][data-uid="'+attacker.uid+'"]',mobile,label+' attacker');
  await until(()=>evaluate('Boolean(document.querySelector(".field-unit.targetable[data-player=\\"1\\"]"))'),label+' selects an attacker with real input');
  const target=await evaluate('document.querySelector(".field-unit.targetable[data-player=\\"1\\"]")?.dataset.uid');
  assert.ok(target,label+' has a legal enemy target');
  await pointerClick('.field-unit[data-player="1"][data-uid="'+target+'"]',mobile,label+' enemy');
  await until(()=>evaluate('document.querySelectorAll(".field-unit").length===3'),label+' resolves the pointer attack');
  await assertSummonScene(expected.filter(unit=>unit.uid!==target),label+' after a creature leaves the field');
 }
}

/** Two bounded real-UI cases share the isolated test profile. The approved
 * illustrated face and printed game values must survive both finish modes. */
async function runReliefSmoke(){
 const originalMotion=await evaluate('!document.body.classList.contains("reduce-motion")');
 async function setMotion(enabled){
  await click('.site-controls [data-action=settings]');
  await click('[data-action=settings-tab][data-tab=motion]');
  if(await evaluate('document.querySelector("[data-action=motion]").getAttribute("aria-checked")')!==String(enabled))await click('[data-action=motion]');
  await click('#modal-root .modal-close');
 }
 async function searchCard(id){
  await evaluate(`(()=>{const input=document.querySelector('#card-search');input.value=${JSON.stringify(id)};input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await waitElement('#card-results .game-card[data-id="'+id+'"]');
 }
 async function openApex(){
  await searchCard('B0001');
  await click('#card-results .game-card[data-id=B0001]');
  await until(()=>evaluate(exists('#modal-root .game-card[data-id=B0001] .card-finish[data-relief-ready=true][data-fx-visible=true]')),'visible apex relief in card detail');
  await evaluate(`(async()=>{await document.fonts.ready;const style=document.querySelector('#modal-root .game-card[data-id=B0001] .card-art').style.backgroundImage;const src=style.slice(4,-1).replace(/^["']|["']$/g,'');const image=new Image();image.src=src;await image.decode();return true})()`);
 }
 async function inspectApex(label,moving){
  const result=await evaluate(`(async()=>{
   const {getCard}=await import('./catalog.js?v=20261125-35');
   const card=document.querySelector('#modal-root .game-card[data-id=B0001]'),data=getCard('B0001'),art=card.querySelector('.card-art'),finish=card.querySelector('.card-finish'),relief=finish.querySelector('.bk-relief'),contour=relief.querySelector('.bk-relief-contour'),polish=relief.querySelector('.bk-relief-polish');
   const background=node=>{const s=getComputedStyle(node);return {image:s.backgroundImage,size:s.backgroundSize,position:s.backgroundPosition,repeat:s.backgroundRepeat}};
   const inside=(a,b)=>a.left>=b.left-1&&a.right<=b.right+1&&a.top>=b.top-1&&a.bottom<=b.bottom+1;
   const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
   const aperture=layoutRect(finish),artBox=layoutRect(art),visible=layoutRect(contour),shade=getComputedStyle(contour),shine=getComputedStyle(polish);
   return {id:card.dataset.id,finish:card.dataset.cardRelief,ready:finish.dataset.reliefReady,visible:finish.dataset.fxVisible,aria:finish.getAttribute('aria-hidden'),count:finish.querySelectorAll('.bk-relief').length,
    source:background(art),copies:[...relief.querySelectorAll('.bk-relief-contour,.bk-relief-polish')].map(background),filter:shade.filter,opacity:Number(shade.opacity),polish:{name:shine.animationName,state:shine.animationPlayState,opacity:Number(shine.opacity)},
    aperture:aperture.toJSON(),visibleBox:visible.toJSON(),sameAperture:inside(aperture,artBox)&&inside(artBox,aperture),withinArt:inside(visible,artBox),textOverlap:[...card.querySelectorAll('.card-top,.card-bottom')].filter(node=>overlap(aperture,layoutRect(node))).map(node=>node.className),pointerEvents:getComputedStyle(relief).pointerEvents,
    actual:{name:card.querySelector('.card-name').textContent,cost:Number(card.querySelector('.cost-gem').textContent),attack:Number(card.querySelector('[title="攻撃力"]').textContent),hp:Number(card.querySelector('[title="守備力"]').textContent),text:card.querySelector('.card-effect').textContent},
    expected:{name:data.name,cost:data.cost,attack:data.attack,hp:data.hp,text:data.text},definitionCount:document.querySelectorAll('#bk-card-relief-etch').length};
  })()`);
  assert.equal(result.finish,'apex',label+' marks the strongest card');
  assert.equal(result.ready,'true',label+' finishes mounting its relief');
  assert.equal(result.visible,'true',label+' is observed in the viewport');
  assert.equal(result.aria,'true',label+' keeps purely decorative art out of the accessible text');
  assert.equal(result.count,1,label+' has exactly one relief subtree');
  assert.equal(result.definitionCount,1,label+' shares one static contour filter');
  assert.equal(result.copies.length,2,label+' has two approved-art layers');
  assert.ok(result.source.image.includes('assets/design-v2/cards/individual/illustration-update-02.webp'),label+' keeps the approved B0001 atlas');
  for(const copy of result.copies)assert.deepEqual(copy,result.source,label+' exactly preserves the existing artwork source and crop');
  assert.ok(result.filter.includes('#bk-card-relief-etch')&&result.opacity>0&&result.visibleBox.width>0&&result.visibleBox.height>0,label+' renders actual static etched ridges');
  assert.equal(result.sameAperture,true,label+' keeps the finish aligned with the illustration');
  assert.equal(result.withinArt,true,label+' confines embossing to the illustration');
  assert.deepEqual(result.textOverlap,[],label+' leaves card name, cost, rules and stats uncovered');
  assert.equal(result.pointerEvents,'none',label+' never blocks game input');
  assert.deepEqual(result.actual,result.expected,label+' preserves every printed game value');
  assert.equal(result.polish.name,moving?'bk-relief-polish':'none',label+' respects the motion setting');
  if(moving)assert.equal(result.polish.state,'running',label+' moves the localized reflection only while visible');
  await assertFits();
  return result;
 }
 async function capture(name){
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await mkdir('artifacts/layout',{recursive:true});
  await writeFile('artifacts/layout/'+name+'.png',Buffer.from(shot.data,'base64'));
 }
 async function dismissOutside(mobile,label){
  const point=await evaluate(`(()=>{const backdrop=document.querySelector('#modal-root .modal-backdrop');for(const [x,y] of [[3,3],[innerWidth/2,3],[innerWidth-3,3],[3,innerHeight/2],[innerWidth-3,innerHeight/2],[3,innerHeight-3],[innerWidth/2,innerHeight-3]])if(document.elementFromPoint(x,y)===backdrop)return {x,y};return null})()`);
  assert.ok(point,label+' leaves the modal backdrop available for dismissal');
  if(mobile){
   await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,radiusX:1,radiusY:1,force:1,id:1}]});
   await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
   await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...point});
  }
  await until(()=>evaluate('!document.querySelector("#modal-root .modal")'),label+' dismisses the detail by clicking or tapping outside');
 }
 for(const {width,height,mobile} of [{width:1366,height:768,mobile:false},{width:390,height:844,mobile:true}]){
  const label=width+'x'+height+' apex relief';
  await viewport(width,height,mobile);await click('.navigation-dock [data-nav=collection]');
  await click('[data-action=collection-scope][data-scope=all]');
  await setMotion(true);await openApex();
  const moving=await inspectApex(label,true);
  await capture('relief-'+width+'x'+height);
  await pointerClick('#modal-root .modal-close',mobile,label+' close control');
  await until(()=>evaluate('!document.querySelector("#modal-root .modal")'),label+' closes with its visible close control');
  await setMotion(false);await openApex();
  const still=await inspectApex(label+' with animation disabled',false);
  assert.deepEqual(still.source,moving.source,label+' motion toggle never changes the illustration');
  assert.deepEqual(still.actual,moving.actual,label+' motion toggle never changes card values');
  await capture('relief-static-'+width+'x'+height);
  await writeFile('artifacts/layout/relief-'+width+'x'+height+'.json',JSON.stringify({moving,still},null,2));
  await dismissOutside(mobile,label);
  await searchCard('B0002');await click('#card-results .game-card[data-id=B0002]');
  await waitElement('#modal-root .game-card[data-id=B0002] .card-finish.bk-fx-ready');
  const normal=await evaluate(`(()=>{const card=document.querySelector('#modal-root .game-card[data-id=B0002]');return {marked:card.hasAttribute('data-card-relief'),relief:card.querySelectorAll('[data-card-relief],.bk-relief').length}})()`);
  assert.deepEqual(normal,{marked:false,relief:0},label+' keeps an ordinary beast on its existing finish');
  await click('#modal-root .modal-close');
 }
 await setMotion(originalMotion);
 await evaluate(`(()=>{const input=document.querySelector('#card-search');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
 await click('.navigation-dock [data-nav=home]');await viewport(1280,720);
}

/** Review public mask cache output against the exact original card artwork.
 * The CI browser exercises the shipped source-key resolver, atlas crop and
 * alpha composer; it downloads no inference runtime and never repaints RGB. */
async function runForegroundReview(){
 const cases=[['B0001','BASE / redrawn atlas'],['B0257','BASE / original atlas'],['B0263','ORIGINAL / portrait'],['B0512','REGALIA / public printing'],['B1537','BK04 / star deer'],['B1609','BK04 / evolved deer'],['B2049','PREMIUM / dragon'],['B2053','PREMIUM / messenger'],['F0513','PREMIUM / fusion'],['B2056','BK05 / origami'],['B2073','BK05 / glass'],['F0522','BK05 / pigment']];
 foregroundNetwork=[];
 try{
  await evaluate(`(()=>{
   const state={done:false,error:null,rows:[],prepareMs:null,maskTileSize:null,sheet:null,extractor:null};window.__bkForegroundReview=state;
   const overlay=document.createElement('div');overlay.id='foreground-review-overlay';overlay.setAttribute('aria-hidden','true');overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#07121d;pointer-events:none;display:flex;align-items:center;justify-content:center';document.body.appendChild(overlay);
   void (async()=>{
    const {getCard}=await import('./catalog.js?v=20261125-35');
    const {resolveSummonArt,computeSummonArtCrop}=await import('./summon-art.js?v=20261125-35');
    const {createForegroundExtractor,FOREGROUND_INPUT_SIZE}=await import('./summon-foreground.js?v=20261125-35');state.maskTileSize=FOREGROUND_INPUT_SIZE;
    const cases=${JSON.stringify(cases)},tileW=480,tileH=348,gap=16,pad=24,top=112;
    const sheet=document.createElement('canvas');sheet.width=1520;sheet.height=1588;sheet.style.cssText='width:100%;height:100%;object-fit:contain';state.sheet=sheet;overlay.appendChild(sheet);
    const ctx=sheet.getContext('2d');ctx.fillStyle='#07121d';ctx.fillRect(0,0,sheet.width,sheet.height);
    ctx.fillStyle='#e7f4ff';ctx.font='bold 28px sans-serif';ctx.fillText('BEAST KING · ORIGINAL ART / FOREGROUND REVIEW',pad,42);
    ctx.fillStyle='#9fc4d9';ctx.font='16px sans-serif';ctx.fillText('Public illustrations · 320px source crop · original RGB retained · verified public '+FOREGROUND_INPUT_SIZE+'px alpha cache',pad,72);
    const checker=(x,y,w,h)=>{ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();for(let row=0;row<Math.ceil(h/12);row++)for(let col=0;col<Math.ceil(w/12);col++){ctx.fillStyle=(row+col)%2?'#20313f':'#11212e';ctx.fillRect(x+col*12,y+row*12,12,12);}ctx.restore();};
    const fitImage=(image,x,y,size)=>{const s=Math.min(size/image.width,size/image.height),w=image.width*s,h=image.height*s;ctx.drawImage(image,x+(size-w)/2,y+(size-h)/2,w,h);};
    state.extractor=createForegroundExtractor({window,document});const startup=performance.now();await state.extractor.prepare();state.prepareMs=Math.round(performance.now()-startup);
    for(let index=0;index<cases.length;index++){
     const [id,group]=cases[index],x=pad+(index%3)*(tileW+gap),y=top+Math.floor(index/3)*(tileH+gap),row={id,group,status:'preparing'};state.rows.push(row);
     ctx.fillStyle='#0b1b29';ctx.fillRect(x,y,tileW,tileH);ctx.strokeStyle='#315166';ctx.strokeRect(x+.5,y+.5,tileW-1,tileH-1);
     ctx.fillStyle='#dceefe';ctx.font='bold 18px sans-serif';ctx.fillText(id+'  '+group,x+12,y+25);ctx.font='14px sans-serif';ctx.fillStyle='#9fc4d9';ctx.fillText('APPROVED ORIGINAL',x+12,y+49);ctx.fillText('BACKGROUND-FREE',x+248,y+49);
     checker(x+12,y+60,220,220);checker(x+248,y+60,220,220);
     try{
      const card=getCard(id),art=resolveSummonArt(card),url=new URL(art.src,document.baseURI);row.name=card.name;row.source=url.pathname+url.search;
      if(url.origin!==location.origin||!url.pathname.startsWith('/assets/'))throw Error('review source must be a public same-origin asset');
      const image=new Image();image.src=url.href;await image.decode();
      const crop=computeSummonArtCrop(art,image.naturalWidth,image.naturalHeight);if(!crop)throw Error('invalid approved crop');row.crop=crop;
      const source=document.createElement('canvas'),aspect=crop.width/crop.height;source.width=Math.round(aspect>=1?320:320*aspect);source.height=Math.round(aspect>=1?320/aspect:320);
      const originalContext=source.getContext('2d',{willReadFrequently:true});originalContext.drawImage(image,crop.x,crop.y,crop.width,crop.height,0,0,source.width,source.height);
      const before=originalContext.getImageData(0,0,source.width,source.height);fitImage(source,x+12,y+60,220);
      const started=performance.now(),result=await state.extractor.extract(source,{art,baseUrl:document.baseURI});row.latencyMs=Math.round(performance.now()-started);
      if(result.width!==source.width||result.height!==source.height)throw Error('foreground changed source dimensions');
      let rgbChanged=0,sourceChanged=0,alphaIncreased=0,clear=0,opaque=0,soft=0,alphaSum=0;const after=originalContext.getImageData(0,0,source.width,source.height);
      for(let p=0;p<before.data.length;p+=4){for(let channel=0;channel<3;channel++)if(result.data[p+channel]!==before.data[p+channel])rgbChanged++;for(let channel=0;channel<4;channel++)if(after.data[p+channel]!==before.data[p+channel])sourceChanged++;const alpha=result.data[p+3];if(alpha>before.data[p+3])alphaIncreased++;if(alpha<=8)clear++;else if(alpha<128)soft++;else opaque++;alphaSum+=alpha;}
      const count=source.width*source.height;Object.assign(row,{status:'ok',width:source.width,height:source.height,rgbChanged,sourceChanged,alphaIncreased,clearFraction:clear/count,opaqueFraction:opaque/count,softFraction:soft/count,alphaCoverage:alphaSum/(count*255)});
      const cutout=document.createElement('canvas');cutout.width=result.width;cutout.height=result.height;const cutoutContext=cutout.getContext('2d'),pixels=cutoutContext.createImageData(result.width,result.height);pixels.data.set(result.data);cutoutContext.putImageData(pixels,0,0);fitImage(cutout,x+248,y+60,220);
      ctx.fillStyle='#b7e9cd';ctx.font='15px sans-serif';ctx.fillText('RGB Δ '+rgbChanged+' · source Δ '+sourceChanged+' · '+(row.latencyMs/1000).toFixed(2)+'s',x+12,y+305);
      ctx.fillStyle='#9fc4d9';ctx.font='14px sans-serif';ctx.fillText('solid '+(row.opaqueFraction*100).toFixed(1)+'% · clear '+(row.clearFraction*100).toFixed(1)+'% · alpha '+(row.alphaCoverage*100).toFixed(1)+'%',x+12,y+329);
      cutout.width=0;source.width=0;
     }catch(error){row.status='failed';row.error=error.code||error.message||String(error);ctx.fillStyle='#ffb0b6';ctx.font='16px sans-serif';ctx.fillText('EXTRACTION FAILED · '+row.error.slice(0,38),x+12,y+310);}
    }
    ctx.fillStyle='#9fc4d9';ctx.font='14px sans-serif';ctx.fillText('Cache preparation '+state.prepareMs+'ms · sampled silhouette quality requires visual review',pad,sheet.height-15);
   })().catch(error=>{state.error=error.stack||String(error);}).finally(()=>{state.extractor?.destroy();state.extractor=null;state.done=true;});return true;
  })()`);
  let completed=-1;
  await until(async()=>{
   const progress=await evaluate('(()=>{const s=window.__bkForegroundReview;return {done:s.done,count:s.rows.filter(r=>r.status!=="preparing").length,last:s.rows.at(-1)?.id}})()');
   if(progress.count!==completed){completed=progress.count;console.log('Foreground review '+completed+'/'+cases.length+(progress.last?' · '+progress.last:''));}
   return progress.done;
  },'12 verified public foreground masks',90000);
  const payload=await evaluate('(()=>{const s=window.__bkForegroundReview;return {report:{prepareMs:s.prepareMs,maskTileSize:s.maskTileSize,error:s.error,rows:s.rows},png:s.sheet?.toDataURL("image/png")}})()');
  const requests=foregroundNetwork;foregroundNetwork=null;
  payload.report.requests=requests;
  await mkdir('artifacts/layout',{recursive:true});
  await writeFile('artifacts/layout/foreground-review.json',JSON.stringify(payload.report,null,2));
  if(payload.png)await writeFile('artifacts/layout/foreground-review.png',Buffer.from(payload.png.split(',')[1],'base64'));
  assert.equal(payload.report.error,null,'The shipped public mask coordinator initializes successfully');
  assert.equal(payload.report.maskTileSize,256,'The public cache uses the reviewed mask tile resolution');
  assert.equal(payload.report.rows.length,cases.length,'All requested original-art styles were reviewed');
  for(const row of payload.report.rows){
   assert.equal(row.status,'ok',row.id+' produces a foreground silhouette');
   assert.equal(row.rgbChanged,0,row.id+' keeps every source RGB byte');
   assert.equal(row.sourceChanged,0,row.id+' does not mutate the authorized original');
   assert.equal(row.alphaIncreased,0,row.id+' never makes original transparency opaque');
   assert.ok(row.clearFraction>0&&row.opaqueFraction>0&&row.alphaCoverage>0&&row.alphaCoverage<1,row.id+' has a nonempty, genuinely transparent silhouette');
  }
  const sourceOrigin=await evaluate('location.origin');
  assert.ok(requests.every(request=>new URL(request.url).origin===sourceOrigin&&request.method==='GET'),'Foreground review uses only local GET requests; artwork is never uploaded: '+JSON.stringify(requests));
  assert.ok(requests.every(request=>!/(?:\.onnx|\.wasm|summon-runtime|summon-foreground-worker)/i.test(new URL(request.url).pathname)),'Public mask display must not download an inference runtime or model');
 }finally{
  foregroundNetwork=null;
  await evaluate('window.__bkForegroundReview?.extractor?.destroy();document.getElementById("foreground-review-overlay")?.remove();delete window.__bkForegroundReview;true');
 }
}

try{
 await new Promise((res,rej)=>{server.once('error',rej);server.listen(0,'127.0.0.1',res)});
 const url='http://127.0.0.1:'+server.address().port+'/';
 browser=await launchSmokeChrome();ws=browser.ws;
 ws.addEventListener('message',event=>{
  const m=JSON.parse(event.data);
  if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result);return}
  if(m.method==='Network.requestWillBeSent'&&foregroundNetwork)foregroundNetwork.push({url:m.params.request.url,method:m.params.request.method,type:m.params.type});
  if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  if(m.method==='Page.javascriptDialogOpening')void send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});
 });
 await send('Runtime.enable');await send('Page.enable');await send('Page.bringToFront');await viewport(1280,720);

 // No production writes: the test runs against a temporary local server/profile.
 await send('Network.enable');await send('Network.setBlockedURLs',{urls:['*chatgpt.site/*']});
 await send('Page.navigate',{url});await waitElement('#entry-start-form');
 for(const {width,height,mobile} of cameraOnly||reliefOnly||foregroundOnly?[{width:1280,height:720,mobile:false}]:[{width:1280,height:720,mobile:false},...viewports.filter(v=>v.mobile&&v.height>v.width)]){
  await viewport(width,height,mobile);await waitElement('.bk-entry-native');
  const entry=await evaluate(`(()=>{const p=layoutRect(document.querySelector('#app'));return [...document.querySelectorAll('#entry-start-form,#entry-player-name,.entry-profile-option,#entry-starter,.entry-start-button,.entry-footer a')].filter(e=>{const r=layoutRect(e);return r.width<=0||r.height<=0||r.left<p.left-2||r.right>p.right+2||r.top<p.top-2||r.bottom>p.bottom+2}).map(e=>e.id||e.className)})()`);
  assert.deepEqual(entry,[],width+'x'+height+' complete entry controls inside the live canvas');await assertFits();
 }
 await viewport(1280,720);
 await evaluate('document.querySelector("#entry-player-name").value="画面表示テスト十二文字";true');
 assert.equal(await evaluate('document.querySelectorAll("#entry-starter option").length'),4);
 await click('[data-action=name-start]');await waitElement('.product-home');
 assert.equal(await evaluate('Object.values(JSON.parse(localStorage.getItem("beast-king-v6")).collection).reduce((a,b)=>a+b,0)'),36);
 if(!foregroundOnly)await runReliefSmoke();
 if(foregroundOnly||cameraOnly)await runForegroundReview();
 if(foregroundOnly){
  assert.deepEqual(exceptions,[],'No uncaught foreground browser errors');
  console.log('Foreground review passed: twelve public originals, exact source RGB preservation, transparent masks, local-only requests and review contact sheet');
 }else if(reliefOnly){
  assert.deepEqual(exceptions,[],'No uncaught relief browser errors');
  console.log('Apex relief passed: exact approved artwork and crop, printed card values, art-only relief, static motion-off finish, ordinary-card exclusion, close control and outside dismissal on desktop and portrait touch');
 }else if(cameraOnly){
  await runSummonSmoke();
  assert.deepEqual(exceptions,[],'No uncaught camera browser errors');
  console.log('Angled battle camera passed: eight original-art creatures, perspective depth, visible hit targets, desktop mouse and portrait touch attacks, rerenders, animation-off, and removal');
 }else{
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
    const modeVisibility=await evaluate('(()=>{const p=layoutRect(document.querySelector(".home-page"));return [...document.querySelectorAll(".home-mode-rail>.home-mode")].map(e=>{const r=layoutRect(e);return r.top>=p.top-2&&r.bottom<=p.bottom+2&&r.left>=p.left-2&&r.right<=p.right+2})})()');assert.deepEqual(modeVisibility,[true,true,true,true],width+'x'+height+' all four mode controls fully visible');
    // The feature cards deliberately form an overlapping fan; each complete
    // transformed card must nevertheless remain inside the content pane.
    const fan=await evaluate('(()=>{const p=layoutRect(document.querySelector(".bk-native-pane"));return {frame:p.toJSON(),cards:[...document.querySelectorAll(".home-card-fan>.game-card")].map(e=>{const r=layoutRect(e);return {visible:r.width>0&&r.height>0&&r.top>=p.top-2&&r.bottom<=p.bottom+2&&r.left>=p.left-2&&r.right<=p.right+2,box:r.toJSON()}})}})()');assert.deepEqual(fan.cards.map(c=>c.visible),[true,true,true],width+'x'+height+' all three featured cards fully visible '+JSON.stringify(fan));
   }
   if(page==='shop'){
    const assertShopVisible=async(selector,count,label,completeText=false)=>{
     const result=await evaluate(`(()=>{
      const bounds=layoutRect(document.querySelector('.bk-native-pane')),nodes=[...document.querySelectorAll(${JSON.stringify(selector)})];
      return {count:nodes.length,bad:nodes.filter(node=>{const r=layoutRect(node),s=getComputedStyle(node);return r.width<=0||r.height<=0||s.display==='none'||s.visibility==='hidden'||r.left<bounds.left-2||r.right>bounds.right+2||r.top<bounds.top-2||r.bottom>bounds.bottom+2||${completeText}&&node.scrollHeight>node.clientHeight+2}).map(node=>node.className||node.dataset.bkScreenTab||node.tagName)};
     })()`);
     assert.deepEqual(result,{count,bad:[]},width+'x'+height+' '+label+' visible within the shop pane');
    };
    const selectShopPane=async(mode)=>{
     const compact=await evaluate('layoutViewport().width<1100||layoutViewport().height<800');
     if(!compact){assert.equal(await evaluate('document.querySelector(".product-shop").dataset.bkShopMode'),'all');return;}
     const selector='.product-shop>[data-bk-tab-kind=shop] [data-bk-screen-tab='+mode+']';
     await assertShopVisible(selector,1,'shop '+mode+' tab');
     await click(selector);
     await until(()=>evaluate('document.querySelector(".product-shop").dataset.bkShopMode==='+JSON.stringify(mode)+'&&document.querySelector('+JSON.stringify(selector)+').getAttribute("aria-pressed")==="true"'),'shop '+mode+' pane');
     await delay(120);
    };
    assert.equal(await evaluate('document.querySelectorAll(".product-section-tabs [data-action=pack-select]").length'),5);
    for(const pack of ['BK03','BK04','BK05']){
     const packSelector='.product-section-tabs [data-action=pack-select][data-pack='+pack+']';
     await assertShopVisible(packSelector,1,pack+' selector');await click(packSelector);await delay(160);
     await selectShopPane('pack');
     await assertShopVisible('.pack-display,.pack-buy',2,pack+' artwork and purchase control');
     assert.equal(await evaluate('document.querySelector(".pack-cover-art").complete&&document.querySelector(".pack-cover-art").naturalWidth>0'),true,pack+' illustrated cover loads');
     await check(width+'x'+height+' '+pack+' purchase',['.product-section-tabs>button','.pack-offer>.pack-buy,.pack-offer>.pack-assurance,.pack-offer>.pack-collection']);
     await selectShopPane('details');
     await assertShopVisible('.pack-offer>p:not([class]),.pack-assurance,.pack-collection,.pack-offer>[data-action=pack-odds]',4,pack+' complete pack description and collection details',true);
     const packContent=await evaluate(`(async()=>{
      const {getPack}=await import('./shop.js?v=20261125-35'),pack=getPack(${JSON.stringify(pack)}),buy=document.querySelector('.pack-buy');
      return {description:document.querySelector('.pack-offer>p:not([class])').textContent===pack.description,purchase:buy.dataset.pack===pack.id&&buy.textContent.includes(pack.cost+'秘宝で'+pack.size+'枚'),guarantee:document.querySelector('.pack-assurance').textContent.includes('レア以上を1枚保証'),collection:document.querySelector('.pack-collection').textContent.includes(pack.cardCount.toLocaleString('ja-JP')+'種類')};
     })()`);
     assert.deepEqual(packContent,{description:true,purchase:true,guarantee:true,collection:true},pack+' complete supply information');
     await check(width+'x'+height+' '+pack+' details',['.pack-offer>p:not([class]),.pack-offer>.pack-assurance,.pack-offer>.pack-collection,.pack-offer>[data-action=pack-odds]']);
     await selectShopPane('recipes');
     await assertShopVisible('.recipe-launchers>button',4,pack+' four recipe choices');
     await check(width+'x'+height+' '+pack+' recipes',['.recipe-launchers>button']);
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
  await evaluate(`(async()=>{const {setPublicNotice}=await import('./news.js?v=20261125-35');setPublicNotice({ok:true,notice:'長文の運営告知',notices:[{id:'fixture-long-notice',title:'長文の運営告知',body:'【検証用】改行を含む長いお知らせ。<script>を文字として表示します。\\n'.repeat(40),status:'published',phase:'active',startAt:Date.now()}],maintenance:false,upcomingMaintenance:{startAt:Date.now()+3600000,endAt:Date.now()+7200000,message:'予約メンテナンスの表示検証'}});return true})()`);
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
  assert.equal(await evaluate('Number(document.querySelector(".results-meta").dataset.resultTotal)'),4721);
  const cardGeometry=await evaluate(`(()=>{
   const failures=[];
   for(const [grid,selector] of [['.transfer-source .cards-grid','.transfer-card'],['.deck-image-grid','.deck-image-slot']]){
    const container=document.querySelector(grid);if(!container){failures.push(grid);continue}
    const bounds=layoutRect(container);
    for(const tile of container.querySelectorAll(selector)){
     const r=layoutRect(tile),parts=[...tile.children].map(e=>layoutRect(e)).filter(p=>p.width>0&&p.height>0);
     // Images and counts may share a row. Only intersection on both axes
     // is a collision; compare every pair so nonadjacent controls are covered.
     const overlap=parts.some((p,i)=>parts.slice(i+1).some(q=>Math.min(p.right,q.right)-Math.max(p.left,q.left)>2&&Math.min(p.bottom,q.bottom)-Math.max(p.top,q.top)>2));
     if(r.left<bounds.left-2||r.right>bounds.right+2||r.top<bounds.top-2||r.bottom>bounds.bottom+2||overlap)failures.push({grid,id:tile.dataset.transferId,tile:r.toJSON(),bounds:bounds.toJSON()});
    }
   }
   return failures;
  })()`);
  assert.deepEqual(cardGeometry,[],width+'x'+height+' card art, counts, buttons and grid bounds');
  const symmetric=await evaluate(`(()=>{const q=s=>layoutRect(document.querySelector(s)),a=q('.transfer-source .cards-grid'),b=q('.deck-image-grid'),c=q('.transfer-card>.game-card'),d=q('.deck-image-slot>.game-card'),p=q('.deck-list-pagination'),l=q('#card-results>.pagination'),foot=q('.deck-panel-foot');return {a:a.toJSON(),b:b.toJSON(),c:c.toJSON(),d:d.toJSON(),p:p.toJSON(),l:l.toJSON(),foot:foot.toJSON()}})()`);
  assert.ok(Math.abs(symmetric.a.top-symmetric.b.top)<=2&&Math.abs(symmetric.a.bottom-symmetric.b.bottom)<=2&&Math.abs(symmetric.c.width-symmetric.d.width)<=2&&Math.abs(symmetric.c.height-symmetric.d.height)<=2,width+'x'+height+' symmetric card grids '+JSON.stringify(symmetric));
  const footerVisible=symmetric.foot.width>0&&symmetric.foot.height>0;
  assert.ok((!footerVisible||symmetric.foot.bottom<=symmetric.b.top+2)&&symmetric.p.top>=symmetric.b.bottom-2&&Math.abs(symmetric.p.top-symmetric.l.top)<=2&&symmetric.p.bottom<=panes.right.bottom+2,width+'x'+height+' save and pager separated '+JSON.stringify(symmetric));
  if(!footerVisible){
   // A zero rect from a hidden footer has no meaningful position, especially
   // after portrait rotation. Its actions must remain reachable in Settings.
   await click('[data-bk-screen-tab=settings]');await delay(120);
   const settingsActions=await evaluate(`(()=>{
    const frame=layoutRect(document.querySelector('.bk-native-pane'));
    return ['deck-save','deck-save-only','deck-bank-delete'].map(action=>{
     const node=document.querySelector('.dual-workshop [data-action="'+action+'"]');if(!node)return {action,missing:true};
     const r=layoutRect(node),s=getComputedStyle(node);
     return {action,width:r.width,height:r.height,visible:s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0,inside:r.left>=frame.left-2&&r.right<=frame.right+2&&r.top>=frame.top-2&&r.bottom<=frame.bottom+2,disabled:node.disabled};
    });
   })()`);
   assert.ok(settingsActions.every(a=>!a.missing&&a.width>0&&a.height>0&&a.visible&&a.inside&&(!a.disabled||a.action==='deck-bank-delete')),width+'x'+height+' settings retains save/delete controls, allowing last-deck delete protection '+JSON.stringify(settingsActions));
   await check(width+'x'+height+' deck settings actions',['.deck-bank-actions>.btn','.deck-panel-foot>div>button']);
   await click('[data-bk-screen-tab=cards]');await delay(120);
   assert.equal(await evaluate('document.querySelector(".dual-workshop").dataset.bkWorkshopMode'),'cards','Restore card mode after checking settings actions');
  }
  // Exercise the operator status/actions in the visible settings tab without
  // accessing a live account. Hidden card-mode rows cannot prove their fit.
  await click('[data-bk-screen-tab=settings]');await delay(120);
  await evaluate(`(()=>{const head=document.querySelector('.deck-panel-head'),row=document.createElement('div');row.className='operator-deck-preset';row.dataset.layoutFixture='true';row.innerHTML='<span>運営構築 · 開放済み</span><button class="text-button" data-action="operator-deck-use">プレミアムデッキを使う</button><small class="operator-art-auto">専用イラストを自動適用</small><small class="operator-art-status">専用イラスト未受信</small><button class="text-button" data-action="operator-art-refresh">再取得</button>';head.append(row);return true})()`);
  await delay(180);
  await check(width+'x'+height+' visible operator deck settings',['.deck-panel>.workshop-tools>*','[data-layout-fixture]>*']);
  const operatorSettingsFit=await evaluate(`(()=>{const row=document.querySelector('[data-layout-fixture]'),frame=layoutRect(document.querySelector('.bk-native-pane')),bounds=layoutRect(row),nodes=[row,...row.children],inside=(r,b)=>r.left>=b.left-2&&r.right<=b.right+2&&r.top>=b.top-2&&r.bottom<=b.bottom+2;return {mode:document.querySelector('.dual-workshop').dataset.bkWorkshopMode,visible:nodes.every(e=>{const r=layoutRect(e);return r.width>0&&r.height>0}),inside:nodes.every(e=>inside(layoutRect(e),frame)),contained:[...row.children].every(e=>inside(layoutRect(e),bounds))}})()`);
  assert.deepEqual(operatorSettingsFit,{mode:'settings',visible:true,inside:true,contained:true},width+'x'+height+' complete operator settings controls');
  await evaluate('document.querySelector("[data-layout-fixture]").remove();true');await delay(120);
  await click('[data-bk-screen-tab=filter]');await delay(120);await click('[data-action=deck-advanced-filters]');await delay(200);await check(width+'x'+height+' expanded deck filters',['.transfer-source>.transfer-heading,.transfer-source>.deck-source-tools,.transfer-source>.filter-bar,.transfer-source>#card-results','.filter-bar>.search-field,.filter-bar>.tabs,.filter-bar>.filters-secondary','.filters-secondary>select']);
  await click('[data-action=deck-advanced-filters]');await delay(120);await click('[data-bk-screen-tab=cards]');await delay(160);
  await click('[data-action=deck-filter-scope][data-scope=owned]');
  const ownedTotal=await evaluate('Number(document.querySelector(".results-meta").dataset.resultTotal)');assert.ok(ownedTotal>0&&ownedTotal<4721);
  assert.equal(await evaluate('document.querySelector(".deck-zone-tabs [data-section=main] b").textContent'),'32/32');
  await click('[data-action=deck-filter-scope][data-scope=all]');
  assert.equal(await evaluate('Number(document.querySelector(".results-meta").dataset.resultTotal)'),4721);
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
  await click('.navigation-dock [data-nav=collection]');await click('#card-results .game-card');await waitElement('.modal');await check(width+'x'+height+' card detail',['.detail-info button']);
  const detailClose=await evaluate(`(()=>{
   const close=document.querySelector('#modal-root .modal-close'),detail=document.querySelector('#modal-root .detail-layout'),box=layoutRect(close),viewport=layoutViewport(),style=getComputedStyle(close),overlaps=[];
   const intersects=r=>r.width>0&&r.height>0&&Math.min(box.right,r.right)-Math.max(box.left,r.left)>2&&Math.min(box.bottom,r.bottom)-Math.max(box.top,r.top)>2;
   const controlSelector='button,input,select,textarea,a[href]';
   for(const node of detail.querySelectorAll(':scope > .game-card,'+controlSelector)){
    const s=getComputedStyle(node);if(s.display!=='none'&&s.visibility!=='hidden'&&intersects(layoutRect(node)))overlaps.push(node.className||node.tagName);
   }
   // Padding around a heading can intentionally accommodate the close button.
   // Range rectangles measure the painted text instead of that parent box.
   const walker=document.createTreeWalker(detail,NodeFilter.SHOW_TEXT);
   while(walker.nextNode()){
    const node=walker.currentNode,parent=node.parentElement;
    if(!node.textContent.trim()||parent.closest('.game-card,'+controlSelector)||getComputedStyle(parent).visibility==='hidden')continue;
    const range=document.createRange();range.selectNodeContents(node);
    if([...range.getClientRects()].some(raw=>intersects(layoutRect({getBoundingClientRect:()=>raw}))))overlaps.push(node.textContent.trim().slice(0,45));
   }
   close.focus({preventScroll:true});
   return {width:box.width,height:box.height,visible:style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0,inside:box.left>=-2&&box.top>=-2&&box.right<=viewport.width+2&&box.bottom<=viewport.height+2,focusable:document.activeElement===close,overlaps};
  })()`);
  assert.ok(detailClose.width>0&&detailClose.height>0&&detailClose.visible&&detailClose.inside&&detailClose.focusable,width+'x'+height+' visible, focusable close control '+JSON.stringify(detailClose));
  assert.deepEqual(detailClose.overlaps,[],width+'x'+height+' close control leaves card artwork, text and actions unobstructed');
  await click('.modal-close');assert.equal(await evaluate('Boolean(document.querySelector("#modal-root .modal"))'),false,'Close control dismisses the detail');
 }
 // Account layout uses the real controller and view with in-memory server
 // responses. No account choice, link claim or production mutation is made.
 for(const {width,height,mobile} of [{width:1920,height:810,mobile:false},{width:1366,height:768,mobile:false},{width:390,height:844,mobile:true},{width:320,height:568,mobile:true}]){
  await viewport(width,height,mobile);await click('.navigation-dock [data-nav=home]');
  await evaluate(`(async()=>{
   const {createAccountUi}=await import('./account-ui.js'),{BRAND_ICONS}=await import('./brand-icons.js');
   const root=document.querySelector('#modal-root'),icon=name=>'<svg class="icon" aria-hidden="true" viewBox="0 0 24 24">'+(BRAND_ICONS[name]||BRAND_ICONS.spark)+'</svg>';
   const now=Date.now(),state={phase:'conflict',playerId:'layout-account-1234567890',lastSyncedAt:now,dirty:true,conflict:{reason:'revision',remoteRevision:7}};
   let modal=null,expired=false,sessions=Array.from({length:2},(_,index)=>({id:'layout-device-'+index,label:index?'PCブラウザ':'このスマートフォン',isCurrent:index===0,createdAt:now,lastSeenAt:now}));
   const calls={create:0,claim:0,remote:0,local:0,revoke:0};
   const client={profile:{id:state.playerId,nickname:'画面表示テスト十二文字',origin:'river'},getSessions:async()=>({sessions}),revokeSession:async()=>{calls.revoke++;}};
   const cloud={getState:()=>state,refresh:async()=>{state.lastSyncedAt+=1000;},createDeviceLink:async()=>{calls.create++;return {code:'LAYOUT-123456',expiresAt:expired?now-1000:Date.now()+600000};},claimDeviceLink:async()=>{calls.claim++;},reloadCloud:async()=>{calls.remote++;},keepLocal:async()=>{calls.local++;}};
   const ui=createAccountUi({client,cloud,ensureReady:async()=>{},isBattleActive:()=>false,getModal:()=>modal,setModal:value=>modal=value,showModal:(html,wide)=>{root.innerHTML='<div class="modal-backdrop"><section class="modal '+(wide?'wide':'')+'" role="dialog" aria-modal="true" tabindex="-1"><button class="icon-btn modal-close" data-action="close-modal" aria-label="閉じる">'+icon('close')+'</button>'+html+'</section></div>';setTimeout(()=>{if(!root.contains(document.activeElement))root.querySelector('.modal')?.focus({preventScroll:true});},0);},closeModal:()=>{root.innerHTML='';modal=null;},render(){},toast(){},icon});
   const listener=event=>{const button=event.target.closest('[data-action]');if(!button)return;if(button.dataset.action==='close-modal'){event.preventDefault();event.stopImmediatePropagation();ui.onModalClosed();root.innerHTML='';modal=null;return;}if(button.dataset.action.startsWith('cloud-')){event.preventDefault();event.stopImmediatePropagation();ui.handleAction(button.dataset.action,button);}};
   root.addEventListener('click',listener,true);
   window.__accountLayoutFixture={ui,state,calls,expire:()=>expired=true,manyDevices:()=>{sessions=Array.from({length:9},(_,index)=>({id:'layout-device-'+index,label:'表示検証の端末 '+(index+1),isCurrent:index===0,revokedAt:index===1?now:null,createdAt:now,lastSeenAt:now}));},close:()=>{ui.onModalClosed();root.removeEventListener('click',listener,true);root.innerHTML='';modal=null;}};
   await ui.openAccount();return true;
  })()`);
  await waitElement('.account-fullscreen .account-workspace');await delay(300);
  const label=width+'x'+height+' account';
  const readAccount=async(name,controls=[],body=[])=>assertReadableModal(label+' '+name,{fullViewport:true,controls:['.modal-close','.account-task-tabs [data-action=cloud-account-tab]',...controls],body,labels:['.account-task-tabs [data-action=cloud-account-tab]','.account-button','.account-label','.account-small-label','.account-status','.account-sync-meta','.account-link-result>p','.account-device-copy small','.account-device-copy strong']});
  const accountTab=async(name)=>{await click('[data-action=cloud-account-tab][data-tab='+name+']');await until(()=>evaluate('document.querySelector(".account-workspace").dataset.accountTab==='+JSON.stringify(name)),label+' '+name+' tab');await delay(160);};
  assert.equal(await evaluate('document.querySelector(".account-workspace").dataset.accountTab'),'sync');
  await readAccount('conflict',['[data-action=cloud-conflict-remote]','[data-action=cloud-conflict-local]','[data-action=cloud-refresh]'],['#cloud-sync-status>p','.account-conflict>p','.account-conflict-options small']);
  await accountTab('devices');
  await readAccount('two linked devices',height===568?[]:['[data-action=cloud-revoke-session]']);
  assert.equal(await evaluate('document.querySelectorAll(".account-device-list>li").length'),height===568?1:2,label+' device page adapts to available height');
  await accountTab('receive');
  await readAccount('receive',['#device-link-code','[data-action=cloud-link-claim]'],['.account-replace-note']);
  const draftCode='入力途中-TEST-99';
  await evaluate('(()=>{const input=document.querySelector("#device-link-code");input.value='+JSON.stringify(draftCode)+';input.dispatchEvent(new Event("input",{bubbles:true}));return true})()');
  await accountTab('send');
  await readAccount('send before code',['[data-action=cloud-link-create]']);
  await click('[data-action=cloud-link-create]');await waitElement('.account-link-code');await until(()=>evaluate('!document.querySelector("[data-action=cloud-link-create]").disabled'),label+' code creation complete');await delay(160);
  assert.equal(await evaluate('document.querySelector(".account-link-code").textContent'),'LAYOUT-123456');
  assert.ok(await evaluate('document.querySelector(".account-link-result").textContent.includes("有効期限")'),label+' generated code retains its expiry');
  assert.equal(await evaluate('document.querySelector("[data-action=cloud-link-copy]").disabled'),false);
  await readAccount('generated code',['[data-action=cloud-link-create]','[data-action=cloud-link-copy]','.account-link-code']);
  await accountTab('receive');
  assert.equal(await evaluate('document.querySelector("#device-link-code").value'),draftCode,label+' unsent code survives tab changes and link creation');
  await evaluate('(()=>{const input=document.querySelector("#device-link-code");input.focus({preventScroll:true});input.setSelectionRange(3,3);window.__accountLayoutFixture.state.lastSyncedAt+=1000;window.__accountLayoutFixture.ui.onCloudState();return true})()');await delay(160);
  assert.deepEqual(await evaluate('(()=>{const input=document.querySelector("#device-link-code");return {tab:document.querySelector(".account-workspace").dataset.accountTab,value:input.value,focused:document.activeElement===input,selection:input.selectionStart}})()'),{tab:'receive',value:draftCode,focused:true,selection:3},label+' background redraw preserves code, selected tab, focus and cursor');
  await accountTab('send');await evaluate('window.__accountLayoutFixture.expire();true');await click('[data-action=cloud-link-create]');await waitElement('.account-link-result.is-expired');await delay(160);
  assert.equal(await evaluate('document.querySelector("[data-action=cloud-link-copy]").disabled'),true,label+' expired code cannot be copied');
  await readAccount('expired code',['[data-action=cloud-link-create]','.account-link-code']);
  await evaluate('window.__accountLayoutFixture.manyDevices();true');await accountTab('sync');await click('[data-action=cloud-refresh]');await until(()=>evaluate('!document.querySelector("[data-action=cloud-refresh]").disabled'),label+' device refresh complete');await accountTab('devices');
  const deviceIds=[];let devicePages=0;
  while(true){
   await readAccount('device page '+(devicePages+1),['[data-action=cloud-device-prev]','[data-action=cloud-device-next]']);
   const page=await evaluate('(()=>{const rows=[...document.querySelectorAll(".account-device-list>li")];return {ids:rows.map(row=>row.dataset.deviceId),nextDisabled:document.querySelector("[data-action=cloud-device-next]").disabled,prevDisabled:document.querySelector("[data-action=cloud-device-prev]").disabled}})()');
   assert.ok(page.ids.length>0&&page.ids.every(Boolean),label+' device rows expose stable identities');
   assert.equal(page.prevDisabled,devicePages===0,label+' previous device page availability');
   deviceIds.push(...page.ids);devicePages++;
   if(page.nextDisabled)break;
   assert.ok(devicePages<9,label+' device pagination terminates');await click('[data-action=cloud-device-next]');await delay(160);
  }
  assert.deepEqual(deviceIds,Array.from({length:9},(_,index)=>'layout-device-'+index),label+' every linked device appears once, including current and revoked devices');
  assert.deepEqual(await evaluate('window.__accountLayoutFixture.calls'),{create:2,claim:0,remote:0,local:0,revoke:0},label+' layout navigation never applies an account mutation or conflict choice');
  await evaluate('window.__accountLayoutFixture.close();delete window.__accountLayoutFixture;true');
  if(width===1366||width===320){
   await click('[data-action=settings]');await click('[data-action=settings-tab][data-tab=account]');await waitElement('#settings-account:not([hidden])');await delay(300);
   await assertReadableModal(width+'x'+height+' data settings',{controls:['.modal-close','[data-action=settings-tab]','#settings-account [data-action=online-name]','[data-action=cloud-open]','[data-action=inbox-open]','[data-action=export]','[data-action=import]','#settings-account a'],body:['#settings-account .modal-intro'],labels:['#settings-account .setting-row','#settings-account small','#settings-account button','#settings-account a','.settings-tabs button']});
   await click('#settings-account [data-action=online-name]');await waitElement('#online-nickname');await delay(300);
   assert.equal(await evaluate('document.querySelectorAll(".profile-options .profile-option").length'),7);
   await assertReadableModal(width+'x'+height+' profile',{controls:['.modal-close','#online-nickname','.profile-options .profile-option','[data-action=online-name-save]'],body:['.modal-intro','#online-nickname'],labels:['.profile-name-label','.profile-choice-label','.profile-option','.modal-actions button']});
   await click('.modal-close');await click('.navigation-dock [data-nav=home]');await waitElement('[data-bk-screen-tab=command]');await click('[data-bk-screen-tab=command]');await delay(160);await click('[data-action=deck-analysis]');await waitElement('.deck-check-summary');await delay(300);
   await assertReadableModal(width+'x'+height+' deck analysis',{controls:['.modal-close','.modal-actions button'],body:['.modal-intro','.deck-check-note'],labels:['.deck-check-summary>div','.deck-curve>div>span','.modal-actions button']});
   assert.equal(await evaluate('(()=>{const curve=document.querySelector(".deck-curve");return curve.scrollHeight<=curve.clientHeight+2})()'),true,'The chart includes all bar labels without overflowing into the advice row');
   await click('.modal-close');
  }
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
 await runSummonSmoke();
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
 console.log('Layout smoke passed: entry, home, deck, collection, shop, rules, solo, practice, room, rank, details, battle and every chapter in both guides; eight desktop/mobile viewports including portrait touch landscape fallback; readable account workspaces, conflict/code/device pages and profile/settings/analysis dialogs; persistent original-art summons, motion-off, rerenders and creature removal on desktop/mobile');
 }
}catch(error){
 try{
  const diagnostic=await evaluate(`(()=>({pointer:window.__bkPointerProbe||null,selected:document.querySelector('.duel-help')?.dataset.selection,modal:document.querySelector('#modal-root .modal')?.getAttribute('aria-label'),units:[...document.querySelectorAll('.field-unit')].map(e=>({uid:e.dataset.uid,player:e.dataset.player,classes:e.className,rect:e.getBoundingClientRect().toJSON()})),viewport:layoutViewport()}))()`);
  await mkdir('artifacts/layout',{recursive:true});
  const cameraLayout=await cameraLayoutDiagnostic();
  await writeFile('artifacts/layout/failure.json',JSON.stringify({error:error.stack||String(error),exceptions,...diagnostic,cameraLayout},null,2));
  console.error('Browser failure diagnostics',JSON.stringify({exceptions,...diagnostic}));
 }catch{}
 try{
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await mkdir('artifacts/layout',{recursive:true});
  await writeFile('artifacts/layout/failure.png',Buffer.from(screenshot.data,'base64'));
 }catch{}
 throw error;
}finally{
 for(const p of pending.values())clearTimeout(p.timer);
 server.close();server.closeAllConnections();
 await stopSmokeChrome(browser);
}

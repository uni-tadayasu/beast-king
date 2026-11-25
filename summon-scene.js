/** Persistent, background-free relief summons. Only revealed field units and
 * their already-authorized artwork enter this presentation layer. Original RGB
 * pixels supply the creature; exact public mask assets or native image alpha
 * provide its contour. Battle rules, saves, and private artwork are not sent
 * to another service or a browser inference runtime. */
import {resolveSummonArt,computeSummonArtCrop,summonArtSourceFromBackground} from './summon-art.js?v=20261125-36';
import {freshBattleEvents} from './experience-fx.js?v=20261125-36';
import {createBattleCamera,projectBattlePoint,getBattleSlot} from './battle-camera.js?v=20261125-36';
import {createWebglBattleRenderer,createCanvasBattleRenderer} from './battle-renderer.js?v=20261125-36';
import {createForegroundExtractor} from './summon-foreground.js?v=20261125-36';
import {buildCreatureGeometry} from './summon-geometry.js?v=20261125-36';

const MAX_TEXTURES=16;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const identity=(owner,uid)=>owner+':'+uid;
const originColours={mountain:'#eac27f',river:'#7fd6ff',seed:'#cee896',grass:'#8ce5bc',flower:'#e9aaff',tree:'#b4e5a0',king:'#ffe4a2'};
export function snapshotSummons(game){
 if(!game||!Array.isArray(game.players)||game.players.length!==2)return null;
 return {active:game.active,turn:game.turn,log:(game.log||[]).slice(-256).map(({type,text,turn})=>({type,text,turn})),
  units:game.players.flatMap((p,owner)=>(p.field||[]).slice(0,4).filter(u=>u&&typeof u.uid==='string'&&typeof u.cardId==='string'&&u.hp>0).map(u=>({key:identity(owner,u.uid),owner,uid:u.uid,cardId:u.cardId,hp:u.hp,maxHp:u.maxHp,attack:u.attack,ready:!!u.ready})))};
}
export function summonChanges(before,next){
 if(!before||!next)return [];
 const prior=new Map(before.units.map(u=>[u.key,u]));
 const changes=[];
 for(const unit of next.units){
  const old=prior.get(unit.key);
  if(!old||old.cardId!==unit.cardId)changes.push({key:unit.key,kind:'summon'});
  else if(old.ready&&!unit.ready)changes.push({key:unit.key,kind:'attack'});
  else if(unit.hp<old.hp)changes.push({key:unit.key,kind:'damage'});
  else if(unit.attack>old.attack||unit.hp>old.hp||unit.maxHp>old.maxHp)changes.push({key:unit.key,kind:'heal'});
 }
 // Logs carry no target UID. A public spell makes the projection bases glow;
 // it must not invent a target or inspect a face-down gimmick's identity.
 if(freshBattleEvents(before.log,next.log).some(e=>['miracle','gimmick','fusion','shield'].includes(e.type)))changes.push({kind:'activate'});
 return changes;
}

const quadUV=[{u:0,v:0},{u:1,v:0},{u:1,v:1},{u:0,v:1}],quadIndices=[0,1,2,0,2,3];
const projected=(camera,x,y,z)=>projectBattlePoint(camera,{x,y,z});
function drawTable(renderer,camera){
 const b=camera.boardWorldBounds,c=camera.boardCorners;
 // The visible front edge and converging grid establish the low viewing angle.
 renderer.polygon([c[3],c[2],projected(camera,b.right,-.24,b.near),projected(camera,b.left,-.24,b.near)],{fill:[.015,.045,.075,.98],stroke:[.25,.60,.72,.8],lineWidth:1.5});
 renderer.polygon(c,{fill:[.018,.095,.13,.96],stroke:[.35,.85,.91,.8],lineWidth:1.6});
 for(let x=-4.8;x<=4.81;x+=1.2)renderer.line([projected(camera,x,.003,b.far),projected(camera,x,.003,b.near)],{stroke:[.20,.55,.64,.12]});
 for(let z=-3;z<=3.01;z+=.6)renderer.line([projected(camera,b.left,.003,z),projected(camera,b.right,.003,z)],{stroke:[.20,.55,.64,z===0?.38:.12]});
 const ring=Array.from({length:49},(_,i)=>{const a=i/48*Math.PI*2;return projected(camera,Math.cos(a)*1.3,.006,Math.sin(a)*.85);});
 renderer.line(ring,{stroke:[.34,.76,.84,.20],lineWidth:1.3});
 renderer.line([projected(camera,-.65,.008,0),projected(camera,.65,.008,0)],{stroke:[.65,.87,.87,.28]});
}
function drawGround(renderer,camera,slot,binding,glow){
 const active=binding?.element.classList.contains('selected')||binding?.element.classList.contains('targetable');
 const rarityColour=binding?.rarity==='GGR'?[1,.83,.44]:binding?.rarity==='GR'?[.82,.67,1]:null;
 const colour=active?[1,.84,.40]:rarityColour||binding?.accent||[.25,.64,.77];
 const corners=slot.cardCorners;
 renderer.polygon(corners.map(p=>({...p,y:p.y+3})),{fill:[0,0,0,.48]});
 renderer.polygon(corners,{fill:[.025,.10,.16,.94],stroke:[...colour,binding?.unit.ready ? .8 : .40],lineWidth:active?2.6:1.3});
 if(binding?.item.floorTexture)renderer.mesh(binding.item.floorTexture,corners,quadUV,quadIndices,{tint:[.76,.84,.89,.82],fade:false});
 renderer.polygon(corners,{fill:null,stroke:[...colour,active ? .95 : .6+glow*.35],lineWidth:active?2.4:1.3});
 if(binding){
  const ring=Array.from({length:33},(_,i)=>{const a=i/32*Math.PI*2;return projected(camera,slot.world.x+Math.cos(a)*.64,.04,slot.world.z+Math.sin(a)*.35);});
  renderer.polygon(ring,{fill:[...colour,.07+glow*.13],stroke:[...colour,.30+glow*.5],lineWidth:1.2+glow*1.3});
 }
}
function drawCreature(renderer,camera,slot,binding,pose){
 const {scale,lift,yaw,alpha}=pose,c=Math.cos(yaw),s=Math.sin(yaw),geometry=binding.item.geometry;
 const place=(v,back=false)=>{const x=v.x*slot.bodyWidth*scale,z=(back?-.025:v.z)*slot.bodyHeight*scale;
  return projected(camera,slot.world.x+x*c+z*s,slot.bodyBaseY+v.y*slot.bodyHeight*scale+lift,slot.world.z-x*s+z*c);};
 const points=geometry.vertices.map(v=>place(v)),back=geometry.vertices.map(v=>place(v,true));
 const shadow=Array.from({length:33},(_,i)=>{const a=i/32*Math.PI*2;return projected(camera,slot.world.x+Math.cos(a)*slot.bodyWidth*.35,.055,slot.world.z+Math.sin(a)*.22);});
 renderer.polygon(shadow,{fill:[0,.015,.025,.3*alpha]});
 if(renderer.kind==='canvas'){
  // The software path keeps the raised front and matte contour without
  // drawing the entire painting twice or degenerate side-wall UV triangles.
  for(const [a,b] of geometry.contourEdges)renderer.polygon([back[a],back[b],points[b],points[a]],{fill:[.07,.13,.17,.8*alpha]});
  renderer.mesh(binding.item.texture,points,geometry.uvs,geometry.indices,{tint:[1,1,1,alpha],fade:false});return;
 }
 // A narrow back and joined contour give the silhouette physical thickness.
 // The front uses real depth testing; transparent texels never occlude limbs.
 renderer.mesh(binding.item.texture,back,geometry.uvs,geometry.indices,{tint:[.62,.68,.73,alpha],fade:false,depthTest:true});
 const sidePoints=[],sideUV=[],sideIndices=[];
 for(const [a,b] of geometry.contourEdges){const k=sidePoints.length;sidePoints.push(back[a],back[b],points[b],points[a]);sideUV.push(geometry.uvs[a],geometry.uvs[b],geometry.uvs[b],geometry.uvs[a]);sideIndices.push(k,k+1,k+2,k,k+2,k+3);}
 if(sideIndices.length)renderer.mesh(binding.item.texture,sidePoints,sideUV,sideIndices,{tint:[.73,.79,.85,alpha],fade:false,depthTest:true});
 renderer.mesh(binding.item.texture,points,geometry.uvs,geometry.indices,{tint:[1,1,1,alpha],shades:binding.item.shades,fade:false,depthTest:true});
}

export function createSummonScene(options={}){
 const doc=options.document??globalThis.document,win=options.window??globalThis.window,getCard=options.getCard??(()=>null);
 if(!doc?.createElement||!win)return {sync(){},react(){},refresh(){},destroy(){}};
 let canvas=null,renderer=null,arena=null,snapshot=null,battleKey=null,bindings=[],frame=0,lastPaint=-Infinity,dirty=true,destroyed=false,active=false;
 let cameraCache=null;
 let foreground=null;
 let prefs={motion:true,intensity:'full'},activation=-Infinity,clock=()=>win.performance?.now?.()??Date.now();
 const reduced=win.matchMedia?.('(prefers-reduced-motion: reduce)'),textures=new Map(),loads=new Map(),instances=new Map(),offs=[];
 const on=(target,event,fn,opts)=>{target?.addEventListener?.(event,fn,opts);offs.push(()=>target?.removeEventListener?.(event,fn,opts));};
 const visible=()=>!doc.hidden&&doc.visibilityState!=='hidden';
 const moving=()=>prefs.motion!==false&&!reduced?.matches&&visible();
 const localRect=node=>{const rect=node.getBoundingClientRect();return win.BeastKingViewport?.toLocalRect(rect)||rect;};
 const schedule=()=>{dirty=true;if(!frame&&active&&visible()&&!destroyed)frame=win.requestAnimationFrame(paint);};
 const stop=()=>{if(frame)win.cancelAnimationFrame(frame);frame=0;};
 function unmark(){
  for(const b of bindings)if(b.slot?.dataset){for(const name of ['summonReady','summonFloorReady','summonState','summonMaskCoverage','summonMeshDepth'])delete b.slot.dataset[name];}
  for(const slot of arena?.querySelectorAll('[data-camera-placed]')||[]){delete slot.dataset.cameraPlaced;for(const name of ['x','y','w','h','label-h'])slot.style.removeProperty('--summon-'+name);}
  if(arena?.dataset)delete arena.dataset.battleCamera;
 }
 function init(){
  if(canvas)return !!renderer;
  canvas=doc.createElement('canvas');canvas.className='bk-summon-canvas';canvas.setAttribute('aria-hidden','true');canvas.setAttribute('role','presentation');
  try{renderer=createWebglBattleRenderer(canvas);}catch{renderer=null;}
  if(!renderer){canvas=doc.createElement('canvas');canvas.className='bk-summon-canvas';canvas.setAttribute('aria-hidden','true');try{renderer=createCanvasBattleRenderer(canvas);}catch{renderer=null;}}
  if(!renderer){canvas=null;return false;}
  // A lost GPU context retains the same transparent silhouettes in software.
  on(canvas,'webglcontextlost',event=>{event.preventDefault();stop();const old=canvas;canvas=doc.createElement('canvas');canvas.className='bk-summon-canvas';canvas.setAttribute('aria-hidden','true');renderer=createCanvasBattleRenderer(canvas);for(const item of textures.values()){item.texture=item.source?renderer?.upload(item.source):null;item.floorTexture=item.floorSource?renderer?.upload(item.floorSource):null;}if(arena&&renderer){old.replaceWith(canvas);arena.dataset.summonRenderer=renderer.kind;schedule();}else{old.remove();unmark();}});
  return true;
 }
 function loadImage(src){
  if(loads.has(src))return loads.get(src);
  const promise=new Promise((resolve,reject)=>{
   const img=new win.Image();img.decoding='async';const timeout=win.setTimeout(()=>{img.onload=img.onerror=null;reject(Error('image timeout'));},12000);
   img.onload=()=>{win.clearTimeout(timeout);resolve(img);};img.onerror=()=>{win.clearTimeout(timeout);reject(Error('image unavailable'));};img.src=src;
  });
  loads.set(src,promise);promise.catch(()=>{if(loads.get(src)===promise)loads.delete(src);});while(loads.size>6)loads.delete(loads.keys().next().value);return promise;
 }
 function cacheKey(art){return art.src+'|'+JSON.stringify(art.crop);}
 function evict(){
  const used=new Set(bindings.map(b=>b.artKey));
  for(const [key,item] of textures){if(used.has(key)||(!item.privateSource&&(textures.size<=MAX_TEXTURES||!item.done)))continue;if(item.texture)renderer?.release(item.texture);if(item.floorTexture)renderer?.release(item.floorTexture);if(item.privateSource)loads.delete(item.artSource);textures.delete(key);}
 }
 function requestArt(art){
  const key=cacheKey(art),cached=textures.get(key);
  if(cached&&!cached.failed)return cached;
  if(cached&&clock()-cached.failedAt<(cached.floorTexture?60000:5000))return cached;
  if(cached){if(cached.texture)renderer?.release(cached.texture);if(cached.floorTexture)renderer?.release(cached.floorTexture);textures.delete(key);}
  const url=new URL(art.src,doc.baseURI),privateSource=url.origin!==new URL(doc.baseURI).origin||!url.pathname.includes('/assets/');
  const item={done:false,texture:null,floorTexture:null,source:null,floorSource:null,geometry:null,aspect:1,privateSource,artSource:art.src};textures.set(key,item);
  loadImage(art.src).then(async img=>{
   if(destroyed||textures.get(key)!==item)return;
   const crop=computeSummonArtCrop(art,img.naturalWidth,img.naturalHeight);if(!crop)throw Error('invalid image crop');
   const source=doc.createElement('canvas'),limit=320,aspect=crop.width/crop.height;
   source.width=Math.round(aspect>=1?limit:limit*aspect);source.height=Math.round(aspect>=1?limit/aspect:limit);
   const ctx=source.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('image canvas unavailable');
   ctx.drawImage(img,crop.x,crop.y,crop.width,crop.height,0,0,source.width,source.height);
   item.floorSource=source;item.aspect=aspect;item.floorTexture=renderer?.upload(source);schedule();
   foreground??=createForegroundExtractor({window:win,document:doc,loadImage});
   const pixels=await foreground.extract(source,{art,baseUrl:doc.baseURI});
   if(destroyed||textures.get(key)!==item)return;
   const geometry=buildCreatureGeometry(pixels,{grid:renderer?.kind==='canvas'?12:24});
   if(!geometry)throw Error('creature outline unavailable');
   const body=doc.createElement('canvas');body.width=pixels.width;body.height=pixels.height;
   const bodyContext=body.getContext('2d');if(!bodyContext)throw Error('creature canvas unavailable');
   const imageData=bodyContext.createImageData(pixels.width,pixels.height);imageData.data.set(pixels.data);bodyContext.putImageData(imageData,0,0);
   item.source=body;item.geometry=geometry;item.shades=geometry.normals.map(n=>clamp(.88+.18*(n.x*-.3+n.y*.4+n.z*.86),.83,1.09));item.aspect=geometry.aspect;item.texture=renderer?.upload(body);item.done=true;evict();schedule();
  }).catch(()=>{if(textures.get(key)!==item)return;item.done=true;item.failed=true;item.failedAt=clock();schedule();});return item;
 }
 function captureBindings(){
  if(!arena)return;
  const current=[];
  for(const element of arena.querySelectorAll('.field-unit[data-card-id][data-uid]')){
   const key=identity(Number(element.dataset.player),element.dataset.uid),unit=instances.get(key);if(!unit||unit.cardId!==element.dataset.cardId)continue;
   const anchor=element.querySelector('.summon-anchor'),artElement=element.querySelector('.card-art');if(!anchor||!artElement)continue;
   const src=summonArtSourceFromBackground(win.getComputedStyle(artElement).backgroundImage),card=getCard(unit.cardId),art=resolveSummonArt(card,{sourceOverride:src,baseUrl:doc.baseURI});
   const slot=element.closest('.field-slot');if(!art){if(slot?.dataset){delete slot.dataset.summonReady;delete slot.dataset.summonFloorReady;delete slot.dataset.summonState;}continue;}
   const item=requestArt(art),artKey=cacheKey(art),colour=originColours[card.element]||originColours.flower;
   current.push({key,unit,element,anchor,slot,index:Number(slot?.dataset.slot)||0,item,artKey,colour,rarity:card.rarity,accent:[1,3,5].map(i=>parseInt(colour.slice(i,i+2),16)/255)});
  }
  bindings=current;evict();
 }
 function measure(){
  if(!arena||!renderer)return null;
  const rect=localRect(arena),width=arena.clientWidth,height=arena.clientHeight;if(!width||!height||!rect.width||!rect.height)return null;
  const dpr=Math.min(win.devicePixelRatio||1,1.6,Math.sqrt(2000000/(width*height))),w=Math.max(1,Math.round(width*dpr)),h=Math.max(1,Math.round(height*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  return {rect,width,height,sx:width/rect.width,sy:height/rect.height};
 }
 function cameraLayout(m){
  const rows=[...arena.querySelectorAll(':scope > .field-row[data-owner]')];if(rows.length!==2)return null;
  const rects=rows.map(row=>{const r=localRect(row);return {row,x:(r.x-m.rect.x)*m.sx,y:(r.y-m.rect.y)*m.sy,width:r.width*m.sx,height:r.height*m.sy};});
  const left=Math.max(...rects.map(r=>r.x)),right=Math.min(...rects.map(r=>r.x+r.width)),top=Math.min(...rects.map(r=>r.y)),bottom=Math.max(...rects.map(r=>r.y+r.height));
  if(right-left<80||bottom-top<70)return null;
  const cameraRect={x:left+3,y:top+3,width:right-left-6,height:bottom-top-6},cameraKey=Object.values(cameraRect).map(n=>n.toFixed(2)).join('|');
  if(cameraCache?.key!==cameraKey)cameraCache={key:cameraKey,value:createBattleCamera(cameraRect)};
  const camera=cameraCache.value,slots=[];
  const bindingBySlot=new Map(bindings.map(b=>[b.slot,b]));
  for(const r of rects)for(const element of r.row.querySelectorAll(':scope > .field-slot')){
   const binding=bindingBySlot.get(element),owner=Number(element.dataset.owner),index=Number(element.dataset.slot),slot=getBattleSlot(camera,owner,index,binding?.item.aspect||1);
   const vars={x:slot.hitBounds.x-r.x,y:slot.hitBounds.y-r.y,w:slot.hitBounds.width,h:slot.hitBounds.height,'label-h':camera.labelHeight};
   for(const [key,value] of Object.entries(vars)){const text=value.toFixed(2)+'px';if(element.style.getPropertyValue('--summon-'+key)!==text)element.style.setProperty('--summon-'+key,text);}
   if(element.dataset.cameraPlaced!=='true')element.dataset.cameraPlaced='true';
   slots.push({slot,binding,element});
  }
  canvas.dataset.cameraElevation=String(camera.elevationDeg);canvas.dataset.cameraBodyHeight=String(camera.bodyHeight);canvas.dataset.cameraRectHeight=String(camera.rect.height);return {camera,slots};
 }
 function poseFor(binding,now,animate){
  const phase=binding.unit.phase||0,age=now-binding.unit.at;
  let scale=1,lift=animate?Math.sin(now*.0017+phase)*.035:0,glow=0,alpha=1;
  if(animate&&age<640){const t=clamp(age/640,0,1),pulse=Math.sin(t*Math.PI);
   if(binding.unit.cue==='summon'){scale=.84+.16*(1-Math.pow(1-t,3));lift-=.15*(1-t);alpha=.25+.75*t;glow=pulse;}
   else if(binding.unit.cue==='attack'){lift+=.20*pulse;scale=1+.055*pulse;glow=.5*pulse;}
   else if(binding.unit.cue==='damage'){lift+=Math.sin(t*32)*.035*(1-t);glow=.35*pulse;}
   else if(binding.unit.cue==='heal')glow=.7*pulse;
  }
  if(animate&&now-activation<900)glow=Math.max(glow,Math.sin(clamp((now-activation)/900,0,1)*Math.PI)*.65);
  const yaw=(binding.unit.owner===0?-.10:.10)+(animate?Math.sin(now*.0007+phase)*.065:0);
  return {scale,lift,glow,alpha,yaw};
 }
 function paint(now){
  frame=0;if(!active||destroyed||!visible()||!renderer||!arena?.isConnected)return;
  const animate=moving(),period=prefs.intensity==='subtle'||renderer.kind==='canvas'?66:33;
  if(!dirty&&now-lastPaint<period){if(animate)frame=win.requestAnimationFrame(paint);return;}
  dirty=false;lastPaint=now;const m=measure();if(!m)return;
  renderer.begin(m.width,m.height);const layout=cameraLayout(m);if(!layout)return;
  const {camera,slots}=layout;drawTable(renderer,camera);let count=0;
  const poses=new Map();
  for(const item of slots){
   if(item.binding){poses.set(item.binding,poseFor(item.binding,now,animate));item.element.dataset.summonState=item.binding.item.failed?'unavailable':item.binding.item.texture?'ready':'preparing';}
   // Readiness belongs to the current artwork, including a replacement that
   // is still loading or has failed. Keep its DOM card visible until the
   // current floor texture can actually be drawn.
   if(item.binding?.item.floorTexture)item.element.dataset.summonFloorReady='true';else delete item.element.dataset.summonFloorReady;
   drawGround(renderer,camera,item.slot,item.binding,poses.get(item.binding)?.glow||0);
  }
  for(const {slot,binding,element} of slots.sort((a,b)=>b.slot.owner-a.slot.owner)){
   if(!binding?.item.texture){delete element.dataset.summonReady;continue;}
   drawCreature(renderer,camera,slot,binding,poses.get(binding));element.dataset.summonReady='true';
   element.dataset.summonMaskCoverage=(binding.item.geometry.opaquePixels/(binding.item.source.width*binding.item.source.height)).toFixed(4);
   element.dataset.summonMeshDepth=String(binding.item.geometry.thickness);count++;
  }
  canvas.dataset.summonCount=String(count);canvas.dataset.summonForeground='transparent';canvas.dataset.summonMotion=animate?'on':'off';
  if(animate&&bindings.length)frame=win.requestAnimationFrame(paint);
 }
 function sync(game,next={}){
  if(destroyed)return;
  prefs={motion:next.motion??prefs.motion,intensity:next.intensity??prefs.intensity};const state=snapshotSummons(game),newArena=state?doc.querySelector('.duel-shell .arena'):null;
  if(!state||!newArena||next.enabled===false){active=false;stop();unmark();bindings=[];evict();for(const [id,item] of textures)if(!item.done){if(item.floorTexture)renderer?.release(item.floorTexture);textures.delete(id);}foreground?.destroy();foreground=null;instances.clear();snapshot=null;battleKey=null;activation=-Infinity;if(arena?.dataset)delete arena.dataset.summonRenderer;canvas?.remove();arena=null;return;}
  const key=next.key??game,newBattle=battleKey!==key||!snapshot,changes=newBattle?[]:summonChanges(snapshot,state),now=clock();
  if(newBattle){instances.clear();activation=-Infinity;}battleKey=key;snapshot=state;
  const alive=new Set(state.units.map(u=>u.key));for(const id of instances.keys())if(!alive.has(id))instances.delete(id);
  for(const u of state.units){const prior=instances.get(u.key);instances.set(u.key,{...u,phase:prior?.phase??Array.from(u.uid).reduce((sum,c)=>sum+c.charCodeAt(0),u.owner*17),cue:prior?.cue||'',at:prior?.at??-Infinity});}
  if(moving())for(const change of changes){if(change.kind==='activate')activation=now;else{const unit=instances.get(change.key);if(unit){unit.cue=change.kind;unit.at=now;}}}
  active=true;if(!init())return;
  if(arena!==newArena){if(arena?.dataset)delete arena.dataset.summonRenderer;arena=newArena;arena.appendChild(canvas);resize?.disconnect();resize?.observe(arena);for(const row of arena.querySelectorAll(':scope > .field-row'))resize?.observe(row);}
  arena.dataset.summonRenderer=renderer.kind;arena.dataset.battleCamera='angled';captureBindings();schedule();
 }
 const resize=typeof win.ResizeObserver==='function'?new win.ResizeObserver(schedule):null;
 on(win,'resize',schedule,{passive:true});on(win,'beastking:viewport',schedule);on(win,'bk-fit-card-metrics',schedule);on(win,'bk-battle-layout',schedule);
 on(doc,'visibilitychange',()=>{if(!visible()){stop();activation=-Infinity;for(const unit of instances.values())unit.at=-Infinity;}else schedule();});
 on(win,'pagehide',stop);on(win,'pageshow',schedule);on(reduced,'change',schedule);
 return {sync,
  react(kind,{uid,player=0}={}){const unit=instances.get(identity(player,uid));if(unit&&moving()){unit.cue=kind;unit.at=clock();schedule();}},
  refresh(){captureBindings();schedule();},
  destroy(){if(destroyed)return;destroyed=true;active=false;stop();unmark();for(const off of offs)off();resize?.disconnect();foreground?.destroy();renderer?.destroy();canvas?.remove();if(arena?.dataset)delete arena.dataset.summonRenderer;textures.clear();loads.clear();instances.clear();bindings=[];snapshot=null;arena=null;}
 };
}

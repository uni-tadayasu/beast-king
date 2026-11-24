/** Persistent illustration-faithful relief summons. Only the public field and
 * each card's already-authorized painting enter this presentation layer.
 * The original pixels are retained; there is no guessed animal silhouette,
 * recoloured replacement, hidden-card lookup, or change to battle/save state. */
import {resolveSummonArt,computeSummonArtCrop,summonArtSourceFromBackground} from './summon-art.js?v=20261125-33';
import {freshBattleEvents} from './experience-fx.js?v=20261125-33';

const MAX_TEXTURES=16, GRID=28;
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

/** A shallow curved surface keeps the whole approved image, including wings
 * and horns at its edges. It never tries to infer an unseen back/side view. */
function reliefMesh(){
 const vertices=[],indices=[];
 for(let y=0;y<=GRID;y++)for(let x=0;x<=GRID;x++){
  const u=x/GRID,v=y/GRID,arch=Math.sin(u*Math.PI)*Math.sin(v*Math.PI);
  vertices.push(u-.5,.5-v,arch*.16,u,v);
 }
 for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++){
  const a=y*(GRID+1)+x,b=a+1,c=a+GRID+1,d=c+1;indices.push(a,c,b,b,c,d);
 }
 return {vertices:new Float32Array(vertices),indices:new Uint16Array(indices)};
}

const VERTEX=`attribute vec3 aPosition;
attribute vec2 aUV;
uniform vec2 uResolution,uCenter,uSize;
uniform float uYaw,uLift,uScale;
varying vec2 vUV;
varying float vDepth;
void main(){
 float c=cos(uYaw),s=sin(uYaw);
 vec3 p=vec3(aPosition.x*c+aPosition.z*s,aPosition.y,-aPosition.x*s+aPosition.z*c);
 float perspective=1.0/(1.0-p.z*.20);
 vec2 pixel=uCenter+vec2(p.x,-p.y)*uSize*perspective*uScale+vec2(0.0,-uLift);
 gl_Position=vec4(pixel/uResolution*vec2(2.0,-2.0)+vec2(-1.0,1.0),-p.z*.2,1.0);
 vUV=aUV;vDepth=aPosition.z;
}`;
const FRAGMENT=`precision mediump float;
uniform sampler2D uImage;
uniform float uGlow,uAlpha;
uniform vec3 uAccent;
varying vec2 vUV;
varying float vDepth;
void main(){
 vec4 tex=texture2D(uImage,vUV);
 // Preserve all of the painting. Only the final antialiased pixel fades.
 float edge=min(min(vUV.x,1.0-vUV.x),min(vUV.y,1.0-vUV.y));
 float alpha=tex.a*smoothstep(0.0,.006,edge)*uAlpha;
 vec3 paint=tex.rgb*(.96+.04*vDepth/.16);
 paint+=uAccent*uGlow*.20+vec3(pow(max(0.0,vDepth/.16),6.0)*.025);
 gl_FragColor=vec4(paint,alpha);
}`;

function webglRenderer(canvas){
 const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:true,depth:false,preserveDrawingBuffer:false,powerPreference:'low-power'});
 if(!gl)return null;
 const shaders=[];
 function shader(type,source){const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('summon shader');return s;}
 let program;
 try{program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,VERTEX));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,FRAGMENT));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('summon program');}
 catch{for(const s of shaders)gl.deleteShader(s);if(program)gl.deleteProgram(program);return null;}
 for(const s of shaders)gl.deleteShader(s);
 const geometry=reliefMesh(),vbo=gl.createBuffer(),ibo=gl.createBuffer();
 gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,geometry.vertices,gl.STATIC_DRAW);
 gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,geometry.indices,gl.STATIC_DRAW);
 const loc={};for(const name of ['uResolution','uCenter','uSize','uYaw','uLift','uScale','uGlow','uAlpha','uAccent','uImage'])loc[name]=gl.getUniformLocation(program,name);
 const position=gl.getAttribLocation(program,'aPosition'),uv=gl.getAttribLocation(program,'aUV');
 const textures=new Set();
 return {kind:'webgl',
  upload(source){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);textures.add(t);return t;},
  release(texture){gl.deleteTexture(texture);textures.delete(texture);},
  begin(width,height){gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,3,gl.FLOAT,false,20,0);gl.enableVertexAttribArray(uv);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,20,12);gl.uniform2f(loc.uResolution,width,height);gl.uniform1i(loc.uImage,0);},
  draw(texture,p){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform2f(loc.uCenter,p.x,p.y);gl.uniform2f(loc.uSize,p.width,p.height);gl.uniform1f(loc.uYaw,p.yaw);gl.uniform1f(loc.uLift,p.lift);gl.uniform1f(loc.uScale,p.scale);gl.uniform1f(loc.uGlow,p.glow);gl.uniform1f(loc.uAlpha,p.alpha);gl.uniform3fv(loc.uAccent,p.accent);gl.drawElements(gl.TRIANGLES,geometry.indices.length,gl.UNSIGNED_SHORT,0);},
  destroy(){for(const t of textures)gl.deleteTexture(t);textures.clear();gl.deleteBuffer(vbo);gl.deleteBuffer(ibo);gl.deleteProgram(program);}
 };
}

/** The same original image remains visible without WebGL. The fallback uses
 * narrow image strips for restrained perspective, not a substitute creature. */
function canvasRenderer(canvas){
 const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)return null;
 let ratio=1;
 return {kind:'canvas',upload:source=>source,release(){},
  begin(w){ratio=canvas.width/w;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,canvas.width/ratio,canvas.height/ratio);},
  draw(texture,p){
   ctx.save();ctx.translate(p.x,p.y-p.lift);ctx.scale(p.scale,p.scale);ctx.globalAlpha=p.alpha;
   ctx.shadowColor=p.glow>.1?'rgba('+p.accent.map(c=>Math.round(c*255)).join(',')+',.8)':'rgba(0,0,0,.65)';ctx.shadowBlur=p.glow>.1?12:5;
   const strips=16,sw=texture.width/strips,cos=Math.cos(p.yaw),sin=Math.sin(p.yaw);
   for(let i=0;i<strips;i++){const u=(i+.5)/strips-.5,curve=Math.sin((u+.5)*Math.PI)*.06,z=-u*sin+curve*cos,per=1/(1-z*.20);const x=(u*cos+curve*sin)*p.width*per,w=p.width/strips*cos*per+.55,h=p.height*per;ctx.drawImage(texture,i*sw,0,sw,texture.height,x-w/2,-h/2,w,h);ctx.shadowBlur=0;}
   ctx.restore();
  },destroy(){}
 };
}

export function createSummonScene(options={}){
 const doc=options.document??globalThis.document,win=options.window??globalThis.window,getCard=options.getCard??(()=>null);
 if(!doc?.createElement||!win)return {sync(){},react(){},destroy(){}};
 let canvas=null,renderer=null,arena=null,snapshot=null,battleKey=null,bindings=[],frame=0,lastPaint=-Infinity,dirty=true,destroyed=false,active=false;
 let prefs={motion:true,intensity:'full'},activation=-Infinity,clock=()=>win.performance?.now?.()??Date.now();
 const reduced=win.matchMedia?.('(prefers-reduced-motion: reduce)'),textures=new Map(),loads=new Map(),instances=new Map(),offs=[];
 const on=(target,event,fn,opts)=>{target?.addEventListener?.(event,fn,opts);offs.push(()=>target?.removeEventListener?.(event,fn,opts));};
 const visible=()=>!doc.hidden&&doc.visibilityState!=='hidden';
 const moving=()=>prefs.motion!==false&&!reduced?.matches&&visible();
 const localRect=node=>{const rect=node.getBoundingClientRect();return win.BeastKingViewport?.toLocalRect(rect)||rect;};
 const schedule=()=>{dirty=true;if(!frame&&active&&visible()&&!destroyed)frame=win.requestAnimationFrame(paint);};
 const stop=()=>{if(frame)win.cancelAnimationFrame(frame);frame=0;};
 function unmark(){for(const b of bindings)if(b.slot?.dataset)delete b.slot.dataset.summonReady;}
 function init(){
  if(canvas)return !!renderer;
  canvas=doc.createElement('canvas');canvas.className='bk-summon-canvas';canvas.setAttribute('aria-hidden','true');canvas.setAttribute('role','presentation');
  try{renderer=webglRenderer(canvas);}catch{renderer=null;}
  if(!renderer){canvas=doc.createElement('canvas');canvas.className='bk-summon-canvas';canvas.setAttribute('aria-hidden','true');try{renderer=canvasRenderer(canvas);}catch{renderer=null;}}
  if(!renderer){canvas=null;return false;}
  // A lost GPU context degrades to the original-image software projection.
  on(canvas,'webglcontextlost',event=>{event.preventDefault();stop();const old=canvas;canvas=doc.createElement('canvas');canvas.className='bk-summon-canvas';canvas.setAttribute('aria-hidden','true');renderer=canvasRenderer(canvas);for(const item of textures.values())item.texture=renderer?.upload(item.source);if(arena&&renderer){old.replaceWith(canvas);arena.dataset.summonRenderer=renderer.kind;schedule();}else{old.remove();unmark();}});
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
  for(const [key,item] of textures){if(textures.size<=MAX_TEXTURES)break;if(used.has(key)||!item.done)continue;if(item.texture)renderer?.release(item.texture);textures.delete(key);}
 }
 function requestArt(art){
  const key=cacheKey(art),cached=textures.get(key);
  if(cached&&!cached.failed)return cached;
  if(cached&&clock()-cached.failedAt<5000)return cached;
  if(cached)textures.delete(key);
  const item={done:false,texture:null,source:null,aspect:1};textures.set(key,item);
  loadImage(art.src).then(img=>{
   if(destroyed||textures.get(key)!==item)return;
   const crop=computeSummonArtCrop(art,img.naturalWidth,img.naturalHeight);if(!crop)throw Error('invalid image crop');
   const source=doc.createElement('canvas'),limit=320,aspect=crop.width/crop.height;
   source.width=Math.round(aspect>=1?limit:limit*aspect);source.height=Math.round(aspect>=1?limit/aspect:limit);
   const ctx=source.getContext('2d');if(!ctx)throw Error('image canvas unavailable');
   ctx.drawImage(img,crop.x,crop.y,crop.width,crop.height,0,0,source.width,source.height);
   item.source=source;item.aspect=aspect;item.texture=renderer?.upload(source);item.done=true;evict();schedule();
  }).catch(()=>{item.done=true;item.failed=true;item.failedAt=clock();schedule();});return item;
 }
 function captureBindings(){
  if(!arena)return;
  const current=[];
  for(const element of arena.querySelectorAll('.field-unit[data-card-id][data-uid]')){
   const key=identity(Number(element.dataset.player),element.dataset.uid),unit=instances.get(key);if(!unit||unit.cardId!==element.dataset.cardId)continue;
   const anchor=element.querySelector('.summon-anchor'),artElement=element.querySelector('.card-art');if(!anchor||!artElement)continue;
   const src=summonArtSourceFromBackground(win.getComputedStyle(artElement).backgroundImage),card=getCard(unit.cardId),art=resolveSummonArt(card,{sourceOverride:src,baseUrl:doc.baseURI});
   const slot=element.closest('.field-slot');if(!art){if(slot?.dataset)delete slot.dataset.summonReady;continue;}
   const item=requestArt(art),artKey=cacheKey(art),colour=originColours[card.element]||originColours.flower;
   current.push({key,unit,element,anchor,slot,item,artKey,colour,accent:[1,3,5].map(i=>parseInt(colour.slice(i,i+2),16)/255)});
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
 function paint(now){
  frame=0;if(!active||destroyed||!visible()||!renderer||!arena?.isConnected)return;
  const animate=moving(),period=prefs.intensity==='subtle'||renderer.kind==='canvas'?66:33;
  if(!dirty&&now-lastPaint<period){if(animate)frame=win.requestAnimationFrame(paint);return;}
  dirty=false;lastPaint=now;const m=measure();if(!m)return;
  renderer.begin(m.width,m.height);let count=0;
  for(const b of bindings){
   if(!b.anchor.isConnected||!b.item.texture){if(b.slot?.dataset)delete b.slot.dataset.summonReady;continue;}
   const r=localRect(b.anchor),aw=r.width*m.sx,ah=r.height*m.sy;if(aw<2||ah<2)continue;
   const h=Math.min(ah,aw/b.item.aspect),w=h*b.item.aspect,phase=(b.unit.phase||0),age=now-b.unit.at;
   let scale=1,lift=animate?Math.sin(now*.0017+phase)*Math.min(2.5,h*.015):0,glow=0,alpha=1;
   if(animate&&age<640){const t=clamp(age/640,0,1),pulse=Math.sin(t*Math.PI);
    if(b.unit.cue==='summon'){scale=.88+.12*(1-Math.pow(1-t,3));lift-=h*.12*(1-t);alpha=.25+.75*t;glow=pulse;}
    else if(b.unit.cue==='attack'){lift+=h*.09*pulse;scale=1+.055*pulse;glow=.5*pulse;}
    else if(b.unit.cue==='damage'){lift+=Math.sin(t*32)*2*(1-t);glow=.35*pulse;}
    else if(b.unit.cue==='heal')glow=.7*pulse;
   }
   if(animate&&now-activation<900)glow=Math.max(glow,Math.sin(clamp((now-activation)/900,0,1)*Math.PI)*.65);
   const yaw=(b.unit.owner===0?-.055:.055)+(animate?Math.sin(now*.0007+phase)*.055:0);
   renderer.draw(b.item.texture,{x:(r.x-m.rect.x)*m.sx+aw/2,y:(r.y-m.rect.y)*m.sy+ah-h/2,width:w,height:h,yaw,lift,scale,glow,alpha,accent:b.accent});
   b.slot.dataset.summonReady='true';count++;
  }
  canvas.dataset.summonCount=String(count);canvas.dataset.summonMotion=animate?'on':'off';
  if(animate&&bindings.length)frame=win.requestAnimationFrame(paint);
 }
 function sync(game,next={}){
  if(destroyed)return;
  prefs={motion:next.motion??prefs.motion,intensity:next.intensity??prefs.intensity};const state=snapshotSummons(game),newArena=state?doc.querySelector('.duel-shell .arena'):null;
  if(!state||!newArena||next.enabled===false){active=false;stop();unmark();bindings=[];instances.clear();snapshot=null;battleKey=null;activation=-Infinity;if(arena?.dataset)delete arena.dataset.summonRenderer;canvas?.remove();arena=null;return;}
  const key=next.key??game,newBattle=battleKey!==key||!snapshot,changes=newBattle?[]:summonChanges(snapshot,state),now=clock();
  if(newBattle){instances.clear();activation=-Infinity;}battleKey=key;snapshot=state;
  const alive=new Set(state.units.map(u=>u.key));for(const id of instances.keys())if(!alive.has(id))instances.delete(id);
  for(const u of state.units){const prior=instances.get(u.key);instances.set(u.key,{...u,phase:prior?.phase??Array.from(u.uid).reduce((sum,c)=>sum+c.charCodeAt(0),u.owner*17),cue:prior?.cue||'',at:prior?.at??-Infinity});}
  if(moving())for(const change of changes){if(change.kind==='activate')activation=now;else{const unit=instances.get(change.key);if(unit){unit.cue=change.kind;unit.at=now;}}}
  active=true;if(!init())return;
  if(arena!==newArena){if(arena?.dataset)delete arena.dataset.summonRenderer;arena=newArena;arena.appendChild(canvas);resize?.disconnect();resize?.observe(arena);}
  arena.dataset.summonRenderer=renderer.kind;captureBindings();schedule();
 }
 const resize=typeof win.ResizeObserver==='function'?new win.ResizeObserver(schedule):null;
 on(win,'resize',schedule,{passive:true});on(win,'beastking:viewport',schedule);on(win,'bk-fit-card-metrics',schedule);
 on(doc,'visibilitychange',()=>{if(!visible()){stop();activation=-Infinity;for(const unit of instances.values())unit.at=-Infinity;}else schedule();});
 on(win,'pagehide',stop);on(win,'pageshow',schedule);on(reduced,'change',schedule);
 return {sync,
  react(kind,{uid,player=0}={}){const unit=instances.get(identity(player,uid));if(unit){unit.cue=kind;unit.at=clock();schedule();}},
  refresh(){captureBindings();schedule();},
  destroy(){if(destroyed)return;destroyed=true;active=false;stop();unmark();for(const off of offs)off();resize?.disconnect();renderer?.destroy();canvas?.remove();if(arena?.dataset)delete arena.dataset.summonRenderer;textures.clear();loads.clear();instances.clear();bindings=[];snapshot=null;arena=null;}
 };
}

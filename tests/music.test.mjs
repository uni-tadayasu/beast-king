import test from 'node:test';
import assert from 'node:assert/strict';
import {createMusicController} from '../music.js';

const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
class FakeAudio extends EventTarget {
  constructor(scene){super();this.scene=scene;this.paused=true;this.currentTime=0;this.volume=1;this.muted=false;this.playCalls=0;this.pauseCalls=0;this.loadCalls=0;this.attributes=new Map();this.requests=[];this.plans=[];this.removed=false;}
  setAttribute(k,v){this.attributes.set(k,v);}
  removeAttribute(k){this.attributes.delete(k);if(k==='src')this.src=undefined;}
  play(){
    this.playCalls++;const plan=this.plans.shift()||'resolve';
    if(plan==='throw'){const error=new Error('unsupported');error.name='NotSupportedError';throw error;}
    if(plan==='reject'){const error=new Error('gesture required');error.name='NotAllowedError';return Promise.reject(error);}
    if(plan==='pending') {
      let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});
      this.requests.push({resolve:()=>{this.paused=false;this.dispatchEvent(new Event('playing'));resolve();},reject:error=>{this.paused=true;reject(error);}});
      return promise;
    }
    this.paused=false;this.dispatchEvent(new Event('playing'));return Promise.resolve();
  }
  pause(){this.pauseCalls++;const changed=!this.paused;this.paused=true;if(changed)this.dispatchEvent(new Event('pause'));}
  load(){this.loadCalls++;}
  remove(){this.removed=true;}
}
class FakeDocument extends EventTarget {
  constructor(){super();this.hidden=false;this.visibilityState='visible';this.children=[];this.body={appendChild:a=>this.children.push(a)};}
  visibility(hidden){this.hidden=hidden;this.visibilityState=hidden?'hidden':'visible';this.dispatchEvent(new Event('visibilitychange'));}
}
function setup(options={}) {
  const doc=new FakeDocument(),win=new EventTarget(),audios={},states=[];
  const controller=createMusicController({document:doc,window:win,createAudio:scene=>(audios[scene]=new FakeAudio(scene)),onstate:s=>states.push(s),...options});
  return {controller,doc,win,audios,states};
}
function fakeContext() {
  const ctx=new EventTarget();ctx.state='suspended';ctx.currentTime=0;ctx.destination={};ctx.resumeCalls=0;ctx.closeCalls=0;ctx.sources=[];
  ctx.gain={gain:{value:1,setValueAtTime(v){this.value=v;}},connect(){},disconnect(){}};
  ctx.createGain=()=>ctx.gain;
  ctx.createMediaElementSource=audio=>{const source={audio,connect(){},disconnect(){}};ctx.sources.push(source);return source;};
  ctx.resume=()=>{ctx.resumeCalls++;ctx.state='running';ctx.dispatchEvent(new Event('statechange'));return Promise.resolve();};
  ctx.close=()=>{ctx.closeCalls++;ctx.state='closed';return Promise.resolve();};
  return ctx;
}

test('four persistent DOM audio elements are configured without eagerly loading or autoplaying',()=>{
  const {controller,doc,audios}=setup();
  assert.equal(doc.children.length,4);
  assert.deepEqual(Object.keys(audios),['menu','battle','battle-event','battle-danger']);
  for(const [scene,audio] of Object.entries(audios)) {
    assert.equal(audio.id,`beastking-bgm-${scene}`);assert.equal(audio.attributes.get('data-scene'),scene);
    assert.equal(audio.loop,true);assert.equal(audio.preload,'none');assert.equal(audio.hidden,true);assert.equal(audio.autoplay,false);
    assert.equal(audio.src,`assets/audio/${scene}.mp3`);assert.equal(audio.playCalls,0);assert.equal(audio.loadCalls,0);
  }
  assert.equal(controller.getState().volume,.5);assert.equal(controller.getState().enabled,true);assert.equal(controller.getState().unlocked,false);
});

test('unlock starts current scene; repeated renders preserve position and do not call play again',async()=>{
  const {controller,audios,states}=setup();
  controller.sync({scene:'menu',enabled:true,volume:.5,visible:true});assert.equal(audios.menu.playCalls,0);
  controller.unlock();await flush();assert.equal(controller.getState().playing,true);audios.menu.currentTime=27.5;
  const before=states.length;
  for(let i=0;i<10;i++)controller.sync({scene:'menu',enabled:true,volume:.5,visible:true});
  assert.equal(audios.menu.playCalls,1);assert.equal(audios.menu.currentTime,27.5);assert.equal(states.length,before);
});

test('danger, event battle, regular battle and menu switch exclusively and remember all four positions',async()=>{
  const {controller,audios,states}=setup();
  for(const audio of Object.values(audios)){
    const original=audio.play.bind(audio);
    audio.play=()=>{for(const other of Object.values(audios))if(other!==audio)assert.equal(other.paused,true,'pause every other track before play');return original();};
  }
  controller.unlock();await flush();audios.menu.currentTime=19;
  controller.sync({scene:'battle'});await flush();audios.battle.currentTime=42;
  controller.sync({scene:'battle-event'});await flush();audios['battle-event'].currentTime=31;
  for(let i=0;i<5;i++)controller.sync({scene:'battle-event'});
  assert.equal(audios['battle-event'].playCalls,1);assert.equal(audios['battle-event'].currentTime,31);
  controller.sync({scene:'battle-danger',volume:.37});await flush();audios['battle-danger'].currentTime=13;
  assert.equal(controller.getState().scene,'battle-danger');assert.equal(states.at(-1).scene,'battle-danger');assert.equal(states.at(-1).playing,true);
  for(let i=0;i<5;i++)controller.sync({scene:'battle-danger'});
  assert.equal(audios['battle-danger'].playCalls,1);assert.equal(audios['battle-danger'].currentTime,13);
  controller.sync({scene:'battle-event'});await flush();assert.equal(audios['battle-danger'].paused,true);assert.equal(audios['battle-event'].currentTime,31);
  controller.sync({scene:'menu'});await flush();assert.equal(audios['battle-event'].paused,true);assert.equal(audios.menu.currentTime,19);
  controller.sync({scene:'battle'});await flush();assert.equal(audios.battle.currentTime,42);
  controller.sync({scene:'battle-danger'});await flush();assert.equal(audios['battle-danger'].currentTime,13);
  for(const audio of Object.values(audios))assert.equal(audio.volume,.37);
});

test('disabled audio stays stopped even after unlock; volume zero is muted without rewinding',async()=>{
  const {controller,audios}=setup();controller.sync({enabled:false});controller.unlock();await flush();assert.equal(audios.menu.playCalls,0);
  controller.sync({enabled:true});await flush();audios.menu.currentTime=8;
  controller.sync({volume:0});assert.equal(audios.menu.muted,true);assert.equal(audios.menu.volume,0);assert.equal(audios.menu.paused,false);assert.equal(audios.menu.currentTime,8);
  controller.sync({enabled:false});await flush();assert.equal(audios.menu.paused,true);assert.equal(controller.getState().status,'off');
  controller.sync({volume:1.8});assert.equal(controller.getState().volume,1);
  controller.sync({volume:-10});assert.equal(controller.getState().volume,0);
  controller.sync({volume:NaN});assert.equal(controller.getState().volume,0);
});

test('autoplay rejection is handled and retried only on a fresh gesture or meaningful configuration change',async()=>{
  for(const scene of ['menu','battle','battle-event','battle-danger']){
    const {controller,audios}=setup(),audio=audios[scene];controller.sync({scene});audio.plans.push('reject');controller.unlock();await flush();
    assert.equal(controller.getState().blocked,true);assert.equal(controller.getState().status,'blocked');assert.equal(audio.paused,true);
    controller.sync({scene,enabled:true,volume:.5,visible:true});controller.sync({volume:.4});await flush();assert.equal(audio.playCalls,1);
    controller.unlock();await flush();assert.equal(audio.playCalls,2);assert.equal(controller.getState().playing,true);assert.equal(controller.getState().blocked,false);assert.equal(controller.getState().scene,scene);
  }
});

test('synchronous play errors and asynchronous unsupported errors do not escape',async()=>{
  const {controller,audios}=setup();audios.menu.plans.push('throw');assert.doesNotThrow(()=>controller.unlock());await flush();
  assert.equal(controller.getState().status,'error');assert.equal(controller.getState().error,'NotSupportedError');
  audios.menu.plans.push('pending');controller.unlock();const error=new Error('format');error.name='NotSupportedError';audios.menu.requests[0].reject(error);await flush();
  assert.equal(controller.getState().status,'error');assert.equal(controller.getState().playing,false);
});

test('rapid switches cannot revive an inactive track from a late play fulfillment or rejection',async()=>{
  const {controller,audios}=setup();audios.menu.plans.push('pending');audios.battle.plans.push('pending');audios['battle-event'].plans.push('pending');controller.unlock();
  controller.sync({scene:'battle'});controller.sync({scene:'battle-event'});controller.sync({scene:'battle-danger'});await flush();assert.equal(audios['battle-danger'].paused,false);
  audios.menu.requests[0].resolve();await flush();assert.equal(audios.menu.paused,true);assert.equal(audios['battle-danger'].paused,false);assert.equal(controller.getState().scene,'battle-danger');
  const error=new Error('stale');error.name='NotAllowedError';audios.battle.requests[0].reject(error);await flush();
  assert.equal(controller.getState().playing,true);assert.equal(controller.getState().blocked,false);
  audios['battle-event'].requests[0].resolve();assert.equal(audios['battle-event'].paused,true,'a late event playing notification is stopped immediately');await flush();
  assert.equal(audios['battle-danger'].paused,false);assert.equal(controller.getState().scene,'battle-danger');assert.equal(controller.getState().playing,true);
  audios['battle-event'].plans.push('pending');controller.sync({scene:'battle-event'});controller.sync({scene:'battle-danger'});
  audios['battle-event'].requests[1].reject(error);await flush();assert.equal(controller.getState().playing,true);assert.equal(controller.getState().blocked,false);assert.equal(audios['battle-danger'].paused,false);
  controller.sync({scene:'menu'});audios['battle-danger'].plans.push('pending');controller.sync({scene:'battle-danger'});controller.sync({scene:'battle'});
  audios['battle-danger'].requests[0].resolve();await flush();assert.equal(audios['battle-danger'].paused,true);assert.equal(audios.menu.paused,true);assert.equal(audios.battle.paused,false);assert.equal(controller.getState().scene,'battle');
});

test('a late old request for the same scene does not pause a newer playback request',async()=>{
  const {controller,audios}=setup();audios.menu.plans.push('pending','pending');controller.unlock();controller.sync({scene:'battle'});controller.sync({scene:'menu'});
  audios.menu.requests[1].resolve();await flush();assert.equal(audios.menu.paused,false);
  audios.menu.requests[0].resolve();await flush();assert.equal(audios.menu.paused,false);assert.equal(controller.getState().playing,true);assert.equal(audios.battle.paused,true);
});

test('queued pause events from rapid scene switches cannot mark the current playback as paused',async()=>{
  const {controller,audios}=setup(),events=[];
  for(const audio of Object.values(audios))audio.pause=()=>{audio.pauseCalls++;if(!audio.paused)events.push(audio);audio.paused=true;};
  controller.unlock();await flush();
  for(const scene of ['battle','battle-event','battle-danger','battle-event','menu','battle-danger','battle','menu'])controller.sync({scene});
  await flush();assert.equal(controller.getState().playing,true);
  for(const audio of events)audio.dispatchEvent(new Event('pause'));
  assert.equal(controller.getState().playing,true);assert.equal(controller.getState().status,'playing');
});

test('disabled and hidden states win over a pending playback request',async()=>{
  for(const scene of ['menu','battle','battle-event','battle-danger'])for(const change of [{enabled:false},{visible:false}]) {
    const {controller,audios}=setup();controller.sync({scene});audios[scene].plans.push('pending');controller.unlock();controller.sync(change);
    audios[scene].requests[0].resolve();await flush();assert.equal(controller.getState().playing,false);
    for(const audio of Object.values(audios))assert.equal(audio.paused,true);
  }
});

test('document visibility and page lifecycle pause and resume with positions retained',async()=>{
  for(const scene of ['battle-event','battle-danger']) {
    const {controller,audios,doc,win}=setup(),audio=audios[scene];controller.sync({scene});controller.unlock();await flush();audio.currentTime=51;
    doc.visibility(true);assert.equal(audio.paused,true);assert.equal(controller.getState().status,'hidden');
    controller.sync({visible:false});doc.visibility(false);await flush();assert.equal(audio.paused,false);assert.equal(audio.currentTime,51);
    win.dispatchEvent(new Event('pagehide'));assert.equal(audio.paused,true);
    win.dispatchEvent(new Event('pageshow'));await flush();assert.equal(audio.paused,false);assert.equal(audio.currentTime,51);assert.equal(controller.getState().scene,scene);
    for(const other of Object.values(audios))if(other!==audio)assert.equal(other.playCalls,0);
  }
});

test('visibility resume rejection waits for the next gesture rather than repeatedly trying',async()=>{
  const {controller,audios,doc}=setup();controller.unlock();await flush();doc.visibility(true);audios.menu.plans.push('reject');doc.visibility(false);await flush();
  assert.equal(controller.getState().blocked,true);const attempts=audios.menu.playCalls;
  controller.sync({visible:true});await flush();assert.equal(audios.menu.playCalls,attempts);
  controller.unlock();await flush();assert.equal(controller.getState().playing,true);
});

test('Web Audio gain handles volume separately from element.volume and is created only once',async()=>{
  const context=fakeContext();let factories=0;
  const {controller,audios}=setup({audioContextFactory:()=>{factories++;return context;}});
  controller.sync({volume:.5});assert.equal(factories,0);controller.unlock();await flush();
  assert.equal(factories,1);assert.equal(context.sources.length,4);assert.equal(context.gain.gain.value,.5);assert.equal(audios.menu.volume,1);
  assert.equal(audios.menu.attributes.get('data-bgm-volume'),'.5'.replace(/^\./,'0.'));
  assert.equal(controller.getState().gainMode,'web-audio');assert.equal(controller.getState().playing,true);
  controller.sync({volume:.2});assert.equal(context.gain.gain.value,.2);assert.equal(audios.menu.playCalls,1);
  controller.sync({scene:'battle'});controller.sync({scene:'battle-event'});controller.sync({scene:'battle-danger'});await flush();assert.equal(context.sources.length,4);assert.equal(factories,1);
  assert.equal(controller.getState().gainMode,'web-audio');assert.equal(audios['battle-danger'].volume,1);assert.equal(context.gain.gain.value,.2);
  controller.sync({volume:0});for(const audio of Object.values(audios))assert.equal(audio.muted,true);
});

test('a pending AudioContext.resume never prevents calling audio.play in the same gesture',async()=>{
  const context=fakeContext();let resumeResolve;
  context.resume=()=>{context.resumeCalls++;return new Promise(r=>{resumeResolve=r;});};
  const {controller,audios}=setup({audioContextFactory:()=>context});controller.unlock();
  assert.equal(audios.menu.playCalls,1,'play starts synchronously without awaiting resume');
  await flush();assert.equal(controller.getState().playing,false);
  context.state='running';context.dispatchEvent(new Event('statechange'));resumeResolve();await flush();assert.equal(controller.getState().playing,true);
});

test('synchronous and rejected AudioContext resumes remain blocked until a later successful gesture',async()=>{
  for(const synchronous of [false,true]) {
    const context=fakeContext(),resume=context.resume;
    context.resume=()=>{const error=new Error('gesture required');error.name='NotAllowedError';if(synchronous)throw error;return Promise.reject(error);};
    const {controller,audios}=setup({audioContextFactory:()=>context});
    assert.doesNotThrow(()=>controller.unlock());await flush();
    assert.equal(controller.getState().status,'blocked');assert.equal(controller.getState().playing,false);assert.equal(audios.menu.paused,true);
    const plays=audios.menu.playCalls;controller.sync({volume:.4});await flush();assert.equal(audios.menu.playCalls,plays);
    context.resume=resume;controller.unlock();await flush();assert.equal(controller.getState().playing,true);assert.equal(controller.getState().blocked,false);
  }
});

test('pause is temporary, and destroy removes elements and handles pending playback safely',async()=>{
  const context=fakeContext();const {controller,audios,doc}=setup({audioContextFactory:()=>context});controller.unlock();await flush();
  controller.pause();assert.equal(audios.menu.paused,true);controller.sync({volume:.3});assert.equal(audios.menu.paused,true);controller.unlock();await flush();assert.equal(audios.menu.paused,false);
  audios['battle-danger'].plans.push('pending');controller.sync({scene:'battle-danger'});controller.destroy();audios['battle-danger'].requests[0].resolve();await flush();
  assert.equal(controller.getState().status,'destroyed');assert.equal(context.closeCalls,1);
  for(const audio of Object.values(audios)){assert.equal(audio.paused,true);assert.equal(audio.removed,true);}
  const playCalls=()=>Object.values(audios).reduce((n,a)=>n+a.playCalls,0),calls=playCalls();doc.visibility(true);doc.visibility(false);controller.unlock();controller.sync({enabled:true});
  assert.equal(playCalls(),calls);
});

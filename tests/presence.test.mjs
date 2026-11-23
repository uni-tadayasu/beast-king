import test from 'node:test';
import assert from 'node:assert/strict';
import {createPresenceController} from '../presence.js';
import {parseJapanDate} from '../account-ui.js';

const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function fixture(send){
  const events=new Map(),timers=new Map(),calls=[];let next=0;
  const document={hidden:false,visibilityState:'visible',addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  const window={addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  const client={profile:{id:'player-a'},async updatePresence(body,options){calls.push({id:this.profile.id,body,options});return send?send(body):{ok:true};}};
  const controller=createPresenceController({client,documentImpl:document,windowImpl:window,timers:{setTimeout(fn,delay){const id=++next;timers.set(id,{fn:()=>{timers.delete(id);return fn();},delay});return id;},clearTimeout:id=>timers.delete(id)}});
  const hide=async hidden=>{document.hidden=hidden;document.visibilityState=hidden?'hidden':'visible';events.get('visibilitychange')?.();await flush();};
  return {controller,client,calls,events,timers,hide};
}

test('visible sessions record one login, renew every 30 seconds and release their lease when hidden',async()=>{
  const f=fixture();await f.controller.start();
  assert.deepEqual(f.calls[0].body,{online:true,login:true});
  const scheduled=[...f.timers.values()][0];assert.equal(scheduled.delay,30000);
  scheduled.fn();await flush();
  assert.deepEqual(f.calls[1].body,{online:true,login:false});
  await f.hide(true);
  assert.deepEqual(f.calls.at(-1).body,{online:false,login:false});
  assert.equal(f.calls.at(-1).options.keepalive,true);
  assert.equal(f.timers.size,0);
  await f.hide(false);
  assert.deepEqual(f.calls.at(-1).body,{online:true,login:false});
  f.controller.destroy();await flush();
});

test('offline presence waits behind an in-flight online update instead of reviving a hidden session',async()=>{
  let resolve;const waiting=new Promise(yes=>{resolve=yes;});let count=0;
  const f=fixture(()=>++count===1?waiting:Promise.resolve({ok:true}));
  const start=f.controller.start();await flush();await f.hide(true);
  assert.equal(f.calls.length,1);
  resolve({ok:true});await start;await flush();
  assert.deepEqual(f.calls.map(c=>c.body.online),[true,false]);
  assert.equal(f.timers.size,0);
  f.controller.destroy();await flush();
});

test('switching identities does not renew the former player and an invalid session stops polling',async()=>{
  const f=fixture();await f.controller.start();f.client.profile={id:'player-b'};
  const scheduled=[...f.timers.values()][0];scheduled.fn();await flush();
  assert.equal(f.calls.length,1);
  await f.controller.start();assert.equal(f.calls.at(-1).id,'player-b');assert.equal(f.calls.at(-1).body.login,true);
  f.controller.destroy();await flush();
  const bad=fixture(()=>Promise.reject(Object.assign(new Error('revoked'),{status:401})));
  await bad.controller.start();assert.equal(bad.timers.size,0);bad.controller.destroy();await flush();
});

test('operator event input always uses Japan time and rejects non-calendar dates',()=>{
  assert.equal(parseJapanDate('2026-11-24T09:30'),Date.parse('2026-11-24T00:30:00Z'));
  assert.equal(Number.isNaN(parseJapanDate('2026-02-30T12:00')),true);
  assert.equal(Number.isNaN(parseJapanDate('2026-11-24T25:00')),true);
  assert.equal(Number.isNaN(parseJapanDate('')),true);
});

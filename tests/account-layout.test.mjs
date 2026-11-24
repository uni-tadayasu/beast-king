import test from 'node:test';
import assert from 'node:assert/strict';
import {accountSyncView,accountDevicePageSize} from '../account-views.js';
import {createAccountUi} from '../account-ui.js';

const devices=Array.from({length:9},(_,index)=>({id:'session-'+index,label:'端末 '+(index+1),isCurrent:index===0,revokedAt:index===1?'2026-11-23T00:00:00Z':null,lastSeenAt:'2026-11-24T04:00:00Z'}));

test('all linked devices remain reachable without rendering a long unbounded list',()=>{
  for(const height of [320,390,760]){
    const seen=[],pageSize=accountDevicePageSize(height),pages=Math.ceil(devices.length/pageSize);
    for(let page=0;page<pages;page++){
      const html=accountSyncView({devices,tab:'devices',devicePage:page,viewportHeight:height});
      const ids=[...html.matchAll(/<li data-device-id="([^"]+)"/g)].map(match=>match[1]);
      assert.ok(ids.length<=pageSize);
      seen.push(...ids);
      assert.match(html,/class="account-device-list" data-account-paged/);
      assert.match(html,new RegExp('data-action="cloud-device-prev"'+(page===0?' disabled':'(?! disabled)')));
      assert.match(html,new RegExp('data-action="cloud-device-next"'+(page===pages-1?' disabled':'(?! disabled)')));
    }
    assert.deepEqual(seen,devices.map(device=>device.id));
  }
});

test('device paging clamps stale positions and never offers removal for this or revoked devices',()=>{
  const last=accountSyncView({devices,tab:'devices',devicePage:999,viewportHeight:320});
  assert.match(last,/data-device-id="session-8"/);
  assert.doesNotMatch(last,/data-device-id="session-7"/);
  const first=accountSyncView({devices,tab:'devices',devicePage:-5,viewportHeight:760});
  assert.doesNotMatch(first,/data-session-id="session-[01]"/);
  assert.match(first,/data-session-id="session-2"/);
  const empty=accountSyncView({devices:[],tab:'devices',devicePage:999,viewportHeight:320});
  assert.match(empty,/data-action="cloud-device-next" disabled/);
  assert.match(empty,/data-action="cloud-device-prev" disabled/);
  assert.match(empty,/>1 \/ 1</);
});

function fixture(){
  let modal=null,html='',state={phase:'synced',dirty:false,lastSyncedAt:'2026-11-24T04:00:00Z'},input=null;
  const calls={refresh:0,claims:0,creates:0,remote:0,local:0};
  const documentImpl={
    activeElement:null,
    getElementById:id=>id==='device-link-code'?input:null,
    querySelectorAll:selector=>selector==='#modal-root input, #modal-root textarea, #modal-root select'&&input?[input]:[],
    querySelector:()=>null,
  };
  const ui=createAccountUi({
    client:{profile:{id:'fixture',nickname:'確認用',origin:'river'},getSessions:async()=>({sessions:devices})},
    cloud:{getState:()=>state,refresh:async()=>{calls.refresh++},createDeviceLink:async()=>{calls.creates++;return {code:'test-code',expiresAt:Date.now()+600000}},claimDeviceLink:async()=>{calls.claims++},reloadCloud:async()=>{calls.remote++},keepLocal:async()=>{calls.local++}},
    ensureReady:async()=>{},isBattleActive:()=>false,documentImpl,
    showModal:value=>{html=value;input={id:'device-link-code',value:'',type:'text',checked:false,selectionStart:0,focus(){},setSelectionRange(){}};},
    setModal:value=>{modal=value;},getModal:()=>modal,closeModal:()=>{modal=null;},render(){},toast(){},
  });
  return {ui,calls,setState:value=>{state=value;},get html(){return html;},get input(){return input;},act:(action,dataset={})=>ui.handleAction(action,{dataset})};
}

test('task navigation preserves typed link codes and does not create, claim or overwrite data',async()=>{
  const f=fixture();await f.ui.openAccount();
  assert.match(f.html,/data-account-tab="sync"/);
  f.act('cloud-account-tab',{tab:'receive'});
  f.input.value='preserve-this-code';
  f.act('cloud-account-tab',{tab:'devices'});
  f.act('cloud-device-next');
  f.act('cloud-account-tab',{tab:'send'});
  f.act('cloud-account-tab',{tab:'receive'});
  assert.equal(f.input.value,'preserve-this-code');
  f.ui.onCloudState();
  assert.equal(f.input.value,'preserve-this-code');
  assert.match(f.html,/data-account-tab="receive"/);
  assert.deepEqual(f.calls,{refresh:0,claims:0,creates:0,remote:0,local:0});
  f.ui.onModalClosed();
});

test('a new real conflict opens readable choices once and preserves the unfinished link input',async()=>{
  const f=fixture();await f.ui.openAccount();
  f.act('cloud-account-tab',{tab:'receive'});f.input.value='unfinished-code';
  f.setState({phase:'conflict',dirty:true,conflict:{reason:'revision'}});f.ui.onCloudState();
  assert.match(f.html,/data-account-tab="sync"/);
  assert.match(f.html,/data-action="cloud-conflict-remote"/);
  assert.match(f.html,/data-action="cloud-conflict-local"/);
  assert.equal(f.input.value,'unfinished-code');
  f.act('cloud-account-tab',{tab:'receive'});f.ui.onCloudState();
  assert.match(f.html,/data-account-tab="receive"/,'known conflict must not repeatedly steal the chosen tab');
  assert.equal(f.input.value,'unfinished-code');
  assert.equal(f.calls.local,0);assert.equal(f.calls.remote,0);
  f.ui.onModalClosed();
});

test('expired codes cannot be copied and untrusted device text is escaped',()=>{
  const html=accountSyncView({tab:'send',link:{code:'<code>',expiresAt:'2020-01-01T00:00:00Z'},devices:[{id:'a" data-action="bad',label:'<img src=x onerror=alert(1)>'}]});
  assert.match(html,/data-action="cloud-link-copy" disabled/);
  assert.match(html,/&lt;code&gt;/);
  assert.doesNotMatch(html,/<img src=x/);
  assert.match(html,/data-device-id="a&quot; data-action=&quot;bad"/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountUi,parseJapanDate} from '../account-ui.js';
import {operatorDashboardView,playerInboxView} from '../account-views.js';
import {CARDS,getCard} from '../catalog.js';

const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const decode=s=>String(s||'').replace(/&(amp|lt|gt|quot|#39);/g,(_,key)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[key]));
function fixture(t,hooks={}){
 let modal=null,html='',fields=new Map(),writes=[],reads=[],recordCalls=[],toastMessages=[],savedRevision=4;
 const now=Date.parse('2026-11-24T10:00:00Z');
 const snapshot={stats:{totalPlayers:4,onlinePlayers:1},settings:{revision:1,notice:'',maintenance:false},messages:[],gifts:[],events:[],notices:[],audit:[],serverTime:now};
 let gift={id:'gift-fixture-1',kind:'gift',title:'お祝い',body:'本文',target:'all',status:'published',phase:'active',revision:1,publishAt:now,treasure:10,cards:[],claimedAt:null,claimable:true};
 const key=kind=>({message:'messages',gift:'gifts',event:'events',notice:'notices'}[kind]);
 const renderHtml=value=>{
  html=value;fields=new Map();
  for(const match of value.matchAll(/<(input|textarea|select)\b([^>]*\bid="([^"]+)"[^>]*)>(?:([\s\S]*?)<\/\1>)?/g)){
   const [,tag,attrs,id,body]=match;let fieldValue=decode(attrs.match(/\bvalue="([^"]*)"/)?.[1]);
   if(tag==='textarea')fieldValue=decode(body);
   if(tag==='select'){const options=[...String(body).matchAll(/<option\b([^>]*)>(.*?)<\/option>/g)];const selected=options.find(m=>/\bselected\b/.test(m[1]))||options[0];fieldValue=decode(selected?.[1].match(/value="([^"]*)"/)?.[1]);}
   fields.set(id,{id,value:fieldValue,type:attrs.match(/type="([^"]*)"/)?.[1]||tag,checked:/\bchecked\b/.test(attrs),disabled:/\bdisabled\b/.test(attrs),focus(){},setSelectionRange(){}});
  }
 };
 const documentImpl={hidden:false,activeElement:null,getElementById:id=>fields.get(id)||null,querySelectorAll:selector=>selector.includes('details')?[]:[...fields.values()],querySelector:()=>({scrollTop:0})};
 async function write(kind,body){writes.push({kind,body:structuredClone(body)});if(hooks.write)return hooks.write(kind,body,{snapshot,writes});const id=body.id||'saved-fixture-'+writes.length,row={...body,id,kind,revision:(body.revision||0)+1,phase:body.status==='draft'?'draft':'active'};snapshot[key(kind)]=[row];return {operator:structuredClone(snapshot),createdId:id};}
 const client={profile:{id:'operator-fixture'},getStatus:()=>({}),getOperator:async()=>hooks.getOperator?hooks.getOperator():({operator:structuredClone(snapshot)}),getOperatorRecords:async values=>{recordCalls.push(values);return {kind:values.kind,items:snapshot[key(values.kind)]||[],page:values.page||0,pageSize:4,total:(snapshot[key(values.kind)]||[]).length};},getPublicStatus:async()=>({ok:true,notice:'',notices:[],maintenance:false}),sendOperatorMessage:body=>write('message',body),sendOperatorGift:body=>write('gift',body),saveOperatorEvent:body=>write('event',body),saveOperatorNotice:body=>write('notice',body),updateOperatorSettings:async body=>{writes.push({kind:'settings',body});if(hooks.settings)throw Error('通信エラー');snapshot.settings={...body,revision:body.revision+1};return {operator:structuredClone(snapshot)};},getInbox:async values=>({messages:values.kind==='message'?[{id:'mail-fixture-1',title:'メール',body:'<script>は文字です',status:'published',phase:'active',readAt:reads.length?now:null}]:[],gifts:values.kind==='gift'?[structuredClone(gift)]:[],counts:{messages:1,gifts:1,unread:reads.length?0:1},pagination:{page:values.page,pageSize:4,total:1}}),getEvents:async()=>({events:[],pagination:{page:0,pageSize:4,total:0}}),markInboxRead:async id=>{reads.push(id);return {ok:true};},claimGift:async(id,revision)=>{if(hooks.claimGift)return hooks.claimGift(id,revision);assert.equal(revision,savedRevision);gift={...gift,claimedAt:now,claimable:false,claim:{id,treasure:10,cards:[],convertedTreasure:5,claimedAt:now}};return {save:{revision:++savedRevision,data:{}},claim:gift.claim};}};
 const cloud={getState:()=>({revision:savedRevision}),flush:async()=>{reads.push('flush');},acceptServerSave:async save=>{reads.push('accepted-'+save.revision);return {phase:'synced'};}};
 const ui=createAccountUi({client,cloud,ensureReady:async()=>{},isBattleActive:()=>false,showModal:renderHtml,setModal:value=>{modal=value;},getModal:()=>modal,closeModal:()=>{modal=null;html='';},render:()=>{},toast:message=>toastMessages.push(message),getCard,documentImpl});
 t.after(()=>ui.onModalClosed());
 const act=async(action,dataset={})=>{assert.equal(ui.handleAction(action,{dataset}),true);await flush();};
 return {ui,client,snapshot,fields:()=>fields,html:()=>html,close:()=>{modal=null;html='';},writes,reads,recordCalls,toastMessages,act};
}

test('native console has bounded tabs and escapes author content while keeping automatic operator art',()=>{
 const html=operatorDashboardView({snapshot:{stats:{},settings:{},deck:{unlockedAt:1}}});
 assert.equal((html.match(/data-action="operator-tab"/g)||[]).length,8);assert.match(html,/class="operator-workspace op-workspace"/);assert(!html.includes('<details'));
 assert.match(html,/専用レガリアのイラストは、運営認証後に自動で適用/);assert(!html.includes('operator-artwork-open'));
 const escaped=operatorDashboardView({tab:'notice',draft:{kind:'notice',title:'<img onerror=attack()>',body:'<script>attack()</script>',status:'draft'},step:3});
 assert(!escaped.includes('<script>attack()'));assert.match(escaped,/&lt;script&gt;/);
});

test('composing a scheduled targeted gift carries fields across four steps and sends catalog-driven multi-card rewards after preview',async t=>{
 const f=fixture(t);await f.act('operator-open');await f.act('operator-content-new',{kind:'gift'});
 f.fields().get('operator-editor-title').value='予約の贈り物';f.fields().get('operator-editor-body').value='本文\n二行目';await f.act('operator-editor-next');
 f.fields().get('operator-editor-target-mode').value='player';f.fields().get('operator-editor-target').value='player-target-fixture';f.fields().get('operator-editor-status').value='published';
 f.fields().get('operator-editor-start').value='2026-12-01T12:00';f.fields().get('operator-editor-end').value='2026-12-02T12:00';await f.act('operator-editor-next');
 for(const card of CARDS.slice(-2)){f.fields().get('operator-reward-query').value=card.id;await f.act('operator-reward-search');await f.act('operator-reward-add',{id:card.id});}
 f.fields().get('operator-editor-treasure').value='500';f.fields().get('operator-reward-count-0').value='3';f.fields().get('operator-reward-count-1').value='2';await f.act('operator-editor-next');
 assert.equal(f.writes.length,0);assert.match(f.html(),/player-target-fixture/);assert.match(f.html(),/予約の贈り物/);
 await f.act('operator-editor-save');assert.equal(f.writes.length,1);const {kind,body}=f.writes[0];assert.equal(kind,'gift');assert.equal(body.status,'published');assert.equal(body.target,'player-target-fixture');assert.equal(body.body,'本文\n二行目');assert.equal(body.publishAt,parseJapanDate('2026-12-01T12:00'));assert.equal(body.cards.length,2);assert.deepEqual(body.cards.map(c=>c.count),[3,2]);assert.equal(body.treasure,500);assert.match(body.mutationId,/^[a-f0-9-]{36}$/);
});

test('an early publish action opens review and a lost response retains the same operation id on retry',async t=>{
 let calls=0;const f=fixture(t,{write:async(kind,body,{snapshot})=>{if(++calls===1)throw Error('通信が途切れました');return {operator:snapshot,createdId:'saved-retry-fixture'};}});
 await f.act('operator-open');await f.act('operator-content-new',{kind:'message'});f.fields().get('operator-editor-title').value='保存する下書き';
 await f.act('operator-editor-save');assert.equal(f.writes.length,0);assert.match(f.html(),/下書きを保存/);
 await f.act('operator-editor-save');assert.equal(f.writes.length,1);assert.match(f.html(),/通信が途切れました/);
 await f.act('operator-editor-save');assert.equal(f.writes.length,2);assert.deepEqual(f.writes[0].body,f.writes[1].body);
});

test('published edits carry the displayed revision and cannot alter locked recipient or reward fields',async t=>{
 const f=fixture(t),cardId=CARDS.at(-1).id;f.snapshot.gifts=[{id:'locked-gift-fixture',kind:'gift',title:'確定済み',body:'本文',target:'all',status:'published',revision:8,deliveryLocked:true,treasure:50,cards:[{cardId,count:1}],publishAt:1}];
 await f.act('operator-open');await f.act('operator-tab',{tab:'gift'});await f.act('operator-content-edit',{kind:'gift',id:'locked-gift-fixture'});
 f.fields().get('operator-editor-title').value='本文の訂正';await f.act('operator-editor-step',{step:'2'});
 assert.equal(f.fields().get('operator-editor-treasure').disabled,true);f.fields().get('operator-editor-treasure').value='99999';f.fields().get('operator-reward-count-0').value='3';
 await f.act('operator-editor-next');await f.act('operator-editor-save');assert.equal(f.writes[0].body.revision,8);assert.equal(f.writes[0].body.treasure,50);assert.equal(f.writes[0].body.cards[0].count,1);
});

test('settings retain edited fields and their original revision when saving fails',async t=>{
 const f=fixture(t,{settings:true});await f.act('operator-open');await f.act('operator-tab',{tab:'maintenance'});
 f.fields().get('operator-maintenance').checked=true;f.fields().get('operator-maintenance-message').value='点検の予告';f.fields().get('operator-maintenance-start').value='2026-12-01T12:00';
 await f.act('operator-save');assert.equal(f.writes[0].body.revision,1);assert.equal(f.fields().get('operator-maintenance-message').value,'点検の予告');assert.equal(f.fields().get('operator-maintenance').checked,true);assert.match(f.html(),/通信エラー/);
});

test('opening a system mail marks only that item read, and claiming reconciles the authoritative save and receipt',async t=>{
 const f=fixture(t);await f.act('inbox-open');await f.act('inbox-tab',{tab:'message'});await f.act('inbox-item-open',{id:'mail-fixture-1'});
 assert.deepEqual(f.reads,['mail-fixture-1']);assert.match(f.html(),/既読/);assert.match(f.html(),/&lt;script&gt;/);
 await f.act('inbox-tab',{tab:'gift'});await f.act('inbox-item-open',{id:'gift-fixture-1'});await f.act('inbox-claim',{id:'gift-fixture-1'});
 assert.ok(f.reads.includes('flush'));assert.ok(f.reads.includes('accepted-5'));assert.match(f.html(),/受取済み/);assert.match(f.html(),/重複分 \+5 秘宝/);
});

test('operator pagination requests older records and a late identity response cannot reopen the console',async t=>{
 const f=fixture(t);await f.act('operator-open');await f.act('operator-tab',{tab:'message'});await f.act('operator-page-next');assert.equal(f.recordCalls.at(-1).page,1);assert.equal(f.recordCalls.at(-1).pageSize,4);
 let resolve;const pending=new Promise(yes=>{resolve=yes;});const late=fixture(t,{getOperator:()=>pending});late.ui.handleAction('operator-open',{dataset:{}});await flush();late.ui.clearIdentity();resolve({operator:{stats:{totalPlayers:999},settings:{}}});await flush();assert.equal(late.html(),'');
});

test('a late reward response after account reset cannot enter the new account cloud save or dialog',async t=>{
 let resolve;const pending=new Promise(yes=>{resolve=yes;});const f=fixture(t,{claimGift:()=>pending});
 await f.act('inbox-open');f.ui.handleAction('inbox-claim',{dataset:{id:'gift-fixture-1'}});await flush();
 f.ui.clearIdentity();f.client.profile={id:'new-player-fixture'};f.close();
 resolve({save:{revision:99,data:{treasure:99999}},claim:{treasure:99999}});await flush();
 assert.equal(f.reads.some(row=>row.startsWith('accepted-')),false);assert.equal(f.html(),'');assert.equal(f.toastMessages.length,0);
});

test('a periodic operator refresh cannot revive the prior account console after identity reset',async t=>{
 const original=globalThis.setTimeout;let timer;
 globalThis.setTimeout=(fn,delay,...args)=>delay===30000?(timer=fn,123456789):original(fn,delay,...args);
 t.after(()=>{globalThis.setTimeout=original;});
 const f=fixture(t);await f.act('operator-open');assert.equal(typeof timer,'function');
 let resolve;const pending=new Promise(yes=>{resolve=yes;});f.client.getOperator=()=>pending;
 const refresh=timer();await flush();f.ui.clearIdentity();f.client.profile={id:'new-player-fixture'};f.close();timer=null;
 resolve({operator:{stats:{totalPlayers:99999},settings:{}}});await refresh;await flush();
 assert.equal(f.html(),'');assert.equal(timer,null,'old account refresh is not rescheduled');
});

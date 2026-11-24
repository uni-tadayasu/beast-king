import {CARDS} from './catalog.js?v=20261124-28';
import {accountSyncView,operatorGateView,operatorDashboardView,playerInboxView} from './account-views.js?v=20261124-28';
import {operatorRewardPageSize} from './operator-paging.js?v=20261124-28';

/** Account dialogs use the same server identity as online battles. No role or
 * activation credential is saved in the game data or inferred from the UI. */
export function createAccountUi({client,cloud,ensureReady,isBattleActive,showModal,setModal,getModal,closeModal,render,toast,esc,icon,getCard,setPublicNotice,beforeLink,afterLink,onOperatorDeckChange,onEquipOperatorDeck,documentImpl=globalThis.document}={}) {
  const byId=id=>documentImpl.getElementById(id);
  const value=id=>byId(id)?.value?.trim()||'';
  let account={link:null,devices:[],busy:false,error:''};
  const freshInbox=()=>({messages:[],gifts:[],events:[],tab:'gift',page:0,selected:null,bodyPage:0,counts:{},request:0,busy:false,error:''});
  const freshOperator=()=>({snapshot:null,tab:'overview',records:null,page:0,query:'',draft:null,step:0,rewardPage:0,rewardMatchPage:0,rewardMatches:[],busy:false,error:''});
  let inbox=freshInbox(),operator=freshOperator();
  let operatorDeck=null,operatorDeckOwner=null,deckRequest=null;
  let brandCount=0,brandAt=0,operatorTimer=null;
  const pending=new Map();
  const kind=()=>getModal()?.kind;
  const safeError=error=>error?.message||'通信を確認して、もう一度お試しください。';
  const dialog=(type,label,html,wide=false)=>{setModal({kind:type,label});showModal(html,wide);};
  function rememberFields(){
    const values=[];
    for(const field of documentImpl.querySelectorAll('#modal-root input, #modal-root textarea, #modal-root select')) {
      if(field.id&&field.type!=='password')values.push({id:field.id,value:field.value,checked:field.checked});
    }
    const active=documentImpl.activeElement;
    const readers=[...documentImpl.querySelectorAll('#modal-root [data-op-reader-page]')].filter(node=>node.dataset?.opReaderPage!==undefined).map(node=>node.dataset.opReaderPage);
    const panels=[...documentImpl.querySelectorAll('#modal-root [data-op-panel-active]')].filter(node=>node.dataset?.opPanelActive!==undefined).map(node=>node.dataset.opPanelActive);
    return {values,readers,panels,openDetails:[...documentImpl.querySelectorAll('#modal-root details')].map((node,index)=>node.open?index:-1).filter(index=>index>=0),activeId:active?.id,selection:typeof active?.selectionStart==='number'?active.selectionStart:null,scroll:documentImpl.querySelector('#modal-root .modal')?.scrollTop||0};
  }
  function restoreFields(saved,clearPrefix=''){
    for(const [index,node] of [...documentImpl.querySelectorAll('#modal-root details')].entries())node.open=saved.openDetails.includes(index);
    for(const field of saved.values)if(!clearPrefix||!field.id.startsWith(clearPrefix)){
      const node=byId(field.id);if(node){node.value=field.value;if(typeof field.checked==='boolean')node.checked=field.checked;}
    }
    const modal=documentImpl.querySelector('#modal-root .modal');if(modal)modal.scrollTop=saved.scroll;
    for(const [index,node] of [...documentImpl.querySelectorAll('#modal-root [data-op-reader-page]')].entries())if(node.dataset&&saved.readers?.[index]!==undefined)node.dataset.opReaderPage=saved.readers[index];
    for(const [index,node] of [...documentImpl.querySelectorAll('#modal-root [data-op-panel-active]')].entries())if(node.dataset&&saved.panels?.[index]!==undefined)node.dataset.opPanelActive=saved.panels[index];
    const win=documentImpl.defaultView;if(win)win.dispatchEvent(new win.Event('bk-operator-page-layout'));
    if(saved.activeId&&!saved.activeId.startsWith(clearPrefix||'\u0000'))setTimeout(()=>{
      const field=byId(saved.activeId);if(field){field.focus({preventScroll:true});if(saved.selection!==null&&typeof field.setSelectionRange==='function')try{field.setSelectionRange(saved.selection,saved.selection);}catch{}}
    },0);
  }
  function accountModal(preserve=true){
    const saved=preserve&&kind()==='account'?rememberFields():null;
    dialog('account','端末連携と同期',accountSyncView({state:{...cloud.getState(),busy:account.busy||cloud.getState().busy,error:account.error||cloud.getState().error},profile:client.profile,link:account.link,devices:account.devices,esc,icon}),true);
    if(saved)restoreFields(saved);
  }
  function inboxModal(){dialog('inbox','お知らせ・プレゼント',playerInboxView({...inbox,esc,icon,getCard}),true);}
  function operatorModal({preserve=true,clearPrefix=''}={}){
    const saved=preserve&&kind()==='operator'?rememberFields():null;
    dialog('operator','運営管理',operatorDashboardView({...operator,esc,icon,getCard}),true);
    if(saved)restoreFields(saved,clearPrefix);
  }
  function gateModal(error=''){dialog('operator-gate','アクセス確認',operatorGateView({esc,icon,error,busy:operator.busy}));}
  function regaliaModal(error=''){dialog('operator-regalia','特別コードの確認',operatorGateView({esc,icon,error,busy:operator.busy,purpose:'regalia',regaliaClaimed:!!operator.snapshot?.regalia?.claimedAt}));}
  const getOperatorDeck=()=>{const state=client.getStatus?.()||{};if(!operatorDeck||operatorDeckOwner!==client.profile?.id||state.authInvalidated||state.identityChanging)return null;return structuredClone(operatorDeck);};
  function acceptOperatorDeck(value){
    const next=value?.id==='operator-kirahara-v1'&&client.profile?.id&&Array.isArray(value.ids)&&value.ids.length===32&&Array.isArray(value.specialIds)&&value.specialIds.length===4?structuredClone(value):null;
    const owner=next?client.profile.id:null;
    if(operatorDeckOwner===owner&&JSON.stringify(operatorDeck)===JSON.stringify(next))return;
    operatorDeck=next;operatorDeckOwner=owner;onOperatorDeckChange?.(getOperatorDeck());
  }
  function refreshOperatorDeck(){
    if(deckRequest)return deckRequest;
    const owner=operator;
    const request=(async()=>{
      try{await ensureReady();const result=await client.getOperatorDeck();if(operator===owner)acceptOperatorDeck(result.deck);}
      catch(error){if(operator===owner&&(error?.status===401||error?.status===404))acceptOperatorDeck(null);}
      return operator===owner?getOperatorDeck():null;
    })();
    deckRequest=request;request.finally(()=>{if(deckRequest===request)deckRequest=null;});return request;
  }
  function disallowDuringBattle(){
    if(!isBattleActive())return false;
    toast('対戦やマッチングを終了してから、この操作を行ってください。',true);return true;
  }
  async function loadDevices(){const payload=await client.getSessions();account.devices=payload.sessions||[];}
  async function openAccount(){
    account.error='';accountModal(false);
    try{await ensureReady();await loadDevices();}
    catch(error){account.error=safeError(error);}
    if(kind()==='account')accountModal();
  }
  async function accountAction(operation){
    if(account.busy)return;
    account.busy=true;account.error='';accountModal();
    try{await operation();}
    catch(error){account.error=safeError(error);}
    finally{account.busy=false;if(kind()==='account')accountModal();}
  }
  async function createLink(){
    if(disallowDuringBattle())return;
    await accountAction(async()=>{await ensureReady();const result=await cloud.createDeviceLink();account.link=result.link||result;});
  }
  async function claimLink(){
    if(disallowDuringBattle())return;
    const code=value('device-link-code');
    if(!code){toast('元の端末で発行した連携コードを入力してください。',true);return;}
    await accountAction(async()=>{
      const deviceName=/Android|iPhone|iPad|Mobile/i.test(globalThis.navigator?.userAgent||'')?'スマホ・タブレット':'PCブラウザ';
      await beforeLink?.();try{await cloud.claimDeviceLink(code,deviceName);}finally{await afterLink?.();}
      account.link=null;operator=freshOperator();acceptOperatorDeck(null);deckRequest=null;pending.clear();
      const input=byId('device-link-code');if(input)input.value='';
      await loadDevices();render();toast('連携しました。同じプレイヤーのデータを読み込みました。');
    });
  }
  async function revokeSession(id){
    const session=account.devices.find(item=>item.id===id);
    if(!session||session.isCurrent)return;
    await accountAction(async()=>{await client.revokeSession(id);await loadDevices();toast('選んだ端末の連携を解除しました。');});
  }
  async function loadInbox(){
    const owner=inbox,tab=inbox.tab,page=inbox.page,request=inbox.request;
    const [letters,events]=await Promise.all([client.getInbox({kind:tab==='event'?'gift':tab,page:tab==='event'?0:page,pageSize:4}),client.getEvents({page:tab==='event'?page:0,pageSize:4})]);
    if(inbox!==owner||inbox.tab!==tab||inbox.page!==page||inbox.request!==request)return;
    Object.assign(inbox,{messages:letters.messages||[],gifts:letters.gifts||[],events:events.events||[],counts:letters.counts||{},pagination:letters.pagination,eventPagination:events.pagination});
  }
  async function openInbox(){
    const owner=inbox,request=++inbox.request,tab=inbox.tab,page=inbox.page;
    const current=()=>inbox===owner&&inbox.request===request&&inbox.tab===tab&&inbox.page===page;
    inbox.busy=true;inbox.error='';inboxModal();
    try{await ensureReady();if(current())await loadInbox();}
    catch(error){if(current())inbox.error=safeError(error);}
    finally{if(current()){inbox.busy=false;if(kind()==='inbox')inboxModal();}}
  }
  async function openInboxItem(id){
    if(inbox.busy)return;const owner=inbox;
    inbox.selected=id;inbox.bodyPage=0;inbox.error='';inboxModal();
    if(inbox.tab==='event')return;
    try{await client.markInboxRead(id);if(inbox===owner){await loadInbox();if(kind()==='inbox')inboxModal();}}
    catch(error){if(inbox===owner){inbox.error=safeError(error);if(kind()==='inbox')inboxModal();}}
  }
  async function claimReward(id,event=false){
    if(inbox.busy||disallowDuringBattle())return;
    const owner=inbox;let identity=client.profile?.id;
    const owned=()=>inbox===owner&&(!identity||identity===client.profile?.id);
    inbox.busy=true;inbox.error='';inboxModal();
    try{
      await ensureReady();if(!owned())return;identity=client.profile?.id;
      await cloud.flush();if(!owned())return;
      const revision=cloud.getState().revision;
      const result=event?await client.claimEvent(id,revision):await client.claimGift(id,revision);
      if(!owned())return;
      const sync=await cloud.acceptServerSave(result.save);if(!owned())return;
      await loadInbox();if(!owned())return;
      render();toast(sync.phase==='conflict'?'受取はクラウドで確定しました。設定の「端末連携と同期」で保存内容を確認してください。':result.replayed?'このプレゼントは受取済みです。':'プレゼントを受け取りました。');
    }catch(error){if(owned())inbox.error=safeError(error);}
    finally{if(owned()){inbox.busy=false;if(kind()==='inbox')inboxModal();}}
  }
  function stopOperatorRefresh(){if(operatorTimer!==null)clearTimeout(operatorTimer);operatorTimer=null;}
  function scheduleOperatorRefresh(){
    stopOperatorRefresh();if(kind()!=='operator')return;
    operatorTimer=setTimeout(async()=>{
      operatorTimer=null;if(kind()!=='operator')return;
      const owner=operator,identity=client.profile?.id;
      const owned=()=>operator===owner&&client.profile?.id===identity;
      if(!operator.busy&&!documentImpl.hidden)try{
        const result=await client.getOperator();if(!owned())return;
        operator.snapshot=result.operator;acceptOperatorDeck(operator.snapshot?.deck);if(kind()==='operator')operatorModal();
      }catch(error){if(!owned())return;if(error.status===401||error.status===404){acceptOperatorDeck(null);closeModal();toast('認証を確認してください。',true);return;}}
      if(owned())scheduleOperatorRefresh();
    },30000);
  }
  async function openOperator(){
    if(operator.busy)return;
    const owner=operator;operator.busy=true;operator.error='';
    try{
      await ensureReady();if(operator!==owner)return;
      const result=await client.getOperator();if(operator!==owner)return;
      operator.snapshot=result.operator;if(operator.tab==='maintenance')operator.settingsDraft=structuredClone(result.operator.settings);
      await loadOperatorRecords();if(operator!==owner)return;
      acceptOperatorDeck(result.operator?.deck);operator.busy=false;operatorModal({preserve:false});scheduleOperatorRefresh();
    }catch(error){
      if(operator!==owner)return;operator.snapshot=null;operator.busy=false;
      if(error?.status===401||error?.status===404)acceptOperatorDeck(null);
      if(error?.payload?.setupAvailable===true)gateModal();
      else toast(error?.status===404?'この操作は利用できません。':safeError(error),true);
    }
  }
  async function activate(){
    // Enter on the original password field follows the existing app handler.
    if(kind()==='operator-regalia'){await claimRegalia();return;}
    if(operator.busy||kind()!=='operator-gate')return;
    const owner=operator,identity=client.profile?.id;
    const field=byId('operator-code'),code=field?.value||'';
    if(!code)return;
    if(field)field.value='';
    operator.busy=true;gateModal();
    try{
      const result=await client.activateOperator(code);if(operator!==owner||client.profile?.id!==identity)return;
      operator.snapshot=result.operator;operator.busy=false;operatorModal({preserve:false});scheduleOperatorRefresh();
      toast('初回設定が完了しました。');
    }catch(error){if(operator!==owner||client.profile?.id!==identity)return;operator.busy=false;try{const result=await client.getOperator();if(operator!==owner||client.profile?.id!==identity)return;operator.snapshot=result.operator;operatorModal({preserve:false});scheduleOperatorRefresh();}catch{if(operator===owner&&client.profile?.id===identity)gateModal(safeError(error));}}
  }
  function openRegalia(){
    if(operator.busy||!operator.snapshot||kind()!=='operator')return;
    stopOperatorRefresh();regaliaModal();
  }
  async function claimRegalia(){
    if(operator.busy||!operator.snapshot||kind()!=='operator-regalia'||disallowDuringBattle())return;
    const owner=operator;
    const field=byId('operator-code'),code=field?.value||'';
    if(!code)return;
    if(field)field.value='';
    operator.busy=true;regaliaModal();
    try{
      await ensureReady();await cloud.flush();
      if(operator!==owner)return;
      const result=await client.claimOperatorRegalia(code,cloud.getState().revision);
      if(operator!==owner)return;
      const sync=await cloud.acceptServerSave(result.save);
      if(operator!==owner)return;
      operator.snapshot={...operator.snapshot,regalia:{claimedAt:result.claim.claimedAt},deck:result.deck||null};
      operator.busy=false;
      acceptOperatorDeck(result.deck);
      render();
      if(kind()==='operator-regalia'){operatorModal({preserve:false});scheduleOperatorRefresh();}
      const converted=result.claim.convertedTreasure||0;
      toast(sync.phase==='conflict'?'受取はクラウドで確定しました。設定の「端末連携と同期」で保存内容を確認してください。':result.replayed?'𠮷良原デッキは開放済みです。':result.upgraded?'𠮷良原デッキを開放しました。必要なカードもそろいました。':converted?`𠮷良原デッキを開放しました。レガリアの所持上限を超えた分は${converted}秘宝に変わりました。`:'王冠竜 レガリアを2枚受け取り、𠮷良原デッキを開放しました。');
    }catch(error){
      if(operator!==owner)return;
      operator.busy=false;
      if(kind()==='operator-regalia')regaliaModal(safeError(error));
    }
  }
  async function equipOperatorDeck(){
    if(operator.busy||!operatorDeck||typeof onEquipOperatorDeck!=='function'||disallowDuringBattle())return;
    const owner=operator;operator.busy=true;
    try{
      await ensureReady();await cloud.flush();if(operator!==owner)return;
      let result=await client.getOperatorDeck();if(operator!==owner)return;
      if(result.deck?.upgradeRequired){result=await client.claimOperatorRegalia('',cloud.getState().revision,{upgrade:true});if(operator!==owner)return;await cloud.acceptServerSave(result.save);if(operator!==owner)return;}
      acceptOperatorDeck(result.deck);
      if(!operatorDeck)throw new Error('専用デッキの開放を確認してください。');
      await onEquipOperatorDeck(getOperatorDeck());if(operator!==owner)return;
      closeModal();toast('𠮷良原デッキを使用します。ソロ・ルーム対戦・ランクマッチで使えます。');
    }catch(error){
      if(operator!==owner)return;
      if(error?.status===401||error?.status===404)acceptOperatorDeck(null);
      toast(safeError(error),true);
    }finally{if(operator===owner)operator.busy=false;}
  }
  function captureDraft(){
    const draft=operator.draft;if(!draft)return;
    const set=(id,key)=>{const field=byId(id);if(field)draft[key]=field.value;};
    set('operator-editor-title','title');set('operator-editor-body','body');set('operator-editor-status','status');
    if(byId('operator-editor-target-mode')&&!draft.deliveryLocked)draft.target=value('operator-editor-target-mode')==='all'?'all':value('operator-editor-target');
    for(const [id,key] of [['operator-editor-start',['event','notice'].includes(draft.kind)?'startAt':'publishAt'],['operator-editor-end',['event','notice'].includes(draft.kind)?'endAt':'expiresAt']]){
      if(byId(id)){const raw=value(id),time=raw?parseJapanDate(raw):null;if(raw&&!Number.isFinite(time))throw new Error('日時を日本時間で正しく入力してください。');draft[key]=time;}
    }
    if(byId('operator-editor-treasure')&&!draft.deliveryLocked)draft.treasure=Number(value('operator-editor-treasure')||0);
    if(byId('operator-editor-priority'))draft.priority=Number(value('operator-editor-priority')||0);
    if(!draft.deliveryLocked)for(const [index,card] of (draft.cards||[]).entries())if(byId('operator-reward-count-'+index))card.count=Number(value('operator-reward-count-'+index));
  }
  function changeEditor(operation){try{captureDraft();operator.error='';operation();operatorModal({preserve:false});}catch(error){operator.error=safeError(error);operatorModal();}}
  function mutation(type,body){
    const fingerprint=JSON.stringify(body),old=pending.get(type);
    if(old?.fingerprint===fingerprint)return {...body,mutationId:old.id};
    const id=crypto.randomUUID();pending.set(type,{id,fingerprint});return {...body,mutationId:id};
  }
  const listKey=type=>({message:'messages',gift:'gifts',event:'events',notice:'notices'}[type]);
  function findContent(type,id){return [...(operator.records?.items||[]),...(operator.snapshot?.[listKey(type)]||[])].find(row=>row.id===id);}
  async function loadOperatorRecords(){
    if(['overview','maintenance'].includes(operator.tab))return;
    const owner=operator,tab=operator.tab;
    const result=await client.getOperatorRecords({kind:tab,page:operator.page,pageSize:4,query:operator.query||''});
    if(operator===owner&&operator.tab===tab)operator.records=result;
  }
  async function selectOperatorTab(tab,page=0){
    if(operator.busy)return;
    operator.tab=tab;operator.page=page;operator.draft=null;if(tab==='maintenance')operator.settingsDraft=structuredClone(operator.snapshot?.settings||{});operator.receiptItem=null;operator.receiptDetailId=null;operator.receipts=null;operator.error='';operator.busy=true;operatorModal({preserve:false});
    const owner=operator;
    try{await loadOperatorRecords();}catch(error){if(operator===owner)operator.error=safeError(error);}
    finally{if(operator===owner){operator.busy=false;if(kind()==='operator')operatorModal({preserve:false});}}
  }
  function newContent(type,target='all',source=null){
    const now=operator.snapshot?.serverTime||Date.now();
    operator.tab=type;operator.step=0;operator.previewPage=0;operator.rewardPage=0;operator.rewardMatchPage=0;operator.rewardMatches=[];operator.rewardQuery='';operator.error='';operator.receiptItem=null;
    operator.draft={kind:type,title:'',body:'',status:'draft',target,treasure:0,cards:[],publishAt:null,startAt:type==='event'?now:null,endAt:type==='event'?now+86400000:null,expiresAt:null,priority:0,...(source?structuredClone(source):{})};
    if(source){delete operator.draft.id;operator.draft.revision=0;operator.draft.status='draft';operator.draft.deliveryLocked=false;operator.draft.publishAt=null;operator.draft.startAt=type==='event'?now:null;operator.draft.endAt=type==='event'?now+86400000:null;operator.draft.expiresAt=null;}
    operatorModal({preserve:false});
  }
  function editContent(type,id){const row=findContent(type,id);if(!row)return;operator.tab=type;operator.draft={...structuredClone(row),kind:type};operator.step=0;operator.previewPage=0;operator.rewardPage=0;operator.rewardMatchPage=0;operator.rewardMatches=[];operator.error='';operatorModal({preserve:false});}
  async function loadReceipts(type,id,page=0){
    const item=findContent(type,id)||operator.receiptItem;if(!item||operator.busy)return;
    const owner=operator;operator.busy=true;operator.receiptItem={...item,kind:type};operator.receiptDetailId=null;operator.draft=null;operatorModal({preserve:false});
    try{const result=await client.getOperatorRecords({kind:type==='message'?'reads':'claims',itemId:id,itemType:type,page,pageSize:4});if(operator===owner)operator.receipts=result;}
    catch(error){if(operator===owner)operator.error=safeError(error);}
    finally{if(operator===owner){operator.busy=false;if(kind()==='operator')operatorModal({preserve:false});}}
  }
  function draftPayload(){
    captureDraft();const draft=operator.draft;
    if(!draft||!draft.title?.trim())throw new Error('タイトルを入力してください。');
    const body={...(draft.id?{id:draft.id,revision:draft.revision}:{}),title:draft.title.trim(),body:draft.body||'',status:draft.status};
    if(draft.kind!=='notice'){if(!draft.target)throw new Error('個別配信のプレイヤーIDを入力してください。');body.target=draft.target;}
    if(['event','notice'].includes(draft.kind)){
      draft.startAt??=Date.now();body.startAt=draft.startAt;body.endAt=draft.endAt??null;
      if(draft.kind==='event'&&(!Number.isFinite(body.endAt)||body.endAt<=body.startAt))throw new Error('イベントの終了を開始より後に指定してください。');
    }else {body.publishAt=draft.publishAt??null;body.expiresAt=draft.expiresAt??null;}
    if(draft.kind==='gift'||draft.kind==='event'){
      if(!Number.isSafeInteger(draft.treasure)||draft.treasure<0||draft.treasure>100000)throw new Error('秘宝は0〜100,000の整数で指定してください。');
      if(draft.cards.some(card=>!getCard(card.cardId)||!Number.isInteger(card.count)||card.count<1||card.count>3))throw new Error('カードの枚数は1〜3枚で指定してください。');
      if(draft.kind==='gift'&&draft.status==='published'&&!draft.treasure&&!draft.cards.length)throw new Error('配布する秘宝かカードを指定してください。');
      Object.assign(body,{treasure:draft.treasure,cards:draft.cards.map(({cardId,count})=>({cardId,count}))});
    }
    if(draft.kind==='notice')body.priority=draft.priority||0;
    return body;
  }
  async function operate(type){
    if(operator.busy||!operator.snapshot||kind()!=='operator')return;
    let body;
    try{
      if(type==='settings'){
        const readDate=id=>{const raw=value(id),time=raw?parseJapanDate(raw):null;if(raw&&!Number.isFinite(time))throw new Error('メンテナンス日時を確認してください。');return time;};
        body={revision:(operator.settingsDraft||operator.snapshot.settings).revision,notice:value('operator-notice'),maintenance:byId('operator-maintenance')?.checked===true,maintenanceMessage:value('operator-maintenance-message'),maintenanceStartAt:readDate('operator-maintenance-start'),maintenanceEndAt:readDate('operator-maintenance-end')};
        operator.settingsDraft={...(operator.settingsDraft||operator.snapshot.settings),...body};
      }else{
        if(!operator.draft)return;if(operator.step!==3){changeEditor(()=>operator.step=3);return;}
        type=operator.draft.kind;body=draftPayload();
      }
    }catch(error){operator.error=safeError(error);operatorModal();return;}
    const owner=operator;operator.busy=true;operator.error='';operatorModal();
    try{
      const methods={settings:'updateOperatorSettings',message:'sendOperatorMessage',gift:'sendOperatorGift',event:'saveOperatorEvent',notice:'saveOperatorNotice'};
      const result=await client[methods[type]](mutation(type,body));if(operator!==owner)return;
      pending.delete(type);operator.snapshot=result.operator;if(type==='settings')operator.settingsDraft=structuredClone(result.operator.settings);operator.draft=null;operator.status=type==='settings'?'受付設定を保存しました。':body.status==='draft'?'下書きを保存しました。':body.status==='ended'?'公開を終了しました。':'公開・予約設定を保存しました。';
      try{setPublicNotice?.(await client.getPublicStatus());}catch{}
      if(type!=='settings'){operator.page=0;try{await loadOperatorRecords();}catch{operator.records=null;}}
      toast(operator.status);
    }catch(error){if(operator===owner)operator.error=safeError(error);}
    finally{if(operator===owner){operator.busy=false;if(kind()==='operator')operatorModal({preserve:false});}}
  }
  function keepLocalConfirmation(){
    if(disallowDuringBattle())return;
    dialog('cloud-overwrite','同期データの確認',`<h2>この端末のデータで置き換えますか？</h2><p class="modal-intro">別端末で保存されたカード・秘宝・デッキ・ソロ進行を、この端末に残っている内容で置き換えます。残したいデータを確認してから選んでください。</p><div class="modal-actions"><button class="btn" data-action="cloud-open">戻る</button><button class="btn primary" data-action="cloud-conflict-local-confirm">この端末のデータで置き換える</button></div>`);
  }
  function handleAction(action,element){
    switch(action){
      case'cloud-open':void openAccount();break;
      case'cloud-link-create':void createLink();break;
      case'cloud-link-claim':void claimLink();break;
      case'cloud-link-copy':if(account.link?.code)void globalThis.navigator?.clipboard?.writeText(account.link.code).then(()=>toast('連携コードをコピーしました。'),()=>toast('コードを選択してコピーしてください。'));break;
      case'cloud-refresh':void accountAction(async()=>{await ensureReady();await cloud.refresh();await loadDevices();});break;
      case'cloud-conflict-remote':if(!disallowDuringBattle())void accountAction(async()=>{await cloud.reloadCloud();toast('クラウドのデータを読み込みました。');});break;
      case'cloud-conflict-local':keepLocalConfirmation();break;
      case'cloud-conflict-local-confirm':accountModal(false);void accountAction(async()=>{await cloud.keepLocal();toast('この端末のデータをクラウドへ保存しました。');});break;
      case'cloud-revoke-session':void revokeSession(element.dataset.sessionId||element.dataset.id);break;
      case'inbox-open':case'inbox-refresh':void openInbox();break;
      case'inbox-tab':if(inbox.busy)break;inbox.tab=element.dataset.tab;inbox.page=0;inbox.selected=null;void openInbox();break;
      case'inbox-page-prev':case'inbox-page-next':if(inbox.busy)break;inbox.page=Math.max(0,inbox.page+(action.endsWith('next')?1:-1));void openInbox();break;
      case'inbox-item-open':void openInboxItem(element.dataset.id);break;
      case'inbox-item-back':inbox.selected=null;inboxModal();break;
      case'inbox-body-prev':case'inbox-body-next':inbox.bodyPage=Math.max(0,inbox.bodyPage+(action.endsWith('next')?1:-1));inboxModal();break;
      case'inbox-claim':void claimReward(element.dataset.id);break;
      case'event-claim':void claimReward(element.dataset.id,true);break;
      case'operator-open':void openOperator();break;
      case'operator-activate':void activate();break;
      case'operator-regalia-open':openRegalia();break;
      case'operator-regalia-claim':void claimRegalia();break;
      case'operator-regalia-back':if(!operator.busy&&operator.snapshot&&kind()==='operator-regalia'){operatorModal({preserve:false});scheduleOperatorRefresh();}break;
      case'operator-deck-use':void equipOperatorDeck();break;
      case'operator-save':void operate('settings');break;
      case'operator-tab':void selectOperatorTab(element.dataset.tab);break;
      case'operator-page-prev':case'operator-page-next':void selectOperatorTab(operator.tab,Math.max(0,operator.page+(action.endsWith('next')?1:-1)));break;
      case'operator-player-search':operator.query=value('operator-player-search');void selectOperatorTab('player');break;
      case'operator-player-mail':newContent('message',element.dataset.id);break;
      case'operator-player-gift':newContent('gift',element.dataset.id);break;
      case'operator-content-new':newContent(element.dataset.kind);break;
      case'operator-content-edit':editContent(element.dataset.kind,element.dataset.id);break;
      case'operator-content-copy':newContent(element.dataset.kind,'all',findContent(element.dataset.kind,element.dataset.id));break;
      case'operator-content-receipts':void loadReceipts(element.dataset.kind,element.dataset.id);break;
      case'operator-receipts-prev':case'operator-receipts-next':void loadReceipts(operator.receiptItem.kind,operator.receiptItem.id,Math.max(0,(operator.receipts?.page||0)+(action.endsWith('next')?1:-1)));break;
      case'operator-receipts-back':operator.receiptItem=null;operator.receipts=null;operatorModal({preserve:false});break;
      case'operator-receipt-open':operator.receiptDetailId=element.dataset.id;operatorModal({preserve:false});break;
      case'operator-receipt-close':operator.receiptDetailId=null;operatorModal({preserve:false});break;
      case'operator-editor-cancel':void selectOperatorTab(operator.tab);break;
      case'operator-editor-step':changeEditor(()=>operator.step=Number(element.dataset.step));break;
      case'operator-editor-prev':case'operator-editor-next':changeEditor(()=>operator.step=Math.max(0,Math.min(3,operator.step+(action.endsWith('next')?1:-1))));break;
      case'operator-editor-save':void operate(operator.draft?.kind);break;
      case'operator-preview-prev':case'operator-preview-next':changeEditor(()=>operator.previewPage=Math.max(0,(operator.previewPage||0)+(action.endsWith('next')?1:-1)));break;
      case'operator-reward-search':changeEditor(()=>{operator.rewardQuery=value('operator-reward-query').trim();const query=operator.rewardQuery.toLocaleLowerCase('ja');operator.rewardMatches=query?CARDS.filter(card=>card.id.toLowerCase().includes(query)||card.name.toLocaleLowerCase('ja').includes(query)):[];operator.rewardMatchPage=0;});break;
      case'operator-reward-match-prev':case'operator-reward-match-next':changeEditor(()=>{const size=operatorRewardPageSize()<4?1:3,last=Math.max(0,Math.ceil(operator.rewardMatches.length/size)-1),current=Math.min(operator.rewardMatchPage||0,last);operator.rewardMatchPage=Math.max(0,Math.min(last,current+(action.endsWith('next')?1:-1)));});break;
      case'operator-reward-add':changeEditor(()=>{const id=element.dataset.id;if(!operator.draft.deliveryLocked&&getCard(id)&&operator.draft.cards.length<12&&!operator.draft.cards.some(c=>c.cardId===id))operator.draft.cards.push({cardId:id,count:1});});break;
      case'operator-reward-remove':changeEditor(()=>{if(!operator.draft.deliveryLocked)operator.draft.cards=operator.draft.cards.filter(c=>c.cardId!==element.dataset.id);operator.rewardPage=Math.min(operator.rewardPage,Math.max(0,Math.ceil(operator.draft.cards.length/operatorRewardPageSize())-1));});break;
      case'operator-reward-prev':case'operator-reward-next':changeEditor(()=>{const last=Math.max(0,Math.ceil(operator.draft.cards.length/operatorRewardPageSize())-1),current=Math.min(operator.rewardPage,last);operator.rewardPage=Math.max(0,Math.min(last,current+(action.endsWith('next')?1:-1)));});break;
      case'operator-message-send':case'operator-gift-send':case'operator-event-save':void operate(operator.draft?.kind);break;
      case'operator-refresh':void openOperator();break;
      default:return false;
    }
    return true;
  }
  return {
    handleAction,openAccount,openInbox,getOperatorDeck,refreshOperatorDeck,onModalClosed:stopOperatorRefresh,
    onCloudState(){if(kind()==='account')accountModal();},
    touchBrand(){const now=Date.now();brandCount=now-brandAt<1800?brandCount+1:1;brandAt=now;if(brandCount<7)return false;brandCount=0;void openOperator();return true;},
    clearIdentity(){stopOperatorRefresh();account.link=null;account.devices=[];inbox=freshInbox();operator=freshOperator();acceptOperatorDeck(null);deckRequest=null;pending.clear();},
  };
}

/** datetime-local is labelled JST, independently of the device's timezone. */
export function parseJapanDate(value){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return NaN;const time=Date.parse(value+':00+09:00');return Number.isFinite(time)&&new Date(time+9*3600000).toISOString().slice(0,16)===value?time:NaN;}

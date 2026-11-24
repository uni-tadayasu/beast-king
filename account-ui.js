import {accountSyncView,operatorGateView,operatorDashboardView,playerInboxView} from './account-views.js';

/** Account dialogs use the same server identity as online battles. No role or
 * activation credential is saved in the game data or inferred from the UI. */
export function createAccountUi({client,cloud,ensureReady,isBattleActive,showModal,setModal,getModal,closeModal,render,toast,esc,icon,getCard,setPublicNotice,beforeLink,afterLink,onOperatorDeckChange,onEquipOperatorDeck,documentImpl=globalThis.document}={}) {
  const byId=id=>documentImpl.getElementById(id);
  const value=id=>byId(id)?.value?.trim()||'';
  let account={link:null,devices:[],busy:false,error:''};
  let inbox={messages:[],gifts:[],events:[],busy:false,error:''};
  let operator={snapshot:null,eventDraft:null,busy:false,error:''};
  let operatorDeck=null,deckRequest=null;
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
    return {values,openDetails:[...documentImpl.querySelectorAll('#modal-root details')].map((node,index)=>node.open?index:-1).filter(index=>index>=0),activeId:active?.id,selection:typeof active?.selectionStart==='number'?active.selectionStart:null,scroll:documentImpl.querySelector('#modal-root .modal')?.scrollTop||0};
  }
  function restoreFields(saved,clearPrefix=''){
    for(const [index,node] of [...documentImpl.querySelectorAll('#modal-root details')].entries())node.open=saved.openDetails.includes(index);
    for(const field of saved.values)if(!clearPrefix||!field.id.startsWith(clearPrefix)){
      const node=byId(field.id);if(node){node.value=field.value;if(typeof field.checked==='boolean')node.checked=field.checked;}
    }
    const modal=documentImpl.querySelector('#modal-root .modal');if(modal)modal.scrollTop=saved.scroll;
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
    dialog('operator','運営管理',operatorDashboardView({...operator,esc,icon}),true);
    if(saved)restoreFields(saved,clearPrefix);
  }
  function gateModal(error=''){dialog('operator-gate','アクセス確認',operatorGateView({esc,icon,error,busy:operator.busy}));}
  function regaliaModal(error=''){dialog('operator-regalia','特別コードの確認',operatorGateView({esc,icon,error,busy:operator.busy,purpose:'regalia',regaliaClaimed:!!operator.snapshot?.regalia?.claimedAt}));}
  const getOperatorDeck=()=>operatorDeck?structuredClone(operatorDeck):null;
  function acceptOperatorDeck(value){
    const next=value&&Array.isArray(value.ids)&&value.ids.length===32&&Array.isArray(value.specialIds)&&value.specialIds.length===4?structuredClone(value):null;
    if(JSON.stringify(operatorDeck)===JSON.stringify(next))return;
    operatorDeck=next;onOperatorDeckChange?.(getOperatorDeck());
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
      account.link=null;operator={snapshot:null,eventDraft:null,busy:false,error:''};acceptOperatorDeck(null);deckRequest=null;pending.clear();
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
    const [letters,events]=await Promise.all([client.getInbox(),client.getEvents()]);
    inbox.messages=letters.messages||[];inbox.gifts=letters.gifts||[];inbox.events=events.events||[];
  }
  async function openInbox(){
    inbox.busy=true;inbox.error='';inboxModal();
    try{await ensureReady();await loadInbox();}
    catch(error){inbox.error=safeError(error);}
    finally{inbox.busy=false;if(kind()==='inbox')inboxModal();}
  }
  async function claimReward(id,event=false){
    if(inbox.busy||disallowDuringBattle())return;
    inbox.busy=true;inbox.error='';inboxModal();
    try{
      await ensureReady();await cloud.flush();
      const revision=cloud.getState().revision;
      const result=event?await client.claimEvent(id,revision):await client.claimGift(id,revision);
      const sync=await cloud.acceptServerSave(result.save);
      await loadInbox();render();toast(sync.phase==='conflict'?'受取はクラウドで確定しました。設定の「端末連携と同期」で保存内容を確認してください。':result.replayed?'このプレゼントは受取済みです。':'プレゼントを受け取りました。');
    }catch(error){inbox.error=safeError(error);}
    finally{inbox.busy=false;if(kind()==='inbox')inboxModal();}
  }
  function stopOperatorRefresh(){if(operatorTimer!==null)clearTimeout(operatorTimer);operatorTimer=null;}
  function scheduleOperatorRefresh(){
    stopOperatorRefresh();if(kind()!=='operator')return;
    operatorTimer=setTimeout(async()=>{
      operatorTimer=null;if(kind()!=='operator')return;
      if(!operator.busy&&!documentImpl.hidden)try{operator.snapshot=(await client.getOperator()).operator;acceptOperatorDeck(operator.snapshot?.deck);if(kind()==='operator')operatorModal();}catch(error){if(error.status===401||error.status===404){acceptOperatorDeck(null);closeModal();toast('認証を確認してください。',true);return;}}
      scheduleOperatorRefresh();
    },30000);
  }
  async function openOperator(){
    if(operator.busy)return;
    operator.busy=true;operator.error='';
    try{
      await ensureReady();
      const result=await client.getOperator();operator.snapshot=result.operator;acceptOperatorDeck(result.operator?.deck);operator.busy=false;operatorModal({preserve:false});scheduleOperatorRefresh();
    }catch(error){
      operator.snapshot=null;operator.busy=false;
      if(error?.status===401||error?.status===404)acceptOperatorDeck(null);
      if(error?.payload?.setupAvailable===true)gateModal();
      else toast(error?.status===404?'この操作は利用できません。':safeError(error),true);
    }
  }
  async function activate(){
    // Enter on the original password field follows the existing app handler.
    if(kind()==='operator-regalia'){await claimRegalia();return;}
    if(operator.busy||kind()!=='operator-gate')return;
    const field=byId('operator-code'),code=field?.value||'';
    if(!code)return;
    if(field)field.value='';
    operator.busy=true;gateModal();
    try{
      const result=await client.activateOperator(code);
      operator.snapshot=result.operator;operator.busy=false;operatorModal({preserve:false});scheduleOperatorRefresh();
      toast('初回設定が完了しました。');
    }catch(error){operator.busy=false;try{operator.snapshot=(await client.getOperator()).operator;operatorModal({preserve:false});scheduleOperatorRefresh();}catch{gateModal(safeError(error));}}
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
  function recipient(prefix){
    if(value(prefix+'-audience')==='all')return 'all';
    const target=value(prefix+'-player');if(!target)throw new Error('配布先のプレイヤーIDを入力してください。');return target;
  }
  function reward(prefix){
    const treasure=Number(value(prefix+'-treasure')||0),cardId=value(prefix+'-card-id').toUpperCase(),count=Number(value(prefix+'-card-count')||1);
    if(!Number.isSafeInteger(treasure)||treasure<0||treasure>100000)throw new Error('秘宝は0〜100,000の整数で指定してください。');
    if(cardId&&(!getCard(cardId)||!Number.isInteger(count)||count<1||count>3))throw new Error('有効なカードIDと1〜3枚の枚数を指定してください。');
    return {treasure,cards:cardId?[{cardId,count}]:[]};
  }
  function mutation(kind,body){
    const fingerprint=JSON.stringify(body),old=pending.get(kind);
    if(old?.fingerprint===fingerprint)return {...body,mutationId:old.id};
    const id=crypto.randomUUID();pending.set(kind,{id,fingerprint});return {...body,mutationId:id};
  }
  async function operate(type){
    if(operator.busy||!operator.snapshot||kind()!=='operator')return;
    let body;
    try{
      if(type==='settings')body={notice:value('operator-notice'),maintenance:byId('operator-maintenance')?.checked===true};
      if(type==='message')body={title:value('operator-message-title'),body:value('operator-message-body'),target:recipient('operator-message')};
      if(type==='gift')body={title:value('operator-gift-title'),body:value('operator-gift-body'),target:recipient('operator-gift'),...reward('operator-gift')};
      if(type==='event'){
        const startAt=parseJapanDate(value('operator-event-start')),endAt=parseJapanDate(value('operator-event-end'));
        if(!Number.isFinite(startAt)||!Number.isFinite(endAt)||endAt<=startAt)throw new Error('開始・終了日時を日本時間で指定し、終了を開始より後にしてください。');
        body={...(value('operator-event-id')?{id:value('operator-event-id')}:{}),title:value('operator-event-title'),body:value('operator-event-body'),startAt,endAt,status:value('operator-event-status'),...reward('operator-event')};
      }
      if(type!=='settings'&&(!body?.title||!body.body))throw new Error('タイトルと本文を入力してください。');
    }catch(error){operator.error=safeError(error);operatorModal();return;}
    operator.busy=true;operator.error='';operatorModal();
    let completed=false;
    try{
      const methods={settings:'updateOperatorSettings',message:'sendOperatorMessage',gift:'sendOperatorGift',event:'saveOperatorEvent'};
      const result=await client[methods[type]](type==='settings'?body:mutation(type,body));
      pending.delete(type);completed=true;
      operator.snapshot=result.operator||(await client.getOperator()).operator;
      setPublicNotice?.(operator.snapshot?.settings||{});
      if(type==='event')operator.eventDraft=null;
      toast({settings:'お知らせと受付設定を保存しました。',message:'システムメッセージを送信しました。',gift:'プレゼントを配布しました。',event:'イベントを保存しました。'}[type]);
    }catch(error){operator.error=safeError(error);}
    finally{operator.busy=false;if(kind()==='operator')operatorModal({clearPrefix:completed&&type!=='settings'?'operator-'+type+'-':''});}
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
      case'inbox-claim':void claimReward(element.dataset.id);break;
      case'event-claim':void claimReward(element.dataset.id,true);break;
      case'operator-activate':void activate();break;
      case'operator-regalia-open':openRegalia();break;
      case'operator-regalia-claim':void claimRegalia();break;
      case'operator-regalia-back':if(!operator.busy&&operator.snapshot&&kind()==='operator-regalia'){operatorModal({preserve:false});scheduleOperatorRefresh();}break;
      case'operator-deck-use':void equipOperatorDeck();break;
      case'operator-save':void operate('settings');break;
      case'operator-message-send':void operate('message');break;
      case'operator-gift-send':void operate('gift');break;
      case'operator-event-save':void operate('event');break;
      case'operator-event-edit':operator.eventDraft=operator.snapshot?.events?.find(item=>item.id===element.dataset.id)||null;operator.error='';operatorModal({preserve:false});documentImpl.querySelector('[data-operator-section="events"]')?.setAttribute('open','');break;
      case'operator-event-new':operator.eventDraft=null;operator.error='';operatorModal({preserve:false});break;
      case'operator-refresh':void openOperator();break;
      default:return false;
    }
    return true;
  }
  return {
    handleAction,openAccount,openInbox,getOperatorDeck,refreshOperatorDeck,onModalClosed:stopOperatorRefresh,
    onCloudState(){if(kind()==='account')accountModal();},
    touchBrand(){const now=Date.now();brandCount=now-brandAt<1800?brandCount+1:1;brandAt=now;if(brandCount<7)return false;brandCount=0;void openOperator();return true;},
    clearIdentity(){stopOperatorRefresh();account.link=null;account.devices=[];inbox={messages:[],gifts:[],events:[],busy:false,error:''};operator={snapshot:null,eventDraft:null,busy:false,error:''};acceptOperatorDeck(null);deckRequest=null;pending.clear();},
  };
}

/** datetime-local is labelled JST, independently of the device's timezone. */
export function parseJapanDate(value){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return NaN;const time=Date.parse(value+':00+09:00');return Number.isFinite(time)&&new Date(time+9*3600000).toISOString().slice(0,16)===value?time:NaN;}

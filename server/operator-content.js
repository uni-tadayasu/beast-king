import {getCard} from '../catalog.js';

// Content management has no access to activation secrets or private card artwork.
const statement=(db,sql,...args)=>db.prepare(sql).bind(...args);
const first=(db,sql,...args)=>statement(db,sql,...args).first();
const all=async(db,sql,...args)=>(await statement(db,sql,...args).all()).results;
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const identifier=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(value);
const text=(value,max,{empty=true,lines=false}={})=>typeof value==='string'&&[...value].length<=max&&(empty||value.trim().length>0)&&!(lines?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u:/[\u0000-\u001f\u007f-\u009f]/u).test(value);
const check=(condition,fail,code='invalid_content',message='入力内容を確認してください。')=>{if(!condition)fail(400,code,message);};
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const cardsOf=row=>JSON.parse(row.cards_json||'[]');
const startOf=row=>row.publish_at||row.start_at||row.created_at;
export const NEW_MATCHES_ALLOWED_SQL="NOT EXISTS (SELECT 1 FROM bk_operator_settings WHERE singleton=1 AND maintenance=1 AND (maintenance_start_at IS NULL OR maintenance_start_at<=?) AND (maintenance_end_at IS NULL OR maintenance_end_at>?))";
export function contentPhase(row,now){
  if(row.status==='draft')return 'draft';
  if(row.status==='ended')return 'ended';
  const end=row.end_at??row.expires_at;
  if(end!==null&&end!==undefined&&end<=now)return 'expired';
  return startOf(row)>now?'scheduled':'active';
}
export function announcementPublic(row,now=Date.now()){
  return {id:row.id,kind:row.kind,title:row.title,body:row.body,target:row.target_player||'all',status:row.status,publishAt:row.publish_at||row.created_at,phase:contentPhase(row,now),revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at||row.created_at,expiresAt:row.expires_at,readAt:row.read_at??null,deliveryLocked:row.delivery_locked===1||row.status==='published'&&startOf(row)<=now,...(row.kind==='gift'?{treasure:row.treasure,cards:cardsOf(row),claimedAt:row.claimed_at??null}:{}),...(row.read_count===undefined?{}:{readCount:row.read_count,claimedCount:row.claim_count||0,targetCount:row.target_count})};
}
export function eventPublic(row,now=Date.now()){
  return {id:row.id,kind:'event',title:row.title,body:row.body,target:row.target_player||'all',startAt:row.start_at,endAt:row.end_at,status:row.status,phase:contentPhase(row,now),treasure:row.treasure,cards:cardsOf(row),revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at,claimedAt:row.claimed_at??null,deliveryLocked:row.delivery_locked===1||row.status==='published'&&row.start_at<=now,...(row.claim_count===undefined?{}:{claimedCount:row.claim_count,targetCount:row.target_count})};
}
export function noticePublic(row,now=Date.now()){
  return {id:row.id,kind:'notice',title:row.title,body:row.body,status:row.status,phase:contentPhase(row,now),startAt:row.start_at,endAt:row.end_at,priority:row.priority,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at};
}
export async function operatorSettings(db,now){
  const row=await first(db,'SELECT * FROM bk_operator_settings WHERE singleton=1');
  const maintenance=row?.maintenance===1,start=row?.maintenance_start_at??null,end=row?.maintenance_end_at??null;
  return {notice:row?.notice||'',maintenance,maintenanceStartAt:start,maintenanceEndAt:end,maintenanceMessage:row?.maintenance_message||'',revision:row?.revision||0,updatedAt:row?.updated_at??null,effectiveMaintenance:maintenance&&(start===null||start<=now)&&(end===null||now<end)};
}
export async function operatorPublicStatus(db,now=Date.now()){
  const [settings,rows]=await Promise.all([operatorSettings(db,now),all(db,"SELECT * FROM bk_notices WHERE status='published' AND start_at<=? AND (end_at IS NULL OR end_at>?) ORDER BY priority DESC,start_at DESC,id DESC LIMIT 20",now,now)]);
  const notices=rows.map(row=>noticePublic(row,now));
  return {ok:true,notice:notices.length?notices[0].title:settings.notice,notices,maintenance:settings.effectiveMaintenance,maintenanceMessage:settings.maintenanceMessage,upcomingMaintenance:settings.maintenance&&settings.maintenanceStartAt>now?{startAt:settings.maintenanceStartAt,endAt:settings.maintenanceEndAt,message:settings.maintenanceMessage}:null,serverTime:now};
}
const contentQueries={
 message:{table:'bk_announcements',where:"a.kind='message'",select:"a.*,(SELECT count(*) FROM bk_inbox_reads r WHERE r.item_id=a.id) AS read_count,(SELECT count(*) FROM bk_reward_claims c WHERE c.item_id=a.id AND c.item_type='gift') AS claim_count,CASE WHEN a.target_player IS NULL THEN (SELECT count(*) FROM bk_profiles) ELSE 1 END AS target_count",order:'COALESCE(a.updated_at,a.created_at) DESC,a.id DESC',format:announcementPublic},
 gift:{table:'bk_announcements',where:"a.kind='gift'",select:"a.*,(SELECT count(*) FROM bk_inbox_reads r WHERE r.item_id=a.id) AS read_count,(SELECT count(*) FROM bk_reward_claims c WHERE c.item_id=a.id AND c.item_type='gift') AS claim_count,CASE WHEN a.target_player IS NULL THEN (SELECT count(*) FROM bk_profiles) ELSE 1 END AS target_count",order:'COALESCE(a.updated_at,a.created_at) DESC,a.id DESC',format:announcementPublic},
 event:{table:'bk_events',where:'1=1',select:"a.*,(SELECT count(*) FROM bk_reward_claims c WHERE c.item_id=a.id AND c.item_type='event') AS claim_count,CASE WHEN a.target_player IS NULL THEN (SELECT count(*) FROM bk_profiles) ELSE 1 END AS target_count",order:'a.updated_at DESC,a.id DESC',format:eventPublic},
 notice:{table:'bk_notices',where:'1=1',select:'a.*',order:'a.updated_at DESC,a.id DESC',format:noticePublic},
};
const safeAudit=row=>{
  let payload={};try{payload=JSON.parse(row.payload_json||'{}');}catch{}
  const detail={};for(const key of ['id','title','target','status','revision','treasure','maintenance','maintenanceStartAt','maintenanceEndAt'])if(typeof payload[key]==='string'||typeof payload[key]==='number'||typeof payload[key]==='boolean'||payload[key]===null)detail[key]=payload[key];
  return {id:row.id,action:row.action,createdAt:row.created_at,detail};
};
export async function operatorRecords(db,now,{kind='message',page=0,pageSize=6,query='',itemId='',itemType='gift'}={},fail){
  check(integer(page,0,100000)&&integer(pageSize,1,30)&&text(query,100),fail,'invalid_page');
  const q=contentQueries[kind],offset=page*pageSize;
  let rows,total;
  if(q){
    const [count,result]=await Promise.all([first(db,`SELECT count(*) AS n FROM ${q.table} a WHERE ${q.where}`),all(db,`SELECT ${q.select} FROM ${q.table} a WHERE ${q.where} ORDER BY ${q.order} LIMIT ? OFFSET ?`,pageSize,offset)]);
    total=count.n;rows=result.map(row=>q.format(row,now));
  }else if(kind==='audit'){
    const [count,result]=await Promise.all([first(db,'SELECT count(*) AS n FROM bk_operator_audit'),all(db,'SELECT id,action,payload_json,created_at FROM bk_operator_audit ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?',pageSize,offset)]);total=count.n;rows=result.map(safeAudit);
  }else if(kind==='player'){
    const filter='(?=\'\' OR id=? OR nickname LIKE ? ESCAPE \'\\\')',pattern='%'+query.replace(/[\\%_]/g,'\\$&')+'%';
    const args=[query,query,pattern];const [count,result]=await Promise.all([first(db,`SELECT count(*) AS n FROM bk_profiles WHERE ${filter}`,...args),all(db,`SELECT id,nickname,COALESCE(origin_v2,origin) AS origin,rating,created_at AS createdAt FROM bk_profiles WHERE ${filter} ORDER BY created_at DESC,id LIMIT ? OFFSET ?`,...args,pageSize,offset)]);total=count.n;rows=result;
  }else if(kind==='claims'||kind==='reads'){
    check(identifier(itemId)&&['gift','event','message'].includes(itemType),fail,'invalid_item');
    const table=itemType==='event'?'bk_events':'bk_announcements';
    check(!!await first(db,`SELECT id FROM ${table} WHERE id=?`,itemId),fail,'invalid_item');
    const isClaim=kind==='claims',filter=isClaim?'r.item_id=? AND r.item_type=?':'r.item_id=?',args=isClaim?[itemId,itemType]:[itemId],source=isClaim?'bk_reward_claims':'bk_inbox_reads',time=isClaim?'claimed_at':'read_at';
    const [count,result]=await Promise.all([first(db,`SELECT count(*) AS n FROM ${source} r WHERE ${filter}`,...args),all(db,`SELECT r.*,p.nickname FROM ${source} r JOIN bk_profiles p ON p.id=r.player_id WHERE ${filter} ORDER BY r.${time} DESC,r.player_id LIMIT ? OFFSET ?`,...args,pageSize,offset)]);total=count.n;
    rows=result.map(row=>({id:row.player_id,nickname:row.nickname,...(isClaim?{claimedAt:row.claimed_at,saveRevision:row.save_revision,claim:JSON.parse(row.result_json)}:{readAt:row.read_at})}));
  }else check(false,fail,'invalid_kind');
  return {ok:true,kind,items:rows,total,page,pageSize,serverTime:now};
}
export async function operatorContentSummary(db,now,fail){
  const kinds=['message','gift','event','notice','audit'];
  const results=await Promise.all(kinds.map(kind=>operatorRecords(db,now,{kind,pageSize:20},fail)));
  return {messages:results[0].items,gifts:results[1].items,events:results[2].items,notices:results[3].items,audit:results[4].items,contentTotals:Object.fromEntries(results.map(r=>[r.kind,r.total])),settings:await operatorSettings(db,now),serverTime:now};
}
function rewardInput(body,fail,allowEmpty){
  const treasure=body.treasure??0,cards=body.cards??[];
  check(integer(treasure,0,100000)&&Array.isArray(cards)&&cards.length<=12&&cards.every(c=>c&&typeof c==='object'&&!!getCard(c.cardId)&&integer(c.count,1,3))&&new Set(cards.map(c=>c.cardId)).size===cards.length,fail,'invalid_reward','秘宝は0〜100,000個、カードは最大12種類・各1〜3枚で指定してください。');
  check(allowEmpty||treasure>0||cards.length>0,fail,'invalid_reward','配布する報酬を指定してください。');
  return {treasure,cards:cards.map(c=>({cardId:c.cardId,count:c.count})).sort((a,b)=>a.cardId.localeCompare(b.cardId))};
}
export async function writeOperatorContent(c,player,kind,{requireOperator,rateLimit,dashboard}){
  const {db,request,now,fail,bodyJSON}=c;await requireOperator(c,player);
  if(!await rateLimit(db,request,player.id,'operator-write',now,{ip:120,player:60,window:60000}))fail(429,'rate_limited','操作が続いています。少し待ってください。');
  const body=await bodyJSON(request),mutationId=body.mutationId??(kind==='settings'?crypto.randomUUID():null);
  check(identifier(mutationId),fail,'invalid_mutation_id');
  const value={id:body.id??null,revision:body.revision??null};
  check(value.id===null||identifier(value.id),fail,'invalid_item');
  if(kind==='settings'){
    check(text(body.notice,200,{lines:true})&&typeof body.maintenance==='boolean',fail,'invalid_settings');
    Object.assign(value,{notice:body.notice,maintenance:body.maintenance,maintenanceStartAt:body.maintenanceStartAt??null,maintenanceEndAt:body.maintenanceEndAt??null,maintenanceMessage:body.maintenanceMessage??''});
    check(text(value.maintenanceMessage,200,{lines:true})&&(value.maintenanceStartAt===null||integer(value.maintenanceStartAt))&&(value.maintenanceEndAt===null||integer(value.maintenanceEndAt))&&(value.maintenanceEndAt===null||value.maintenanceEndAt>(value.maintenanceStartAt??0)),fail,'invalid_schedule','メンテナンスの開始・終了日時を確認してください。');
  }else{
    check(text(body.title,80,{empty:false})&&text(body.body??'',1000,{lines:true}),fail,'invalid_content','タイトルは80文字以内、本文は1,000文字以内で入力してください。');
    Object.assign(value,{title:body.title.trim(),body:body.body??'',status:body.status??'published'});
    check(['draft','published','ended'].includes(value.status),fail,'invalid_status');
    if(kind==='event'||kind==='notice'){
      Object.assign(value,{startAt:body.startAt??null,endAt:body.endAt??null});
      check((integer(value.startAt)||kind==='notice'&&value.startAt===null)&&(value.endAt===null&&kind==='notice'||integer(value.endAt)&&(value.startAt===null||value.endAt>value.startAt)),fail,'invalid_schedule','終了日時は開始日時より後に指定してください。');
    }else{
      Object.assign(value,{publishAt:body.publishAt??null,expiresAt:body.expiresAt??null});
      check((value.publishAt===null||integer(value.publishAt))&&(value.expiresAt===null||integer(value.expiresAt)&&(value.publishAt===null||value.expiresAt>value.publishAt)),fail,'invalid_schedule');
    }
    if(kind!=='notice'){
      value.target=body.target??'all';check(value.target==='all'||identifier(value.target),fail,'invalid_target');
      if(value.target!=='all'&&!await first(db,'SELECT id FROM bk_profiles WHERE id=?',value.target))fail(404,'player_not_found','対象のプレイヤーが見つかりません。');
    }else {value.priority=body.priority??0;check(integer(value.priority,0,9),fail,'invalid_priority');}
    if(kind==='gift'||kind==='event')Object.assign(value,rewardInput(body,fail,kind==='event'||value.status==='draft'));
  }
  const requestHash=await hash(canonical({kind,value}));
  const replay=async()=>{const old=await first(db,'SELECT request_hash,resource_id FROM bk_operator_mutations WHERE player_id=? AND mutation_id=?',player.id,mutationId);if(!old)return null;if(old.request_hash!==requestHash)fail(409,'mutation_id_reused','同じ操作番号を別の内容には使えません。');return {...await dashboard(db,now),replayed:true,createdId:old.resource_id};};
  const replayed=await replay();if(replayed)return replayed;
  const table=kind==='settings'?'bk_operator_settings':kind==='event'?'bk_events':kind==='notice'?'bk_notices':'bk_announcements';
  const old=kind==='settings'?await first(db,'SELECT * FROM bk_operator_settings WHERE singleton=1'):value.id?await first(db,`SELECT * FROM ${table} WHERE id=?`,value.id):null;
  if(value.id&&!old)fail(404,'item_not_found','編集する内容が見つかりません。');
  if(old&&kind!=='settings'&&kind!=='event'&&kind!=='notice'&&old.kind!==kind)fail(404,'item_not_found','編集する内容が見つかりません。');
  const expected=old?.revision??0;
  if(old)check(integer(value.revision,1),fail,'revision_required','編集前に最新の内容を読み込んでください。');
  else check(value.revision===null||value.revision===0,fail,'invalid_revision');
  if(old&&value.revision!==expected)fail(409,'content_conflict','別の操作で更新されました。最新の内容を確認してください。',{revision:expected});
  let locked=Boolean(old&&['message','gift','event'].includes(kind)&&(old.delivery_locked===1||old.status==='published'&&startOf(old)<=now));
  if(old&&['gift','event'].includes(kind))locked=locked||!!await first(db,'SELECT 1 AS claimed FROM bk_reward_claims WHERE item_id=? AND item_type=? LIMIT 1',old.id,kind);
  if(locked){
    if(value.status==='draft')fail(409,'delivery_locked','配信済みの内容は下書きへ戻せません。「終了」で公開を停止できます。');
    const previousCards=cardsOf(old).sort((a,b)=>a.cardId.localeCompare(b.cardId));
    if(value.target!==(old.target_player||'all')||['gift','event'].includes(kind)&&(value.treasure!==old.treasure||canonical(value.cards)!==canonical(previousCards)))fail(409,'delivery_locked','公開開始後は対象と報酬を変更できません。別の配信として作成してください。');
  }
  if(kind==='settings'&&value.maintenance)check(value.maintenanceEndAt===null||value.maintenanceEndAt>now,fail,'invalid_schedule','終了日時は現在より後に指定してください。');
  const end=value.endAt??value.expiresAt;
  if(value.status==='published')check(end===null||end===undefined||end>now,fail,'invalid_expiry','公開終了は現在より後に設定してください。');
  const id=kind==='settings'?'settings':value.id||crypto.randomUUID(),next=expected+1,guard='NOT EXISTS (SELECT 1 FROM bk_operator_mutations WHERE player_id=? AND mutation_id=?)',guardArgs=[player.id,mutationId];
  const start=value.publishAt??value.startAt??now;
  locked=locked||['message','gift','event'].includes(kind)&&value.status==='published'&&start<=now;
  let resource;
  if(kind==='settings')resource=statement(db,`INSERT INTO bk_operator_settings (singleton,notice,maintenance,maintenance_start_at,maintenance_end_at,maintenance_message,revision,updated_at,updated_by) SELECT 1,?,?,?,?,?,?,?,? WHERE ${guard} ON CONFLICT(singleton) DO UPDATE SET notice=excluded.notice,maintenance=excluded.maintenance,maintenance_start_at=excluded.maintenance_start_at,maintenance_end_at=excluded.maintenance_end_at,maintenance_message=excluded.maintenance_message,revision=excluded.revision,updated_at=excluded.updated_at,updated_by=excluded.updated_by WHERE bk_operator_settings.revision=?`,value.notice,value.maintenance?1:0,value.maintenanceStartAt,value.maintenanceEndAt,value.maintenanceMessage,next,now,player.id,...guardArgs,expected);
  else{
    const fields={title:value.title,body:value.body,status:value.status,revision:next,updated_at:now};
    if(kind==='notice')Object.assign(fields,{start_at:value.startAt??now,end_at:value.endAt,priority:value.priority});
    else Object.assign(fields,{target_player:value.target==='all'?null:value.target,treasure:value.treasure||0,cards_json:JSON.stringify(value.cards||[]),delivery_locked:locked?1:0,...(kind==='event'?{start_at:value.startAt,end_at:value.endAt}:{publish_at:start,expires_at:value.expiresAt})});
    const keys=Object.keys(fields),args=Object.values(fields);
    if(old){
      const sensitive=['message','gift','event'].includes(kind)&&(value.status==='draft'&&old.status!=='draft'||value.target!==(old.target_player||'all')||['gift','event'].includes(kind)&&(value.treasure!==old.treasure||canonical(value.cards)!==canonical(cardsOf(old).sort((a,b)=>a.cardId.localeCompare(b.cardId)))));
      // A scheduled delivery can start while this request is awaiting storage.
      // Reads/claims are checked in this same write transaction, not only above.
      const deliveryGuard=sensitive?` AND delivery_locked=0 AND NOT EXISTS (SELECT 1 FROM bk_reward_claims WHERE item_id=? AND item_type=?)${kind==='event'?'':' AND NOT EXISTS (SELECT 1 FROM bk_inbox_reads WHERE item_id=?)'}`:'';
      const deliveryArgs=sensitive?[id,kind,...(kind==='event'?[]:[id])]:[];
      resource=statement(db,`UPDATE ${table} SET ${keys.map(key=>key+'=?').join(',')} WHERE id=? AND revision=? AND ${guard}${deliveryGuard}`,...args,id,expected,...guardArgs,...deliveryArgs);
    }
    else{
      Object.assign(fields,{id,created_at:now,created_by:player.id});if(kind==='message'||kind==='gift')fields.kind=kind;
      resource=statement(db,`INSERT INTO ${table} (${Object.keys(fields).join(',')}) SELECT ${Object.keys(fields).map(()=>'?').join(',')} WHERE ${guard}`,...Object.values(fields),...guardArgs);
    }
  }
  const action=kind==='settings'?'settings.updated':old?kind+'.updated':value.status==='published'&&start<=now&&['message','gift'].includes(kind)?kind+'.sent':kind+'.created';
  const payload={id,title:value.title??null,target:value.target??null,status:value.status??null,revision:next,...(kind==='settings'?{maintenance:value.maintenance,maintenanceStartAt:value.maintenanceStartAt,maintenanceEndAt:value.maintenanceEndAt}:{}),...(value.treasure===undefined?{}:{treasure:value.treasure})};
  // changes() links audit/receipt insertion to the immediately preceding write
  // inside one transactional D1 batch. A losing revision never writes a receipt.
  const result=await db.batch([resource,
    statement(db,'INSERT INTO bk_operator_audit (id,player_id,action,payload_json,created_at) SELECT ?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),player.id,action,JSON.stringify(payload),now),
    statement(db,'INSERT INTO bk_operator_mutations (player_id,mutation_id,request_hash,resource_id,created_at) SELECT ?,?,?,?,? WHERE changes()=1',player.id,mutationId,requestHash,id,now)]);
  if(!Number(result[0]?.meta?.changes)){const again=await replay();if(again)return again;fail(409,'content_conflict','別の操作が先に確定しました。最新の内容を確認してください。');}
  return {...await dashboard(db,now),createdId:id};
}

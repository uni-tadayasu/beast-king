// Explicit cloud backup/restore; never create or replace an account session.
import {ONLINE_API_BASE,ONLINE_STORAGE_KEY} from '../online.js?v=20261124-26';
import {validateRebuildBackup} from './backup.js?v=20261124-26';
export function createRebuildCloudClient({storage=globalThis.localStorage,fetchImpl=globalThis.fetch?.bind(globalThis),baseUrl=ONLINE_API_BASE}={}){
 function credential(){
  try{const x=JSON.parse(storage?.getItem(ONLINE_STORAGE_KEY)||'null');return !x?.authInvalidated&&typeof x?.token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(x.token)?x.token:null}catch{return null}
 }
 async function request(method,body){
  const token=credential();if(!token)throw Error('従来版の設定でアカウント作成・端末連携を行ってください。');
  let response;
  try{response=await fetchImpl(baseUrl+'/rebuild/cloud-save',{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(12000)})}catch{throw Error('クラウド保存サーバーに接続できません。端末の保存データは保持しています。')}
  if(token!==credential())throw Error('アカウントが切り替わりました。再接続してください。');
  if(!response.ok){const e=Error(response.status===409?'別の端末で保存が更新されました。最新状態を確認してください。':response.status===401?'アカウントの認証が失効しています。端末連携を確認してください。':'クラウド保存を利用できません。端末内の保存は有効です。');e.code=response.status===409?'conflict':'unavailable';throw e}
  const raw=await response.json();
  if(raw?.ok!==true||typeof raw.accountId!=='string'||!raw.accountId)throw Error('クラウド保存の応答が無効です。');
  if(body&&raw.accountId!==body.accountId)throw Error('保存先のアカウントが変わりました。');
  let save=null;
  if(raw.save!==null){
   if(!Number.isSafeInteger(raw.save?.revision)||raw.save.revision<1||!Number.isFinite(raw.save.updatedAt))throw Error('クラウド保存の更新情報が無効です。');
   save={revision:raw.save.revision,updatedAt:raw.save.updatedAt,data:validateRebuildBackup(raw.save.data)};
  }
  return {accountId:raw.accountId,save};
 }
 return Object.freeze({available:()=>!!credential(),read:()=>request('GET'),write:({accountId,revision,data,mutationId=crypto.randomUUID()})=>request('POST',{accountId,revision,mutationId,data:validateRebuildBackup(data)})});
}

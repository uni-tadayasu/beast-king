// Entitlement transport: uses an existing authenticated account session.
// Never store a grant, activation code, or entitlement in the local save.
import {ONLINE_API_BASE,ONLINE_STORAGE_KEY} from '../online.js?v=20261124-32';
import {getCard,SECOND_REGALIA_ID,validateDeck,validateSpecialDeck} from './catalog.js?v=20261124-32';
export function createOperatorClient({storage=globalThis.localStorage,fetchImpl=globalThis.fetch?.bind(globalThis)}={}){
 const credential=()=>{
  try{
   const v=JSON.parse(storage?.getItem(ONLINE_STORAGE_KEY)||'null');
   return !v?.authInvalidated&&typeof v?.token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v.token)?v.token:null;
  }catch{return null}
 };
 async function request(method,code){
  const token=credential();
  if(!token)throw Error('先に運営アカウントの端末連携を完了してください。');
  const headers={Authorization:'Bearer '+token};
  if(method==='POST')headers['Content-Type']='application/json';
  let response;
  try{response=await fetchImpl(ONLINE_API_BASE+'/rebuild/operator-deck',{method,headers,cache:'no-store',credentials:'omit',redirect:'error',...(method==='POST'?{body:JSON.stringify({code})}:{})})}
  catch{throw Error('運営認証サーバーに接続できません。')}
  if(credential()!==token)throw Error('アカウントが切り替わりました。');
  if(!response.ok)throw Error('運営認証を確認できませんでした。');
  const data=await response.json();
  if(data?.ok!==true||typeof data.entitled!=='boolean')throw Error('運営認証の応答を確認できません。');
  if(!data.entitled)return Object.freeze({entitled:false});
  const deck=data.deck,collection=data.collection;
  if(deck?.id!=='kirahara'||!validateDeck(deck.main).valid||!validateSpecialDeck(deck.special).valid||!collection||typeof collection!=='object')throw Error('運営デッキの応答が無効です。');
  const needed={};for(const id of [...deck.main,...deck.special])needed[id]=(needed[id]||0)+1;
  if(needed[SECOND_REGALIA_ID]!==2||Object.keys(needed).some(id=>!getCard(id)||collection[id]!==needed[id])||Object.keys(collection).length!==Object.keys(needed).length)throw Error('運営デッキのカード情報が無効です。');
  const artwork=typeof data.artwork==='string'&&/^data:image\/(?:svg\+xml|webp);base64,[A-Za-z0-9+/=]+$/.test(data.artwork)?data.artwork:null;
  return Object.freeze({entitled:true,artwork,deck:Object.freeze({id:deck.id,name:'𠮷良原デッキ',main:Object.freeze([...deck.main]),special:Object.freeze([...deck.special])}),collection:Object.freeze({...needed})});
 }
 return Object.freeze({status:()=>request('GET'),activate:code=>request('POST',String(code??''))});
}

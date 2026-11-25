import {splitReadingText} from './reading-pages.js?v=20261125-34';
import {bindOutsideDismiss} from './overlay-dismiss.js?v=20261125-34';
import {createSummonScene} from './summon-scene.js?v=20261125-34';
import {createExperienceController} from './experience-fx.js?v=20261125-34';
import {BRAND_ICONS} from './brand-icons.js?v=20261125-34';
import {CARD_ART_CROPS} from './card-art-layouts.js?v=20261125-34';
import {CARD_ART_EXPANSIONS} from './card-art-expansion.js?v=20261125-34';
import {CARD_ART_FIFTH} from './card-art-fifth.js?v=20261125-34';
import {CARD_ART_OVERRIDES} from './card-art-overrides.js?v=20261125-34';
import {CARD_ART_USER_OVERRIDES} from './card-art-user.js?v=20261125-34';
import {PREMIUM_CARD_ART} from './card-art-premium.js?v=20261125-34';
import {PREMIUM_DECK,PREMIUM_DECK_ID} from './premium-deck.js?v=20261125-34';
import { CARDS, DECK_MIN, DECK_COPY_LIMIT, ELEMENTS, TYPE_LABELS, RARITY_LABELS, KEYWORD_LABELS, STARTER_DECKS, DECK_PRESETS, getDeckPreset, getCard, validateDeck, validateSpecialDeck, SPECIAL_DECK_SIZE, POINT_SCALE, FUSION_MATERIAL_BONUS, MODEL_LABELS, SUBTYPE_LABELS, EXPANSION_DECKS, EXPANSION_FAMILIES, getExpansionDeck } from './catalog.js?v=20261125-34';
import {createMusicController} from './music.js?v=20261125-34';
import {createOnlineClient} from './online.js?v=20261125-34';
import {createCloudSync} from './cloud-sync.js?v=20261125-34';
import {createAccountUi} from './account-ui.js?v=20261125-34';
import {setPublicNotice} from './news.js?v=20261125-34';
import {createPresenceController} from './presence.js?v=20261125-34';
import {entryView} from './entry.js?v=20261125-34';
import {soloView} from './mode-views.js?v=20261125-34';
import {EVENT_DECKS,EVENT_DECK_GROUPS,getEventDeck} from './event-decks.js?v=20261125-34';
import {createEventProgress,normalizeEventProgress,recordEventResult} from './event-battles.js?v=20261125-34';
import {eventChallengeView} from './event-views.js?v=20261125-34';
import {rulebookView} from './rules-view.js?v=20261125-34';
import {homeDashboard,treasureShop,packOddsView} from './product-views.js?v=20261125-34';
import {calculateCardLayout,calculateFittedCardLayout,calculateWorkshopTileLayout} from './viewport.js?v=20261125-34';
import {battleLogView} from './battle-log.js?v=20261125-34';
import {handInspectorView} from './hand-inspector.js?v=20261125-34';
import {CAMPAIGN_BATTLES,createCampaignProgress,normalizeCampaignProgress,getCampaignBattle,isCampaignBattleUnlocked,getNextCampaignBattle,recordCampaignResult} from './campaign.js?v=20261125-34';
import {PACKS,getPack,PACK_ID,PACK_NAME,PACK_DESCRIPTION,PACK_COST,PACK_SIZE,STARTING_TREASURE,EXTRA_COPY_TREASURE,RARITY_ODDS,GUARANTEED_RARITY_ODDS,PACK_CARD_IDS,createStarterCollection,hasStarterCards,migrateLegacyStarters,normalizeCollection,grantDeckCollection,openPack,getBattleReward,quoteStarterPurchase,purchaseStarter,quoteDeckRecipe} from './shop.js?v=20261125-34';
import { newGame, playCard, attack, endTurn, runCpuTurn, getLegalTargets, getAttackTargets, canAttack, getPlayableCards, getCardCost, getFusionChoices, getEligibleFusionMaterials, validateFusionSelection, MAX_HEART_POINTS } from './engine.js?v=20261125-34';

const $ = (s, r=document) => r.querySelector(s);
const layoutWidth=()=>window.BeastKingViewport?.get().width||window.innerWidth;
const layoutHeight=()=>window.BeastKingViewport?.get().height||window.innerHeight;
const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Number(n).toLocaleString('ja-JP');
const storageKey = 'beast-king-v6';
const LEVELS = {easy:{name:'見習い',caption:'ゆっくり覚える'},normal:{name:'策士',caption:'読み合いを楽しむ'},hard:{name:'覇王',caption:'腕を試す'}};
const elementMap = Object.fromEntries(ELEMENTS.map(e=>[e.id,e]));
const originOrder = Object.fromEntries(ELEMENTS.map((e,i)=>[e.id,i]));
const subtypeOptions=[['attack','beast','アタック型（通常魔獣）'],['defense','beast','ディフェンス型（通常魔獣）'],['power','miracle','威力カード'],['regeneration','miracle','再生（回復）カード'],['reflection','gimmick','反射カード'],['support','gimmick','魔獣サポートカード']];
const typeColors = {beast:'#7eb5a6',miracle:'#a996d3',gimmick:'#c7a76f',fusion:'#c9a4ef'};
const icons = BRAND_ICONS;
const icon = name => `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24">${icons[name]||icons.spark}</svg>`;
const baseData = (starterId=STARTER_DECKS[0].id) => {const first=STARTER_DECKS.find(d=>d.id===starterId)||STARTER_DECKS[0];return ({version:6,playerName:'',profileOrigin:'mountain',campaignProgress:createCampaignProgress(),eventProgress:createEventProgress(),bgm:true,bgmVolume:.5,treasure:STARTING_TREASURE,collection:createStarterCollection({},first.id),rewardedMatches:[],lastPack:null,deckName:first.name,deckIds:[...first.ids],specialIds:[...first.specialIds],starter:first.id,freeStarterId:first.id,draft:null,sound:true,motion:true,stats:{played:0,won:0,drawn:0},game:null});};
function validSavedGame(g) {
  const known = (ids,types) => Array.isArray(ids)&&ids.length<=36&&ids.every(id=>types.includes(getCard(id)?.type));
  return !!(g && g.rulesVersion===2 && (!g.eventBattleId&&!g.eventMatchId||!!getEventDeck(g.eventBattleId)&&typeof g.eventMatchId==='string'&&g.eventMatchId.trim().length>0&&g.eventMatchId.length<=200&&!g.campaignBattleId) && (g.openingRuleVersion===undefined||g.openingRuleVersion===1) && Array.isArray(g.players) && g.players.length===2 && [0,1].includes(g.active) && [null,0,1,'draw'].includes(g.winner) && Number.isInteger(g.turn) && g.turn>0 && g.turn<10000 && Number.isFinite(g.seed) && Number.isFinite(g.nextUid) && Array.isArray(g.log) && g.log.every(l=>typeof l.text==='string'&&typeof l.type==='string') && g.players.every(p=>p && ['core','shield','energy','maxEnergy','fatigue'].every(k=>Number.isFinite(p[k])&&p[k]>=0) && p.core<=MAX_HEART_POINTS && p.hand?.length<=4 && known(p.deck,['beast','miracle','gimmick'])&&known(p.hand,['beast','miracle','gimmick','fusion']) && known(p.grave,['beast','miracle','gimmick','fusion']) && known(p.banished,['beast','fusion']) && known(p.special,['fusion']) && p.special.length<=4 && Array.isArray(p.field)&&p.field.length<=4&&p.field.every(u=>['beast','fusion'].includes(getCard(u.cardId)?.type)&&typeof u.uid==='string'&&['attack','hp','maxHp'].every(k=>Number.isFinite(u[k])&&u[k]>=0)&&Array.isArray(u.keywords)) && Array.isArray(p.traps)&&p.traps.length<=2&&p.traps.every(t=>getCard(t.cardId)?.type==='gimmick')&&validSavedPool(p)));
}
function validSavedPool(p){const ids=[...p.deck,...p.hand,...p.special,...p.grave,...p.banished,...p.field.map(u=>u.cardId),...p.traps.map(t=>t.cardId)];return validateDeck(ids.filter(id=>getCard(id)?.type!=='fusion')).valid&&validateSpecialDeck(ids.filter(id=>getCard(id)?.type==='fusion')).valid;}
function restoreGame(g,version){if(!g)return null;if(version<5&&g.rulesVersion!==2&&Array.isArray(g.players)){for(const p of g.players){p.special??=[];p.banished??=[];p.specialSize??=p.special.length;p.core=p.core>0?Math.min(MAX_HEART_POINTS,p.core*POINT_SCALE+MAX_HEART_POINTS-30*POINT_SCALE):0;p.shield*=POINT_SCALE;if(Array.isArray(p.field))for(const u of p.field)for(const k of ['attack','hp','maxHp'])u[k]*=POINT_SCALE;}g.rulesVersion=2;if(Array.isArray(g.log)){g.log.push({type:'info',text:'ハートポイント5,000・戦闘値100単位のルールへ引き継ぎました。'});g.log=g.log.slice(-1000);}}return validSavedGame(g)?g:null;}
function restoreDeckCopies(ids,owned,special=false,fill=true){
 const types=special?['fusion']:['beast','miracle','gimmick'],size=special?4:32;
 if(!Array.isArray(ids)||ids.length>size||(fill&&ids.length!==size)||ids.some(id=>!types.includes(getCard(id)?.type)))return null;
 const used=new Map(),extra=[];
 const result=ids.map((id,index)=>{const count=used.get(id)||0;if(count>=Math.min(DECK_COPY_LIMIT,owned[id]||0)){extra.push({index,type:getCard(id).type});return null;}used.set(id,count+1);return id;});
 if(!fill)return result.filter(Boolean);
 const pool=[...new Set([...ids,...Object.keys(owned)])].filter(id=>types.includes(getCard(id)?.type));
 for(const {index,type} of extra){const available=id=>(used.get(id)||0)<Math.min(DECK_COPY_LIMIT,owned[id]||0);const replacement=pool.find(id=>getCard(id).type===type&&available(id))||pool.find(available);if(!replacement)return null;result[index]=replacement;used.set(replacement,(used.get(replacement)||0)+1);}
 return result;
}
const DECK_BANK_LIMIT=16;
const deckRecord=(id,name,ids,specialIds)=>({id,name,ids:[...ids],specialIds:[...specialIds]});
const starterSlot=id=>'starter-'+id;
function validBankId(id){return typeof id==='string'&&(/^(?:starter-(?:star-crown|azure-memory|crimson-pulse|sky-promise)|custom-[a-z0-9-]{1,60}|operator-kirahara-v1)$/.test(id));}
function validBankDeck(d,owned){
 if(!d||!validBankId(d.id)||typeof d.name!=='string'||!d.name.trim()||d.name.length>28||!validateDeck(d.ids).valid||!validateSpecialDeck(d.specialIds).valid)return false;
 return [...d.ids,...d.specialIds].every(id=>[...d.ids,...d.specialIds].filter(x=>x===id).length<=(owned[id]||0));
}
function cleanBankDraft(d,owned){
 if(!d||typeof d.name!=='string'||!Array.isArray(d.ids)||!Array.isArray(d.specialIds))return null;
 const ids=restoreDeckCopies(d.ids,owned,false,false),specialIds=restoreDeckCopies(d.specialIds,owned,true,false);
 return ids&&specialIds?{name:d.name.slice(0,28),ids,specialIds}:null;
}
function sameBankDeck(a,b){return a?.name===b?.name&&Array.isArray(a?.ids)&&Array.isArray(a?.specialIds)&&a.ids.join('|')===b.ids?.join('|')&&a.specialIds.join('|')===b.specialIds?.join('|');}
function initializeDeckBank(target,source=target){
 const deleted=new Set((Array.isArray(source?.deletedStarterDeckIds)?source.deletedStarterDeckIds:[]).filter(id=>STARTER_DECKS.some(d=>starterSlot(d.id)===id)));
 target.deletedStarterDeckIds=[...deleted];
 const defaults=STARTER_DECKS.filter(d=>!deleted.has(starterSlot(d.id))&&hasStarterCards(target.collection,d.id)).map(d=>deckRecord(starterSlot(d.id),d.name,d.ids,d.specialIds));
 const records=new Map();
 for(const d of (Array.isArray(source?.deckLibrary)?source.deckLibrary:[]).slice(0,DECK_BANK_LIMIT)){
  if(!validBankDeck(d,target.collection)||(!records.has(d.id)&&records.size>=DECK_BANK_LIMIT))continue;
  const record=deckRecord(d.id,d.name,d.ids,d.specialIds);if(Number.isInteger(d.recipeRevision))record.recipeRevision=d.recipeRevision;const draft=cleanBankDraft(d.draft,target.collection);if(draft)record.draft=draft;records.set(record.id,record);
 }
 for(const d of defaults)if(!records.has(d.id)&&records.size<DECK_BANK_LIMIT)records.set(d.id,d);
 const active={name:target.deckName,ids:target.deckIds,specialIds:target.specialIds};
 let slot=records.get(source?.activeDeckId);
 if(!sameBankDeck(slot,active))slot=[...records.values()].find(d=>sameBankDeck(d,active));
 if(!slot){
  const id=records.has('custom-original')?'custom-imported':'custom-original';
  if(records.size>=DECK_BANK_LIMIT&&!records.has(id)){const removable=[...records.keys()].reverse().find(k=>k.startsWith('custom-')&&k!==source?.editingDeckId);if(removable)records.delete(removable);}
  slot=deckRecord(id,active.name,active.ids,active.specialIds);records.set(id,slot);
 }
 let editing=records.get(source?.editingDeckId)||slot;
 if(target.draft){editing.draft=cleanBankDraft(target.draft,target.collection)||undefined;}
 target.deckLibrary=[...records.values()];target.activeDeckId=slot.id;target.editingDeckId=editing.id;
 target.draft=editing.draft?{name:editing.draft.name,ids:[...editing.draft.ids],specialIds:[...editing.draft.specialIds]}:null;
}
function ensureDeckBank(){if(!Array.isArray(data.deckLibrary)||!data.deckLibrary.some(d=>d.id===data.activeDeckId))initializeDeckBank(data);}
function bankEntry(id){ensureDeckBank();return data.deckLibrary.find(d=>d.id===id);}
function currentBankEntry(){return bankEntry(data.editingDeckId)||bankEntry(data.activeDeckId);}
function loadBankEntry(id,{persistNow=true}={}){
 const d=bankEntry(id);if(!d||!validBankDeck(d,data.collection)||id==='operator-kirahara-v1'&&!accountUi?.getOperatorDeck?.())return false;
 data.editingDeckId=id;const source=d.draft||d;
 data.draft=d.draft?{name:source.name,ids:[...source.ids],specialIds:[...source.specialIds]}:null;
 workingDeck=[...source.ids];workingSpecial=[...source.specialIds];workingName=source.name;deckTapPending=null;deckSection='main';deckListPage=1;
 if(persistNow)persist(true);return true;
}
function selectBankDeck(id){
 if(!loadBankEntry(id)){toast('所持カードで編成できるデッキを選んでください。',true);render();return false;}render();return true;
}
function registerOwnedStarter(id){
 const preset=STARTER_DECKS.find(d=>d.id===id);
 if(!preset||!hasStarterCards(data.collection,id))return false;
 ensureDeckBank();const slot=starterSlot(id);
 if(bankEntry(slot))return true;
 if(data.deckLibrary.length>=DECK_BANK_LIMIT)return false;
 data.deckLibrary.push(deckRecord(slot,preset.name,preset.ids,preset.specialIds));
 data.deletedStarterDeckIds=(data.deletedStarterDeckIds||[]).filter(id=>id!==slot);
 return true;
}
function loadStarterFromShop(id){
 if(!hasStarterCards(data.collection,id)){toast('このスターターは未所持です。ショップで購入してください。',true);return false;}
 if(!registerOwnedStarter(id)||!loadBankEntry(starterSlot(id))){toast('デッキ保存枠または所持枚数を確認してください。',true);return false;}
 navigate('deck');toast('「'+workingName+'」を読み込みました。');return true;
}
function setActiveBankDeck(d){
 data.activeDeckId=d.id;data.deckName=d.name;data.deckIds=[...d.ids];data.specialIds=[...d.specialIds];
 data.starter=DECK_PRESETS.find(p=>p.name===d.name&&p.ids.join('|')===d.ids.join('|')&&p.specialIds.join('|')===d.specialIds.join('|'))?.id||'';
}
function activateSelectedBank(){
 const d=currentBankEntry();if(!d||d.draft||d.id==='operator-kirahara-v1'&&!accountUi?.getOperatorDeck?.()||!validBankDeck(d,data.collection))return false;
 setActiveBankDeck(d);persist(true);render();toast('「'+d.name+'」を対戦用に設定しました。');return true;
}
function createBankDeck(){
 ensureDeckBank();if(data.deckLibrary.length>=DECK_BANK_LIMIT){toast('保存できるデッキは16個までです。',true);return false;}
 const id='custom-'+crypto.randomUUID().toLowerCase();const d=deckRecord(id,'マイデッキ '+(data.deckLibrary.filter(x=>x.id.startsWith('custom-')).length+1),data.deckIds,data.specialIds);
 data.deckLibrary.push(d);loadBankEntry(id);render();return true;
}
// Deleting an editor entry never removes collection cards or a running match.
// Keep a complete, authorized saved deck available for the next battle.
function bankDeletionPlan(id){
 ensureDeckBank();
 const usable=d=>validBankDeck(d,data.collection)&&(d.id!=='operator-kirahara-v1'||!!accountUi?.getOperatorDeck?.());
 const entry=data.deckLibrary.find(d=>d.id===id);
 if(!entry||!usable(entry))return {ok:false,reason:'削除するデッキを選び直してください。'};
 const remaining=data.deckLibrary.filter(d=>d.id!==id&&usable(d));
 const fallback=remaining.find(d=>d.id===data.activeDeckId)||remaining[0];
 if(!fallback)return {ok:false,reason:'最後の使用可能なデッキは削除できません。先に別のデッキを作成してください。'};
 return {ok:true,entry,fallback,changesActive:data.activeDeckId===id};
}
function requestBankDeckDelete(id=data.editingDeckId){
 const plan=bankDeletionPlan(id);
 if(!plan.ok){toast(plan.reason,true);return false;}
 const {entry,fallback,changesActive}=plan;
 currentModal={kind:'deck-delete',label:'保存デッキを削除',id:entry.id,record:JSON.stringify(entry),activeId:data.activeDeckId,fallbackId:fallback.id};
 showModal(`<div class="eyebrow">DECK MANAGEMENT</div><h2>このデッキを削除しますか？</h2><p class="deck-delete-name">「${esc(entry.name)}」</p><p class="modal-intro">この保存枠${entry.draft?'と編集中の内容':''}を削除します。<strong>所持カード・秘宝・戦績は減りません。</strong></p>${entry.draft&&entry.draft.name!==entry.name?`<p class="modal-intro">編集中の名前：${esc(entry.draft.name)}</p>`:''}<p class="modal-intro">${changesActive?'使用中のデッキは「'+esc(fallback.name)+'」に切り替わります。':'使用中の「'+esc(data.deckName)+'」はそのままです。'}${game?.winner===null?' 中断中の対戦はそのまま再開できます。':''}</p><div class="modal-actions"><button class="btn" data-action="close-modal">キャンセル</button><button class="btn danger" data-action="confirm-deck-bank-delete" data-id="${esc(entry.id)}">このデッキを削除</button></div>`);
 return true;
}
function confirmBankDeckDelete(id){
 const pending=currentModal;
 if(pending?.kind!=='deck-delete'||pending.id!==id)return false;
 const plan=bankDeletionPlan(id);
 if(!plan.ok){closeModal();render();toast(plan.reason,true);return false;}
 if(pending.record!==JSON.stringify(plan.entry)||pending.activeId!==data.activeDeckId||pending.fallbackId!==plan.fallback.id){
  requestBankDeckDelete(id);toast('デッキの内容が更新されました。削除する内容をもう一度確認してください。',true);return false;
 }
 const {entry,fallback,changesActive}=plan;
 data.deckLibrary=data.deckLibrary.filter(d=>d.id!==id);
 if(id.startsWith('starter-'))data.deletedStarterDeckIds=[...new Set([...(data.deletedStarterDeckIds||[]),id])];
 if(changesActive)setActiveBankDeck(fallback);
 // A different saved deck can retain its own incomplete draft for later editing.
 const editing=data.editingDeckId===id?fallback.id:data.editingDeckId;
 loadBankEntry(editing,{persistNow:false});
 persist(true);closeModal();render();
 toast('「'+entry.name+'」を削除しました。所持カードはそのままです。');
 return true;
}
function deckBankToolbar(){
 ensureDeckBank();const entry=currentBankEntry(),visible=data.deckLibrary.filter(d=>d.id!=='operator-kirahara-v1'||accountUi?.getOperatorDeck?.()),deletion=bankDeletionPlan(entry?.id);
 return `<section class="deck-bank-toolbar"><label for="deck-bank-select"><strong>デッキ別編集</strong><select id="deck-bank-select" data-change="deck-bank" aria-label="編集するデッキを選択">${visible.map(d=>`<option value="${esc(d.id)}" ${d.id===data.editingDeckId?'selected':''}>${esc(d.name)}${d.id===data.activeDeckId?'（使用中）':''}${d.draft?'・編集中':''}</option>`).join('')}</select></label><div class="deck-bank-actions"><button class="btn small" data-action="deck-bank-new" ${data.deckLibrary.length>=DECK_BANK_LIMIT?'disabled':''}>＋ 新規デッキ</button><button class="btn small" data-action="deck-bank-use" ${entry?.id===data.activeDeckId||entry?.draft?'disabled':''}>対戦に使用</button><button class="btn small danger" data-action="deck-bank-delete" ${deletion.ok?'':'disabled aria-describedby="deck-delete-help"'}>削除</button></div><p>使用中：<b>${esc(data.deckName)}</b> · 保存 ${visible.length}/16</p><p id="deck-delete-help" class="deck-delete-help">${deletion.ok?'デッキを削除しても所持カードは残ります。':'最後のデッキは削除できません。'}</p></section>`;
}

function restoreData(saved) {
  const initial=STARTER_DECKS.find(d=>d.id===saved?.freeStarterId)||STARTER_DECKS.find(d=>d.id===saved?.starter)||STARTER_DECKS[0],restored=baseData(initial.id);
  if(!saved||![3,4,5,6].includes(saved.version)){initializeDeckBank(restored);return restored;}
  let owned=normalizeCollection(saved.collection);
  if(saved.version<6){
   owned=grantDeckCollection(createStarterCollection(owned,initial.id),[...(Array.isArray(saved.deckIds)?saved.deckIds:[]),...(Array.isArray(saved.specialIds)?saved.specialIds:[])]);
   const q=saved.game?.players?.[0];if(q)owned=grantDeckCollection(owned,[...(q.deck||[]),...(q.special||[]),...(q.hand||[]),...(q.grave||[]),...(q.banished||[]),...(q.field||[]).map(u=>u.cardId),...(q.traps||[]).map(t=>t.cardId)]);
  }
  const operator=Array.isArray(saved.deckLibrary)?saved.deckLibrary.find(d=>d.id==='operator-kirahara-v1'&&validBankDeck(d,owned)):null;
  const migration=migrateLegacyStarters(saved,owned,{preferred:initial.id,protectedIds:operator?[...operator.ids,...operator.specialIds]:[]});
  owned=migration.collection;restored.freeStarterId=migration.freeStarterId;
  const priorActive={id:saved.activeDeckId||'custom-original',name:saved.deckName,ids:saved.deckIds,specialIds:saved.specialIds};
  const replaceActive=migration.removed>0&&!validBankDeck(priorActive,owned);
  let main=replaceActive?[...initial.ids]:restoreDeckCopies(saved.deckIds,owned),special=replaceActive?[...initial.specialIds]:restoreDeckCopies(saved.specialIds,owned,true);
  if(saved.version===3&&main){
   const preset=getDeckPreset(saved.starter)||initial,e=DECK_PRESETS.indexOf(preset),oldDraw=`M${String(e*32+3).padStart(4,'0')}`,legacy=[...preset.ids.filter(id=>id!=='M0256'),oldDraw,oldDraw];
   if([...main].sort().join(',')===legacy.sort().join(',')&&preset.ids.every(id=>preset.ids.filter(x=>x===id).length<=(owned[id]||0)))main=[...preset.ids];
  }
  let fallback=null;
  if(!validateDeck(main).valid||!validateSpecialDeck(special).valid){
   const records=Array.isArray(saved.deckLibrary)?saved.deckLibrary:[];
   fallback=records.find(d=>d.id===saved.activeDeckId&&validBankDeck(d,owned))||records.find(d=>validBankDeck(d,owned))||STARTER_DECKS.find(d=>hasStarterCards(owned,d.id));
   const pool=(fusion,size)=>Object.entries(owned).filter(([id])=>(getCard(id)?.type==='fusion')===fusion).flatMap(([id,n])=>Array(Math.min(DECK_COPY_LIMIT,n)).fill(id)).slice(0,size);
   if(!validateDeck(main).valid)main=fallback?[...fallback.ids]:pool(false,32);
   if(!validateSpecialDeck(special).valid)special=fallback?[...fallback.specialIds]:pool(true,4);
   // Last-resort recovery for an unplayable corrupted save; never replenish
   // the inventory of a valid current-format save.
   if(!validateDeck(main).valid||!validateSpecialDeck(special).valid){
    owned=createStarterCollection(owned,initial.id);
    if(!validateDeck(main).valid)main=[...initial.ids];
    if(!validateSpecialDeck(special).valid)special=[...initial.specialIds];
   }
  }
  restored.deckIds=main;restored.specialIds=special;
  restored.deckName=String(replaceActive?initial.name:(saved.deckName||fallback?.name||initial.name)).slice(0,28);
  restored.starter=replaceActive?initial.id:String(saved.starter||'');restored.collection=owned;
  restored.playerName=typeof saved.playerName==='string'?saved.playerName.trim().slice(0,16):'';restored.profileOrigin=elementMap[saved.profileOrigin]?saved.profileOrigin:'mountain';restored.campaignProgress=normalizeCampaignProgress(saved.campaignProgress);restored.eventProgress=normalizeEventProgress(saved.eventProgress);
  restored.sound=saved.sound===undefined?true:saved.sound===true;restored.motion=saved.motion!==false;restored.bgm=saved.bgm!==false;restored.bgmVolume=Number.isFinite(saved.bgmVolume)?Math.max(0,Math.min(1,saved.bgmVolume)):.5;
  if(saved.version>=6){restored.treasure=Number.isSafeInteger(saved.treasure)&&saved.treasure>=0?saved.treasure:STARTING_TREASURE;restored.rewardedMatches=Array.isArray(saved.rewardedMatches)?saved.rewardedMatches.filter(id=>typeof id==='string').slice(-200):[];if(Array.isArray(saved.lastPack?.pulls)&&saved.lastPack.pulls.length===12&&saved.lastPack.pulls.every(x=>getCard(x.cardId)))restored.lastPack={packId:getPack(saved.lastPack.packId)?.id||PACK_ID,pulls:saved.lastPack.pulls.map(x=>({cardId:x.cardId,isNew:x.isNew===true,converted:x.converted===true,guaranteed:x.guaranteed===true})),bonusTreasure:Number.isSafeInteger(saved.lastPack.bonusTreasure)&&saved.lastPack.bonusTreasure>=0?saved.lastPack.bonusTreasure:0,...(Number.isSafeInteger(saved.lastPack.openedAt)&&saved.lastPack.openedAt>=0?{openedAt:saved.lastPack.openedAt}:{})};}
  if(saved.stats&&['played','won','drawn'].every(k=>Number.isInteger(saved.stats[k])&&saved.stats[k]>=0)&&saved.stats.won+saved.stats.drawn<=saved.stats.played)restored.stats={played:saved.stats.played,won:saved.stats.won,drawn:saved.stats.drawn};
  if(!replaceActive&&saved.draft&&Array.isArray(saved.draft.ids)&&saved.draft.ids.length<=32&&saved.draft.ids.every(id=>['beast','miracle','gimmick'].includes(getCard(id)?.type))){const special=saved.draft.specialIds;restored.draft={ids:restoreDeckCopies(saved.draft.ids,owned,false,false)||[],specialIds:restoreDeckCopies(special,owned,true,false)||[...restored.specialIds],name:String(saved.draft.name||'マイデッキ').slice(0,28)};}
  restored.game=restoreGame(saved.game,saved.version);
  const source=replaceActive?{...saved,activeDeckId:starterSlot(initial.id),editingDeckId:starterSlot(initial.id)}:saved;
  initializeDeckBank(restored,source);return restored;
}
let data=baseData(),storageAvailable=true;
try {const saved=JSON.parse(localStorage.getItem(storageKey)||localStorage.getItem('beast-king-v5')||localStorage.getItem('beast-king-v4')||localStorage.getItem('beast-king-v3')||'null');data=restoreData(saved);if(saved&&data.playerName&&!saved.freeStarterId)localStorage.setItem(storageKey,JSON.stringify(data));}catch{storageAvailable=false;}
initializeDeckBank(data);
let game=data.game;
let cpuGame=game;
let entered=Boolean(data.playerName);
let entryNameDraft=data.playerName;
let entryStarterDraft=STARTER_DECKS.some(d=>d.id===data.starter)?data.starter:STARTER_DECKS[0].id;
let onlineBattle=false;
const online={profile:null,phase:'idle',room:null,queue:null,match:null,busy:false,connecting:false,error:'',syncRequired:false,resultShown:null,clockOffset:0,queueReceivedAt:0,activityKey:null,membershipKind:null,requestedRoom:null,cancelling:false};
let page=['home','collection','deck','rules','shop','online','solo','events'].includes(location.hash.slice(1))?location.hash.slice(1):'home';
let workingDeck=[...(data.draft?.ids||data.deckLibrary.find(d=>d.id===data.editingDeckId)?.ids||data.deckIds)];
let workingSpecial=[...(data.draft?.specialIds||data.deckLibrary.find(d=>d.id===data.editingDeckId)?.specialIds||data.specialIds)];
let workingName=data.draft?.name||data.deckLibrary.find(d=>d.id===data.editingDeckId)?.name||data.deckName;
const freshCardSearch=()=>({text:'',type:'all',family:'all',subtype:'all',setId:'all',element:'all',rarity:'all',sort:'number',page:1});
let deckSearch=freshCardSearch(),collectionSearch=freshCardSearch();
let search=page==='deck'?deckSearch:collectionSearch;
let selected=null;
let battleLogOpen=false;
let handEffectsOpen=false;
let inspectedHandId=null;
let battleEffectZone='hand',battleEffectKey=null;
let cpuTimer=null;
let currentModal=null;
let modalReturnFocus=null;
let difficulty='normal';
let cpuDeckId='random';
let campaignBattleId=getNextCampaignBattle(data.campaignProgress)?.id||CAMPAIGN_BATTLES[0].id;
let lobbyMode='all';
let soloSection='campaign',campaignMapPage=null;
let eventGroup='all',eventListPage=0,eventDeckId=EVENT_DECKS[0].id,eventSection='opponents';
const eventCompact=()=>layoutHeight()<=540;
const eventPageSize=()=>eventCompact()?2:layoutHeight()>650&&layoutWidth()>950?6:4;
let shopSection='boosters',selectedPackId=PACKS.at(-1).id;
let rulebookSection='basics';
let deckSection='main',deckListPage=1,deckFilterScope='all';
let deckTapMode=false,deckTapPending=null,deckPointer=null,deckSuppressClickUntil=0;
let deckAdvancedFilters=false;
let cardLayout=null,deckImageCount=0,deckImageLayout=null;
let saveTimer;
let packOpening=false,settingsTab='sound',collectionScope='all';
const favoriteKey='beast-king-card-favorites-v1';
let favoriteCards=new Set();
try{const savedFavorites=JSON.parse(localStorage.getItem(favoriteKey)||'[]');if(Array.isArray(savedFavorites))favoriteCards=new Set(savedFavorites.filter(id=>!!getCard(id)));}catch{}
let cloudRequested=false,cloudReady=false,cloudStarting=null,applyingCloud=false;
let cloudStatus={phase:'idle',busy:false,dirty:false,revision:null,playerId:null,lastSyncedAt:null,error:null,conflict:null};
let accountUi=null;
let titleDefault='ビーストキング｜36枚で戦う無料オンラインカードゲーム';
const app=$('#app');
const modalRoot=$('#modal-root');
const experience=createExperienceController();
const summonScene=createSummonScene({document,window,getCard});
const musicController=createMusicController({onstate:updateMusicControls});
const onlineClient=createOnlineClient({onUpdate:receiveOnlineUpdate,onError:receiveOnlineError});
const presenceController=createPresenceController({client:onlineClient});
const cloudSync=createCloudSync({client:onlineClient,getLocalData:cloudData,applyRemoteData:applyCloudData,onState:receiveCloudState,canApplyRemote:()=>!onlineBattle&&!(page==='duel'&&game?.winner===null)});
accountUi=createAccountUi({client:onlineClient,cloud:cloudSync,ensureReady:initializeCloud,isBattleActive:()=>!onlineClient.getStatus().authInvalidated&&(onlineBattle||online.match?.status==='active'||['waiting','joining'].includes(online.phase))||(!onlineBattle&&page==='duel'&&game?.winner===null),showModal,setModal:value=>{currentModal=value;},getModal:()=>currentModal,closeModal,render,toast,esc,icon,getCard,setPublicNotice,beforeLink:prepareDeviceLink,afterLink:()=>{void accountUi.refreshOperatorDeck();return presenceController.start();},onOperatorDeckChange:operatorDeckChanged,onEquipOperatorDeck:equipOperatorDeck});
async function prepareDeviceLink(){await presenceController.stop(true);if(onlineClient.getStatus().authInvalidated){onlineClient.stopPolling();onlineBattle=false;online.match=null;online.phase='idle';game=cpuGame;if(page==='duel'){page='home';history.replaceState(null,'','#home');}render();}}
function cloudData(){return {...data,game:cpuGame};}
function receiveCloudState(state){const previous=cloudStatus.phase;cloudStatus=state;window.BeastKingLoading?.busy({key:'cloud',active:!!state.busy,label:'プレイデータを同期しています'});if(state.phase==='conflict'&&previous!=='conflict'&&entered)toast('別端末の更新を確認しました。設定の「端末連携と同期」で保存内容を選んでください。',true);accountUi?.onCloudState();const control=$('[data-cloud-status]');if(control){control.textContent=state.phase==='synced'?'同期済み':state.phase==='conflict'?'保存を確認':state.phase==='offline'?'未同期':'端末連携';}}
function applyCloudData(saved,meta={}){
 applyingCloud=true;
 try{
  if(meta.reason==='link'){pendingOnlineArt=null;void presenceController.start();clearTimeout(cpuTimer);onlineClient.stopPolling();onlineBattle=false;Object.assign(online,{profile:onlineClient.profile,phase:'idle',room:null,queue:null,match:null,busy:false,connecting:false,error:'',syncRequired:false,resultShown:null});accountUi?.clearIdentity();}
  data=restoreData(saved);promoteLegacyKirahara();entryNameDraft=data.playerName;cpuGame=data.game;if(!onlineBattle)game=cpuGame;
  {const d=data.deckLibrary.find(d=>d.id===data.editingDeckId)||data.deckLibrary.find(d=>d.id===data.activeDeckId);workingDeck=[...(data.draft?.ids||d?.ids||data.deckIds)];workingSpecial=[...(data.draft?.specialIds||d?.specialIds||data.specialIds)];workingName=data.draft?.name||d?.name||data.deckName;}
  campaignBattleId=getNextCampaignBattle(data.campaignProgress)?.id||CAMPAIGN_BATTLES[0].id;
  if(meta.reason==='link'&&page==='duel'){page='home';history.replaceState(null,'','#home');}
  persist(true);render();
 }finally{applyingCloud=false;}
}
async function initializeCloud(){
 if(cloudStarting)return cloudStarting;
 if(cloudReady)return cloudSync.getState();
 cloudRequested=true;
 const task=(async()=>{
  if(onlineClient.profile)await onlineClient.ensureProfile();else await onlineClient.updateProfile({nickname:data.playerName||'プレイヤー',origin:data.profileOrigin});
  online.profile=onlineClient.profile;void presenceController.start();
  const result=await cloudSync.start();cloudReady=true;void accountUi?.refreshOperatorDeck?.();return result;
 })();
 cloudStarting=task;
 try{return await task;}catch(error){if(!cloudStatus.error)receiveCloudState({...cloudStatus,phase:error.status===401?'auth-required':'offline',busy:false,error:{code:error.code,message:error.message}});throw error;}
 finally{if(cloudStarting===task)cloudStarting=null;}
}

const needsTarget=c=>c.type==='miracle'&&(!!c.targetType||['damage_enemy','buff'].includes(c.effect.kind));
const targetHint=c=>c.targetType==='regalia-ace'?'強化する自分のレガリアか、レガリア専用合成魔獣を選んでください。':c.targetType==='legacy'?'第一弾・第二弾の味方魔獣を選んでください。':EXPANSION_FAMILIES.some(f=>f.id===c.targetType)?`${EXPANSION_FAMILIES.find(f=>f.id===c.targetType).name}の味方魔獣を選んでください。`:c.effect.kind==='buff'?'強化する味方の魔獣を選んでください。':'対象の相手の魔獣か、ハートポイントを選んでください。';

function persist(immediate=false){if(!onlineBattle)cpuGame=game;data.game=cpuGame;if(cloudRequested&&!applyingCloud)cloudSync.markDirty();clearTimeout(saveTimer);const write=()=>{saveTimer=null;try{localStorage.setItem(storageKey,JSON.stringify(data));storageAvailable=true;}catch{if(storageAvailable){toast('このブラウザでは保存できません。設定からバックアップを保存してください。',true);storageAvailable=false;}}};if(immediate)write();else saveTimer=setTimeout(write,180);}
window.addEventListener('pagehide',()=>{if(saveTimer)persist(true);});
function syncExperience(){
 window.BeastKingLoading?.busy({key:'online',active:online.busy||online.connecting,label:'対戦サーバーに接続しています'});
 experience.sync({enabled:data.sound,motion:data.motion});experience.screen(entered?page:'entry');
 const battle=entered&&page==='duel'?game:null,key=onlineBattle?online.match?.id:game;
 experience.observeBattle(battle,key);
 summonScene.sync(battle,{key,motion:data.motion,intensity:experience.getPreferences().intensity,enabled:true});
}
function sound(kind='click'){if(kind==='click'||page==='duel'&&['play','attack','turn','win'].includes(kind))return;experience.sound(kind);}
function toast(text,error=false){if(error)experience.sound('deny');const el=document.createElement('div');el.className='toast'+(error?' error':'');el.textContent=text;$('#toasts').append(el);setTimeout(()=>el.remove(),3800);}
const KIRAHARA_SLOT='operator-kirahara-v1',REGALIA_ID='B0512';
const onlineArtKey='beast-king-match-art-context-v1';
let pendingOnlineArt=null;
function currentOperatorGrant(){
 const status=onlineClient.getStatus();
 if(status.authInvalidated||status.identityChanging)return null;
 const grant=accountUi?.getOperatorDeck?.();
 return grant?.id===KIRAHARA_SLOT?grant:null;
}
function storedMatchArt(match){
 if(!match?.id)return null;
 if(Object.prototype.hasOwnProperty.call(match,'ownDeckSlot'))return match.ownDeckSlot===KIRAHARA_SLOT?KIRAHARA_SLOT:null;
 try{const saved=JSON.parse(localStorage.getItem(onlineArtKey)||'null');return saved?.matchId===match.id&&saved.playerId===onlineClient.profile?.id&&saved.deckId===KIRAHARA_SLOT?KIRAHARA_SLOT:null;}catch{return null;}
}
function rememberOnlineArt(match){
 if(!match?.id||!pendingOnlineArt)return;
 const pending=pendingOnlineArt;
 if(pending.playerId!==onlineClient.profile?.id||!['joining','waiting'].includes(online.phase))return;
 if(pending.mode!==match.mode||(pending.roomCode&&pending.roomCode!==match.roomCode))return;
 pendingOnlineArt=null;
 try{localStorage.setItem(onlineArtKey,JSON.stringify({playerId:pending.playerId,matchId:match.id,deckId:pending.deckId}));}catch{}
}
function regaliaDeckContext(context){
 if(context==='editor')return page==='deck'&&data.editingDeckId===KIRAHARA_SLOT&&workingDeck.includes(REGALIA_ID);
 if(context==='active')return page==='home'&&data.activeDeckId===KIRAHARA_SLOT&&data.deckIds.includes(REGALIA_ID);
 if(context==='battle')return page==='duel'&&!!game&&(onlineBattle?storedMatchArt(online.match):game.playerDeckId)===KIRAHARA_SLOT;
 return false;
}
function operatorRegaliaArt(context='public'){
 if(!regaliaDeckContext(context))return null;
 const artwork=currentOperatorGrant()?.artwork;
 return typeof artwork==='string'&&/^data:image\/(?:svg\+xml|webp);base64,[A-Za-z0-9+/=]+$/.test(artwork)?artwork:null;
}
function regaliaStatus(c,context='public'){
 if(c.id!==REGALIA_ID||!regaliaDeckContext(context))return 'normal';
 return operatorRegaliaArt(context)?'special':'pending';
}
function promoteLegacyKirahara(grant=currentOperatorGrant()){
 if(!grant||!Array.isArray(data.deckLibrary)||data.deckLibrary.some(d=>d.id===KIRAHARA_SLOT))return false;
 const oldMain=['B0005','B0263','B0647','B0015','B0079','B0535','B0480','B0512','M0065','M0294','M0256','M0512','G0481','G0002','G0227','G0260'].flatMap(id=>[id,id]);
 const oldSpecial=['F0128','F0128','F0174','F0174'];
 const same=(x,y)=>Array.isArray(x)&&Array.isArray(y)&&x.length===y.length&&[...x].sort().join('|')===[...y].sort().join('|');
 const entry=data.deckLibrary.find(d=>['custom-original','custom-imported'].includes(d.id)&&[grant.name,'𠮷良原デッキ'].includes(d.name)&&((same(d.ids,grant.ids)&&same(d.specialIds,grant.specialIds))||(same(d.ids,oldMain)&&same(d.specialIds,oldSpecial))));
 if(!entry)return false;
 const prior=entry.id;entry.id=KIRAHARA_SLOT;entry.recipeRevision=same(entry.ids,grant.ids)&&same(entry.specialIds,grant.specialIds)?Number(grant.revision)||1:1;
 if(data.activeDeckId===prior)data.activeDeckId=KIRAHARA_SLOT;
 if(data.editingDeckId===prior)data.editingDeckId=KIRAHARA_SLOT;
 return true;
}
function refreshRegaliaImages(){
 for(const node of document.querySelectorAll('[data-regalia-context]')){
  const c=getCard(REGALIA_ID),context=node.dataset.regaliaContext;
  node.style.cssText=artStyle(c,context);node.dataset.regaliaStatus=regaliaStatus(c,context);
 }
 summonScene.refresh?.();
}
function operatorDeckChanged(){
 if(promoteLegacyKirahara())persist(true);
 if(entered&&['home','deck','duel'].includes(page))render();
 refreshRegaliaImages();
}
function artStyle(c,artContext='public'){if(c.id==='B0512'){const status=regaliaStatus(c,artContext);if(status==='pending')return 'background:radial-gradient(ellipse,#283b5a,#100f24 70%);background-size:cover';const src=operatorRegaliaArt(artContext)||'assets/design-v2/cards/individual/king.webp';return "background-image:url('"+src+"');background-position:center;background-repeat:no-repeat;background-size:"+(src.startsWith('data:image/webp;')?'contain':'cover');}const original=CARD_ART_USER_OVERRIDES[c.id]||PREMIUM_CARD_ART[c.id];if(original)return "background-image:url('"+original.src+"?v="+original.sha256.slice(0,12)+"');background-position:"+original.position+";background-size:"+original.fit+";background-repeat:no-repeat";const replacement=CARD_ART_FIFTH[c.id]||CARD_ART_EXPANSIONS[c.id]||CARD_ART_OVERRIDES[c.id];if(replacement){const r=replacement;return "background-image:url('"+r.src+"?v="+r.sha256.slice(0,12)+"');background-position:"+(r.x*100/(r.width-r.size))+"% "+(r.y*100/(r.height-r.size))+"%;background-size:"+(r.width*100/r.size)+"% "+(r.height*100/r.size)+"%";}const n=Number(c.id.slice(1))-1,cell=n%16,batch=String(Math.floor(n/16)+1).padStart(2,'0'),src=`assets/design-v2/cards/individual/${c.type}-${batch}.webp?art=20261124`,crop=CARD_ART_CROPS[c.id];if(crop)return `background-image:url('${src}');background-position:${crop.x*100/(crop.width-crop.size)}% ${crop.y*100/(crop.height-crop.size)}%;background-size:${crop.width*100/crop.size}% ${crop.height*100/crop.size}%`;return `background-image:url('${src}');background-position:${(cell%4+.01)*100/3.02}% ${(Math.floor(cell/4)+.01)*100/3.02}%;background-size:408.163265% 408.163265%`;}
function art(c,artContext='public'){return `<div class="card-art individual-art" data-protect-art aria-hidden="true" ${c.id===REGALIA_ID?`data-regalia-context="${artContext}" data-regalia-status="${regaliaStatus(c,artContext)}"`:''} style="${artStyle(c,artContext)}"></div><span class="card-finish rarity-${c.rarity}" aria-hidden="true"><i class="finish-crown">${icon('crown')}</i></span>`;}
function counts(ids){return ids.reduce((r,id)=>{const c=getCard(id);if(c)r[c.type]++;return r;},{beast:0,miracle:0,gimmick:0,fusion:0});}
function cardMarkup(c,{action='detail',extra='',classes='',idx='',label='',artContext='public'}={}){
 const e=elementMap[c.element],beast=['beast','fusion'].includes(c.type),cost=action==='hand'&&game?getCardCost(game,c,0):c.cost;
 return `<button class="game-card rarity-${c.rarity} ${classes}" data-card-type="${c.type}" data-origin="${e.id}" data-protect-art data-action="${action}" data-id="${c.id}" data-art-context="${artContext}" ${idx!==''?`data-index="${idx}"`:''} style="--card-border:${typeColors[c.type]};--element-color:${e.color}" aria-label="${esc(label||`${c.name}、${TYPE_LABELS[c.type]}、${c.type==='fusion'?'特殊デッキ':`コスト${cost}`}、${RARITY_LABELS[c.rarity]}、詳細を表示`)}">
  ${art(c,artContext)}
  <div class="card-top"><span class="cost-gem ${c.type==='fusion'?'fusion-gem':''}">${c.type==='fusion'?'合':cost}</span><span class="card-name">${esc(c.name)}</span><span class="element-badge" title="${e.name}">${icon('origin-'+e.id)}</span></div>
  <div class="card-bottom"><div class="card-kind"><span>${TYPE_LABELS[c.type]} · ${e.name}</span><span class="rarity" title="${esc(RARITY_LABELS[c.rarity])}">${esc(RARITY_LABELS[c.rarity])}</span></div><p class="card-effect">${esc(c.text)}</p><div class="card-stats">${beast?`<span title="攻撃力">${icon('sword')}${c.attack}</span><em class="card-model">${MODEL_LABELS[c.model]||''}</em><span class="health" title="守備力">${icon('shield')}${c.hp}</span>`:`<span class="card-subtype-stat">${icon(c.type==='miracle'?'spark':'trap')} ${esc(SUBTYPE_LABELS[c.subtype]||TYPE_LABELS[c.type])}</span>`}</div><div class="card-imprint"><span>${c.id}</span><span>© 2026 Beast King</span></div></div>${extra}</button>`;
}
const navItems=[['home','home','ホーム'],['deck','cards','デッキ編成'],['collection','book','カード図鑑'],['shop','treasure','ショップ'],['rules','spark','遊び方']];
function nav(){return `<nav class="navigation-dock" aria-label="メインメニュー">${navItems.map(([id,ic,label])=>`<button class="dock-link ${page===id?'active':''}" data-nav="${id}" ${page===id?'aria-current="page"':''}>${icon(ic)}<span>${label}</span></button>`).join('')}</nav>`;}
function shell(content){return `<div class="app-shell royal-shell"><div class="app-body"><header class="site-header"><button class="site-brand" data-nav="home" aria-label="ビーストキング ホーム"><img src="assets/icon.svg" alt=""><span><strong>BEAST KING</strong><small>ビーストキング</small></span></button><div class="site-location"><small>BATTLE INTERFACE</small><span>${({home:'ホーム',deck:'デッキ工房',collection:'カード図鑑',shop:'秘宝ショップ',rules:'遊び方',solo:'ソロの旅',online:'オンライン闘技場',events:'環境デッキ戦'})[page]||'王庭'}</span></div><div class="site-controls"><button class="profile-button" data-action="online-name" aria-label="${esc(data.playerName)}のプロフィールを変更">${profileIcon(data.profileOrigin)}</button><button class="treasure-wallet" data-nav="shop" aria-label="秘宝 ${fmt(data.treasure)}個 ショップへ">${icon('treasure')}<strong>${fmt(data.treasure)}</strong><small>秘宝</small></button>${musicButton()}<button class="icon-btn" data-action="inbox-open" aria-label="お知らせ・プレゼント">${icon('treasure')}</button><button class="icon-btn sound-button" data-action="sound" aria-label="効果音を${data.sound?'オフ':'オン'}にする" title="効果音 ${data.sound?'ON':'OFF'}">${icon(data.sound?'sound':'mute')}</button><button class="icon-btn" data-action="settings" aria-label="設定">${icon('settings')}</button></div></header><main id="main" data-page="${page}" class="page ${page==='home'?'home-page':''}" tabindex="-1">${content}</main><footer class="site-copyright">© 2026 Beast King <a href="about.html">ゲームについて</a> <a href="rebuild/">旧セーブ互換版</a></footer></div>${nav()}</div>`;}
function homeView(){return homeDashboard({data,game,icon,esc,fmt,cardMarkup,counts});}
function title(label,jp,desc,count=''){return `<div class="page-title"><div><div class="page-label">${label}</div><h1>${jp}</h1><p>${desc}</p></div>${count?`<span class="count-pill">${count}</span>`:''}</div>`;}
function filters(){return `<div class="filter-bar ${page==='deck'&&!deckAdvancedFilters?'deck-filters-compact':''}"><label class="search-field">${icon('search')}<input id="card-search" data-input="search" type="search" placeholder="カード名・効果で検索" aria-label="カード名・効果で検索" value="${esc(search.text)}" autocomplete="off"></label><div class="tabs" role="tablist" aria-label="カードの種類">${[['all','すべて'],['beast','魔獣'],['miracle','ミラクル'],['gimmick','ギミック'],['fusion','合成魔獣']].map(([v,t])=>`<button class="tab ${search.type===v?'active':''}" data-action="filter-type" data-type="${v}" role="tab" aria-selected="${search.type===v}">${t}</button>`).join('')}</div><div class="filters-secondary"><select data-change="setId" aria-label="収録パックで絞り込む"><option value="all">すべての収録弾</option>${PACKS.map(p=>`<option value="${p.id}" ${search.setId===p.id?'selected':''}>${p.editionLabel} ${p.name}</option>`).join('')}</select><select data-change="family" aria-label="系統で絞り込む"><option value="all">すべての系統</option><option value="legacy" ${search.family==='legacy'?'selected':''}>継承支援（第三弾）</option>${EXPANSION_FAMILIES.map(f=>`<option value="${f.id}" ${search.family===f.id?'selected':''}>${f.name}（${getPack(f.setId||'BK04').editionLabel}）</option>`).join('')}</select><select data-change="subtype" aria-label="収録区分で絞り込む" ${search.type==='fusion'?'disabled':''}><option value="all">すべての収録区分</option>${subtypeOptions.filter(([,type])=>search.type==='all'||search.type===type).map(([value,,label])=>`<option value="${value}" ${search.subtype===value?'selected':''}>${label}</option>`).join('')}</select><select data-change="element" aria-label="オリジンで絞り込む"><option value="all">すべてのオリジン</option>${ELEMENTS.map(e=>`<option value="${e.id}" ${search.element===e.id?'selected':''}>${e.name}</option>`).join('')}</select><select data-change="rarity" aria-label="レアリティで絞り込む"><option value="all">全レアリティ</option>${Object.keys(RARITY_LABELS).map(r=>`<option value="${r}" ${search.rarity===r?'selected':''}>${RARITY_LABELS[r]}</option>`).join('')}</select><select data-change="sort" aria-label="カードを並び替える"><option value="number" ${search.sort==='number'?'selected':''}>図鑑順</option><option value="origin" ${search.sort==='origin'?'selected':''}>オリジン順</option><option value="cost" ${search.sort==='cost'?'selected':''}>コスト順</option><option value="attack" ${search.sort==='attack'?'selected':''}>攻撃力順</option><option value="rarity" ${search.sort==='rarity'?'selected':''}>レア度順</option></select></div></div>`;}
function filteredCards(){const selectedIds=page==='deck'&&deckFilterScope==='deck'?new Set([...workingDeck,...workingSpecial]):null;let cards=CARDS.filter(c=>(page!=='collection'||collectionScope==='all'||(collectionScope==='owned'?availableCopies(c.id)>0:favoriteCards.has(c.id)))&&(page!=='deck'||deckFilterScope==='all'||(deckFilterScope==='owned'?availableCopies(c.id)>0:selectedIds.has(c.id)))&&(search.setId==='all'||c.setId===search.setId)&&(!search.family||search.family==='all'||c.family===search.family)&&(search.type==='all'||c.type===search.type||(search.type==='beast'&&c.type==='fusion'))&&(search.subtype==='all'||(['attack','defense'].includes(search.subtype)?c.type==='beast'&&c.model===search.subtype:c.subtype===search.subtype))&&(search.element==='all'||c.element===search.element)&&(search.rarity==='all'||c.rarity===search.rarity));const query=search.text.trim().toLowerCase();if(query)cards=cards.filter(c=>`${c.name} ${c.text} ${c.id} ${c.familyName||''} ${EXPANSION_FAMILIES.find(f=>f.id===c.family)?.name||''} ${elementMap[c.element].name} ${MODEL_LABELS[c.model]||''} ${SUBTYPE_LABELS[c.subtype]||''}`.toLowerCase().includes(query));if(search.sort==='origin')cards.sort((a,b)=>originOrder[a.origin]-originOrder[b.origin]||a.index-b.index);else if(search.sort==='cost')cards.sort((a,b)=>a.cost-b.cost||a.index-b.index);else if(search.sort==='attack')cards.sort((a,b)=>(b.attack||0)-(a.attack||0)||a.index-b.index);else if(search.sort==='rarity')cards.sort((a,b)=>Object.keys(RARITY_LABELS).indexOf(b.rarity)-Object.keys(RARITY_LABELS).indexOf(a.rarity)||a.index-b.index);return cards;}
function cardResults(edit=false){
 const cards=filteredCards(),layout=cardPageLayout(edit),size=layout.pageSize,pages=Math.max(1,Math.ceil(cards.length/size));
 search.page=Math.max(1,Math.min(search.page,pages));const first=(search.page-1)*size,shown=cards.slice(first,first+size);
 const scope=deckFilterScope==='owned'?'所持カード':deckFilterScope==='deck'?'編成中のカード':'全収録カード';
 return `<div class="results-meta" data-result-total="${cards.length}"><span>${edit?scope+' · ':''}${fmt(cards.length)}種類${cards.length?`中 ${first+1}–${first+shown.length}`:''}</span><span>${edit?'選択したデッキへの追加・取り外し':search.setId==='all'?`第一弾〜第五弾 全${fmt(CARDS.length)}枚`:`${getPack(search.setId).editionLabel}「${getPack(search.setId).name}」`}</span></div><div class="cards-grid" data-page-size="${size}" style="--card-columns:${layout.columns||3};--card-tile-width:${layout.tileWidth||layout.cardWidth||220}px;--card-image-width:${layout.cardWidth||220}px">${shown.length?shown.map(c=>{
  const special=c.type==='fusion',deck=special?workingSpecial:workingDeck,qty=deck.filter(id=>id===c.id).length,owned=availableCopies(c.id),full=deck.length>=(special?4:32),free=Math.max(0,owned-qty);
  return `<div class="card-wrap ${edit?'transfer-card':''}" data-transfer-id="${c.id}" ${edit?'data-card-transfer="pool"':''}>${cardMarkup(c,{classes:edit?'workshop-face':''})}${edit?`<div class="transfer-counts" aria-label="所持${owned}枚、編成中${qty}枚、編成外${free}枚"><button class="workshop-card-label" data-action="detail" data-id="${c.id}" title="${esc(c.name)}">${esc(c.name)}</button><span>所持<b>${owned}</b></span><span>編成<b>${qty}</b></span><span>残り<b>${free}</b></span></div><div class="transfer-actions"><button class="btn small transfer-remove" data-action="deck-remove" data-id="${c.id}" aria-label="${esc(c.name)}を1枚編成から外す" ${qty===0?'disabled':''}>− 戻す</button><button class="btn small primary transfer-add" data-action="deck-add" data-id="${c.id}" aria-label="${esc(c.name)}を1枚${special?'特殊':'通常'}デッキに追加" ${qty>=deckCopyCapacity(c.id)||full?'disabled':''}>＋ 追加</button></div>`:`<span class="card-owned"><span>所持 <b>${owned} / 3</b></span><button class="favorite-card" type="button" data-action="card-favorite" data-id="${c.id}" aria-pressed="${favoriteCards.has(c.id)}" aria-label="${esc(c.name)}をお気に入り${favoriteCards.has(c.id)?'から外す':'に追加'}">${favoriteCards.has(c.id)?'★':'☆'}</button></span>`}</div>`;
 }).join(''):'<div class="empty-state"><h3>カードが見つかりません</h3><p>検索語や絞り込み条件を変更してください。</p><button class="text-button" data-action="reset-filters">絞り込みをリセット</button></div>'}</div><div class="pagination"><button class="btn small" data-action="prev-page" ${search.page<=1?'disabled':''}>前のページ</button><label class="page-jump" aria-label="カード一覧のページ"><input type="number" min="1" max="${pages}" value="${search.page}" data-change="card-page" aria-label="カード一覧のページ番号"><span>/ ${pages}</span></label><button class="btn small" data-action="next-page" ${search.page>=pages?'disabled':''}>次のページ</button></div>`;
}
function collectionView(){return `${title('CARD ATLAS','カード図鑑',`全${fmt(CARDS.length)}枚から、次の切り札を。`,`ALL ${fmt(CARDS.length)}`)}<div class="rarity-guide"><div class="collection-scopes" role="group" aria-label="図鑑の表示範囲">${[['all','すべて'],['owned','所持カード'],['favorites','★ お気に入り']].map(([value,label])=>`<button data-action="collection-scope" data-scope="${value}" aria-pressed="${collectionScope===value}">${label}</button>`).join('')}</div><div class="catalog-rarity-key" aria-label="6段階のレア度">${Object.entries(RARITY_LABELS).map(([code,name])=>`<span class="rarity-label rarity-${code}">${name}</span>`).join('')}</div></div><p class="catalog-guide">五つの弾に全${fmt(CARDS.length)}枚。収録弾・系統で探し、★で切り札を保存しよう。</p>${filters()}<div id="card-results">${cardResults()}</div>`;}

function deckList(special=false){
 const deck=special?workingSpecial:workingDeck;
  // One tile per physical copy, with a direct remove button and independent paging.
  const initial=cardPageLayout(true),size=deckImageCount||initial.pageSize,pages=Math.max(1,Math.ceil(deck.length/size));
  deckListPage=Math.max(1,Math.min(deckListPage,pages));const offset=(deckListPage-1)*size;
  return `<div class="results-meta deck-image-meta"><span>${special?"特殊デッキ":"通常デッキ"} · ${deck.length}枚</span><span>${deck.length?`${offset+1}–${Math.min(deck.length,offset+size)}枚目`:"未編成"}</span></div><div class="deck-image-grid" data-total="${deck.length}" style="--deck-image-columns:${deckImageLayout?.columns||initial.columns};--deck-image-width:${deckImageLayout?.tileWidth||initial.tileWidth||deckImageLayout?.cardWidth||initial.cardWidth}px;--deck-image-card-width:${deckImageLayout?.cardWidth||initial.cardWidth}px">${deck.slice(offset,offset+size).map((id,n)=>{const c=getCard(id),index=offset+n;return `<article class="deck-image-slot" data-card-transfer="deck" data-transfer-id="${id}" data-deck-slot="${index}">${cardMarkup(c,{action:'detail',artContext:'editor',classes:'workshop-face'})}<div class="deck-slot-count"><button class="workshop-card-label" data-action="detail" data-id="${id}" data-art-context="editor" title="${esc(c.name)}">${esc(c.name)}</button><span>${index+1} / ${deck.length}枚</span></div><button class="btn small" data-action="deck-return-slot" data-index="${index}" data-id="${id}" aria-label="${esc(c.name)}をこのデッキから外す">− 戻す</button></article>`;}).join('')||'<p class="deck-hint">左の所持カードから追加してください。</p>'}</div>${deckListPager(pages,deck.length+'枚')}`;
}
function deckListPager(pages,description){
 return `<div class="deck-list-pagination"><button class="icon-btn" data-action="deck-list-prev" aria-label="デッキの前のページ" ${deckListPage<=1?'disabled':''}>${icon('chevron-left')}</button><label class="page-jump deck-page-jump"><input type="number" min="1" max="${pages}" value="${deckListPage}" data-change="deck-page" aria-label="編集中デッキのページ番号"><span>/ ${pages}<small>${description}</small></span></label><button class="icon-btn" data-action="deck-list-next" aria-label="デッキの次のページ" ${deckListPage>=pages?'disabled':''}>${icon('chevron-right')}</button></div>`;
}
// Separate optional inspector. Each physical copy has its own slot index.
function inspectZone(section){return section==='special'?workingSpecial:workingDeck;}
function inspectIndex(section,index){const deck=inspectZone(section),i=Number(index);return Number.isInteger(i)&&i>=0&&i<deck.length?i:-1;}
function inspectOptions(section,index){
 const deck=inspectZone(section),i=inspectIndex(section,index);if(i<0)return [];
 const quantities=new Map();deck.forEach((id,n)=>{if(n!==i)quantities.set(id,(quantities.get(id)||0)+1);});
 return CARDS.filter(c=>c.id!==deck[i]&&(section==='special'?c.type==='fusion':c.type!=='fusion')&&(quantities.get(c.id)||0)<Math.min(DECK_COPY_LIMIT,availableCopies(c.id)));
}
function openDeckInspector(section=deckSection,index=0,mode='single'){
 if(page!=='deck')return;
 const zone=section==='special'?'special':'main',deck=inspectZone(zone);
 const i=Math.max(0,Math.min(Number.isInteger(Number(index))?Number(index):0,Math.max(0,deck.length-1)));
 currentModal={kind:'deck-inspect',label:'編成カードを確認・編集',section:zone,index:i,mode:mode==='gallery'?'gallery':'single',query:'',candidatePage:1,chosen:null,galleryPage:1};
 renderDeckInspector();
}
function inspectTabs(m){
 const z=m.section;
 return `<div class="inspect-toolbar"><div class="inspect-tabs" aria-label="デッキの種類"><button class="btn small ${z==='main'?'primary':''}" data-action="deck-inspect-zone" data-section="main" aria-pressed="${z==='main'}">通常 ${workingDeck.length}/32</button><button class="btn small ${z==='special'?'primary':''}" data-action="deck-inspect-zone" data-section="special" aria-pressed="${z==='special'}">特殊 ${workingSpecial.length}/4</button></div><div class="inspect-tabs" aria-label="表示方法"><button class="btn small ${m.mode==='single'?'primary':''}" data-action="deck-inspect-single" aria-pressed="${m.mode==='single'}">1枚ずつ</button><button class="btn small ${m.mode==='gallery'?'primary':''}" data-action="deck-inspect-all" aria-pressed="${m.mode==='gallery'}">画像一覧</button></div></div>`;
}
function inspectCandidateList(m){
 const query=String(m.query||'').trim().toLowerCase();
 return inspectOptions(m.section,m.index).filter(c=>!query||[c.id,c.name,c.text,elementMap[c.element].name,TYPE_LABELS[c.type]].some(value=>String(value).toLowerCase().includes(query)));
}
function inspectCandidateMarkup(m){
 const list=inspectCandidateList(m),size=layoutWidth()<=560?1:layoutHeight()<=600?2:4,pages=Math.max(1,Math.ceil(list.length/size));m.candidatePage=Math.max(1,Math.min(m.candidatePage,pages));
 return `<p class="inspect-muted">入替可能 ${fmt(list.length)}種類 · ${m.candidatePage}/${pages}ページ</p><div class="inspect-candidates">${list.slice((m.candidatePage-1)*size,m.candidatePage*size).map(c=>`<article>${cardMarkup(c,{action:'deck-inspect-choose',classes:m.chosen===c.id?'selected':''})}<strong>${esc(c.name)}</strong><small>所持 ${availableCopies(c.id)}枚</small><button class="btn small" data-action="deck-inspect-choose" data-id="${c.id}">効果を確認</button></article>`).join('')||'<p>入れ替えられる所持カードが見つかりません。</p>'}</div><div class="inspect-pagination"><button class="btn small" data-action="deck-inspect-candidate-prev" ${m.candidatePage<=1?'disabled':''}>前へ</button><span>${m.candidatePage}/${pages}</span><button class="btn small" data-action="deck-inspect-candidate-next" ${m.candidatePage>=pages?'disabled':''}>次へ</button></div>`;
}
function inspectChosenMarkup(m){
 const candidate=inspectOptions(m.section,m.index).find(c=>c.id===m.chosen);
 return candidate?`<div class="inspect-confirm"><strong>${esc(getCard(m.original).name)} → ${esc(candidate.name)}</strong><p>${esc(candidate.text)}</p><button class="btn primary" data-action="deck-inspect-apply" data-id="${candidate.id}">このカードに入れ替える</button></div>`:'<p class="inspect-muted">候補のカードを選択して、効果を確認してください。</p>';
}
function renderDeckInspector(){
 const m=currentModal;if(m?.kind!=='deck-inspect')return;
 const deck=inspectZone(m.section),zone=m.section==='special'?'特殊':'通常',count=deck.length;
 m.index=Math.max(0,Math.min(m.index,Math.max(0,count-1)));
 const c=getCard(deck[m.index]);
 let body='';
 if(m.mode==='replace'&&c){
  if(deck[m.index]!==m.original){m.mode='single';return renderDeckInspector();}
  body=`<div class="eyebrow">REPLACE · ${zone} ${m.index+1}枚目</div><h2>カードを入れ替え</h2><p>現在：${esc(c.name)}。所持済み・編成可能なカードだけを表示します。</p><label for="inspect-candidate-query">カードを検索</label><input id="inspect-candidate-query" type="search" data-input="inspect-candidate-query" value="${esc(m.query)}" placeholder="カード名・効果・オリジン" autocomplete="off"><div id="inspect-chosen">${inspectChosenMarkup(m)}</div><div id="inspect-candidate-results">${inspectCandidateMarkup(m)}</div><button class="btn" data-action="deck-inspect-single">元のカードに戻る</button>`;
 }else if(m.mode==='gallery'){
  const size=layoutWidth()<=560?1:layoutHeight()<=600?2:4,pages=Math.max(1,Math.ceil(count/size));m.galleryPage=Math.max(1,Math.min(m.galleryPage||1,pages));const offset=(m.galleryPage-1)*size;
  body=`<div class="inspect-gallery" aria-label="${zone}デッキの全カード" data-total="${count}">${deck.slice(offset,offset+size).map((id,n)=>{const i=offset+n,card=getCard(id);return card?`<article data-inspect-slot="${i}"><span class="inspect-muted">${i+1} / ${count}枚</span>${cardMarkup(card,{action:'deck-inspect-slot',idx:i,artContext:'editor'})}<strong>${esc(card.name)}</strong><button class="btn small" data-action="deck-inspect-slot" data-index="${i}">詳細・編集</button></article>`:'';}).join('')||'<p>編成中のカードはありません。</p>'}</div><div class="inspect-pagination"><button class="btn small" data-action="deck-gallery-prev" ${m.galleryPage<=1?'disabled':''}>前へ</button><span>${m.galleryPage}/${pages} · 全${count}枚</span><button class="btn small" data-action="deck-gallery-next" ${m.galleryPage>=pages?'disabled':''}>次へ</button></div>`;
 }else if(c){
  body=`<div class="inspect-slot-nav"><button class="btn small" data-action="deck-inspect-prev" ${m.index===0?'disabled':''}>← 前のカード</button><label><strong>${zone} ${m.index+1} / ${count}枚</strong><select data-change="inspect-slot" aria-label="表示するカード">${deck.map((id,i)=>`<option value="${i}" ${i===m.index?'selected':''}>${i+1}. ${esc(getCard(id)?.name||id)}</option>`).join('')}</select></label><button class="btn small" data-action="deck-inspect-next" ${m.index>=count-1?'disabled':''}>次のカード →</button></div><div class="detail-layout">${cardMarkup(c,{action:'noop',artContext:'editor'})}<div class="detail-info"><div class="eyebrow">DECK CARD · ${esc(c.id)}</div><h2>${esc(c.name)}</h2><div class="detail-meta"><span class="tag">${TYPE_LABELS[c.type]} · ${elementMap[c.element].name}</span><span class="tag">${RARITY_LABELS[c.rarity]}</span></div><p class="inspect-stat">${c.type==='fusion'?'合成魔獣':'コスト '+c.cost}${['beast','fusion'].includes(c.type)?' · 攻撃 '+c.attack+' · 守備 '+c.hp:''}</p><p class="detail-effect">${esc(c.text)}</p><p class="flavor">${esc(c.flavor)}</p><div class="modal-actions"><button class="btn primary" data-action="deck-inspect-replace">このカードを入れ替え</button><button class="btn" data-action="deck-inspect-remove">この1枚を外す</button></div></div></div>`;
 }else body='<p class="modal-intro">このゾーンにカードがありません。通常の編集画面から「＋」で追加してください。</p>';
 showModal(`<div class="deck-inspector"><div class="eyebrow">DECK WORKSHOP</div><h2>${esc(workingName)}｜編成カードの確認・編集</h2>${inspectTabs(m)}${body}<p class="inspect-muted">ここでの編集は従来の編集中デッキに反映されます。対戦に使用するには「保存する」を押してください。</p><div class="modal-actions"><button class="btn" data-action="close-modal">通常の編集画面へ戻る</button></div></div>`,true);
}
function replaceInspectedCard(section,index,original,id){
 const i=inspectIndex(section,index),deck=inspectZone(section);
 if(i<0||deck[i]!==original||!inspectOptions(section,i).some(c=>c.id===id))return false;
 deck[i]=id;rememberDraft();return true;
}
function removeInspectedCard(section,index,original){
 const i=inspectIndex(section,index),deck=inspectZone(section);if(i<0||deck[i]!==original)return false;
 deck.splice(i,1);rememberDraft();return true;
}
function equipOperatorDeck(deck){
 const normal=validateDeck(deck?.ids),special=validateSpecialDeck(deck?.specialIds);
 if(!normal.valid||!special.valid)throw new Error('専用デッキの内容を確認できませんでした。');
 if(missingOwnedCards([...deck.ids,...deck.specialIds]).length)throw new Error('受け取ったカードを同期してから、もう一度お試しください。');
 ensureDeckBank();let entry=bankEntry('operator-kirahara-v1');const revision=Number(deck.revision)||1;
 if(!entry){if(data.deckLibrary.length>=DECK_BANK_LIMIT)throw Error('デッキ保存枠がいっぱいです。');entry=deckRecord('operator-kirahara-v1',deck.name,deck.ids,deck.specialIds);entry.recipeRevision=revision;data.deckLibrary.push(entry);}
 else if((entry.recipeRevision||1)<revision){
  if(data.deckLibrary.length<DECK_BANK_LIMIT){const backup=deckRecord('custom-'+crypto.randomUUID().toLowerCase(),(entry.name+'（旧）').slice(0,28),entry.ids,entry.specialIds);if(entry.draft)backup.draft=entry.draft;data.deckLibrary.push(backup);}
  const next=deckRecord(entry.id,deck.name,deck.ids,deck.specialIds);next.recipeRevision=revision;data.deckLibrary=data.deckLibrary.map(d=>d.id===entry.id?next:d);entry=next;
 }
 setActiveBankDeck(entry);loadBankEntry(entry.id,{persistNow:false});
 deckSection='main';deckListPage=1;persist(true);navigate('deck');
}
function operatorDeckPanel(){
 const deck=accountUi?.getOperatorDeck?.();
 return deck?`<div class="operator-deck-preset"><span>${icon('crown')}運営構築 · 開放済み</span><button class="text-button" data-action="operator-deck-use" title="${esc(deck.description)}">${esc(deck.name)}を使う ${icon('chevron-right')}</button><small class="operator-art-auto">専用イラストを自動適用</small>${!deck.artwork?'<small class="operator-art-status">専用イラスト未受信</small><button class="text-button" data-action="operator-art-refresh">再取得</button>':''}</div>`:'';
}
function deckPanel(){
 const cnt=counts(workingDeck),normal=validateDeck(workingDeck),special=validateSpecialDeck(workingSpecial),valid=normal.valid&&special.valid&&!missingOwnedCards([...workingDeck,...workingSpecial]).length,isSpecial=deckSection==='special';
 return `<aside class="deck-panel" data-transfer-drop="deck" aria-label="編集中のデッキ"><div class="workshop-tools"><div class="transfer-heading"><strong>マイデッキ編集</strong><small>画像形式 · 通常32 / 特殊4</small></div>${deckBankToolbar()}<div class="deck-panel-head"><label for="deck-name">デッキ名</label><input id="deck-name" data-input="deck-name" value="${esc(workingName)}" maxlength="28" aria-label="デッキ名"><select data-change="starter" aria-label="スターターデッキを選択"><option value="">スターターのデッキを選択</option>${STARTER_DECKS.filter(d=>hasStarterCards(data.collection,d.id)).map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select>${operatorDeckPanel()}<div class="deck-total"><strong class="${valid?'status-good':''}">${workingDeck.length+workingSpecial.length}<span> / 36枚</span></strong><span>通常 ${workingDeck.length}/32 · 特殊 ${workingSpecial.length}/4</span></div><p class="deck-composition">魔獣 ${cnt.beast} · ミラクル ${cnt.miracle} · ギミック ${cnt.gimmick}</p></div><div class="deck-zone-tabs" aria-label="編成中のゾーン"><button data-action="deck-section" data-section="main" class="${isSpecial?'':'active'}" aria-pressed="${!isSpecial}">通常 <b>${workingDeck.length}/32</b></button><button data-action="deck-section" data-section="special" class="${isSpecial?'active':''}" aria-pressed="${isSpecial}">${icon('fusion')}特殊 <b>${workingSpecial.length}/4</b></button></div><div class="deck-display-tabs" role="group" aria-label="編成カードの詳細操作"><button class="btn small" data-action="deck-inspect-open" title="1枚ずつ確認・編集">1枚ずつ</button><button class="btn small" data-action="deck-inspect-gallery" title="編成カードの画像一覧">画像ギャラリー</button></div><div class="deck-panel-foot"><p class="deck-hint">${valid?'通常32枚＋特殊4枚。保存して次の対戦へ。':esc([...normal.errors,...special.errors,...missingOwnedCards([...workingDeck,...workingSpecial])][0])}</p><div><button class="btn primary" data-action="deck-save" ${!valid?'disabled':''}>${icon('check')}保存して使用</button><button class="btn small" data-action="deck-save-only" ${!valid?'disabled':''}>保存のみ</button><button class="text-button" data-action="deck-clear">すべて外す</button></div></div></div><div class="deck-list">${deckList(isSpecial)}</div></aside>`;
}
function deckView(){
 const owned=CARDS.filter(c=>availableCopies(c.id)>0).length;
 const scopeTabs=[['all','全カード',CARDS.length],['owned','所持カード',owned],['deck','編成中',new Set([...workingDeck,...workingSpecial]).size]];
 return `<div class="deck-workshop dual-workshop">${title('DECK WORKSHOP','デッキ編成','左右のカードをドラッグ・タップ・ボタンで編成','<button class="text-button" data-action="deck-analysis">構成を分析</button>')}<div class="deck-editor transfer-workspace"><section class="transfer-source" data-transfer-drop="pool" aria-label="左側のカード一覧"><div class="workshop-tools"><div class="transfer-heading"><strong>カード一覧</strong><small>＋追加 ／ −戻す</small></div><div class="deck-source-tools"><div class="deck-scope-tabs" role="group" aria-label="カード表示範囲">${scopeTabs.map(([scope,label,count])=>`<button class="btn small ${deckFilterScope===scope?'primary':''}" data-action="deck-filter-scope" data-scope="${scope}" aria-pressed="${deckFilterScope===scope}">${label}<b>${fmt(count)}</b></button>`).join('')}</div><button class="btn small ${deckTapMode?'primary':''}" data-action="deck-tap-mode" aria-pressed="${deckTapMode}">タップ移動 ${deckTapMode?'ON':'OFF'}</button><button class="btn small" data-action="deck-advanced-filters" aria-expanded="${deckAdvancedFilters}">絞り込み ${deckAdvancedFilters?'−':'＋'}</button><button class="text-button" data-action="reset-filters">全条件解除</button></div>${filters()}</div><div id="card-results">${cardResults(true)}</div></section>${deckPanel()}</div></div>`;
}
function rulesView(){return rulebookView({title,esc,icon,section:rulebookSection});}

function handInspectionSelection(){if(battleEffectZone!=='hand')return {kind:'reference',zone:battleEffectZone,key:battleEffectKey};const hand=game?.players?.[0]?.hand||[],index=hand.indexOf(inspectedHandId);if(index>=0)return {kind:'play',index};if(selected?.kind==='play'&&hand[selected.index])return selected;return {kind:'play',index:0};}
function inspectBattleEffect(zone,key=null){if(page!=='duel'||!game||!['hand','field','gimmick','miracle'].includes(zone))return;battleEffectZone=zone;battleEffectKey=key;handEffectsOpen=true;battleLogOpen=false;render();}
function inspectFieldEffect(who,uid){if(![0,1].includes(who)||!game?.players?.[who]?.field?.some(u=>String(u.uid)===String(uid)))return;inspectBattleEffect('field',who+':'+uid);}
function inspectHand(index){if(!Number.isInteger(index)||!game?.players?.[0]?.hand?.[index])return;selected={kind:'play',index,targeting:false};battleEffectZone='hand';battleEffectKey=null;inspectedHandId=game.players[0].hand[index];handEffectsOpen=true;battleLogOpen=false;render();sound();}
function selectionCard(){if(!game||!selected)return null;if(selected.kind==='play')return getCard(game.players[0].hand[selected.index]);if(selected.kind==='attack'||selected.kind==='unit'){const u=game.players[0].field.find(u=>u.uid===selected.uid);return u?getCard(u.cardId):null;}return null;}
function activeTargets(){if(!selected||!game||game.active!==0||game.winner!==null)return [];if(selected.kind==='attack')return getAttackTargets(game,selected.uid);if(selected.kind==='play'&&selected.targeting)return getLegalTargets(game,selected.index);return [];}
function isTarget(p,uid,core=false){return activeTargets().some(t=>t.player===p&&(core?t.core===true:t.uid===uid));}
function duelistMarkup(i){const p=game.players[i];const e=i===1;const shield=p.shield?`<span class="shield-value">結界 ${p.shield}</span>`:'';return `<div class="duelist ${e?'enemy':'my-hud'}"><div class="duelist-avatar">${profileIcon(e?(onlineBattle?online.match.opponent.origin:game.cpuOrigin):data.profileOrigin)}</div><div class="duelist-info"><div class="duelist-name">${esc(onlineBattle?(e?online.match.opponent.name:online.profile?.nickname||'あなた'):(e?(getCampaignBattle(game.campaignBattleId)?.opponentName||`CPU · ${LEVELS[game.difficulty]?.name||'策士'}`):data.playerName||'あなた'))}${onlineBattle&&e?`<span class="online-badge ${online.match.opponent.kind==='bot'?'bot':''}">${online.match.opponent.kind==='bot'?'BOT':'対人'}</span>`:''}</div><div class="core-bar" aria-label="ハートポイント ${fmt(p.core)}/${fmt(MAX_HEART_POINTS)}"><i style="width:${Math.max(0,p.core/MAX_HEART_POINTS*100)}%"></i></div></div><button class="core-button ${isTarget(i,null,true)?'targetable':''}" data-action="core" data-player="${i}" aria-label="${e?'相手':'自分'}のハートポイント ${p.core}${isTarget(i,null,true)?'を対象に選択':''}"><strong>${fmt(p.core)}</strong><small>HP</small></button>${shield}<div class="duelist-extras">${e?`<div class="hand-backs" aria-label="相手の手札 ${p.hand.length}枚">${p.hand.map(()=>'<span class="card-back-mini"></span>').join('')}</div>`:''}<span class="energy" title="エーテル ${p.energy}/${p.maxEnergy}">${icon('energy')}${p.energy}<span style="opacity:.5">/ ${p.maxEnergy}</span></span><span title="山札">${icon('layers')}<span class="duel-count-label">山札</span> ${p.deck.length}</span></div></div>`;}
function fieldMarkup(i){const p=game.players[i];return `<div class="field-row" data-owner="${i}" aria-label="${i===0?'自分':'相手'}の出場ゾーン">${Array.from({length:4},(_,n)=>{const u=p.field[n];if(!u)return `<div class="field-slot empty" data-owner="${i}" data-slot="${n}" aria-label="空き召喚枠"></div>`;const c=getCard(u.cardId),ready=i===0&&game.active===0&&canAttack(game,u.uid),target=isTarget(i,u.uid);return `<div class="field-slot model-${c.model||'defense'} ${c.type==='fusion'?'fusion-slot':''}" data-owner="${i}" data-slot="${n}" data-card-id="${esc(c.id)}"><button class="field-unit ${ready?'ready':''} ${selected?.uid===u.uid?'selected':''} ${target?'targetable':''}" data-action="unit" data-player="${i}" data-uid="${esc(u.uid)}" data-card-id="${esc(c.id)}" aria-label="${esc(c.name)} ${MODEL_LABELS[c.model]||''} 攻撃力${u.attack} 守備力${u.hp}${ready?' 攻撃可能':''}${target?' 対象に選択':''}"><span class="summon-card-floor" aria-hidden="true">${art(c,i===0?'battle':'public')}</span><span class="summon-anchor" aria-hidden="true"></span><span class="unit-badge ${ready?'':'wait'}" title="${c.type==='fusion'?'合成魔獣 · ':''}${MODEL_LABELS[c.model]||'魔獣'}">${c.type==='fusion'?icon('sword')+icon('shield')+'合成魔獣':MODEL_LABELS[c.model]||'魔獣'}${ready?'<span class="unit-ready"> · 行動可</span>':''}</span>${u.keywords.includes('guard')?`<span class="unit-guard" title="守護">${icon('shield')}</span>`:''}<span class="unit-name">${esc(c.name)}</span><span class="unit-stats"><span title="攻撃力">${icon('sword')}${u.attack}</span><span title="守備力">${icon('shield')}${u.hp}</span></span></button><button type="button" class="field-effect-button" data-action="inspect-field-effect" data-player="${i}" data-uid="${esc(u.uid)}" aria-label="${esc(c.name)}の効果を見る" title="効果を見る">${icon('info')}</button></div>`;}).join('')}</div>`;}
function trapsMarkup(i){const p=game.players[i],last=getCard(p.lastMiracle),miracle=last?.type==='miracle'?last:null;return `<div class="arcana-zone-row" aria-label="${i===0?'自分':'相手'}のミラクル発動・ギミック設置ゾーン"><div class="arcana-slot miracle-frame" aria-label="ミラクルは枠より左"><div class="arcana-frame">${miracle?`<button class="arcana-card miracle-card" data-action="inspect-arcana-effect" data-zone="miracle" data-key="${i}:last" data-id="${miracle.id}" aria-label="直前に発動したミラクル ${esc(miracle.name)}">${art(miracle)}<span>${esc(miracle.name)}</span></button>`:`<span class="arcana-placeholder">${icon('spark')}</span>`}</div><small>${miracle?'直前の発動':'ミラクル'}</small></div><div class="gimmick-frames">${Array.from({length:2},(_,n)=>{const t=p.traps[n],c=i===0&&t?getCard(t.cardId):null;return `<div class="arcana-slot gimmick-frame" aria-label="ギミックは枠より右"><div class="arcana-frame">${t?(c?`<button class="arcana-card gimmick-card" data-action="inspect-arcana-effect" data-zone="gimmick" data-key="0:trap:${esc(t.uid)}" data-id="${c.id}" aria-label="設置したギミック ${esc(c.name)}">${art(c)}<span>${esc(c.name)}</span></button>`:`<span class="arcana-card gimmick-card hidden-gimmick" aria-label="相手の伏せたギミック">${icon('trap')}<span>伏せ</span></span>`):`<span class="arcana-placeholder">${icon('trap')}</span>`}</div><small>ギミック</small></div>`;}).join('')}</div></div>`;}

function selectionMessage(){const c=selectionCard();if(game.winner!==null)return {title:game.winner===0?'あなたの勝利':game.winner===1?'対戦終了':'引き分け',text:'結果を確認して、次の対戦へ。',button:'result',label:'対戦結果'};if(game.active===1)return{title:'相手のターン',text:onlineBattle?'相手の操作を待っています。盤面は自動で更新されます。':'CPUが次の一手を考えています。'};if(!c)return{title:'あなたのターン',text:'手札を選んで使うか、場の魔獣を選んで攻撃。行動を終えたらターン終了。'};if(selected.kind==='attack')return{title:c.name,text:'攻撃する相手の魔獣か、相手のハートポイントを選んでください。守護がある場合は守護を優先。'};if(selected.kind==='unit')return{title:c.name,text:'この魔獣は今は攻撃できません。次の自分のターンに行動できます。'};if(selected.targeting)return{title:c.name,text:targetHint(c)};const playable=getPlayableCards(game).includes(selected.index),cost=getCardCost(game,c,0);return{title:c.name,text:playable?c.text:(cost>game.players[0].energy?`エーテルが不足しています（必要 ${cost}／残り ${game.players[0].energy}）。`:c.type==='beast'?'魔獣の場がいっぱいです（最大4体）。':c.type==='gimmick'?'ギミックの場がいっぱいです（最大2枚）。':c.effect.kind==='fusion'?'特殊ゾーンの魔獣と魔獣の素材が必要です。出場ゾーンが満員の場合は出場中の魔獣を素材にしてください。':'このカードを使用できる対象がいません。'),button:'use-card',label:c.type==='beast'?'召喚する':c.effect.kind==='fusion'?'合成を選ぶ':c.type==='miracle'?'発動する':'設置する',disabled:!playable};}
function selectionPanel(mobile=false){const message=selectionMessage(),c=selectionCard();const action=message.button?`<button class="btn primary ${mobile?'small':''}" data-action="${message.button}" ${message.disabled?'disabled':''}>${message.label}</button>`:'';if(mobile)return `<div class="mobile-action"><div class="selection-text"><strong>${esc(message.title)}</strong><p>${esc(message.text)}</p></div>${c?`<button class="icon-btn" data-action="detail" data-id="${c.id}" data-art-context="battle" aria-label="カード詳細">${icon('info')}</button>`:''}${action}${selected?`<button class="icon-btn" data-action="cancel-selection" aria-label="選択を解除">${icon('close')}</button>`:''}</div>`;return `<div class="duel-help" data-selection="${selected?.kind||'none'}">${c?`<div class="duel-selected-art">${art(c,'battle')}</div>`:''}<h4>${esc(message.title)}</h4>${c?`<div class="duel-small-stats"><span>エーテル ${selected?.kind==='play'?getCardCost(game,c,0):c.cost}</span><span>${TYPE_LABELS[c.type]}</span><span>${elementMap[c.element].name}</span></div>`:''}<p>${esc(message.text)}</p>${action}${c?`<button class="text-button" data-action="detail" data-id="${c.id}" data-art-context="battle">カードの詳細</button>`:''}${selected?`<button class="text-button" data-action="cancel-selection" style="float:right">解除</button>`:''}</div>`;}
function battleTheme(){return !onlineBattle?(game?.eventBattleId?{id:'event',name:'星冠の試練場'}:{id:'solo',name:'古代樹の闘域'}):online.match.mode==='ranked'?{id:'rank',name:'黄金の王座'}:{id:'multi',name:'星鏡の双陣'};}
function duelView(){const p=game.players[0],playable=game.active===0?getPlayableCards(game):[];return `<div class="duel-shell ${onlineBattle&&online.busy?'online-pending':''}" data-field="${battleTheme().id}" data-turn-owner="${game.active===0?'self':'opponent'}" ${onlineBattle&&online.busy?'aria-busy="true"':''}><header class="duel-top"><button class="duel-brand" data-action="pause-game"><img src="assets/icon.svg" alt=""><span>BEAST KING<small class="field-caption">${battleTheme().name}</small></span></button><span class="duel-hint-line">${!onlineBattle&&getEventDeck(game.eventBattleId)?'<span class="online-badge">環境デッキ戦 · 覇王CPU</span> ':''}${onlineBattle?`<span class="online-badge ${online.match.opponent.kind==='bot'?'bot':''}">${online.match.mode==='ranked'?'ランクマッチ':'ルーム対戦'} · ${online.match.opponent.kind==='bot'?'BOT':'対人'}</span> <span class="online-turn-clock" data-online-clock></span>`:''}${game.winner!==null?'対戦終了':game.active===0?'あなたの一手で、流れを変えよう。':'対戦相手が思考中…'}</span><div class="duel-top-actions"><button class="text-button rules-button" data-action="duel-rules">遊び方</button><button class="hand-effects-trigger" data-action="toggle-hand-effects" aria-label="カード効果を確認" aria-controls="hand-effects-panel" aria-expanded="${handEffectsOpen}">${icon('cards')}<span>カード効果</span></button><button class="battle-log-trigger" data-action="toggle-battle-log" aria-label="カード効果ログ" aria-controls="battle-log-drawer" aria-expanded="${battleLogOpen}">${icon('book')}<span>効果ログ</span></button>${musicButton()}<button class="icon-btn" data-action="settings" aria-label="音楽と効果音の設定">${icon('settings')}</button><button class="text-button" data-action="pause-game">${onlineBattle?'メニュー':'中断'}</button></div></header>${onlineBattle&&online.error?`<div class="online-connection-note" role="status">${esc(online.error)} · 再接続を試みています。</div>`:''}<main id="main" class="duel-layout">${handInspectorView({game,selected:handInspectionSelection(),esc,icon,getCard,getCardCost,elementMap,TYPE_LABELS,MODEL_LABELS,open:handEffectsOpen})}<section class="arena" aria-label="対戦フィールド"><div class="arena-atmosphere" aria-hidden="true"><span class="arena-seal"></span>${Array.from({length:8},(_,i)=>`<i style="--spark-index:${i}"></i>`).join('')}</div>${duelistMarkup(1)}${zoneMarkup(1)}${fieldMarkup(1)}<div class="midline">${trapsMarkup(1)}<div class="turn-label">TURN ${game.turn}<strong>${game.winner!==null?'対戦終了':game.active===0?'YOUR TURN':'OPPONENT TURN'}</strong></div><button class="btn primary end-turn" data-action="end-turn" ${game.active!==0||game.winner!==null||(onlineBattle&&(online.busy||online.syncRequired))?'disabled':''}>ターン終了</button></div>${fieldMarkup(0)}<div class="own-zone-row">${zoneMarkup(0)}${trapsMarkup(0)}</div>${duelistMarkup(0)}<section class="hand-section" aria-label="あなたの手札"><div class="hand-heading"><span>手持ち · ${p.hand.length}枚</span><span>手札は最大4枚 · 次のターンに補充</span></div><div class="hand-cards">${p.hand.map((id,i)=>cardMarkup(getCard(id),{action:'hand',artContext:'battle',idx:i,classes:`hand-card ${playable.includes(i)?'playable':'dim'} ${selected?.kind==='play'&&selected.index===i?'selected':''}`,label:`手札 ${getCard(id).name} コスト${getCardCost(game,id,0)}${playable.includes(i)?' 使用可能':''}`})).join('')||'<p class="deck-hint" style="padding:22px">手札がありません。魔獣で攻撃するか、ターンを終了してください。</p>'}</div></section></section><aside class="duel-sidebar"><h3>TACTICAL GUIDE</h3>${selectionPanel()}${battleLogView({game,esc,icon,mode:'panel'})}</aside></main>${battleLogView({game,esc,icon,open:battleLogOpen,mode:'drawer'})}${selectionPanel(true)}</div>`;}
function render(){const previousPage=$('.royal-shell .page'),previousArena=$('.duel-shell .arena'),sameScreen=previousPage?.dataset.page===page||page==='duel'&&!!previousArena;const scrollRegions=sameScreen?['.royal-shell .page','.duel-shell .arena','.deck-visible-rows','#card-results .cards-grid','.duel-sidebar'].map(selector=>({selector,top:$(selector)?.scrollTop||0,left:$(selector)?.scrollLeft||0})):[];const previousInspector=$('[data-hand-inspector-scroll]');const inspectorPosition=previousInspector?{id:previousInspector.querySelector('[data-inspected-card]')?.dataset.inspectedCard,top:previousInspector.scrollTop}:null;const logPositions=[...document.querySelectorAll('[data-battle-log-scroll]')].map(el=>({id:el.id,top:el.scrollTop,height:el.scrollHeight}));document.body.classList.toggle('reduce-motion',!data.motion);document.body.classList.toggle('has-profile',entered);if(!entered){document.body.classList.remove('in-duel');document.title=titleDefault;app.innerHTML=entryView({playerName:entryNameDraft,profileOrigin:data.profileOrigin,starterId:entryStarterDraft,starters:STARTER_DECKS,ELEMENTS,esc,icon,musicButton});syncMusic();syncExperience();return;}document.body.classList.toggle('in-duel',page==='duel');document.title=page==='duel'?'対戦中｜ビーストキング':page==='deck'?'デッキ編成｜ビーストキング':page==='collection'?`カード図鑑 全${fmt(CARDS.length)}枚｜ビーストキング`:page==='rules'?'遊び方｜ビーストキング':page==='shop'?`${shopSection==='starters'?'スターター':getPack(selectedPackId)?.name||'秘宝'}・ショップ｜ビーストキング`:page==='online'?'オンライン対戦｜ビーストキング':page==='solo'?'ソロモード｜ビーストキング':page==='events'?'環境デッキ戦｜ビーストキング':titleDefault;app.innerHTML=page==='duel'&&game?duelView():shell(page==='collection'?collectionView():page==='deck'?deckView():page==='rules'?rulesView():page==='shop'?shopView():page==='online'?onlineView():page==='events'?eventChallengeView({data,game,group:eventGroup,listPage:eventListPage,pageSize:eventPageSize(),selectedId:eventDeckId,compact:eventCompact(),section:eventSection,esc,icon,artStyle}):page==='solo'?soloView({data,game,campaignProgress:data.campaignProgress,campaignBattleId,difficulty,cpuDeckId,LEVELS,STARTER_DECKS,elementMap,icon,esc,title,section:soloSection,mapPage:campaignMapPage}):homeView());for(const old of logPositions){const el=document.getElementById(old.id);if(el&&old.top>0)el.scrollTop=old.top+Math.max(0,el.scrollHeight-old.height);}const nextInspector=$('[data-hand-inspector-scroll]');if(inspectorPosition&&nextInspector?.querySelector('[data-inspected-card]')?.dataset.inspectedCard===inspectorPosition.id)nextInspector.scrollTop=inspectorPosition.top;for(const saved of scrollRegions){const node=$(saved.selector);if(node){node.scrollTop=saved.top;node.scrollLeft=saved.left;}}syncMusic();if(page==='deck'&&deckTapPending)showTapSelection();requestAnimationFrame(syncCardViewport);syncExperience();}
function cardPageLayout(edit=false){
 if(cardLayout?.page===page)return cardLayout;
 const width=layoutWidth()||1280,height=layoutHeight()||720;
 if(edit)return calculateWorkshopTileLayout({width:Math.max(130,width/2-30),height:Math.max(145,height-355),horizontal:height<=540,compact:width<850||height<570});
 return calculateFittedCardLayout({width:width-36,height:Math.max(180,height-300),edit:false,compact:width<850||height<570});
}
function syncCardViewport(){if(typeof window!=='undefined')window.dispatchEvent?.(new Event('bk-fit-layout'));}
function renderResults(){const r=$('#card-results');if(r){r.innerHTML=cardResults(page==='deck');if(page==='deck'&&deckTapPending)showTapSelection();requestAnimationFrame(syncCardViewport);}}
window.addEventListener('bk-fit-card-metrics',event=>{
 if(!['collection','deck'].includes(page)||!entered)return;
 const result=$('#card-results');if(!result)return;
 const m=event.detail||{},edit=page==='deck';
 const compact=(layoutWidth()||1280)<850||(layoutHeight()||720)<570;
 const layout=edit?calculateWorkshopTileLayout({width:Math.min(m.width||160,m.deckWidth||m.width||160),height:Math.min(m.height||145,m.deckHeight||m.height||145),horizontal:layoutHeight()<=540,compact}):calculateFittedCardLayout({width:m.width,height:m.height,edit:false,compact});
 const before=cardLayout;cardLayout={...layout,page};
 if(!before||before.page!==page||before.pageSize!==layout.pageSize||before.cardWidth!==layout.cardWidth||before.tileWidth!==layout.tileWidth||before.columns!==layout.columns)result.innerHTML=cardResults(edit);
 if(edit){
  const imageLayout=layout;
  const images=imageLayout.pageSize;
  const changedImages=!deckImageLayout||deckImageLayout.cardWidth!==imageLayout.cardWidth||deckImageLayout.tileWidth!==imageLayout.tileWidth||deckImageLayout.columns!==imageLayout.columns;
  if(images!==deckImageCount||changedImages){deckImageCount=images;deckImageLayout=imageLayout;const list=$('.deck-list');if(list)list.innerHTML=deckList(deckSection==='special');}
  if(deckTapPending)showTapSelection();
 }
});
let viewportResize;
window.addEventListener('resize',()=>{clearTimeout(viewportResize);viewportResize=setTimeout(()=>{cardLayout=null;deckImageCount=0;deckImageLayout=null;if(['collection','deck','events'].includes(page)&&entered)render();else syncCardViewport();},120);});
function navigate(next){
 if(page==='deck')deckSearch=search;else if(page==='collection')collectionSearch=search;
 if(next==='deck')search=deckSearch;else if(next==='collection')search=collectionSearch;
 deckTapPending=null;
 if(next==='duel'&&!game)return;
 clearTimeout(cpuTimer);closeModal();selected=null;battleLogOpen=false;handEffectsOpen=false;
 if(onlineBattle&&next!=='duel'){onlineBattle=false;game=cpuGame;onlineClient.stopPolling();}
 const leavingWaiting=page==='online'&&next!=='online'&&['waiting','joining'].includes(online.phase)&&online.match?.status!=='active';
 page=next;history.replaceState(null,'',`#${next}`);render();const activePage=$('.royal-shell .page');if(activePage)activePage.scrollTop=0;window.scrollTo({top:0,behavior:'instant'});
 if(leavingWaiting)void cancelOnlineWaiting(true);
 if(next==='online'&&entered)void connectOnline();
 if(['home','deck','duel'].includes(next)&&entered)void accountUi?.refreshOperatorDeck?.();
 if(next==='duel'&&!onlineBattle&&game.active===1&&game.winner===null)scheduleCpu();
}
window.addEventListener('hashchange',()=>{const p=location.hash.slice(1);if(['home','deck','collection','rules','shop','online','solo','events','duel'].includes(p))navigate(p);});

function showModal(html,wide=false){if(!modalRoot.contains(document.activeElement))modalReturnFocus=document.activeElement;modalRoot.innerHTML=`<div class="modal-backdrop"><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-label="${esc(currentModal?.label||'ダイアログ')}" tabindex="-1"><button class="icon-btn modal-close" data-action="close-modal" aria-label="閉じる">${icon('close')}</button>${html}</section></div>`;document.body.style.overflow='hidden';setTimeout(()=>{if(!modalRoot.contains(document.activeElement))$('.modal',modalRoot)?.focus({preventScroll:true});},0);}
function closeModal(){accountUi?.onModalClosed();modalRoot.innerHTML='';currentModal=null;document.body.style.overflow='';if(modalReturnFocus?.isConnected)modalReturnFocus.focus();modalReturnFocus=null;}
function cardDetails(id,artContext='public',textPage=0,recipeReturn=null){
 const c=getCard(id);if(!c)return;
 const pack=getPack(c.setId)||PACKS[0],special=c.type==='fusion',beast=['beast','fusion'].includes(c.type),deck=special?workingSpecial:workingDeck,e=elementMap[c.element],qty=deck.filter(cid=>cid===id).length;
 const keywordHelp={guard:'守護：相手は守護を持つ魔獣を先に攻撃しなければならない。',rush:'速攻：召喚したターンから攻撃できる。',drain:'吸収：戦闘で相手のハートポイントを実際に減らした分、自分のハートポイントを回復する。'};
 const effectText=[c.text,...Object.entries(keywordHelp).filter(([key])=>c.keywords.includes(key)&&!new RegExp(`${KEYWORD_LABELS[key]}\\s*[：:]`).test(c.text)).map(([,description])=>description)].join('\n');
 const budget=layoutHeight()<=350?60:layoutHeight()<=430?120:layoutHeight()<=600?200:10000;
 const pages=splitReadingText(effectText,budget),info=textPage==='info',number=info?0:Math.max(0,Math.min(pages.length-1,Number(textPage)||0));
 currentModal={kind:'detail',id,label:c.name,artContext,textPage:info?'info':number,recipeReturn};
 const nav=(label,target,extra='')=>`<button class="btn small" data-action="detail-page" data-id="${id}" data-page="${target}" ${extra}>${label}</button>`;
 const details=info?`<div class="detail-reference"><p>${esc(c.flavor)}</p><div class="detail-meta"><span class="tag">${esc(e.name)}</span><span class="tag">${c.rarity} · ${RARITY_LABELS[c.rarity]}</span><span class="tag">${TYPE_LABELS[c.type]}</span>${c.model?`<span class="tag">${MODEL_LABELS[c.model]}</span>`:''}${c.subtype?`<span class="tag">${esc(SUBTYPE_LABELS[c.subtype])}</span>`:''}</div><p class="ownership-note">所持 ${availableCopies(c.id)} / 3枚<br>${pack.editionLabel}「${esc(pack.name)}」</p><p class="card-serial">${c.id} · ${String(c.index).padStart(4,'0')} / ${CARDS.length}</p></div>`:`<div class="detail-stats"><span>${special?'特殊デッキ':`コスト <b>${c.cost}</b>`}</span>${beast?`<span>攻撃 <b>${c.attack}</b></span><span>守備 <b>${c.hp}</b></span>`:''}</div><p class="detail-effect" data-reading-page="${number}" data-reading-pages="${pages.length}">${esc(pages[number])}</p>${pages.length>1?`<nav class="detail-reading-nav" aria-label="カード効果のページ">${nav('前へ',number-1,number===0?'disabled':'')}<span aria-live="polite">効果 ${number+1} / ${pages.length}</span>${nav('次へ',number+1,number===pages.length-1?'disabled':'')}</nav>`:''}`;
 showModal(`<div class="detail-layout cyber-card-detail">${cardMarkup(c,{action:'noop',artContext})}<div class="detail-info"><div class="eyebrow">${esc(e.name)} · ${c.rarity} · ${RARITY_LABELS[c.rarity]}</div><h2>${esc(c.name)}</h2><div class="detail-reading-tabs" role="group" aria-label="カードの表示内容">${nav('能力・効果',0,`aria-pressed="${!info}"`)}${nav('カード情報','info',`aria-pressed="${info}"`)}</div>${details}${page==='deck'?`<div class="modal-actions"><button class="btn" data-action="deck-remove" data-id="${id}" ${!qty?'disabled':''}>1枚外す</button><button class="btn primary" data-action="deck-add" data-id="${id}" ${qty>=deckCopyCapacity(c.id)||deck.length>=(special?4:32)?'disabled':''}>${special?'特殊へ':'通常へ'} ${qty}/${DECK_COPY_LIMIT}</button></div>`:''}${recipeReturn?`<button class="btn" data-action="recipe-return" data-id="${esc(recipeReturn.id)}" data-recipe-page="${recipeReturn.page}">構築例に戻る</button>`:''}</div></div>`);
}
function battleSetup(level){if(level)difficulty=level;currentModal={kind:'battle-setup',label:'対戦の準備'};showModal(`<div class="eyebrow">ENTER THE ARENA</div><h2>新たな対戦へ。</h2><p class="modal-intro">使用デッキは「${esc(data.deckName)}」。<br>対戦相手を選び、あなたの戦略を試そう。</p><label class="form-label">CPUの強さ</label><div class="difficulty-grid">${Object.entries(LEVELS).map(([id,l])=>`<button class="difficulty ${difficulty===id?'active':''}" data-action="difficulty" data-level="${id}" aria-pressed="${difficulty===id}"><strong>${l.name}</strong><small>${l.caption}</small></button>`).join('')}</div><label class="form-label" for="cpu-deck">対戦相手のデッキ</label><select class="full-width" id="cpu-deck" data-change="cpu-deck"><option value="random">おまかせ</option>${STARTER_DECKS.map(d=>`<option value="${d.id}" ${cpuDeckId===d.id?'selected':''}>${esc(d.name)} — ${elementMap[d.element].name}</option>`).join('')}</select>${game&&game.winner===null?'<p class="keyword-help">新しく始めると、現在中断している対戦は置き換わります。</p>':''}<div class="modal-actions"><button class="btn" data-nav="deck">デッキを編集</button><button class="btn primary" data-action="start-game">${icon('sword')}対戦開始</button></div>`);}
function startGame(campaignId=null,eventId=null){
 handEffectsOpen=false;inspectedHandId=null;battleEffectZone='hand';battleEffectKey=null;
 if(online.match?.status==='active'){toast('オンライン対戦が進行中です。対戦に戻るか、降参して終了してください。',true);navigate('online');return;}
 const chapterBattle=campaignId?getCampaignBattle(campaignId):null,eventDeck=eventId?getEventDeck(eventId):null;
 if(eventId&&(!eventDeck||campaignId)){toast('対戦相手のデッキを選択してください。',true);return;}
 if(campaignId&&(!chapterBattle||!isCampaignBattleUnlocked(data.campaignProgress,campaignId))){toast('前の回戦をクリアすると挑戦できます。',true);return;}
 const missing=missingOwnedCards([...data.deckIds,...data.specialIds]);if(missing.length){toast(missing[0],true);return;}
 const seed=crypto.getRandomValues(new Uint32Array(1))[0],chosenDeck=chapterBattle?.cpuDeckId||cpuDeckId;
 const cpu=eventDeck||(chosenDeck==='random'?STARTER_DECKS[seed%STARTER_DECKS.length]:getDeckPreset(chosenDeck)||STARTER_DECKS[2]);
 try{game=newGame({playerDeck:data.deckIds,cpuDeck:cpu.ids,playerSpecialDeck:data.specialIds,cpuSpecialDeck:cpu.specialIds,seed,difficulty:eventDeck?'hard':chapterBattle?.difficulty||difficulty});
 game.players[0].name=data.playerName||'あなた';game.cpuDeckName=cpu.name;game.cpuOrigin=cpu.element;game.playerDeckName=data.deckName;game.playerDeckId=data.activeDeckId===KIRAHARA_SLOT?KIRAHARA_SLOT:null;game.statsRecorded=false;
 if(chapterBattle){game.campaignBattleId=chapterBattle.id;game.campaignMatchId=crypto.randomUUID();game.players[1].name=chapterBattle.opponentName;campaignBattleId=chapterBattle.id;game.log.push({type:'info',turn:game.turn,text:`第${chapterBattle.chapter}章・第${chapterBattle.round}回戦「${chapterBattle.title}」：${chapterBattle.opponentName}との対戦。`});}
 if(eventDeck){game.eventBattleId=eventDeck.id;game.eventMatchId=crypto.randomUUID();game.players[1].name=eventDeck.name;eventDeckId=eventDeck.id;game.log.push({type:'info',turn:game.turn,text:`環境デッキ戦「${eventDeck.name}」：覇王CPUへの挑戦。`});}
 persist();sound('play');navigate('duel');toast('あなたが先手です。手札からカードを選んでください。');
 }catch(e){toast(e.message,true);}
}
function showEventRecipe(id,listPage=0){
 const deck=getEventDeck(id);if(!deck)return;
 const counts=new Map();for(const cardId of [...deck.ids,...deck.specialIds])counts.set(cardId,(counts.get(cardId)||0)+1);
 const rows=[...counts],size=layoutHeight()<420?2:layoutHeight()<650?4:6,pages=Math.ceil(rows.length/size),current=Math.max(0,Math.min(pages-1,Math.floor(listPage)||0));
 currentModal={kind:'event-recipe',label:deck.name+'の対戦カード',deckId:id,recipePage:current};
 showModal(`<div class="eyebrow">CHALLENGE DECK</div><h2>${esc(deck.name)}</h2><p class="event-recipe-heading">通常32枚＋特殊4枚 · 同名カード2枚まで</p><div class="event-recipe-list">${rows.slice(current*size,(current+1)*size).map(([cardId,count])=>{const card=getCard(cardId);return `<button class="event-recipe-card" data-action="detail" data-id="${cardId}" data-art-context="public"><strong>${esc(card.name)} ×${count}</strong><small>${TYPE_LABELS[card.type]} · ${elementMap[card.origin].name} · ${card.type==='fusion'?'特殊デッキ':'コスト'+card.cost}</small></button>`;}).join('')}</div><div class="event-pagination"><button class="btn small" data-action="event-recipe-page" data-deck="${deck.id}" data-page="${current-1}"${current===0?' disabled':''}>前のページ</button><span>${current+1} / ${pages}</span><button class="btn small" data-action="event-recipe-page" data-deck="${deck.id}" data-page="${current+1}"${current+1===pages?' disabled':''}>次のページ</button></div>`,true);
}
function applyAction(result,kind='play'){if(!result.ok){toast(result.error,true);return;}selected=null;handEffectsOpen=false;sound(kind);persist();render();if(game.winner!==null)finishGame();}
function finishGame(){if(onlineBattle){recordOnlineResult(online.match);return;}clearTimeout(cpuTimer);if(!game.statsRecorded){if(game.campaignBattleId&&game.campaignMatchId){const result=recordCampaignResult(data.campaignProgress,{battleId:game.campaignBattleId,matchId:game.campaignMatchId,result:game.forfeited?'surrender':game.winner===0?'win':game.winner==='draw'?'draw':'loss'});data.campaignProgress=result.progress;if(result.nextBattle)campaignBattleId=result.nextBattle.id;}if(game.eventBattleId&&game.eventMatchId){data.eventProgress=recordEventResult(data.eventProgress,{deckId:game.eventBattleId,matchId:game.eventMatchId,result:game.forfeited?'surrender':game.winner===0?'win':game.winner==='draw'?'draw':'loss'}).progress;}data.stats.played++;if(game.winner===0)data.stats.won++;if(game.winner==='draw')data.stats.drawn++;game.statsRecorded=true;game.treasureReward=getBattleReward({winner:game.winner,forfeited:game.forfeited===true});data.treasure=Math.min(Number.MAX_SAFE_INTEGER,data.treasure+game.treasureReward);persist(true);}sound(game.winner===0?'win':'turn');setTimeout(()=>{if(page==='duel'&&game?.winner!==null)resultModal();},450);}
function resultModal(){if(!game||game.winner===null)return;const campaign=!onlineBattle?getCampaignBattle(game.campaignBattleId):null,nextCampaign=campaign?getNextCampaignBattle(data.campaignProgress):null,eventDeck=!onlineBattle?getEventDeck(game.eventBattleId):null;currentModal={kind:'result',label:'対戦結果'};showModal(`<div class="result-medal">${icon(game.winner===0?'trophy':game.winner===1?'shield':'spark')}</div><div class="result-score">${game.winner===0?'VICTORY':game.winner===1?'DEFEAT':'DRAW'}</div><p class="result-sub">${game.winner===0?'王への一歩を、ここに。':game.winner===1?'次の一手が、勝利への道になる。':'互いの戦略が、拮抗した。'}<br>${game.turn}ターン · ${esc(game.playerDeckName||data.deckName)}<br>あなたのハートポイント ${game.players[0].core} / 相手のハートポイント ${game.players[1].core}</p><p class="result-reward">秘宝 +${onlineBattle?onlineReward(online.match):game.treasureReward||0}${onlineBattle?`<small>${online.match.mode==='ranked'?`レート ${online.match.selfRating}（${online.match.ratingDelta>=0?'+':''}${online.match.ratingDelta}）`:'ルーム対戦 · レート変動なし'}${online.match.reason==='timeout'?' · 時間切れ':online.match.reason==='surrender'?' · 降参で終了':''}</small>`:''}</p>${eventDeck?`<p class="result-campaign">環境デッキ戦 · ${esc(eventDeck.name)}<br>${game.winner===0?'撃破しました':'何度でも再挑戦できます'} · ${normalizeEventProgress(data.eventProgress).clearedDeckIds.length} / ${EVENT_DECKS.length}構築 撃破</p>`:''}${campaign?`<p class="result-campaign">第${campaign.chapter}章・第${campaign.round}回戦${game.winner===0?' クリア':' — 再挑戦できます'}<br>${data.campaignProgress.clearedBattleIds.length} / 20戦 クリア${!nextCampaign?' · 全10章達成！':''}</p>`:''}<div class="modal-actions"><button class="btn" data-nav="${eventDeck?'events':campaign?'solo':'home'}">${eventDeck?'イベント一覧へ':campaign?'章を選ぶ':'ホームへ'}</button>${eventDeck?`<button class="btn primary" data-action="event-start" data-deck="${eventDeck.id}">この構築に再挑戦</button>`:campaign?`<button class="btn primary" data-action="campaign-start" data-battle="${game.winner===0&&nextCampaign?nextCampaign.id:campaign.id}">${game.winner===0&&nextCampaign?'次の回戦へ':'この回戦に再挑戦'}</button>`:`<button class="btn primary" ${onlineBattle?'data-nav="online"':'data-action="battle-setup"'}>${onlineBattle?'オンラインロビーへ':'もう一度対戦'}</button>`}</div>`);}
function scheduleCpu(){if(onlineBattle)return;clearTimeout(cpuTimer);cpuTimer=setTimeout(()=>{if(onlineBattle||page!=='duel'||!game||game.active!==1||game.winner!==null)return;const result=runCpuTurn(game,game.difficulty);if(!result.ok){toast(result.error,true);return;}persist();selected=null;render();sound('turn');if(game.winner!==null)finishGame();else toast('あなたのターンです。');},850);}
function useSelected(){if(!game||game.active!==0||selected?.kind!=='play')return;handEffectsOpen=false;const c=selectionCard();if(!c)return;if(!getPlayableCards(game).includes(selected.index)){toast('いまはこのカードを使用できません。',true);return;}if(c.effect.kind==='fusion'){openFusion(selected.index);}else if(needsTarget(c)){selected.targeting=true;render();toast(targetHint(c));}else if(onlineBattle)void performOnlineAction({kind:'play',handIndex:selected.index});else applyAction(playCard(game,selected.index));}
function targetAction(target){if(!game||game.active!==0||!selected)return false;const legal=activeTargets().some(t=>t.player===target.player&&(target.core?t.core:t.uid===target.uid));if(!legal)return false;if(selected.kind==='attack'){if(onlineBattle)void performOnlineAction({kind:'attack',attackerUid:selected.uid,target});else applyAction(attack(game,selected.uid,target),'attack');}else if(selected.kind==='play'&&selected.targeting){if(onlineBattle)void performOnlineAction({kind:'play',handIndex:selected.index,target});else applyAction(playCard(game,selected.index,target));}else return false;return true;}
function editDeck(id,add){const c=getCard(id);if(!c)return false;const special=c.type==='fusion',deck=special?workingSpecial:workingDeck,limit=special?4:32,qty=deck.filter(x=>x===id).length;if(add){if(qty>=DECK_COPY_LIMIT){toast('同じカードは通常・特殊デッキともに2枚までです。',true);return false;}if(qty>=availableCopies(id)){toast(availableCopies(id)?'所持している枚数まで編成できます。':'このカードはショップのパックから入手できます。',true);return false;}if(deck.length>=limit){toast(`${special?'特殊':'通常'}デッキは${limit}枚です。入れ替えるカードを先に外してください。`,true);return false;}deck.push(id);deckSection=special?'special':'main';deckListPage=1;sound('click');}else{const idx=deck.indexOf(id);if(idx<0)return false;deck.splice(idx,1);}rememberDraft();const modalId=currentModal?.kind==='detail'?currentModal.id:null,modalArt=currentModal?.artContext||'public',scroll=$('.deck-list')?.scrollTop||0;render();if($('.deck-list'))$('.deck-list').scrollTop=scroll;if(modalId)cardDetails(modalId,modalArt);return true;}
function saveDeck(use=true){
 const valid=validateDeck(workingDeck),special=validateSpecialDeck(workingSpecial),missing=missingOwnedCards([...workingDeck,...workingSpecial]);if(!valid.valid||!special.valid||missing.length){toast([...valid.errors,...special.errors,...missing][0],true);return false;}
 const entry=currentBankEntry();if(!entry)return false;
 if(entry.id==='operator-kirahara-v1'&&!accountUi?.getOperatorDeck?.()){toast('運営デッキの利用権を確認してください。',true);return false;}
 const next=deckRecord(entry.id,workingName.trim()||'マイデッキ',workingDeck,workingSpecial);if(entry.recipeRevision)next.recipeRevision=entry.recipeRevision;
 data.deckLibrary=data.deckLibrary.map(d=>d.id===next.id?next:d);data.draft=null;workingName=next.name;
 if(use||data.activeDeckId===next.id)setActiveBankDeck(next);
 persist(true);render();toast('「'+next.name+'」を保存しました。'+(use?'次の対戦で使用します。':''));sound('play');return true;
}
function confirmModal(label,text,action,button='実行する'){currentModal={kind:'confirm',label};showModal(`<div class="eyebrow">BEAST KING</div><h2>${esc(label)}</h2><p class="modal-intro">${esc(text)}</p><div class="modal-actions"><button class="btn" data-action="close-modal">キャンセル</button><button class="btn primary" data-action="${action}">${button}</button></div>`);}
function deckAnalysisModal(){
 const ids=page==='deck'?workingDeck:data.deckIds,special=page==='deck'?workingSpecial:data.specialIds,name=page==='deck'?workingName:data.deckName;
 const mainCheck=validateDeck(ids),specialCheck=validateSpecialDeck(special),totals=counts(ids),curve=Array(8).fill(0);
 ids.forEach(id=>{const c=getCard(id);if(c)curve[Math.min(7,Math.max(0,c.cost-1))]++;});
 const top=Math.max(1,...curve),average=ids.length?(ids.reduce((sum,id)=>sum+(getCard(id)?.cost||0),0)/ids.length).toFixed(1):'0.0';
 const ready=mainCheck.valid&&specialCheck.valid,cheap=curve[0]+curve[1];
 currentModal={kind:'deck-analysis',label:'デッキの分析'};
 showModal(`<div class="eyebrow">DECK INSIGHT</div><h2>${esc(name)}</h2><div class="deck-insight-layout"><section class="deck-insight-metrics"><div class="deck-check-summary"><div>メイン<strong>${ids.length} / 32</strong></div><div>特殊<strong>${special.length} / 4</strong></div><div>平均コスト<strong>${average}</strong></div></div><p class="modal-intro">魔獣 ${totals.beast}枚 · ミラクル ${totals.miracle}枚 · ギミック ${totals.gimmick}枚<br>コスト1〜2：${cheap}枚 · 合成魔獣：${special.length}枚</p></section><section class="deck-insight-chart"><h3>コストごとの枚数</h3><div class="deck-curve" role="img" aria-label="${curve.map((n,i)=>`コスト${i===7?'8以上':i+1}は${n}枚`).join('、')}">${curve.map((n,i)=>`<div><div class="deck-curve-track"><span class="deck-curve-bar" style="height:${n/top*100}%">${n||''}</span></div><span>${i===7?'8+':i+1}</span></div>`).join('')}</div></section><div class="deck-check-note">${ready?'枚数と同名カードの上限を満たしています。':'メイン32枚・特殊4枚、同名カードは各2枚以内に調整してください。'}${cheap<8?' 序盤に動ける低コストのカードを増やすと、手札を使いやすくなります。':''}${!ids.some(id=>getCard(id)?.effect?.kind==='fusion'||getCard(id)?.name==='合成'||getCard(id)?.name==='王源合成')?' 合成魔獣を使うには、合成召喚のミラクルも編成しましょう。':''}</div></div><div class="modal-actions"><button class="btn" data-action="close-modal">閉じる</button><button class="btn primary" data-nav="deck">デッキ工房へ</button></div>`);
}
function settingsModal(){
 currentModal={kind:'settings',label:'ゲーム設定'};
 const active=key=>settingsTab===key;
 showModal(`<div class="eyebrow">SYSTEM SETTINGS</div><h2>ゲーム設定</h2><div class="settings-tabs" role="tablist" aria-label="設定の種類">${[['sound','音'],['motion','演出'],['account','データ・プロフィール']].map(([key,label])=>`<button role="tab" tabindex="${active(key)?0:-1}" data-action="settings-tab" data-tab="${key}" aria-selected="${active(key)}" aria-controls="settings-${key}">${label}</button>`).join('')}</div>
 <section id="settings-sound" class="settings-section" role="tabpanel" aria-label="音の設定" ${active('sound')?'':'hidden'}><div class="cyber-sound-group"><div class="setting-row"><div>BGM<small>メニュー・バトル・クライマックスで切り替え</small></div><button class="toggle ${data.bgm?'on':''}" data-action="bgm" role="switch" aria-checked="${data.bgm}" aria-label="BGM"><span></span></button></div><div class="setting-volume"><label for="bgm-volume">BGM音量 <output id="bgm-volume-readout">${Math.round(data.bgmVolume*100)}%</output></label><input id="bgm-volume" data-input="bgm-volume" type="range" min="0" max="100" step="1" value="${Math.round(data.bgmVolume*100)}" aria-label="BGM音量" aria-valuetext="${Math.round(data.bgmVolume*100)}%"></div></div><div class="cyber-sound-group"><div class="setting-row"><div>システム・効果音<small>サイバー操作音・カード・バトル・開封</small></div><button class="toggle ${data.sound?'on':''}" data-action="sound" role="switch" aria-checked="${data.sound}" aria-label="効果音"><span></span></button></div>${experience.settingsMarkup()}</div></section>
 <section id="settings-motion" class="settings-section" role="tabpanel" aria-label="演出の設定" ${active('motion')?'':'hidden'}><div class="setting-row"><div>アニメーション<small>端末の「視差効果を減らす」設定にも対応</small></div><button class="toggle ${data.motion?'on':''}" data-action="motion" role="switch" aria-checked="${data.motion}" aria-label="アニメーション"><span></span></button></div><p class="modal-intro">対戦は自分側の斜め手前から表示します。魔獣はカード原画の姿で、場にいる間カードの上に立ち上がります。アニメーションをオフにすると、立体表示を残して動きを止めます。開封演出はスキップできます。</p></section>
 <section id="settings-account" class="settings-section" role="tabpanel" aria-label="データとプロフィール" ${active('account')?'':'hidden'}><div class="settings-data-grid"><div class="setting-row"><div class="profile-setting">${profileIcon(data.profileOrigin)}<div>プロフィール<small>${esc(data.playerName||'未設定')} · ${elementMap[data.profileOrigin]?.name||'山'}</small></div></div><button class="btn small" data-action="online-name">変更</button></div><div class="setting-row"><div>端末連携と同期<small>別端末でも続きから</small></div><button class="btn small" data-action="cloud-open"><span data-cloud-status>端末連携</span></button></div><div class="setting-row"><div>お知らせ・プレゼント<small>届いた報酬を確認</small></div><button class="btn small" data-action="inbox-open">受取ボックス</button></div></div><div class="settings-backup"><p class="modal-intro">バックアップに認証情報・連携コードは含みません。</p><div class="modal-actions"><button class="btn small" data-action="export">${icon('download')}バックアップ保存</button><button class="btn small" data-action="import">${icon('upload')}読み込む</button></div></div><input id="backup-input" type="file" accept=".json,application/json" hidden><nav class="settings-links" aria-label="ゲームと保存データの案内"><a class="game-guide-link" href="about.html">ゲーム紹介・ルール</a><a class="game-guide-link" href="rebuild/">先行版の保存データ</a></nav></section>`);
 const intensity=$('[data-experience-intensity]',modalRoot)?.closest('.setting-row');if(intensity)$('#settings-motion',modalRoot).append(intensity);
}

function exportSave(){persist(true);const blob=new Blob([JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='beast-king-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('バックアップを保存しました。');}
async function importSave(file){if(!file)return;if(file.size>1000000){toast('バックアップファイルが大きすぎます。',true);return;}try{const s=JSON.parse(await file.text());if(![3,4,5,6].includes(s.version)||!validateDeck(s.deckIds).valid||typeof s.deckName!=='string'||(s.version>=4&&!validateSpecialDeck(s.specialIds).valid)||!s.stats||!['played','won','drawn'].every(k=>Number.isInteger(s.stats[k])&&s.stats[k]>=0)||s.stats.won+s.stats.drawn>s.stats.played||(s.game&&s.version>=4&&!restoreGame(s.game,s.version)))throw new Error('通常32枚・特殊4枚のビーストキングのバックアップを選択してください。');const imported=restoreData(s);imported.draft=null;currentModal={kind:'import-confirm',label:'バックアップを読み込む',imported};showModal(`<div class="eyebrow">RESTORE BACKUP</div><h2>このデータを読み込みますか？</h2><p class="modal-intro">デッキ「${esc(imported.deckName)}」・通常32枚＋特殊4枚・${imported.stats.played}戦 ${imported.stats.won}勝。<br>現在のデッキ・戦績・対戦状況を置き換えます。</p><div class="modal-actions"><button class="btn" data-action="close-modal">キャンセル</button><button class="btn primary" data-action="confirm-import">読み込む</button></div>`);}catch(e){toast(e.message||'バックアップを読み込めませんでした。',true);}}
function pauseModal(){if(onlineBattle){currentModal={kind:'pause',label:'オンライン対戦'};showModal(`<div class="eyebrow">LIVE MATCH</div><h2>オンライン対戦中</h2><p class="modal-intro">オンライン対戦は一時停止できません。画面を離れても手番の制限時間120秒は進み、時間切れは敗北になります。</p><div class="modal-actions"><button class="btn" data-action="surrender">降参する</button><button class="btn" data-nav="online">ロビーへ</button><button class="btn primary" data-action="close-modal">対戦に戻る</button></div>`);return;}if(game.winner!==null){navigate('home');return;}currentModal={kind:'pause',label:'対戦を中断'};showModal(`<div class="eyebrow">TAKE A BREATH</div><h2>ひと息、入れますか。</h2><p class="modal-intro">対戦状況は自動保存されます。ホームからいつでも再開できます。</p><div class="modal-actions"><button class="btn" data-action="surrender">降参する</button><button class="btn" data-action="close-modal">対戦に戻る</button><button class="btn primary" data-nav="home">中断してホームへ</button></div>`);}
function logModal(){currentModal={kind:'log',label:'対戦ログ'};showModal(`<div class="eyebrow">BATTLE RECORD</div><h2>対戦ログ</h2><div class="duel-log" style="max-height:65svh">${game.log.slice().reverse().map(l=>`<p class="log-${esc(l.type)}">${esc(l.text)}</p>`).join('')}</div>`);}

// Pointer-based internal drag keeps image-saving protection intact. The
// transfer operation is shared with the existing +/- and inspector validators.
function transferCard(source,target){
 if(page!=='deck'||!source||!target||source.bank!==data.editingDeckId||!getCard(source.id))return false;
 if(source.side==='pool'&&target.side==='deck'){
  if(target.id&&target.id!==source.id){
   const zone=target.section==='special'?'special':'main',deck=inspectZone(zone);
   const index=Number.isInteger(target.index)?target.index:deck.indexOf(target.id);
   if(replaceInspectedCard(zone,index,target.id,source.id)){deckSection=zone;deckTapPending=null;render();toast('カードを入れ替えました。');return true;}
   toast('カードの種類・所持数・同名2枚制限を確認してください。',true);return false;
  }
  return editDeck(source.id,true);
 }
 if(source.side==='deck'&&target.side==='pool'){
  const zone=source.section==='special'?'special':'main',deck=inspectZone(zone);
  const index=Number.isInteger(source.index)?source.index:deck.indexOf(source.id);
  if(removeInspectedCard(zone,index,source.id)){deckTapPending=null;render();return true;}return false;
 }
 return false;
}
const transferHandle='[data-card-transfer] .game-card';
function readTransferSource(el){
 const card=el?.closest?.('[data-card-transfer]');if(!card)return null;
 return {side:card.dataset.cardTransfer,id:card.dataset.transferId,index:card.dataset.deckSlot===undefined?null:Number(card.dataset.deckSlot),section:deckSection,bank:data.editingDeckId};
}
function readTransferTarget(el){
 const area=el?.closest?.('[data-transfer-drop]');if(!area)return null;
 const card=readTransferSource(el);
 return {side:area.dataset.transferDrop,id:card?.side==='deck'?card.id:null,index:card?.index,section:deckSection};
}
function showTapSelection(){
 document.querySelectorAll('[data-card-transfer]').forEach(el=>el.classList.toggle('transfer-picked',!!deckTapPending&&el.dataset.cardTransfer==='pool'&&el.dataset.transferId===deckTapPending.id));
}
function tapTransfer(el){
 const source=readTransferSource(el);if(!source||!deckTapMode)return false;
 if(source.side==='pool'){
  const card=getCard(source.id);if(!card)return true;
  const zone=card.type==='fusion'?'special':'main',deck=inspectZone(zone);
  if(!availableCopies(card.id)){toast('このカードは所持していません。',true);return true;}
  if(deck.length>=(zone==='special'?4:32)){
   deckTapPending=source;
   if(deckSection!==zone){deckSection=zone;deckListPage=1;render();}
   showTapSelection();toast('右側の交換するカードをタップしてください。');return true;
  }
  deckTapPending=null;transferCard(source,{side:'deck'});return true;
 }
 if(deckTapPending){
  const chosen=deckTapPending;deckTapPending=null;transferCard(chosen,{side:'deck',id:source.id,index:source.index,section:source.section});showTapSelection();return true;
 }
 transferCard(source,{side:'pool'});return true;
}
function finishDeckPointer(event,commit){
 const drag=deckPointer;if(!drag||event.pointerId!==drag.pointerId)return;
 deckPointer=null;
 if(!drag.active)return;
 deckSuppressClickUntil=Date.now()+350;
 const target=commit?readTransferTarget(document.elementFromPoint(event.clientX,event.clientY)):null;
 drag.ghost?.remove();
 document.querySelectorAll('.transfer-drop-ready,.transfer-dragging').forEach(el=>el.classList.remove('transfer-drop-ready','transfer-dragging'));
 if(target&&target.side!==drag.source.side)transferCard(drag.source,target);
}
document.addEventListener('pointerdown',event=>{
 if(page!=='deck'||currentModal||event.button!==0||event.isPrimary===false)return;
 const handle=event.target.closest?.(transferHandle),source=readTransferSource(handle);
 if(!source)return;
 deckPointer={pointerId:event.pointerId,x:event.clientX,y:event.clientY,handle,source,active:false,ghost:null};
});
document.addEventListener('pointermove',event=>{
 const drag=deckPointer;if(!drag||event.pointerId!==drag.pointerId)return;
 if(!drag.active&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<8)return;
 if(!drag.active){
  drag.active=true;
  try{drag.handle.setPointerCapture?.(event.pointerId);}catch{}
  drag.handle.closest('[data-card-transfer]')?.classList.add('transfer-dragging');
  const ghost=document.createElement('div');ghost.className='deck-drag-ghost';ghost.textContent=getCard(drag.source.id)?.name||drag.source.id;
  document.body.append(ghost);drag.ghost=ghost;
 }
 event.preventDefault();const point=window.BeastKingViewport?.toLocalPoint({x:event.clientX,y:event.clientY})||{x:event.clientX,y:event.clientY};drag.ghost.style.left=(point.x+12)+'px';drag.ghost.style.top=(point.y+12)+'px';
 const area=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-transfer-drop]');
 document.querySelectorAll('[data-transfer-drop]').forEach(el=>el.classList.toggle('transfer-drop-ready',el===area&&el.dataset.transferDrop!==drag.source.side));
},{passive:false});
document.addEventListener('pointerup',event=>finishDeckPointer(event,true));
document.addEventListener('pointercancel',event=>finishDeckPointer(event,false));
document.addEventListener('lostpointercapture',event=>finishDeckPointer(event,false));

function actionHandler(event){if(page==='deck'&&!currentModal&&event.target.closest?.(transferHandle)){if(Date.now()<deckSuppressClickUntil){event.preventDefault();return;}if(tapTransfer(event.target)){event.preventDefault();return;}}if(event.target.closest('.site-brand')&&accountUi.touchBrand()){event.preventDefault();return;}if(onlineBattle&&(online.busy||online.syncRequired)&&event.target.closest('[data-action="use-card"],[data-action="unit"],[data-action="core"],[data-action="end-turn"],[data-action="fusion-confirm"],[data-action="confirm-surrender"]'))return;const navEl=event.target.closest('[data-nav]');if(navEl){event.preventDefault();const n=navEl.dataset.nav;navigate(n);sound('click');return;}const el=event.target.closest('[data-action]');if(!el||el.disabled)return;const {action:a,id}=el.dataset;if(accountUi.handleAction(a,el))return;
 switch(a){
 case'settings-tab':if(['sound','motion','account'].includes(el.dataset.tab)){settingsTab=el.dataset.tab;settingsModal();$(`[data-action="settings-tab"][data-tab="${settingsTab}"]`)?.focus({preventScroll:true});}break;
 case'deck-analysis':deckAnalysisModal();break;
 case'favorite-collection':collectionScope='favorites';collectionSearch=freshCardSearch();navigate('collection');break;
 case'collection-scope':if(['all','owned','favorites'].includes(el.dataset.scope)){collectionScope=el.dataset.scope;search.page=1;render();}break;
 case'card-favorite':if(getCard(id)){if(favoriteCards.has(id))favoriteCards.delete(id);else favoriteCards.add(id);try{localStorage.setItem(favoriteKey,JSON.stringify([...favoriteCards]));}catch{toast('お気に入りをこの端末に保存できませんでした。',true);}renderResults();}break;
 case'rulebook-section':rulebookSection=el.dataset.section;render();$(`#rulebook-tab-${rulebookSection}`)?.focus({preventScroll:true});break;
 case'campaign-map-page':campaignMapPage=Number(el.dataset.page)===1?1:0;render();break;
 case'solo-section':soloSection=el.dataset.section==='practice'?'practice':'campaign';render();$(`[data-action="solo-section"][data-section="${soloSection}"]`)?.focus({preventScroll:true});break;
 case'shop-section':shopSection=el.dataset.section==='starters'?'starters':'boosters';render();$(`[data-action="shop-section"][data-section="${shopSection}"]`)?.focus({preventScroll:true});break;
 case'starter-packs':shopSection='starters';navigate('shop');break;
 case'starter-buy':starterPurchaseModal(id);break;
 case'starter-buy-confirm':confirmStarterPurchase(id);break;
 case'starter-load':loadStarterFromShop(id);break;
 case'expansion-shop':if(getPack(el.dataset.pack)){selectedPackId=el.dataset.pack;shopSection='boosters';navigate('shop');}break;
 case'expansion-recipe':expansionRecipeModal(id);break;
 case'recipe-prev':case'recipe-next':if(currentModal?.kind==='expansion-recipe')expansionRecipeModal(currentModal.id,(currentModal.recipePage||1)+(a==='recipe-prev'?-1:1));break;
 case'recipe-load':loadExpansionRecipe(id);break;
 case'recipe-card-detail':cardDetails(id,'public',0,{id:el.dataset.recipe,page:Number(el.dataset.recipePage)||1});break;
 case'recipe-return':expansionRecipeModal(id,Number(el.dataset.recipePage)||1);break;
 case'pack-select':if(getPack(el.dataset.pack)){selectedPackId=el.dataset.pack;shopSection='boosters';render();$(`[data-action="pack-select"][data-pack="${selectedPackId}"]`)?.focus({preventScroll:true});}break;
 case'pack-odds':currentModal={kind:'pack-odds',label:'収録内容と排出率'};showModal(packOddsView({RARITY_LABELS,packId:el.dataset.pack||selectedPackId}));break;
 case'deck-section':deckSection=el.dataset.section==='special'?'special':'main';deckListPage=1;render();break;
 case'deck-inspect-open':openDeckInspector(deckSection,0,'single');break;
 case'deck-inspect-gallery':openDeckInspector(deckSection,0,'gallery');break;
 case'deck-inspect-zone':if(currentModal?.kind==='deck-inspect')openDeckInspector(el.dataset.section,0,currentModal.mode==='gallery'?'gallery':'single');break;
 case'deck-gallery-prev':case'deck-gallery-next':if(currentModal?.kind==='deck-inspect'&&currentModal.mode==='gallery'){currentModal.galleryPage=(currentModal.galleryPage||1)+(a==='deck-gallery-prev'?-1:1);renderDeckInspector();}break;
 case'deck-inspect-all':if(currentModal?.kind==='deck-inspect'){currentModal.mode='gallery';renderDeckInspector();}break;
 case'deck-inspect-single':if(currentModal?.kind==='deck-inspect'){currentModal.mode='single';renderDeckInspector();}break;
 case'deck-inspect-slot':if(currentModal?.kind==='deck-inspect')openDeckInspector(currentModal.section,Number(el.dataset.index),'single');break;
 case'deck-inspect-prev':case'deck-inspect-next':if(currentModal?.kind==='deck-inspect'){currentModal.index+=a==='deck-inspect-prev'?-1:1;currentModal.mode='single';renderDeckInspector();}break;
 case'deck-inspect-replace':if(currentModal?.kind==='deck-inspect'){const m=currentModal;m.mode='replace';m.original=inspectZone(m.section)[m.index];m.query='';m.candidatePage=1;m.chosen=null;renderDeckInspector();}break;
 case'deck-inspect-candidate-prev':case'deck-inspect-candidate-next':if(currentModal?.kind==='deck-inspect'&&currentModal.mode==='replace'){currentModal.candidatePage+=a==='deck-inspect-candidate-prev'?-1:1;const result=$('#inspect-candidate-results');if(result)result.innerHTML=inspectCandidateMarkup(currentModal);}break;
 case'deck-inspect-choose':if(currentModal?.kind==='deck-inspect'&&currentModal.mode==='replace'&&inspectOptions(currentModal.section,currentModal.index).some(c=>c.id===id)){currentModal.chosen=id;const preview=$('#inspect-chosen');if(preview)preview.innerHTML=inspectChosenMarkup(currentModal);const result=$('#inspect-candidate-results');if(result)result.innerHTML=inspectCandidateMarkup(currentModal);}break;
 case'deck-inspect-apply':if(currentModal?.kind==='deck-inspect'&&currentModal.mode==='replace'){const m=currentModal;if(id===m.chosen&&replaceInspectedCard(m.section,m.index,m.original,id)){m.mode='single';render();renderDeckInspector();toast('カードを入れ替えました。保存して使用してください。');}else toast('現在このカードには入れ替えできません。',true);}break;
 case'deck-inspect-remove':if(currentModal?.kind==='deck-inspect'){const m=currentModal,original=inspectZone(m.section)[m.index];if(removeInspectedCard(m.section,m.index,original)){render();renderDeckInspector();toast('カードを1枚外しました。');}}break;
 case'deck-tap-mode':deckTapMode=!deckTapMode;deckTapPending=null;render();break;
 case'deck-advanced-filters':deckAdvancedFilters=!deckAdvancedFilters;render();break;
 case'deck-filter-scope':if(['owned','all','deck'].includes(el.dataset.scope)){deckFilterScope=el.dataset.scope;search.page=1;render();}break;
 case'deck-return-slot':{const i=Number(el.dataset.index);if(removeInspectedCard(deckSection,i,id)){render();toast('1枚を編成から外しました。');}break;}
 case'deck-list-prev':deckListPage--;render();break;
 case'deck-list-next':deckListPage++;render();break;
 case'zone':zoneModal(Number(el.dataset.player),el.dataset.zone);break;
 case'fusion-special':if(currentModal?.kind==='fusion'){currentModal.specialIndex=Number(el.dataset.index);renderFusion();}break;
 case'fusion-material':if(currentModal?.kind==='fusion'){const key=el.dataset.key,all=getEligibleFusionMaterials(game,currentModal.handIndex,currentModal.specialIndex,0),material=all.find(m=>materialKey(m)===key);if(material){const pos=currentModal.materials.findIndex(m=>materialKey(m)===key);if(pos>=0)currentModal.materials.splice(pos,1);else currentModal.materials.push({...material});renderFusion();}}break;
 case'fusion-all':if(currentModal?.kind==='fusion'){for(const m of getEligibleFusionMaterials(game,currentModal.handIndex,currentModal.specialIndex,0).filter(m=>m.zone===el.dataset.zone)){if(!currentModal.materials.some(x=>materialKey(x)===materialKey(m)))currentModal.materials.push({...m});}renderFusion();}break;
 case'fusion-reset':if(currentModal?.kind==='fusion'){currentModal.materials=[];renderFusion();}break;
 case'fusion-confirm':if(currentModal?.kind==='fusion'){if(onlineBattle){const f=currentModal;void performOnlineAction({kind:'play',handIndex:f.handIndex,fusion:{specialIndex:f.specialIndex,materials:f.materials.map(m=>({...m}))}});break;}const f=currentModal,result=playCard(game,f.handIndex,{specialIndex:f.specialIndex,materials:f.materials});if(result.ok){closeModal();applyAction(result);}else{toast(result.error,true);renderFusion();}}break;
 case'noop':break;
 case'name-start':event.preventDefault();startEntry();break;
 case'profile-origin':chooseProfileOrigin(el.dataset.origin);break;
 case'toggle-hand-effects':handEffectsOpen=el.dataset.open==='false'?false:!handEffectsOpen;if(handEffectsOpen)battleLogOpen=false;render();$(handEffectsOpen?'#hand-effects-panel [data-action="toggle-hand-effects"]':'.hand-effects-trigger')?.focus({preventScroll:true});break;
 case'toggle-battle-log':battleLogOpen=el.dataset.open==='false'?false:!battleLogOpen;if(battleLogOpen)handEffectsOpen=false;render();$(battleLogOpen?'#battle-log-drawer [data-action="toggle-battle-log"]':'.battle-log-trigger')?.focus({preventScroll:true});break;
 case'solo-mode':navigate('solo');break;
 case'campaign-select':if(getCampaignBattle(el.dataset.battle)){campaignBattleId=el.dataset.battle;campaignMapPage=Math.floor((getCampaignBattle(campaignBattleId).chapter-1)/5);render();$('.campaign-focus')?.scrollIntoView({block:'nearest',behavior:'instant'});}break;
 case'campaign-start':startGame(el.dataset.battle||campaignBattleId);break;
 case'event-mode':navigate('events');break;
 case'event-select':if(getEventDeck(el.dataset.deck)){eventDeckId=el.dataset.deck;if(eventCompact())eventSection='detail';render();}break;
 case'event-section':eventSection=el.dataset.section==='detail'?'detail':'opponents';render();break;
 case'event-group':if(EVENT_DECK_GROUPS.some(group=>group.id===el.dataset.group)){eventGroup=el.dataset.group;eventListPage=0;eventSection='opponents';eventDeckId=EVENT_DECKS.find(deck=>eventGroup==='all'||deck.group===eventGroup).id;render();}break;
 case'event-page':{eventSection='opponents';const decks=EVENT_DECKS.filter(deck=>eventGroup==='all'||deck.group===eventGroup),size=eventPageSize();eventListPage=Math.max(0,Math.min(Math.ceil(decks.length/size)-1,Math.floor(Number(el.dataset.page)||0)));eventDeckId=decks[eventListPage*size].id;render();}break;
 case'event-start':startGame(null,el.dataset.deck);break;
 case'event-deck-detail':showEventRecipe(el.dataset.deck,0);break;
 case'event-recipe-page':showEventRecipe(el.dataset.deck,Number(el.dataset.page)||0);break;
 case'multi-mode':openMode('multi');break;
 case'rank-mode':openMode('rank');break;
 case'operator-art-refresh':void accountUi.refreshOperatorDeck().then(d=>{render();refreshRegaliaImages();toast(d?.artwork?'専用イラストを取得しました。':'専用イラストを取得できません。運営認証とサーバーの更新状況を確認してください。',!d?.artwork);});break;
 case'detail-page':if(currentModal?.kind==='detail'&&currentModal.id===id)cardDetails(id,currentModal.artContext,el.dataset.page,currentModal.recipeReturn);break;
 case'detail':cardDetails(id,el.dataset.artContext||'public');break;
 case'close-modal':closeModal();break;
 case'settings':settingsModal();break;
 case'bgm':data.bgm=!data.bgm;persist();syncMusic();if(data.bgm)musicController.unlock();updateMusicControls(musicController.getState());break;
 case'home-origin':if(elementMap[el.dataset.origin]){collectionScope='all';collectionSearch={text:'',type:'all',family:'all',subtype:'all',setId:'all',element:el.dataset.origin,rarity:'all',sort:'origin',page:1};navigate('collection');}break;
 case'pack-open':void purchasePack(el.dataset.pack);break;
 case'pack-results':if(data.lastPack)packResultModal();break;
 case'online-lobby':navigate('online');break;
 case'online-retry':void connectOnline();break;
 case'online-create':void beginOnlineMembership('room');break;
 case'online-join':void beginOnlineMembership('join');break;
 case'online-ranked':void beginOnlineMembership('ranked');break;
 case'online-cancel':void cancelOnlineWaiting();break;
 case'online-resume':if(online.match)enterOnlineMatch(online.match);break;
 case'online-copy':if(online.room?.code){navigator.clipboard?.writeText(online.room.code).then(()=>toast('ルームコードをコピーしました。')).catch(()=>toast(`ルームコード：${online.room.code}`));}break;
 case'online-name':nicknameModal();break;
 case'online-name-save':void saveOnlineNickname();break;
 case'sound':data.sound=!data.sound;persist();syncExperience();if(data.sound)experience.sound('confirm');if(currentModal?.kind==='settings'){render();settingsModal();}else render();break;
 case'motion':data.motion=!data.motion;persist();render();settingsModal();break;
 case'filter-type':search.type=el.dataset.type;search.subtype='all';search.page=1;render();break;
 case'reset-filters':collectionScope='all';search={text:'',type:'all',family:'all',subtype:'all',setId:'all',element:'all',rarity:'all',sort:'number',page:1};render();break;
 case'prev-page':search.page--;renderResults();if(page!=='deck'&&!window.matchMedia('(min-width:980px) and (pointer:fine)').matches)$('.filter-bar')?.scrollIntoView({block:'start',behavior:'instant'});break;
 case'next-page':search.page++;renderResults();if(page!=='deck'&&!window.matchMedia('(min-width:980px) and (pointer:fine)').matches)$('.filter-bar')?.scrollIntoView({block:'start',behavior:'instant'});break;
 case'deck-add':editDeck(id,true);break;
 case'deck-remove':editDeck(id,false);break;
 case'deck-save':saveDeck(true);break;
 case'deck-save-only':saveDeck(false);break;
 case'deck-bank-new':createBankDeck();break;
 case'deck-bank-use':activateSelectedBank();break;
 case'deck-bank-delete':requestBankDeckDelete();break;
 case'confirm-deck-bank-delete':confirmBankDeckDelete(id);break;
 case'deck-clear':confirmModal('デッキのカードを外しますか？','編集中のカードをすべて外します。保存済みのデッキは、次に保存するまで変更されません。','confirm-deck-clear','すべて外す');break;
 case'confirm-deck-clear':workingDeck=[];workingSpecial=[];rememberDraft();closeModal();render();break;
 case'battle-setup':battleSetup();break;
 case'tutorial-battle':battleSetup('easy');break;
 case'difficulty':difficulty=el.dataset.level;if(page==='solo')render();else battleSetup();break;
 case'start-game':startGame();break;
 case'resume':navigate('duel');break;
 case'inspect-effect-zone':inspectBattleEffect(el.dataset.zone);break;
 case'inspect-field-effect':inspectFieldEffect(Number(el.dataset.player),el.dataset.uid);break;
 case'inspect-arcana-effect':inspectBattleEffect(el.dataset.zone,el.dataset.key);break;
 case'hand':{const index=Number(el.dataset.index);if(el.dataset.handInspection==='true'){const id=game?.players?.[0]?.hand?.[index];if(id){inspectedHandId=id;inspectBattleEffect('hand');}}else inspectHand(index);break;}
 case'use-card':useSelected();break;
 case'cancel-selection':selected=null;handEffectsOpen=false;render();break;
 case'unit':{handEffectsOpen=false;const who=Number(el.dataset.player),uid=el.dataset.uid,u=game.players[who].field.find(u=>String(u.uid)===uid);if(!u)return;if(targetAction({player:who,uid:u.uid}))return;if(selected?.targeting||selected?.kind==='attack'){if(who===1||selected?.targeting){toast('光っている対象を選んでください。',true);return;}}if(who===0&&game.active===0&&game.winner===null){selected={kind:canAttack(game,u.uid)?'attack':'unit',uid:u.uid};battleEffectZone='field';battleEffectKey=who+':'+u.uid;render();}else inspectFieldEffect(who,u.uid);break;}
 case'core':{const who=Number(el.dataset.player);if(!targetAction({player:who,core:true})&&selected)toast('このハートポイントは今は対象に選べません。守護やカードの対象を確認してください。',true);break;}
 case'end-turn':if(game&&game.active===0&&game.winner===null){if(onlineBattle){void performOnlineAction({kind:'endTurn'});break;}selected=null;applyAction(endTurn(game),'turn');if(game.winner===null)scheduleCpu();}break;
 case'pause-game':pauseModal();break;
 case'surrender':confirmModal('この対戦を終了しますか？','降参すると敗北として戦績に記録されます。','confirm-surrender','降参する');break;
 case'confirm-surrender':if(onlineBattle){void performOnlineAction({kind:'surrender'});break;}if(!game||game.winner!==null){closeModal();if(game?.winner!==null)resultModal();break;}clearTimeout(cpuTimer);closeModal();game.winner=1;game.forfeited=true;game.log.push({type:'result',turn:game.turn,text:'あなたは降参しました。CPUの勝利。'});selected=null;render();finishGame();break;
 case'result':resultModal();break;
 case'battle-log':logModal();break;
 case'duel-rules':currentModal={kind:'duel-rules',label:'対戦中のヒント'};showModal(`<div class="eyebrow">QUICK GUIDE</div><h2>一手を選ぶ。</h2><p class="modal-intro">1. 手札をクリック／タップして選択します。<br>2. 「召喚する」「発動する」「設置する」で使用します。<br>3. 光っている自分の魔獣を選び、相手の魔獣かハートポイントの数字を選ぶと攻撃。<br>4. 「合成」なら素材と特殊ゾーンの魔獣を選び、合成召喚。<br>5. 行動が終わったら「ターン終了」。<br>6. 魔獣の情報ボタン、ギミック・ミラクルの枠、または「カード効果」から使用済みカードも確認できます。<br><br>魔獣は通常、召喚した次の自分のターンから攻撃できます。守護を持つ敵がいる場合は、その敵から攻撃しましょう。</p><div class="modal-actions"><button class="btn primary" data-action="close-modal">対戦に戻る</button></div>`);break;
 case'export':exportSave();break;
 case'import':$('#backup-input')?.click();break;
 case'confirm-import':{const imp=currentModal?.imported;if(!imp)break;clearTimeout(cpuTimer);onlineBattle=false;onlineClient.stopPolling();data=imp;entryNameDraft=data.playerName;campaignBattleId=getNextCampaignBattle(data.campaignProgress)?.id||CAMPAIGN_BATTLES[0].id;game=data.game;cpuGame=game;loadBankEntry(data.editingDeckId,{persistNow:false});persist(true);navigate('home');toast('バックアップを読み込みました。');break;}
 }
}
document.addEventListener('click',actionHandler);
document.addEventListener('submit',event=>{if(event.target.id==='entry-start-form'){event.preventDefault();startEntry();}});
document.addEventListener('input',event=>{const el=event.target;if(el.id==='entry-player-name')entryNameDraft=el.value;if(el.dataset.input==='bgm-volume'){data.bgmVolume=Math.max(0,Math.min(1,Number(el.value)/100));const out=$('#bgm-volume-readout');if(out)out.textContent=`${Math.round(data.bgmVolume*100)}%`;el.setAttribute('aria-valuetext',`${Math.round(data.bgmVolume*100)}%`);persist();syncMusic();musicController.unlock();}if(el.dataset.input==='inspect-candidate-query'&&currentModal?.kind==='deck-inspect'&&currentModal.mode==='replace'){currentModal.query=el.value;currentModal.candidatePage=1;const result=$('#inspect-candidate-results');if(result)result.innerHTML=inspectCandidateMarkup(currentModal);}if(el.dataset.input==='search'){search.text=el.value;search.page=1;renderResults();}if(el.dataset.input==='deck-name'){workingName=el.value;rememberDraft();}});
document.addEventListener('change',event=>{const el=event.target,key=el.dataset.change;if(el.matches?.('[data-experience-intensity]')){syncExperience();return;}if(key==='inspect-battle-card'){if(battleEffectZone!=='hand')inspectBattleEffect(battleEffectZone,el.value);return;}if(key==='inspect-slot'&&currentModal?.kind==='deck-inspect'){currentModal.index=Number(el.value);currentModal.mode='single';renderDeckInspector();return;}if(['setId','family','subtype','element','rarity','sort'].includes(key)){search[key]=el.value;search.page=1;renderResults();}if(key==='card-page'){const max=Math.max(1,Math.ceil(filteredCards().length/cardPageLayout(page==='deck').pageSize));search.page=Math.max(1,Math.min(max,Math.floor(Number(el.value)||1)));renderResults();return;}if(key==='deck-page'){deckListPage=Math.max(1,Math.floor(Number(el.value)||1));const list=$('.deck-list');if(list)list.innerHTML=deckList(deckSection==='special');requestAnimationFrame(syncCardViewport);return;}if(key==='deck-bank'){selectBankDeck(el.value);return;}if(key==='entry-starter'&&!entered&&STARTER_DECKS.some(d=>d.id===el.value)){entryStarterDraft=el.value;return;}if(key==='starter'&&el.value){if(registerOwnedStarter(el.value))selectBankDeck(starterSlot(el.value));else toast('未所持のスターターです。',true);}if(key==='cpu-deck')cpuDeckId=el.value;if(el.id==='backup-input')importSave(el.files?.[0]);});
bindOutsideDismiss(modalRoot,{getLayer:()=>modalRoot.querySelector('.modal'),onDismiss:closeModal});
bindOutsideDismiss(document,{
 getLayer:()=>{
  if(currentModal||document.querySelector('dialog[open],.bk-pack-ceremony'))return null;
  const panel=battleLogOpen?$('#battle-log-drawer:not([hidden])'):handEffectsOpen?$('#hand-effects-panel[data-open=true]'):null;
  return panel&&['fixed','absolute'].includes(getComputedStyle(panel).position)?panel:null;
 },
 isOutside:(event,panel)=>!panel.contains(event.target)&&!event.target.closest?.('[data-action="toggle-battle-log"],[data-action="toggle-hand-effects"]'),
 onDismiss:panel=>{
  const log=panel.id==='battle-log-drawer';
  if(log)battleLogOpen=false;else handEffectsOpen=false;
  render();$(log?'.battle-log-trigger':'.hand-effects-trigger')?.focus({preventScroll:true});
 }
});
document.addEventListener('keydown',event=>{if(event.target.matches?.('[data-action="settings-tab"]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const tabs=['sound','motion','account'],i=tabs.indexOf(settingsTab);settingsTab=event.key==='Home'?tabs[0]:event.key==='End'?tabs[2]:tabs[(i+(event.key==='ArrowRight'?1:2))%3];settingsModal();$(`[data-action="settings-tab"][data-tab="${settingsTab}"]`)?.focus({preventScroll:true});return;}if(event.key==='Enter'&&event.target.id==='entry-player-name'){event.preventDefault();startEntry();return;}if(event.key==='Enter'&&event.target.id==='operator-code'){event.preventDefault();accountUi.handleAction('operator-activate',event.target);return;}if(event.key==='Enter'&&event.target.id==='device-link-code'){event.preventDefault();accountUi.handleAction('cloud-link-claim',event.target);return;}if(event.key==='Enter'&&event.target.id==='online-nickname'){event.preventDefault();void saveOnlineNickname();return;}if(event.key==='Escape'){if(currentModal)closeModal();else if(battleLogOpen){battleLogOpen=false;render();$('.battle-log-trigger')?.focus({preventScroll:true});}else if(handEffectsOpen){handEffectsOpen=false;render();$('.hand-effects-trigger')?.focus({preventScroll:true});}else if(selected){selected=null;render();}return;}if(event.key==='Tab'&&currentModal){const els=[...modalRoot.querySelectorAll('button:not(:disabled),a,input:not([hidden]),textarea,select,[tabindex="0"]')].filter(el=>el.offsetParent!==null),first=els[0],last=els.at(-1);if(event.shiftKey&&(document.activeElement===first||document.activeElement.classList.contains('modal'))){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
render();
musicController.unlock();
if(!storageAvailable)toast('保存領域を読み込めませんでした。設定からバックアップできます。',true);

function rememberDraft(){data.draft={ids:[...workingDeck],specialIds:[...workingSpecial],name:workingName};const entry=currentBankEntry();if(entry)entry.draft={...data.draft,ids:[...data.draft.ids],specialIds:[...data.draft.specialIds]};persist();}
function zoneMarkup(i){const p=game.players[i],special=p.special||[],grave=p.grave||[],banished=p.banished||[];return `<div class="zone-strip" aria-label="${i?'相手':'自分'}のカード置き場"><button class="special-zone" data-action="zone" data-zone="special" data-player="${i}" aria-label="${i?'相手':'自分'}の特殊ゾーン ${special.length}枚"><span class="zone-stack" aria-hidden="true">${Array.from({length:4},(_,n)=>`<i class="${n<special.length?'filled':''}">✧</i>`).join('')}</span><span>特殊ゾーン <b>${special.length}</b></span></button><button class="zone-button" data-action="zone" data-zone="grave" data-player="${i}" aria-label="${i?'相手':'自分'}のお墓ゾーン ${grave.length}枚">お墓ゾーン <b>${grave.length}</b></button><button class="zone-button" data-action="zone" data-zone="banished" data-player="${i}" aria-label="${i?'相手':'自分'}の異世界ゾーン ${banished.length}枚">異世界ゾーン <b>${banished.length}</b></button></div>`;}
function zoneModal(who,zone){if(!game||![0,1].includes(who)||!['special','grave','banished'].includes(zone))return;const p=game.players[who],ids=p[zone]||[],name={special:'特殊ゾーン',grave:'お墓ゾーン',banished:'異世界ゾーン'}[zone];currentModal={kind:'zone',label:name};const hidden=who===1&&zone==='special';showModal(`<div class="eyebrow">${who?'OPPONENT':'YOUR'} ZONE</div><h2>${name} <span class="zone-modal-count">${ids.length}枚</span></h2><p class="modal-intro">${zone==='special'?(hidden?'相手の特殊デッキです。召喚されるまでカード名は公開されません。':'特殊デッキから召喚を待つ合成魔獣です。手持ちのミラクル「合成」を使って召喚します。'):zone==='grave'?'退場した魔獣や、使ったカードの置き場。通常魔獣・合成魔獣とも「合成」の素材として選べます。':'合成で使用した魔獣カードです。この対戦では再利用できません。'}</p><div class="zone-card-list">${hidden?ids.map(()=>'<div class="hidden-special">✧<span>合成魔獣</span></div>').join(''):ids.map(id=>{const c=getCard(id);return `<button class="zone-card-row" data-action="detail" data-id="${id}" data-art-context="${who===0?'battle':'public'}"><span class="material-art">${art(c,who===0?'battle':'public')}</span><span><strong>${esc(c.name)}</strong><small>${TYPE_LABELS[c.type]} · ${elementMap[c.element].name}${['beast','fusion'].includes(c.type)&&zone==='grave'?' · 合成素材に使用可':''}</small></span>${icon('info')}</button>`;}).join('')||'<p class="deck-hint">このゾーンにカードはありません。</p>'}</div><div class="modal-actions"><button class="btn" data-action="close-modal">閉じる</button></div>`,true);}
const materialKey=m=>`${m.zone}:${m.index}`;
function openFusion(handIndex){if(!game||game.active!==0||game.winner!==null)return;currentModal={kind:'fusion',label:'合成召喚',handIndex,specialIndex:getFusionChoices(game,handIndex,0)[0]?.index??-1,materials:[]};renderFusion();}
function renderFusion(){const f=currentModal;if(f?.kind!=='fusion'||!game)return;const p=game.players[0],spell=getCard(p.hand[f.handIndex]),choices=getFusionChoices(game,f.handIndex,0),chosen=getCard(p.special[f.specialIndex]),all=getEligibleFusionMaterials(game,f.handIndex,f.specialIndex,0);f.materials=f.materials.filter(m=>all.some(candidate=>materialKey(candidate)===materialKey(m)));const n=f.materials.length,bonus=Math.max(0,n-1)*FUSION_MATERIAL_BONUS,validation=validateFusionSelection(game,f.handIndex,{specialIndex:f.specialIndex,materials:f.materials}),scroll=$('.modal',modalRoot)?.scrollTop||0;const selectedKeys=new Set(f.materials.map(materialKey));showModal(`<div class="fusion-dialog"><div class="eyebrow">FUSION SUMMON</div><h2>力を合わせ、切り札を。</h2><p class="modal-intro">「${esc(spell.name)}」でエーテル${getCardCost(game,spell,0)}を使います。特殊ゾーンの1体と、1枚以上の魔獣を選択してください。${spell.materialFamily||chosen?.materialFamily?'素材にはレガリアか、レガリア専用魔獣だけを使えます。':''}手持ちだけ・出場ゾーンだけ・お墓ゾーンだけでも、複数ゾーンを組み合わせても合成できます。</p><h3 class="fusion-step"><span>1</span>特殊ゾーンから召喚する魔獣</h3><div class="fusion-choices">${choices.map(({id,index:i})=>{const c=getCard(id);return `<button class="fusion-choice ${f.specialIndex===i?'chosen':''}" data-action="fusion-special" data-index="${i}" aria-pressed="${f.specialIndex===i}"><span class="fusion-choice-art">${art(c)}</span><strong>${esc(c.name)}</strong><small>${elementMap[c.element].name} · ${c.attack} / ${c.hp}</small></button>`;}).join('')||'<p class="deck-hint">召喚できる合成魔獣が特殊ゾーンにいません。</p>'}</div><div class="fusion-step-head"><h3 class="fusion-step"><span>2</span>素材を1つのゾーンからでも選べます</h3><button class="text-button" data-action="fusion-reset">素材の選択を解除</button></div><div class="fusion-materials">${[['hand','手持ち'],['field','出場ゾーン'],['grave','お墓ゾーン']].map(([zone,name])=>{const group=all.filter(m=>m.zone===zone);return `<section class="material-zone"><header><h4>${name}<span>${group.length}枚</span></h4><button class="text-button" data-action="fusion-all" data-zone="${zone}" ${!group.length?'disabled':''}>すべて選択</button></header><div class="material-grid">${group.map(m=>{const c=getCard(m.cardId),key=materialKey(m),on=selectedKeys.has(key);return `<button class="material-option ${on?'chosen':''}" data-action="fusion-material" data-key="${key}" role="checkbox" aria-checked="${on}" aria-label="${name}の${esc(c.name)}を素材に選択"><span class="material-tick">${on?'✓':'+'}</span><span class="material-art">${art(c,'battle')}</span><span class="material-name"><strong>${esc(c.name)}</strong><small>${elementMap[c.element].name} · 攻撃${c.attack} / 守備力${c.hp}</small></span></button>`;}).join('')||'<p class="deck-hint">素材にできる魔獣はいません。</p>'}</div></section>`;}).join('')}</div><div class="fusion-confirmation"><div><span class="eyebrow">SUMMON PREVIEW</span><strong>${chosen?esc(chosen.name):'魔獣を選択'}</strong><p>素材 <b>${n}</b>枚${chosen?` · 攻撃 <b>${chosen.attack+bonus}</b> / 守備力 <b>${chosen.hp+bonus}</b>`:''}</p><small>選んだ素材はすべて異世界ゾーンへ送ります。2枚目以降は1枚ごとに攻撃力・守備力＋100。</small>${!validation.valid?`<p class="fusion-error" role="status">${esc(validation.errors[0])}</p>`:''}</div><div class="modal-actions"><button class="btn" data-action="close-modal">キャンセル</button><button class="btn primary" data-action="fusion-confirm" ${validation.valid?'':'disabled'}>${icon('fusion')}合成召喚</button></div></div></div>`,true);const modal=$('.modal',modalRoot);if(modal){modal.classList.add('fusion-modal');modal.scrollTop=scroll;}}

function musicButton(){return `<button class="icon-btn bgm-button ${data.bgm?'on':''}" data-action="bgm" aria-label="BGMを${data.bgm?'オフ':'オン'}にする" aria-pressed="${data.bgm}" title="BGM ${data.bgm?'ON':'OFF'}">${icon(data.bgm?'music':'musicMute')}</button>`;}
function updateMusicControls(state){if(!state)return;for(const el of document.querySelectorAll('[data-action="bgm"]')){el.classList.toggle('on',data.bgm);if(el.getAttribute('role')==='switch')el.setAttribute('aria-checked',String(data.bgm));else{el.setAttribute('aria-pressed',String(data.bgm));el.setAttribute('aria-label',`BGMを${data.bgm?'オフ':'オン'}にする`);el.title=`${state.scene==='battle-danger'?'クライマックス':state.scene==='battle-event'?'イベント戦':state.scene==='battle'?'バトル':'メニュー'}BGM ${data.bgm?'ON':'OFF'} · ${Math.round(data.bgmVolume*100)}%${state.blocked?' · 操作すると再生':''}`;el.innerHTML=icon(data.bgm?'music':'musicMute');}}}
function currentMusicScene(){
 if(!entered||page!=='duel'||!game)return 'menu';
 if(game.players.some(p=>p.core<=MAX_HEART_POINTS/2))return 'battle-danger';
 return !onlineBattle&&getEventDeck(game.eventBattleId)?'battle-event':'battle';
}
function syncMusic(){musicController.sync({scene:currentMusicScene(),enabled:data.bgm,volume:data.bgmVolume,visible:document.visibilityState!=='hidden'});updateMusicControls(musicController.getState());}
function unlockMusic(event){if(event?.target?.closest?.('[data-action="bgm"]'))return;if(event?.type==='keydown'&&(event.repeat||['Shift','Control','Alt','Meta'].includes(event.key)))return;musicController.unlock();}
document.addEventListener('pointerdown',unlockMusic,{capture:true});
document.addEventListener('keydown',unlockMusic,{capture:true});
function deckCopyCapacity(id){return Math.min(DECK_COPY_LIMIT,availableCopies(id));}
function availableCopies(id){return data.collection[id]||0;}
function missingOwnedCards(ids){return [...new Set(ids)].filter(id=>ids.filter(x=>x===id).length>availableCopies(id)).map(id=>`${getCard(id)?.name||id}の所持枚数が不足しています。`);}
function collectedMain(){return (getPack(selectedPackId)||PACKS[0]).cardIds.filter(id=>(data.collection[id]||0)>0).length;}
function shopView(){return treasureShop({data,section:shopSection,packId:selectedPackId,title,icon,esc,fmt,artStyle,collected:collectedMain()});}
function expansionRecipeModal(id,recipePage=1){
 const quote=quoteDeckRecipe(data.collection,id),deck=quote?.deck;
 if(!deck){toast('この構築例は見つかりませんでした。',true);return false;}
 const family=EXPANSION_FAMILIES.find(f=>f.id===deck.family),pack=getPack(deck.setId),premium=deck.id===PREMIUM_DECK_ID;
 const ids=[...deck.ids,...deck.specialIds],unique=[...new Set(ids)],size=layoutHeight()<420?2:layoutHeight()<650?4:6,pages=Math.ceil(unique.length/size),number=Math.max(1,Math.min(pages,recipePage));
 const shortDescription=deck.description.split('。')[0]+'。';
 currentModal={kind:'expansion-recipe',id,recipePage:number,label:deck.name+'の構築例'};
 showModal(`<div class="recipe-layout"><section class="recipe-overview"><div class="recipe-heading"><div class="recipe-emblem" aria-hidden="true">${icon(deck.setId==='BK03'?'shield':'spark')}</div><div><div class="eyebrow">${premium?'ALL PACKS':pack.id} · DECK RECIPE</div><h2>${esc(deck.name)}</h2><span class="recipe-family-badge">${esc(premium?'全18種類・ギラギラレア':family?.name||'第一弾・第二弾＋第三弾')}</span></div></div><p class="modal-intro recipe-description"><span class="recipe-copy-full">${esc(deck.description)}</span><span class="recipe-copy-compact">${esc(shortDescription)}</span></p><p class="recipe-note"><span class="recipe-copy-full">収録カードの一覧です。カード名から効果を確認できます。必要枚数をすべて所持すると、新しい保存枠に構築例を読み込めます。</span><span class="recipe-copy-compact">カード名で効果を確認。必要枚数が揃うと編成できます。</span></p></section><section class="recipe-contents" aria-label="構築に必要なカード"><div class="recipe-summary"><span>通常 <b>32</b>枚</span><span>特殊 <b>4</b>枚</span><span>不足 <b>${quote.missingCopies}</b>枚</span><span>${quote.owned?'すべて所持・編成可能':'パックから集めて編成'}</span></div><div class="recipe-card-list">${unique.slice((number-1)*size,number*size).map(cardId=>{const card=getCard(cardId),required=ids.filter(x=>x===cardId).length,owned=availableCopies(cardId),missing=Math.max(0,required-owned);return `<div class="recipe-card-row" data-missing="${missing>0}"><button data-action="recipe-card-detail" data-id="${cardId}" data-recipe="${esc(id)}" data-recipe-page="${number}"><strong>${esc(card.name)}</strong><small>${card.id} · ${getPack(card.setId).editionLabel} · ${TYPE_LABELS[card.type]}</small></button><span>必要 ${required}枚</span><span>${missing?`あと${missing}枚`:'所持済み'}</span></div>`;}).join('')}</div><div class="recipe-pagination"><button class="btn small" data-action="recipe-prev" ${number===1?'disabled':''}>前へ</button><span>${number} / ${pages}</span><button class="btn small" data-action="recipe-next" ${number===pages?'disabled':''}>次へ</button></div></section><div class="modal-actions recipe-actions"><button class="btn" data-action="close-modal">ショップに戻る</button><button class="btn primary" data-action="recipe-load" data-id="${esc(id)}" ${quote.owned?'':'disabled'}>${icon('cards')}${quote.owned?'構築例を読み込む':`あと${quote.missingCopies}枚で編成可能`}</button></div></div>`);
 return true;
}
function loadExpansionRecipe(id){
 if(currentModal?.kind!=='expansion-recipe'||currentModal.id!==id)return false;
 const quote=quoteDeckRecipe(data.collection,id),deck=quote?.deck;
 if(!deck||!quote.owned){toast('構築例のカードを必要枚数まで集めてください。',true);return false;}
 ensureDeckBank();
 let saved=data.deckLibrary.find(d=>d.id.startsWith('custom-')&&!d.draft&&sameBankDeck(d,deck));
 if(!saved){
  if(data.deckLibrary.length>=DECK_BANK_LIMIT){toast('デッキの保存枠が16個に達しています。',true);return false;}
  saved=deckRecord('custom-'+crypto.randomUUID().toLowerCase(),deck.name,deck.ids,deck.specialIds);
  data.deckLibrary.push(saved);
 }
 if(!loadBankEntry(saved.id))return false;
 closeModal();navigate('deck');toast('「'+deck.name+'」を読み込みました。「対戦に使用」で切り替えられます。');return true;
}
function packCardsMarkup(pulls){return pulls.map((pull,i)=>`<div class="pack-pull ${pull.isNew?'new-card':''}" style="--reveal-delay:${Math.min(i*.045,.5)}s">${cardMarkup(getCard(pull.cardId))}<span class="pack-pull-status">${pull.converted?`重複 · +${EXTRA_COPY_TREASURE}秘宝`:pull.isNew?'NEW · 初獲得':'所持カードに追加'}${pull.guaranteed?' · 確定枠':''}</span></div>`).join('');}
function starterPurchaseModal(id){
 const quote=quoteStarterPurchase(data,id);
 if(!quote.ok){toast(quote.error,true);return false;}
 currentModal={kind:'starter-buy',id,label:'スターターデッキの購入',received:quote.received,bonusTreasure:quote.bonusTreasure};
 showModal(`<div class="eyebrow">STARTER DECK · PURCHASE</div><h2>${esc(quote.starter.name)}</h2><p class="modal-intro">通常32枚・特殊4枚の固定セットです。抽選はありません。</p><div class="starter-sale-summary"><div><span>価格</span><strong>${fmt(quote.cost)}秘宝</strong></div><div><span>追加されるカード</span><strong>${quote.received}枚</strong></div><div><span>所持上限による変換</span><strong>+${fmt(quote.bonusTreasure)}秘宝</strong></div><div><span>購入後の残高</span><strong>${fmt(quote.treasure)}秘宝</strong></div></div><p class="modal-intro">現在のデッキ編成と保存データは変更しません。</p><div class="modal-actions"><button class="btn" data-action="close-modal">キャンセル</button><button class="btn primary" data-action="starter-buy-confirm" data-id="${esc(id)}">${icon('treasure')}購入する</button></div>`);
 return true;
}
function confirmStarterPurchase(id){
 if(currentModal?.kind!=='starter-buy'||currentModal.id!==id||page!=='shop')return false;
 const quote=quoteStarterPurchase(data,id);
 if(!quote.ok){closeModal();render();toast(quote.error,true);return false;}
 if(quote.received!==currentModal.received||quote.bonusTreasure!==currentModal.bonusTreasure){starterPurchaseModal(id);toast('所持状況が変わりました。購入内容を再確認してください。',true);return false;}
 const result=purchaseStarter(data,id);
 if(!result.ok){closeModal();toast(result.error,true);return false;}
 closeModal();data.treasure=result.treasure;data.collection=result.collection;
 registerOwnedStarter(id);persist(true);render();sound('play');
 currentModal={kind:'starter-purchased',label:'スターター購入完了'};
 showModal(`<div class="eyebrow">STARTER DECK · COMPLETE</div><h2>${esc(result.starter.name)}</h2><p class="modal-intro">購入完了。カード${result.received}枚を所持カードに追加しました。${result.bonusTreasure?` 重複変換で${fmt(result.bonusTreasure)}秘宝を獲得。`:''}</p><p>残り ${fmt(data.treasure)}秘宝</p><div class="modal-actions"><button class="btn" data-action="starter-load" data-id="${esc(id)}">デッキに読み込む</button><button class="btn primary" data-action="close-modal">ショップに戻る</button></div>`);
 return true;
}
async function purchasePack(packId=selectedPackId){
 if(packOpening||currentModal?.kind==='pack-result')return;
 packOpening=true;
 try{
  const result=openPack({treasure:data.treasure,collection:data.collection},{packId,randomFn:()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296});
  if(!result.ok){toast(result.error,true);return;}
  data.treasure=result.treasure;data.collection=result.collection;data.lastPack={packId:result.packId,pulls:result.pulls,bonusTreasure:result.bonusTreasure,openedAt:Date.now()};
  persist(true);render();
  const ranks=Object.keys(RARITY_LABELS),rarity=result.pulls.reduce((highest,pull)=>{const next=getCard(pull.id||pull.cardId)?.rarity||'N';return ranks.indexOf(next)>ranks.indexOf(highest)?next:highest;},'N');
  try{await experience.openPack({name:(getPack(result.packId)||PACKS[0]).name,rarity});}catch{}
  packResultModal(true);
 }finally{packOpening=false;}
}

function packResultModal(reveal=false){const p=data.lastPack;if(!p)return;const pack=getPack(p.packId)||PACKS[0];currentModal={kind:'pack-result',label:'パック開封結果'};showModal(`<div class="eyebrow">${pack.id} · PACK OPENED</div><h2>${pack.name} — 12枚の出会い</h2><p class="modal-intro">新しく獲得 ${p.pulls.filter(x=>x.isNew).length}種類${p.bonusTreasure?` · 重複変換 +${p.bonusTreasure}秘宝`:''} · 残り ${fmt(data.treasure)}秘宝</p><div class="pack-result-grid">${packCardsMarkup(p.pulls)}</div><div class="modal-actions"><button class="btn" data-nav="deck">デッキに組み込む</button><button class="btn primary" data-action="close-modal">ショップに戻る</button></div>`,true);$('.modal',modalRoot)?.classList.add('pack-modal');if(reveal)experience.revealCards(modalRoot,p.pulls,getCard);}


function onlineView(){
 const p=online.profile||onlineClient.profile,active=online.match?.status==='active',disabled=online.busy||online.connecting;
 const header=title(lobbyMode==='multi'?'MULTI MODE':lobbyMode==='rank'?'RANK MODE':'LIVE ARENA',lobbyMode==='multi'?'マルチモード':lobbyMode==='rank'?'ランクモード':'オンライン対戦','ルームを作って友達と。ランクマッチで、まだ見ぬ対戦相手と。');
 const profile=p?`<section class="online-profile"><div class="profile-avatar">${profileIcon(p.origin||data.profileOrigin)}</div><div class="profile-details"><strong>${esc(p.nickname)}</strong><small>使用デッキ：${esc(data.deckName)} · 通常32枚 ＋ 特殊4枚</small></div><div class="profile-rating"><small>RATING</small><strong>${online.match?.selfRating??p.rating}</strong></div><button class="icon-btn" data-action="online-name" aria-label="プロフィールを変更" ${disabled?'disabled':''}>${icon('settings')}</button></section>`:`<p class="online-connection">${online.connecting?'オンライン対戦に接続しています…':'オンライン対戦への接続を確認してください。'}</p>`;
 const error=online.error?`<div class="online-error" role="status">${esc(online.error)}<button class="text-button" data-action="online-retry" ${disabled?'disabled':''}>接続を再確認</button></div>`:'';
 let content;
 if(active){content=`<section class="online-waiting"><div class="waiting-orbit">${icon('sword')}</div><span class="eyebrow">${online.match.mode==='ranked'?'RANKED MATCH':'ROOM MATCH'}</span><h2>対戦が進行中です</h2><p>${esc(online.match.opponent.name)} <span class="online-badge ${online.match.opponent.kind==='bot'?'bot':''}">${online.match.opponent.kind==='bot'?'BOT':'対人'}</span><br>オンライン対戦の制限時間は、ロビーでも進みます。</p><button class="btn primary" data-action="online-resume">${icon('sword')}対戦に戻る</button></section>`;}
 else if(online.phase==='waiting'&&online.room){content=`<section class="online-waiting"><div class="waiting-orbit">${icon('globe')}</div><span class="eyebrow">PRIVATE ROOM</span><h2>対戦相手を待っています</h2><p>このルームコードを相手に伝えてください。<br>相手が入室すると、1対1の対戦が始まります。</p><div class="room-code" aria-label="ルームコード ${esc(online.room.code)}">${esc(online.room.code)}</div><div><button class="btn" data-action="online-copy">コードをコピー</button><button class="btn" data-action="online-cancel" ${disabled?'disabled':''}>ルームを閉じる</button></div><p style="margin-top:20px">ルームの待機期限は30分です。<br>この画面を離れると、待機中のルームを閉じます。</p></section>`;}
 else if(online.phase==='waiting'&&online.queue){content=`<section class="online-waiting"><div class="waiting-orbit">${icon('trophy')}</div><span class="eyebrow">RANKED MATCHMAKING</span><h2>${online.queue.paused?'メンテナンス終了を待っています':'対戦相手を探しています'}</h2><div class="queue-clock" data-queue-clock>0:00</div><div class="queue-progress"><i data-queue-progress style="width:0%"></i></div><p>${online.queue.paused?'新しい対戦の成立は一時停止中です。受付の再開後にマッチングを続けます。':'オンラインのプレイヤーとマッチングします。<br>60秒待っても相手が見つからない場合はBOT戦へ切り替わります。'}</p><button class="btn" data-action="online-cancel" ${disabled?'disabled':''}>マッチングを取り消す</button><p style="margin-top:18px">この画面を離れるとマッチングを取り消します。</p></section>`;}
 else content=`${online.match?.status==='finished'?`<div class="online-connection" style="margin:0 0 22px">前回：${online.match.result==='win'?'勝利':online.match.result==='loss'?'敗北':'引き分け'} · ${esc(online.match.opponent.name)}${online.match.opponent.kind==='bot'?'（BOT）':''}${online.match.mode==='ranked'?` · レート ${online.match.selfRating}（${online.match.ratingDelta>=0?'+':''}${online.match.ratingDelta}）`:''}</div>`:''}<div class="online-grid ${lobbyMode!=='all'?'single-mode':''}"><section class="online-panel" ${lobbyMode==='rank'?'hidden':''}><span class="panel-symbol">${icon('globe')}</span><span class="eyebrow">PLAY WITH A FRIEND</span><h2>ルーム対戦</h2><p>合言葉でつながる、1対1の対戦。<br>ルームを作り、6文字のコードを相手に伝えよう。ルーム対戦ではレートは変わりません。</p><button class="btn primary" data-action="online-create" ${disabled||!p?'disabled':''}>${icon('globe')}ルームを作る</button><div class="room-join"><label for="room-code">6文字のルームコード</label><input id="room-code" maxlength="6" placeholder="ルームコード" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="6文字のルームコード"><button class="btn" data-action="online-join" ${disabled||!p?'disabled':''}>参加</button></div></section><section class="online-panel" ${lobbyMode==='multi'?'hidden':''}><span class="panel-symbol">${icon('trophy')}</span><span class="eyebrow">CLIMB THE RANKS</span><h2>ランクマッチ</h2><p>いま待機しているプレイヤーと対戦。勝敗に応じてレートが変わります。60秒マッチしない場合は、BOTが対戦相手を務めます。</p><button class="btn primary" data-action="online-ranked" ${disabled||!p?'disabled':''}>${icon('sword')}ランクマッチを探す</button><div class="online-connection online-status-line"><i class="online-status-dot"></i>人間の対戦相手を優先 · BOT戦は相手名に表示</div></section></div>`;
 return `<div class="mode-lobby mode-${lobbyMode}">${header}${profile}${error}${content}<section class="online-rules"><h3>対戦の準備と接続</h3><p>使用するカードは、通常デッキが必ず32枚、特殊デッキが必ず4枚。合成魔獣は特殊デッキに入れます。足りない・多いデッキでは開始できません。</p><p>オンライン対戦は1手番120秒で、時間切れは敗北です。タブや画面を離れても一時停止しません。同じブラウザからロビーへ戻ると進行中の対戦に再接続できます。</p><p>レートはプレイヤーにひもづきます。設定の「端末連携と同期」で連携した端末では、所持カード・秘宝・デッキ・ソロ進行と同じオンラインプロフィールを共有できます。</p></section></div>`;
}
function renderOnlineStatus(){if(page==='online'||page==='home')render();updateOnlineClocks();}
function ensureOnlinePolling(target){
 const status=onlineClient.getStatus();
 if(status.polling&&JSON.stringify(status.target)===JSON.stringify(target))return;
 onlineClient.startPolling(target);
}
async function connectOnline(){
 if(online.connecting)return;
 online.connecting=true;online.error='';renderOnlineStatus();
 try{
  await initializeCloud();let payload=await onlineClient.refreshProfile();online.profile=payload.profile||onlineClient.profile;if(page!=='online')return;
  if(payload.activity)await recoverOnlineActivity(payload.activity);
  else if(online.match?.status==='active')await onlineClient.getMatch(online.match.id);
  else if(online.phase==='waiting'&&online.room)await onlineClient.getRoom(online.room.code);
  else if(online.phase==='waiting'&&online.queue)await onlineClient.getQueue();
  else if(payload.profile?.lastMatchId&&!data.rewardedMatches.includes(payload.profile.lastMatchId))await onlineClient.getMatch(payload.profile.lastMatchId);
 }catch(error){if(error.name!=='AbortError')online.error=error.message||'オンライン対戦に接続できませんでした。';}
 finally{online.connecting=false;renderOnlineStatus();}
}
async function recoverOnlineActivity(activity){
 const key=JSON.stringify(activity);if(online.activityKey===key)return;
 online.activityKey=key;
 try{if(activity.kind==='match')await onlineClient.getMatch(activity.matchId);else if(activity.kind==='room')await onlineClient.getRoom(activity.roomCode);else if(activity.kind==='queue')await onlineClient.getQueue();}
 catch(error){if(error.name!=='AbortError')online.error=error.message;}
 finally{online.activityKey=null;}
}
function receiveOnlineUpdate({phase,payload,source}){
 if(['cloud','account','operator','public','inbox','events','presence'].includes(phase))return;
 const previousError=online.error;online.error='';
 if(phase==='profile'){online.profile=payload.profile;renderOnlineStatus();return;}
 if(payload.match){
  const enter=onlineBattle||(page==='online'&&['joining','waiting'].includes(online.phase));
  acceptOnlineMatch(payload.match,{enter});
  if(previousError&&onlineBattle)render();
  return;
 }
 if(phase==='room'||phase==='queue'){
  online.room=phase==='room'?payload.room:null;online.queue=phase==='queue'?payload.queue:null;
  online.queueReceivedAt=Date.now();online.phase=payload.status==='waiting'?'waiting':'idle';
  if(online.phase==='idle')pendingOnlineArt=null;
  if(online.phase==='waiting'){online.membershipKind=phase;if(page!=='online'&&!onlineBattle){void cancelOnlineWaiting(true);return;}ensureOnlinePolling(online.room?{roomCode:online.room.code}:{queue:true});}
  else onlineClient.stopPolling();
  renderOnlineStatus();
 }
}
function receiveOnlineError(error){
 if(error.name==='AbortError'||['cloud','account','operator','public','inbox','events','presence'].includes(error.phase))return;
 const changed=online.error!==error.message;online.error=error.message||'通信を確認しています。';
 if(error.payload?.match)acceptOnlineMatch(error.payload.match,{enter:onlineBattle});
 else if(error.payload?.activity)void recoverOnlineActivity(error.payload.activity);
 if(changed&&(page==='online'||onlineBattle))render();
}
function acceptOnlineMatch(match,{enter=false}={}){
 if(!match?.id||!match.state)return;
 rememberOnlineArt(match);
 const old=online.match,changed=!old||old.id!==match.id||old.revision!==match.revision||old.status!==match.status;
 if(old?.id===match.id&&match.revision<old.revision)return;
 const wasBlocked=online.syncRequired;
 online.match=match;online.room=null;online.queue=null;online.phase=match.status;online.clockOffset=match.serverTime-Date.now();online.syncRequired=false;
 if(online.profile)online.profile.rating=match.selfRating;
 if(enter&&!onlineBattle)enterOnlineMatch(match);
 else if(onlineBattle){
  if(changed){game=match.state;game.playerDeckName='オンラインデッキ';selected=null;if(currentModal?.kind==='fusion')closeModal();render();}
  else if(wasBlocked)render();
 }
 if(match.status==='finished'){
  recordOnlineResult(match);onlineClient.stopPolling();
  if(onlineBattle&&online.resultShown!==match.id){online.resultShown=match.id;sound(match.result==='win'?'win':'turn');setTimeout(()=>{if(onlineBattle&&online.match?.id===match.id&&page==='duel')resultModal();},300);}
 }else if(onlineBattle)ensureOnlinePolling({matchId:match.id});
 if(page==='online'||page==='home')render();updateOnlineClocks();
}
function enterOnlineMatch(match){
 handEffectsOpen=false;inspectedHandId=null;battleEffectZone='hand';battleEffectKey=null;
 if(!match?.state)return;
 clearTimeout(cpuTimer);if(!onlineBattle)cpuGame=game;
 onlineBattle=true;online.match=match;game=match.state;game.playerDeckName='オンラインデッキ';selected=null;closeModal();page='duel';history.replaceState(null,'','#duel');render();window.scrollTo({top:0,behavior:'instant'});
 if(match.status==='active')ensureOnlinePolling({matchId:match.id});else resultModal();
 updateOnlineClocks();
}
function onlineReward(match){return match?.status==='finished'?getBattleReward({winner:match.state.winner,forfeited:match.reason==='surrender'&&match.result==='loss'}):0;}
function recordOnlineResult(match){
 if(!match||match.status!=='finished'||data.rewardedMatches.includes(match.id))return;
 data.rewardedMatches.push(match.id);data.rewardedMatches=data.rewardedMatches.slice(-200);data.stats.played++;
 if(match.result==='win')data.stats.won++;if(match.result==='draw')data.stats.drawn++;
 data.treasure=Math.min(Number.MAX_SAFE_INTEGER,data.treasure+onlineReward(match));persist(true);
}
function validatedOnlineDeck(){
 const main=validateDeck(data.deckIds),special=validateSpecialDeck(data.specialIds),missing=missingOwnedCards([...data.deckIds,...data.specialIds]);
 if(!main.valid||!special.valid||missing.length){toast([...main.errors,...special.errors,...missing][0],true);return null;}
 return {deck:[...data.deckIds],special:[...data.specialIds]};
}
async function beginOnlineMembership(kind){
 if(online.busy||online.connecting||online.cancelling)return;
 if(online.match?.status==='active'){enterOnlineMatch(online.match);return;}
 const selectedDeck=validatedOnlineDeck();if(!selectedDeck)return;
 const code=kind==='join'?$('#room-code')?.value?.trim().toUpperCase():null;
 if(kind==='join'&&!/^[A-Z2-9]{6}$/.test(code||'')){toast('6文字のルームコードを入力してください。',true);return;}
 const deckSlotId=data.activeDeckId===KIRAHARA_SLOT&&currentOperatorGrant()?KIRAHARA_SLOT:null;
 pendingOnlineArt={playerId:onlineClient.profile?.id,mode:kind==='ranked'?'ranked':'room',roomCode:code,deckId:deckSlotId};
 online.membershipKind=kind==='ranked'?'queue':'room';online.requestedRoom=code;online.busy=true;online.error='';online.phase='joining';online.match=null;online.resultShown=null;renderOnlineStatus();
 try{
  if(kind==='ranked')await onlineClient.startRanked(selectedDeck.deck,selectedDeck.special,deckSlotId);
  else if(kind==='room')await onlineClient.createRoom(selectedDeck.deck,selectedDeck.special,deckSlotId);
  else await onlineClient.joinRoom(code,selectedDeck.deck,selectedDeck.special,deckSlotId);
 }catch(error){if(error.name!=='AbortError'){online.error=error.message;if(online.phase==='joining')online.phase='idle';}}
 finally{online.busy=false;if(page==='online'||onlineBattle)render();updateOnlineClocks();}
}
async function cancelOnlineWaiting(force=false){
 pendingOnlineArt=null;
 if(online.cancelling||(!force&&online.busy))return;
 online.cancelling=true;online.busy=true;const code=online.room?.code||online.requestedRoom;
 try{if(online.membershipKind==='room'||code)await onlineClient.leaveRoom(code||undefined);else await onlineClient.cancelRanked();}
 catch(error){if(error.name!=='AbortError')online.error=error.message;}
 finally{online.cancelling=false;online.busy=false;if(online.phase==='idle'){online.membershipKind=null;online.requestedRoom=null;}renderOnlineStatus();}
}

async function performOnlineAction(action){
 if(!onlineBattle||online.busy||online.syncRequired||online.match?.status!=='active')return;
 if(action.kind!=='surrender'&&game.active!==0)return;
 const id=online.match.id,body={...action,revision:online.match.revision,actionId:crypto.randomUUID()};
 online.busy=true;online.error='';selected=null;closeModal();render();
 try{await onlineClient.sendAction(id,body);sound(action.kind==='attack'?'attack':action.kind==='endTurn'?'turn':'play');}
 catch(error){if(error.name!=='AbortError'){
  if(!error.payload?.match){online.syncRequired=true;try{await onlineClient.getMatch(id);}catch{}}
  toast(error.message||'最新の対戦状況を確認しています。',true);
 }}
 finally{online.busy=false;if(onlineBattle){render();updateOnlineClocks();}}
}
function profileIcon(origin){const id=elementMap[origin]?origin:'mountain';return `<img class="origin-profile-image" src="assets/profiles/${id}.svg" alt="${elementMap[id].name}のプロフィールアイコン" width="48" height="48">`;}
function profileChoices(origin){return `<div class="profile-options" role="group" aria-label="プロフィールアイコン">${ELEMENTS.map(e=>`<button type="button" class="profile-option ${origin===e.id?'selected':''}" data-action="profile-origin" data-origin="${e.id}" aria-pressed="${origin===e.id}" aria-label="${e.name}のプロフィールアイコン">${profileIcon(e.id)}<span>${e.name}</span></button>`).join('')}</div>`;}
function nicknameModal(name=data.playerName||online.profile?.nickname||'',origin=data.profileOrigin){currentModal={kind:'nickname',label:'プロフィールの変更',profileOrigin:origin};showModal(`<div class="eyebrow">PLAYER PROFILE</div><h2>プロフィールを変更</h2><p class="modal-intro">ソロ・マルチ・ランクの各モードで使う名前とアイコンです。</p><div class="profile-editor-grid"><div class="profile-name-field"><label class="profile-name-label" for="online-nickname">プレイヤー名 · 1〜16文字</label><input id="online-nickname" class="online-nickname" maxlength="16" value="${esc(name)}" aria-label="プレイヤー名" autocomplete="nickname"></div><div class="profile-icon-field"><p class="profile-choice-label">プロフィールアイコン</p>${profileChoices(origin)}</div></div><div class="modal-actions"><button class="btn" data-action="close-modal">キャンセル</button><button class="btn primary" data-action="online-name-save">保存する</button></div>`);}
async function saveOnlineNickname(){
 const name=$('#online-nickname')?.value.trim();if(!name||name.length>16){toast('プレイヤー名は1〜16文字で入力してください。',true);return;}if(online.busy)return;
 const origin=currentModal?.profileOrigin||data.profileOrigin;data.playerName=name;entryNameDraft=name;data.profileOrigin=elementMap[origin]?origin:'mountain';if(cpuGame)cpuGame.players[0].name=name;persist(true);closeModal();render();toast('プロフィールを保存しました。');
 if(online.profile||onlineClient.profile){online.busy=true;try{const payload=await onlineClient.updateProfile({nickname:name,origin:data.profileOrigin});online.profile=payload.profile;}catch(error){if(error.name!=='AbortError')online.error='オンラインのプロフィールは、次の接続時に更新します。';}finally{online.busy=false;renderOnlineStatus();}}
}
function chooseProfileOrigin(origin){if(!elementMap[origin])return;if(!entered){entryNameDraft=$('#entry-player-name')?.value??entryNameDraft;data.profileOrigin=origin;persist();render();}else if(currentModal?.kind==='nickname'){nicknameModal($('#online-nickname')?.value??data.playerName,origin);}}
function startEntry(){const name=$('#entry-player-name')?.value.trim();if(!name||name.length>16){toast('プレイヤー名を1〜16文字で入力してください。',true);$('#entry-player-name')?.focus();return;}const chosen=STARTER_DECKS.find(d=>d.id===($('#entry-starter')?.value||entryStarterDraft))||STARTER_DECKS[0];
 const first=baseData(chosen.id);data.collection=first.collection;data.deckIds=first.deckIds;data.specialIds=first.specialIds;data.deckName=first.deckName;data.starter=chosen.id;data.freeStarterId=chosen.id;data.deckLibrary=[];data.draft=null;data.activeDeckId=null;data.editingDeckId=null;initializeDeckBank(data);loadBankEntry(data.activeDeckId,{persistNow:false});
 data.playerName=name;entryNameDraft=name;entryStarterDraft=chosen.id;entered=true;persist(true);musicController.unlock();navigate('home');void initializeCloud().catch(()=>{});}
function openMode(mode){lobbyMode=mode;navigate('online');}

function updateOnlineClocks(){
 const queueClock=$('[data-queue-clock]');
 if(queueClock&&online.queue){const elapsed=Math.max(0,online.queue.elapsedSeconds+(online.queue.paused?0:Math.floor((Date.now()-online.queueReceivedAt)/1000)));queueClock.textContent=online.queue.paused?'受付再開待ち':`${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}`;const bar=$('[data-queue-progress]');if(bar)bar.style.width=`${Math.min(100,elapsed/60*100)}%`;}
 const clock=$('[data-online-clock]');if(clock&&online.match){const left=Math.max(0,Math.ceil((online.match.turnDeadline-Date.now()-online.clockOffset)/1000));clock.textContent=online.match.status==='finished'?'':`${game.active===0?'あなた':'相手'} 残り ${left}秒`;}
}
setInterval(updateOnlineClocks,1000);
if(entered)void initializeCloud().catch(()=>{});
if(page==='online'&&entered)void connectOnline();

window.addEventListener('beastking:viewport',()=>{clearTimeout(viewportResize);viewportResize=setTimeout(()=>{cardLayout=null;deckImageCount=0;deckImageLayout=null;if(['collection','deck','events'].includes(page)&&entered)render();else syncCardViewport();},120);});

import {BRAND_ICONS} from '../brand-icons.js?v=20261124-29';
import {ARTWORK_OVERRIDES} from './artwork-manifest.js?v=20261124-29';
import {createMusicController} from '../music.js?v=20261124-29';
import {createExperienceController,RARITY_ORDER,EXPERIENCE_STORAGE_KEY} from '../experience-fx.js?v=20261124-29';
import {normalizeSoloSnapshot,verifyOperatorSnapshot,musicScene} from './solo-save.js?v=20261124-29';
import {createOperatorClient} from './operator-client.js?v=20261124-29';
import {createRebuildCloudClient} from './cloud-client.js?v=20261124-29';
import {validateRebuildBackup,ROLLBACK_KEY} from './backup.js?v=20261124-29';
import {CARDS,ORIGINS,TYPE_LABELS,RARITY_LABELS,MODEL_LABELS,STARTER_DECKS,PACKS,SECOND_REGALIA_ID,getCard} from './catalog.js?v=20261124-29';
import {CARD_ART_CROPS} from '../card-art-layouts.js?v=20261124-29';
import {CARD_ART_OVERRIDES} from '../card-art-overrides.js?v=20261124-29';
import {CARD_ART_USER_OVERRIDES} from '../card-art-user.js?v=20261124-29';
import {newGame,playCard,attack,endTurn,runCpuTurn,getLegalTargets,getAttackTargets,getPlayableCards,getFusionMaterials,canAttack} from './engine.js?v=20261124-29';
import {CAMPAIGN_BATTLES} from '../campaign.js?v=20261124-29';
import {STARTERS,STORAGE_KEY,initialProfile,loadProfile,persistProfile,migrateRebuildProfile,checkDeck,saveDeck,chooseStarter,counts,purchase,recordSolo,endSuspendedSolo} from './profile.js?v=20261124-29';
import {quoteStarterPurchase,purchaseStarter,STARTER_PRICE} from '../shop.js?v=20261124-29';
const root=document.querySelector('#app'),dialog=document.querySelector('#detail');
const esc=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt=n=>Number(n).toLocaleString('ja-JP');
const origin=id=>ORIGINS.find(x=>x.id===id);
const byType=Object.entries(TYPE_LABELS);
const label=id=>getCard(id)?.name||id;
let profile=loadProfile(localStorage),page='home',message='',draft=null,match=null,selection=null,cpuBusy=false,filter={q:'',type:'',origin:'',rarity:'',pack:'',page:0};
if(profile)try{persistProfile(localStorage,profile);}catch{/* Continue with the in-memory save on a read-only device. */}
let shopPage=0,shopPack='BK01',cpuTimer=null,starterQuote=null,packOpening=false;
let hasExperiencePreferences=false;try{hasExperiencePreferences=localStorage.getItem(EXPERIENCE_STORAGE_KEY)!==null;}catch{}
const experience=createExperienceController();
// Migrate legacy mute once; later choices remain device-local across restores.
if(!hasExperiencePreferences&&(typeof profile?.sound==='boolean'||typeof profile?.motion==='boolean'))experience.sync({...(typeof profile.sound==='boolean'?{enabled:profile.sound}:{}),...(typeof profile.motion==='boolean'?{motion:profile.motion}:{})});
const music=createMusicController({idPrefix:'beastking-rebuild-bgm',sources:{menu:'../assets/audio/menu.mp3',battle:'../assets/audio/battle.mp3','battle-danger':'../assets/audio/battle-danger.mp3'}});
const operatorClient=createOperatorClient(),cloudClient=createRebuildCloudClient();let cloudView=null;let operatorGrant=null,operatorSelected=false,operatorBusy=false,brandTaps=0,brandAt=0,starting=false;
const nav=[['home','王庭','home'],['solo','ソロ対戦','sword'],['deck','デッキ工房','cards'],['catalog','カード図鑑','book'],['shop','秘宝ショップ','treasure'],['rules','遊び方','info']];
const typeIcons={beast:'beast',fusion:'fusion',miracle:'spark',gimmick:'trap'};
const actionIcons={'resume':'clock','pause-match':'pause','end-turn':'check','purchase':'treasure','save-deck':'check','close':'close','cancel-target':'back','leave':'home','discard-match':'close','forfeit':'back','campaign':'sword','replay':'sword','cloud-open':'save','cloud-save':'save','cloud-restore':'history','cloud-recover':'history'};
function icon(name){return '<svg class="bk-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24">'+(BRAND_ICONS[name]||BRAND_ICONS.info)+'</svg>'}
function artOverride(c){return c.name==='王冠竜 レガリア'?null:ARTWORK_OVERRIDES[c.id]||null}
function isPendingArt(c){return c.artStatus==='pending'&&!artOverride(c)}
function save(next){persistProfile(localStorage,next);profile=next}
function setMessage(s){message=s;const node=document.querySelector('#status');if(node)node.textContent=s}
function act(action,text,extra='',cls=''){const mark=action==='bgm-toggle'?(profile?.bgm?'music':'musicMute'):actionIcons[action];return '<button type="button" class="'+cls+'" data-act="'+action+'" '+extra+'>'+(mark?icon(mark):'')+'<span>'+esc(text)+'</span></button>'}
function setPage(p){
 if(match&&match.game.winner===null&&p!=='battle'){setMessage('中断するか対戦を終了してから移動してください。');return}
 if(match&&match.game.winner!==null&&p!=='battle'){save(endSuspendedSolo(profile));match=null;selection=null;}
 if(p==='deck'&&!draft)draft={main:[...profile.main],special:[...profile.special]};
 if(page!==p){filter={q:'',type:'',origin:'',rarity:'',pack:'',page:0};shopPage=0}
 page=p;message='';render();
}
function art(c,operatorArt=false){
 if(operatorArt&&c.id===SECOND_REGALIA_ID&&operatorGrant?.entitled&&!operatorGrant.artwork)return 'background:radial-gradient(ellipse,#283b5a,#100f24 70%);background-size:cover';
 if(operatorArt&&c.id===SECOND_REGALIA_ID&&operatorGrant?.entitled&&operatorGrant.artwork)return "background-image:url('"+operatorGrant.artwork+"');background-position:center;background-repeat:no-repeat;background-size:"+(operatorGrant.artwork.startsWith('data:image/webp;')?'contain':'cover');
 const original=CARD_ART_USER_OVERRIDES[c.artSourceId||c.id];if(original)return "background-image:url('../"+original.src+"?v="+original.sha256.slice(0,12)+"');background-position:"+original.position+";background-size:"+original.fit+";background-repeat:no-repeat";
 const custom=artOverride(c);if(custom)return "background-image:url('../"+custom+"');background-position:center;background-size:cover";
 if(isPendingArt(c))return 'background:radial-gradient(ellipse at 50% 30%,'+(origin(c.origin)?.color||'#afc2b9')+'33,#0a201e 80%)';
 if(c.artAsset)return "background-image:url('../"+c.artAsset+"');background-position:center;background-size:cover";
 const replacement=CARD_ART_OVERRIDES[c.artSourceId||c.id];if(replacement){const r=replacement;return "background-image:url('../"+r.src+"?v="+r.sha256.slice(0,12)+"');background-position:"+(r.x*100/(r.width-r.size))+"% "+(r.y*100/(r.height-r.size))+"%;background-size:"+(r.width*100/r.size)+"% "+(r.height*100/r.size)+"%";}
 const artId=c.artSourceId||c.id,n=Number(artId.slice(1))-1,b=String(Math.floor(n/16)+1).padStart(2,'0'),cell=n%16;
 const base="background-image:url('../assets/design-v2/cards/individual/"+c.type+"-"+b+".webp?art=20261124');",crop=CARD_ART_CROPS[artId];
 if(crop)return base+'background-position:'+crop.x*100/(crop.width-crop.size)+'% '+crop.y*100/(crop.height-crop.size)+'%;background-size:'+crop.width*100/crop.size+'% '+crop.height*100/crop.size+'%';
 return base+'background-position:'+((cell%4+.01)*100/3.02)+'% '+((Math.floor(cell/4)+.01)*100/3.02)+'%;background-size:408.163% 408.163%';
}
function cardArt(c,operatorArt=false){
 return '<span class="art-well"><span class="art '+(isPendingArt(c)?'pending-art':'')+'" aria-hidden="true" style="' +art(c,operatorArt)+'">'+(isPendingArt(c)?'<span class="art-placeholder">'+icon(typeIcons[c.type])+'<span>イラスト制作中</span></span>':'')+'</span></span>';
}
function card(c,{action='detail',data='',className='',unit=null,owned=null,operatorArt=false}={}){
 if(!c)return '';
 const attrs=action?'data-act="'+action+'" data-id="'+esc(c.id)+'" '+data:'disabled';
 return '<button type="button" class="card '+c.type+' '+c.rarity+' '+className+'" data-origin="'+esc(c.origin)+'" '+attrs+' title="'+esc(c.name)+'"><span class="cardtop"><span class="cost">'+(c.type==='fusion'?'合':c.cost)+'</span><span class="cardname">'+esc(c.name)+'</span></span>'+cardArt(c,operatorArt)+'<span class="cardtop card-kind"><span>'+icon(typeIcons[c.type])+' '+TYPE_LABELS[c.type]+' · '+esc(origin(c.origin)?.name)+'</span><span class="rarity">'+RARITY_LABELS[c.rarity]+'</span></span><span class="effect">'+esc(c.text)+'</span><span class="cardbottom">'+(['beast','fusion'].includes(c.type)?'<b>'+icon('sword')+' '+(unit?.attack??c.attack)+'</b><b>'+icon('shield')+' '+(unit?.hp??c.hp)+'</b>':esc(c.id))+(owned!==null?'<span>所持 '+owned+'</span>':'')+'</span></button>';
}
function onboard(){
 root.innerHTML='<div class="onboard"><form id="onboard" class="panel"><div class="intro"><img src="../assets/icon.svg" alt=""><div><small>旧セーブ互換版</small><h1>BEAST KING</h1><p>最初の契約を結ぶ</p></div></div><label>プレイヤー名<input name="name" type="text" maxlength="32" required autocomplete="nickname" placeholder="1〜16文字"></label><section><h3>プロフィールアイコン</h3><div class="origins">'+ORIGINS.map((o,i)=>'<label><input type="radio" name="origin" value="'+o.id+'" '+(!i?'checked':'')+'><span style="color:'+o.color+'"><img src="../assets/profiles/'+o.id+'.svg" alt="" width="32" height="32"> '+o.name+'</span></label>').join('')+'</div></section><section><h3>最初のスターター</h3><div class="starter-grid">'+STARTERS.map((s,i)=>'<label><input type="radio" name="starter" value="'+s.id+'" '+(!i?'checked':'')+'><span>'+esc(s.name)+'</span><p>'+esc(s.subtitle)+'</p></label>').join('')+'</div></section><p class="muted">名前とアイコンはこの端末で初回のみ設定します。スターター4種類を利用できます。旧セーブ互換版のデータはメインゲームと別に保存します。</p><p class="edition-links"><a href="../">メインゲームへ</a> · <a href="about.html">旧セーブの案内</a></p><button type="submit" class="primary">契約してゲームを開始</button><p id="status" role="status"></p></form></div>';
}
function audioControls(){return '<div class="audio-controls">'+act('bgm-toggle',profile.bgm?'BGM ON':'BGM OFF','aria-pressed="'+profile.bgm+'"')+act('effects-settings','音・演出','aria-label="音と演出の設定"')+'<label class="volume-control"><span class="visually-hidden">BGM音量</span><input type="range" id="bgm-volume" min="0" max="100" step="5" value="'+Math.round(profile.bgmVolume*100)+'" aria-label="BGM音量"><output id="volume-number">'+Math.round(profile.bgmVolume*100)+'%</output></label></div>'}
function syncMusic(){music.sync({scene:musicScene(page,match?.game),enabled:profile?.bgm??true,volume:profile?.bgmVolume??.5})}
function syncExperience(){
 const settings=experience.sync();document.body.classList.toggle('reduce-motion',!settings.motion);
 experience.screen(profile?page:'entry');experience.observeBattle(page==='battle'?match?.game:null,match?.id);
}
function experienceSettings(){
 const settings=experience.getPreferences();
 openDialog('<section class="bk-experience-settings"><h2>音と演出の設定</h2><p class="muted">音量と演出の好みはこの端末に保存されます。</p><div class="setting-row"><div>効果音<small>カード・ボタン・バトルの操作音</small></div>'+act('effects-sound',settings.enabled?'ON':'OFF','role="switch" aria-checked="'+settings.enabled+'" aria-label="効果音"')+'</div>'+experience.settingsMarkup()+'<div class="setting-row"><div>アニメーション<small>OSの「動きを減らす」設定にも対応</small></div>'+act('effects-motion',settings.motion?'ON':'OFF','role="switch" aria-checked="'+settings.motion+'" aria-label="アニメーション"')+'</div><div class="actions">'+act('close','設定を閉じる','','primary')+'</div></section>');
}
async function purchaseWithPresentation(){
 if(packOpening||page!=='shop'||shopPack==='starters')return;
 packOpening=true;
 try{
  const pack=PACKS.find(p=>p.id===shopPack)||PACKS[0];
  // Commit the grant before any animation; skipping or closing cannot grant twice.
  save(purchase(profile,Math.random,pack.id));shopPage=0;render();
  const pulls=profile.lastPack,rarity=pulls.reduce((best,pull)=>{const next=getCard(pull.cardId)?.rarity||'N';return RARITY_ORDER.indexOf(next)>RARITY_ORDER.indexOf(best)?next:best},'N');
  await experience.openPack({name:pack.name,rarity});
  packOpening=false;render();
  if(page==='shop')experience.revealCards(root,pulls.slice(0,pageSize()),getCard);
  setMessage('12枚のカードを開封しました。');
 }finally{packOpening=false;const button=root.querySelector('[data-act="purchase"]');if(button)button.disabled=profile.treasure<100;}
}
function resumeControls(){const s=profile.suspendedMatch;if(!s)return '';const t=s.chapter===null?'練習戦':CAMPAIGN_BATTLES[s.chapter]?.title||'章モード';return '<div class="resume-panel"><small>'+esc(t)+' · TURN '+s.game.turn+(s.game.winner===null?' · 中断中':' · 対戦終了')+'</small><div>'+act('resume',s.game.winner===null?'対戦を再開':'結果を見る','','primary')+act('discard-match',s.game.winner===null?'降参して終了':'結果を閉じる')+'</div></div>'}
function shell(body){
 const o=origin(profile.origin);
 root.innerHTML='<div class="shell"><header><div class="brand"><button type="button" class="brand-mark" data-act="brand" aria-label="BEAST KING"><img src="../assets/icon.svg" alt=""></button><div><b>BEAST KING</b><small>旧セーブ互換版</small></div></div><div class="identity"><span class="profile-mark" style="color:'+o.color+'"><img src="../assets/profiles/'+o.id+'.svg" alt="" width="28" height="28">'+esc(profile.name)+'</span><span class="balance">'+icon('treasure')+' 秘宝 '+fmt(profile.treasure)+'</span></div></header><nav aria-label="メインメニュー">'+nav.map(([id,name,mark])=>'<button type="button" data-act="nav" data-page="'+id+'" '+(page===id?'aria-current="page"':'')+(page==='battle'&&match?.game.winner===null?' disabled':'')+'>'+icon(mark)+'<span>'+name+'</span></button>').join('')+'</nav><main data-page="'+page+'">'+body+'</main><footer><span>© 2026 Beast King · 旧セーブ互換版</span><span id="status" role="status">'+esc(message)+'</span>'+audioControls()+'</footer></div>';
}
function home(){
 const s=STARTERS.find(x=>x.id===profile.starterId);
 return '<div class="home"><section class="panel hero"><p class="eyebrow">THE FIRST CHRONICLE</p><h1>六源の覚醒</h1><p>獣の契約を結び、ハートポイントを巡る決闘へ。自分だけの36枚で王冠を目指す。</p>'+(profile.suspendedMatch?resumeControls():act('nav','ソロの冒険へ','data-page="solo"','primary'))+'<small>第一弾・第二弾 2,304枚 · 7オリジン · 6段階のレアリティ</small><div class="edition-links"><a href="about.html">旧セーブの案内</a><a href="../">メインゲーム（ソロ・オンライン対戦）</a></div>'+act('cloud-open','クラウド保存・端末間復元','','cloud-entry')+'</section><div class="home-side"><section class="panel"><div class="panel-head"><h2>戦績</h2><span class="sub">'+esc(s?.name||'カスタムデッキ')+'</span></div><div class="summary"><div><small>所持種類</small><strong>'+Object.keys(profile.collection).length+'</strong></div><div><small>勝利</small><strong>'+profile.wins+'</strong></div><div><small>章の進行</small><strong>'+profile.completed+' / 20</strong></div><div><small>デッキ</small><strong>32 + 4</strong></div></div></section><section class="panel modes">'+[['solo','ソロ','全20戦と練習戦'],['deck','デッキ工房','36枚の編成'],['catalog','図鑑','全カードを確認'],['shop','ショップ','12枚入りパック']].map(([id,t,d])=>'<button class="mode" data-mode="'+id+'" data-act="nav" data-page="'+id+'">'+icon(nav.find(n=>n[0]===id)?.[2]||'spark')+'<b>'+t+'</b><span>'+d+'</span></button>').join('')+'</section></div></div>';
}
function solo(){
 const next=CAMPAIGN_BATTLES[profile.completed];
 return '<div class="home"><section class="panel hero"><small>SOLO CHRONICLE</small><h1>'+(next?esc(next.chapterTitle):'全章クリア')+'</h1><p>'+(next?esc(next.title)+' — '+esc(next.description):'すべての試練を突破しました。')+'</p>'+(profile.suspendedMatch?resumeControls():next?act('campaign','次の決闘へ','data-index="'+profile.completed+'"','primary'):'')+'<p>達成 '+profile.completed+' / 20</p><h3>クリア済みの戦い</h3><select id="replay"><option value="">再戦を選ぶ</option>'+CAMPAIGN_BATTLES.slice(0,profile.completed).map((b,i)=>'<option value="'+i+'">'+(i+1)+' · '+esc(b.title)+'</option>').join('')+'</select>'+act('replay','再戦を開始',profile.completed&&!profile.suspendedMatch?'':'disabled')+'</section><section class="panel modes">'+[['easy','見習い'],['normal','策士'],['hard','覇王']].map(([id,t])=>'<button class="mode" data-mode="solo" data-act="practice" data-level="'+id+'" '+(profile.suspendedMatch?'disabled':'')+'>'+icon('sword')+'<b>'+t+'</b><span>自由な練習戦</span></button>').join('')+'<div class="panel"><h3>使用デッキ</h3><p>'+(operatorSelected?'𠮷良原デッキ · 運営限定':'通常デッキ')+'</p><p>メイン 32枚</p><p>特殊 4枚</p>'+act('nav','デッキ確認','data-page="deck"')+'</div></section></div>';
}
function layoutViewport(){return window.BeastKingViewport?.get()||{width:innerWidth,height:innerHeight}}
function pageSize(){const {width,height}=layoutViewport();return width<=600?2:height<620?3:width<1050?4:6}
function opts(items,val){return items.map(([id,t])=>'<option value="'+esc(id)+'" '+(id===val?'selected':'')+'>'+esc(t)+'</option>').join('')}
function catalog(edit){
 const list=CARDS.filter(c=>(!edit||profile.collection[c.id])&&(!filter.q||(c.name+' '+c.text+' '+c.id).toLowerCase().includes(filter.q.toLowerCase()))&&(!filter.type||c.type===filter.type)&&(!filter.origin||c.origin===filter.origin)&&(!filter.rarity||c.rarity===filter.rarity)&&(!filter.pack||c.pack===filter.pack));
 const size=pageSize(),total=Math.max(1,Math.ceil(list.length/size));filter.page=Math.min(filter.page,total-1);
 const shown=list.slice(filter.page*size,(filter.page+1)*size);
 return '<section class="panel catalog-layout"><div><div class="panel-head"><h2>'+(edit?'所持カード':'全カード図鑑')+'</h2><span class="sub">'+fmt(list.length)+'種類</span></div><form class="filters" id="filters"><input name="q" aria-label="カード検索" placeholder="カード名・効果・ID" value="'+esc(filter.q)+'"><select name="type" aria-label="種類">'+opts([['','全種類'],...byType],filter.type)+'</select><select name="origin" aria-label="オリジン">'+opts([['','全オリジン'],...ORIGINS.map(o=>[o.id,o.name])],filter.origin)+'</select><select name="rarity" aria-label="レアリティ">'+opts([['','全レア'],...Object.entries(RARITY_LABELS)],filter.rarity)+'</select><select name="pack" aria-label="収録弾">'+opts([['','全収録弾'],...PACKS.map(p=>[p.id,p.name])],filter.pack)+'</select><button>検索</button></form></div><div class="card-grid">'+shown.map(c=>card(c,{action:edit?'add-detail':'detail',owned:profile.collection[c.id]||0})).join('')+(shown.length?'':'<p class="muted">カードが見つかりません。</p>')+'</div><div class="pagination">'+act('prev','前へ',filter.page===0?'disabled':'')+'<span>'+(filter.page+1)+' / '+total+'</span>'+act('next','次へ',filter.page+1===total?'disabled':'')+'</div></section>';
}
function deck(){
 if(operatorSelected&&operatorGrant?.entitled){const royal=getCard(SECOND_REGALIA_ID);return '<div class="deck-layout">'+catalog(true)+'<section class="panel deck-list"><h2>𠮷良原デッキ</h2><p>通常32枚・特殊4枚 · レガリア2枚</p><div class="operator-preview">'+card(royal,{action:'operator-card-detail',owned:2,operatorArt:true})+'</div><p>'+(!operatorGrant.artwork?'専用イラスト未受信。運営認証を再確認してください。':'運営限定の専用イラスト')+'</p><div class="actions">'+act('operator-select','認証・画像を再取得')+act('operator-off','通常デッキの編集に戻る')+'</div></section></div>';}
 const valid=checkDeck(profile,draft.main,draft.special);
 const sections=[['main','メイン',draft.main,32],['special','特殊',draft.special,4]];
 return '<div class="deck-layout">'+catalog(true)+'<section class="panel deck-list"><div><h2>編成中のデッキ</h2><p>メイン '+draft.main.length+'/32 · 特殊 '+draft.special.length+'/4</p><small>同名2枚まで · 所持枚数以内</small>'+(operatorGrant?.entitled?'<div>'+act('operator-select',operatorSelected?'𠮷良原デッキ使用中':'𠮷良原デッキを使用','','primary')+(operatorSelected?act('operator-off','通常デッキに戻す'):'')+'</div>':'')+'</div><div class="deck-rows">'+sections.map(([zone,t,ids,n])=>'<h3>'+t+' '+ids.length+'/'+n+'</h3>'+Object.entries(counts(ids)).map(([id,k])=>'<button data-act="remove" data-zone="'+zone+'" data-id="'+id+'"><span>'+esc(label(id))+' ×'+k+'</span><span>−</span></button>').join('')).join('')+'</div><div class="actions"><select id="starter-select" aria-label="スターター">'+opts(STARTERS.filter(s=>checkDeck(profile,s.ids,s.specialIds).valid).map(s=>[s.id,s.name]),profile.starterId)+'</select>'+act('preset','適用')+act('discard','元に戻す')+act('save-deck','保存',valid.valid?'':'disabled','primary')+'</div></section></div>';
}
function shop(){
 if(shopPack==='starters')return '<section class="panel shop"><div class="shop-info"><div><h2>スターターデッキ販売</h2><p>各'+STARTER_PRICE+'秘宝 · 通常32枚＋特殊4枚 · 所持 '+profile.treasure+'秘宝</p><small>固定内容。4枚目以降は5秘宝に変換します。</small></div><div class="pack-tabs">'+PACKS.map(p=>act('select-pack',p.number===1?'第一弾':'第二弾','data-pack="'+p.id+'"')).join('')+'</div></div><div class="rebuild-starter-offers">'+STARTERS.map(d=>{const q=quoteStarterPurchase(profile,d.id);return '<article><h3>'+esc(d.name)+'</h3><p>追加 '+q.received+'枚 · 変換 +'+q.bonusTreasure+'秘宝</p>'+act('starter-buy',q.received?STARTER_PRICE+'秘宝で購入':'所持上限','data-id="'+d.id+'" '+(q.ok?'':'disabled'),'primary')+'</article>'}).join('')+'</div></section>';
 const pack=PACKS.find(p=>p.id===shopPack)||PACKS[0],last=PACKS.find(p=>p.id===(profile.lastPackId||'BK01'));
 const pulls=profile.lastPack||[],size=pageSize(),total=Math.max(1,Math.ceil(pulls.length/size));shopPage=Math.min(shopPage,total-1);
 return '<section class="panel shop"><div class="shop-info"><div><h2>'+esc(pack.name)+'</h2><p>1パック 100秘宝 · 12枚 · レア以上1枚保証</p><small>各弾1,152枚。同じカードの4枚目から5秘宝に変換します。</small><div class="pack-tabs">'+PACKS.map(p=>'<button data-act="select-pack" data-pack="'+p.id+'" aria-pressed="'+(p.id===pack.id)+'">'+(p.number===1?'第一弾':'第二弾')+'</button>').join('')+act('select-pack','スターター販売','data-pack="starters"')+'</div></div>'+act('purchase',packOpening?'開封中…':'パックを開封',profile.treasure<100||packOpening?'disabled':'','primary')+'</div><div class="card-grid">'+(pulls.length?pulls.slice(shopPage*size,(shopPage+1)*size).map(x=>card(getCard(x.cardId),{owned:profile.collection[x.cardId]||0,className:'pack-result-card'+(x.converted?' converted':'')})).join(''):'<p class="muted">ここに開封結果が表示されます。</p>')+'</div><div class="pagination">'+act('shop-prev','前へ',shopPage===0?'disabled':'')+'<span>'+(pulls.length?'開封結果：'+esc(last?.name||'')+' · ':'')+(shopPage+1)+' / '+total+'</span>'+act('shop-next','次へ',shopPage+1===total?'disabled':'')+'</div></section>';
}
function rules(){return '<section class="panel rules"><h2>基本ルール</h2><h3>デッキと勝利条件</h3><p>メイン32枚＋合成魔獣4枚。同名2枚まで。ハートポイント5,000で開始し、相手を0にすると勝利します。</p><h3>ターンと出場ゾーン</h3><p>最大エーテルが自分のターンごとに1増加（最大10）。手札は最大4枚、出場魔獣は4体、ギミックは2枚。魔獣は通常、召喚した次の自分のターンから攻撃できます。</p><h3>攻撃と守護</h3><p>守護がある場合は優先して攻撃。通常アタック型は攻撃を受けると消滅し、持ち主に攻撃力分のダメージ。ディフェンス型・合成魔獣は攻撃力が守備力を上回ると消滅し、超過分のみダメージ。通常戦闘で反撃はありません。</p><h3>合成召喚</h3><p>コスト3のミラクル「合成」で特殊デッキから合成魔獣を選び、手札・場・お墓の魔獣を1枚以上異世界へ。素材2枚目以降、攻撃力・守備力が各100上昇します。</p><h3>旧セーブ互換版について</h3><p>以前の専用セーブでソロの続きを遊べる画面です。全2,304枚とCPU対戦に対応し、対戦は自動保存・中断・再開できます。運営デッキのレガリアには、認証後に専用イラストを自動適用します。王庭からクラウド保存・端末間復元を利用できます。オンライン対戦はメインゲームで遊べます。</p><p class="edition-links"><a href="about.html">旧セーブの案内</a><a href="../">メインゲームへ</a></p></section>'}
function targetList(){
 if(!selection||!match||match.game.active!==0||match.game.winner!==null)return [];
 return selection.kind==='attack'?getAttackTargets(match.game,selection.uid):getLegalTargets(match.game,selection.index);
}
function isTarget(player,uid){return targetList().some(t=>t.player===player&&(uid?t.uid===uid:t.core===true))}
function playerStrip(p,i){
 const name=i?p.name:profile.name;
 return '<div class="player-strip"><span class="duelist-name">'+esc(name)+'<small>手札 '+p.hand.length+' · 山札 '+p.deck.length+'</small></span><button type="button" class="hp '+(isTarget(i)?'target':'')+'" data-act="core" data-player="'+i+'" aria-label="'+esc(name+'のハートポイント '+p.core)+'">'+icon('heart')+' '+fmt(p.core)+'</button><span class="duel-meters"><span title="結界">'+icon('shield')+fmt(p.shield)+'</span><span title="エーテル">'+icon('energy')+p.energy+'/'+p.maxEnergy+'</span></span>'+act('zone-list','ゾーン・効果','data-player="'+i+'"','zone-button')+'</div>';
}
function units(p,i){return '<div class="zones">'+p.field.map(u=>card(getCard(u.cardId),{action:'unit',data:'data-player="'+i+'" data-uid="'+u.uid+'"',unit:u,operatorArt:i===0&&match?.mode==='kirahara',className:(isTarget(i,u.uid)?'target ':'')+(selection?.uid===u.uid?'selected':'')})).join('')+Array.from({length:Math.max(0,4-p.field.length)},()=>'<div class="slot">'+icon('beast')+'<span>出場ゾーン</span></div>').join('')+'</div>'}
function battle(){
 const g=match.game,[own,enemy]=g.players,ended=g.winner!==null,playable=g.active===0?getPlayableCards(g):[];
 const result=ended?(g.winner==='draw'?'引き分け':g.winner===0?'勝利！':'敗北'):(g.active===0?'あなたのターン':'CPUのターン');
 return '<div class="arena"><section class="table" data-field="solo" aria-label="古代樹の闘域">'+playerStrip(enemy,1)+units(enemy,1)+'<div class="centerline"><span class="field-name">古代樹の闘域</span><span>TURN '+g.turn+' · '+result+(selection?' · 対象を選択してください':'')+'</span></div>'+units(own,0)+playerStrip(own,0)+'<div class="hand">'+own.hand.map((id,i)=>card(getCard(id),{action:'hand',operatorArt:match?.mode==='kirahara',data:'data-index="'+i+'"',className:playable.includes(i)?'selected':''})).join('')+Array.from({length:Math.max(0,4-own.hand.length)},()=>'<div class="slot">'+icon('cards')+'<span>手札</span></div>').join('')+'</div></section><aside class="panel side"><h3>決闘ログ</h3><div class="log" role="log">'+g.log.slice(-35).reverse().map(l=>'<p><small>T'+l.turn+'</small> '+esc(l.text)+'</p>').join('')+'</div><div class="actions">'+(ended?act('leave','王庭へ戻る','','primary'):act('end-turn','ターン終了',g.active!==0||cpuBusy?'disabled':'','primary')+act('cancel-target','選択を解除',selection?'':'disabled')+act('pause-match','中断して戻る')+act('forfeit','降参'))+'</div></aside></div>';
}
function render(){
 if(!profile){onboard();syncMusic();syncExperience();window.BeastKingLoading?.screen('entry');return}
 const views={home,solo,deck,catalog:()=>catalog(false),shop,rules,battle};
 shell((views[page]||home)());root.style.setProperty('--rebuild-card-columns',String(pageSize()));syncMusic();syncExperience();window.BeastKingLoading?.screen(page==='catalog'?'collection':page);
}
function zoneList(i){
 const player=match?.game?.players?.[i];if(!player)return;
 const groups=[['山札',player.deck.length,null],['手札',player.hand.length,i===0?player.hand:null],['出場魔獣',player.field.length,player.field.map(u=>u.cardId)],['特殊ゾーン',player.special.length,i===0?player.special:null],['ギミック',player.traps.length,i===0?player.traps.map(t=>t.cardId):null],['直前のミラクル',player.lastMiracle?1:0,player.lastMiracle?[player.lastMiracle]:[]],['墓地',player.grave.length,player.grave],['異世界',player.banished.length,player.banished]];
 openDialog('<section class="zone-dialog"><h2>'+esc(i===0?profile.name:player.name)+' · ゾーン一覧</h2>'+groups.map(([name,count,ids])=>'<section><h3>'+esc(name)+' '+count+'枚</h3>'+(ids?'<div class="zone-cards">'+(ids.length?ids.filter(id=>getCard(id)).map(id=>act('zone-card-effect',label(id)+' · 効果を見る','data-id="'+esc(id)+'" data-player="'+i+'"')).join(''):'<small>カードなし</small>')+'</div>':'<small>カードの内容は非公開です</small>')+'</section>').join('')+act('close','閉じる')+'</section>');
}
function closeDialog(){if(dialog.open)dialog.close()}
function openDialog(html){closeDialog();dialog.innerHTML=html;dialog.showModal()}
function cloudStillOpen(v){return cloudView===v&&dialog.open&&!!dialog.querySelector('.cloud-panel')&&page!=='battle'}
function rollbackData(){try{return validateRebuildBackup(JSON.parse(localStorage.getItem(ROLLBACK_KEY)||'null'))}catch{return null}}
function backupSummary(p){return '<b>'+esc(p.name)+'</b><small>秘宝 '+fmt(p.treasure)+' · 所持 '+Object.keys(p.collection).length+'種類 · 章 '+p.completed+'/20'+(p.suspendedMatch?' · 中断対戦あり':'')+'</small>'}
function paintCloud(v){
 const remote=v.remote?.save;
 const ready=!!v.remote&&!v.busy;
 const saved=rollbackData();
 openDialog('<section class="cloud-panel"><h2>クラウド保存・端末間復元</h2><p>旧セーブ互換版のソロデータを保存・復元します。端末とクラウドの内容を確認して、保存する方向を選んでください。</p><div class="cloud-compare"><article><h3>この端末</h3>'+backupSummary(profile)+'</article><article><h3>クラウド</h3>'+(remote?backupSummary(remote.data)+'<small>更新 '+esc(new Date(remote.updatedAt).toLocaleString('ja-JP'))+' · 版 '+remote.revision+'</small>':v.remote?'<p>保存なし</p>':'<p>未確認</p>')+'</article></div><p class="cloud-status" role="status">'+esc(v.message||'')+'</p><div class="cloud-actions">'+act('cloud-refresh','最新状態を確認',v.busy?'disabled':'')+act('cloud-save','端末からクラウドへ',ready?'':'disabled','primary')+act('cloud-restore','クラウドから端末へ',ready&&remote?'':'disabled')+(saved?act('cloud-recover','復元前のデータへ戻す',v.busy?'disabled':''):'')+act('close','閉じる')+'</div><p class="muted">他端末ではメインゲームの端末連携を先に完了してください。<a href="../">メインゲームの設定へ</a></p></section>');
}
async function showCloud(){
 if(page==='battle'||starting||!profile)return;
 const v={remote:null,busy:true,message:'確認中…',local:localStorage.getItem(STORAGE_KEY)};
 cloudView=v;paintCloud(v);
 try{v.remote=await cloudClient.read();v.message=v.remote.save?'保存する方向を選択してください。':'このアカウントには旧セーブ互換版のバックアップがありません。'}catch(e){v.message=e.message}
 v.busy=false;if(cloudStillOpen(v))paintCloud(v);
}
function assertLocalUnchanged(v){
 if(v.local!==localStorage.getItem(STORAGE_KEY))throw Error('別のタブで端末データが変更されました。ページを再読み込みしてください。');
}
function applyCloudRestore(data){
 const previous=validateRebuildBackup(profile),next=migrateRebuildProfile(validateRebuildBackup(data));
 localStorage.setItem(ROLLBACK_KEY,JSON.stringify(previous));
 save(next);clearCpu();match=null;selection=null;draft=null;operatorGrant=null;operatorSelected=false;page='home';render();closeDialog();setMessage('端末データを復元しました。復元前のデータも保持しています。');
}
async function cloudAction(action){
 const v=cloudView;if(!v||!cloudStillOpen(v)||v.busy)return;
 assertLocalUnchanged(v);
 if(action==='recover'){
  const previous=rollbackData();if(previous&&confirm('復元前の端末データに戻しますか？'))applyCloudRestore(previous);
  return;
 }
 if(!v.remote)return;
 const before=v.remote;
 if(action==='save'&&!confirm(before.save?'確認したクラウドの保存を、この端末のデータで更新しますか？':'この端末のデータをクラウドに保存しますか？'))return;
 if(action==='restore'&&(!before.save||!confirm('クラウドのデータをこの端末に復元しますか？ 復元前のデータは別に保持します。')))return;
 v.busy=true;v.message='処理中…';paintCloud(v);
 try{
  if(action==='save'){
   v.remote=await cloudClient.write({accountId:before.accountId,revision:before.save?.revision??0,data:profile});
   v.message='クラウド保存が完了しました。';
  }else{
   const latest=await cloudClient.read();v.remote=latest;
   if(!cloudStillOpen(v))return;
   assertLocalUnchanged(v);
   if(latest.accountId!==before.accountId||latest.save?.revision!==before.save.revision){v.message='保存先が変わったため復元を中止しました。内容を確認してください。';return}
   applyCloudRestore(latest.save.data);return;
  }
 }catch(e){v.message=e.message;if(e.code==='conflict'){v.remote=null;v.message+=' 「最新状態を確認」を押してください。';}}
 finally{v.busy=false;if(cloudStillOpen(v))paintCloud(v)}
}

async function inspectOperator(code){
 if(operatorBusy||starting||page==='battle')return;
 operatorBusy=true;
 try{
 const result=code===undefined?await operatorClient.status():await operatorClient.activate(code);
 if(page==='battle')return;
 operatorGrant=result.entitled?result:null;
 if(!result.entitled){operatorSelected=false;openDialog('<form id="operator-form"><h2>限定デッキ認証</h2><p>運営用の専用コードを入力してください。</p><input type="password" name="code" autocomplete="off" maxlength="128" required><button class="primary">認証</button>'+act('close','閉じる')+'</form>');return;}
 const royal=getCard(SECOND_REGALIA_ID);
 openDialog('<div class="detail"><div class="preview">'+card(royal,{action:'',owned:2,operatorArt:true})+'</div><section><h2>𠮷良原デッキ</h2><p>運営アカウントの利用権を確認しました。</p><p>レガリア2枚（運営専用イラスト） · メイン32枚＋特殊4枚</p>'+act('operator-select','このデッキを使用','','primary')+act('operator-off','通常デッキに戻す')+act('close','閉じる')+'</section></div>');
 }catch(e){operatorGrant=null;operatorSelected=false;closeDialog();setMessage(e.message)}finally{operatorBusy=false}
}
function detail(c,action='',data='',operatorArt=false){
 const own=profile.collection[c.id]||0;
 openDialog('<div class="detail"><div class="preview">'+card(c,{action:'',owned:own,operatorArt})+'</div><section><h2>'+esc(c.name)+'</h2><p>'+TYPE_LABELS[c.type]+' · '+RARITY_LABELS[c.rarity]+' · '+esc(origin(c.origin)?.name)+'</p><p>'+esc(MODEL_LABELS[c.model]||'')+'</p><p>'+esc(c.text)+'</p><p class="muted">'+esc(c.flavor)+'</p>'+(action?act(action,action==='add'?'デッキに追加':'カードを使用',data,'primary'):'')+act('close','閉じる')+'</section></div>');
}
async function start(level,index=null){
 if(starting||match?.game.winner===null)return;
 if(profile.suspendedMatch)throw Error('中断した対戦を先に再開するか終了してください。');
 starting=true;
 try{
 const useOperator=operatorSelected;
 let main=profile.main,special=profile.special;
 if(useOperator){const current=await operatorClient.status();if(!current.entitled){operatorGrant=null;operatorSelected=false;throw Error('運営限定版の利用権を確認できません。')};operatorGrant=current;main=current.deck.main;special=current.deck.special;}
 else {const status=checkDeck(profile,main,special);if(!status.valid)throw new Error(status.errors[0]);}
 const chapter=index===null?null:CAMPAIGN_BATTLES[index];
 if(index!==null&&(!chapter||index>profile.completed))throw new Error('この回戦は未解放です。');
 const cpu=chapter?STARTER_DECKS.find(s=>s.id===chapter.cpuDeckId):STARTER_DECKS[2];
 const game=newGame({playerDeck:main,playerSpecialDeck:special,cpuDeck:cpu.ids,cpuSpecialDeck:cpu.specialIds,difficulty:chapter?.difficulty||level});
 game.players[0].name=profile.name;if(chapter)game.players[1].name=chapter.opponentName;
 const created={game,id:globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2),chapter:index,mode:useOperator?'kirahara':'normal'};
 save(recordSolo(profile,created));match=created;selection=null;cpuBusy=false;page='battle';message='';render();
 }finally{starting=false}
}
async function resumeMatch(){
 if(starting||match?.game.winner===null||!profile.suspendedMatch)return;
 starting=true;
 try{
  const restored=normalizeSoloSnapshot(profile.suspendedMatch,profile);if(!restored)throw Error('中断データを確認できません。');
  if(restored.mode==='kirahara'){
   const grant=await operatorClient.status();
   if(!verifyOperatorSnapshot(restored,grant))throw Error('運営デッキの利用権を確認できません。');
   operatorGrant=grant;operatorSelected=true;
  }
  // Recompute result settlement idempotently even if loaded from an older save.
  save(recordSolo(profile,restored));match=restored;selection=null;cpuBusy=false;page='battle';message='';render();cpuTurn();
 }finally{starting=false}
}
function clearCpu(){if(cpuTimer!==null)clearTimeout(cpuTimer);cpuTimer=null;cpuBusy=false}
function apply(result){
 if(!result.ok){experience.sound('deny');setMessage(result.error);return false}
 selection=null;
 try{save(recordSolo(profile,match));render();return true}
 catch(error){
  clearCpu();match=normalizeSoloSnapshot(profile.suspendedMatch,profile);
  if(!match)page='solo';
  render();setMessage('保存に失敗したため最後の保存状態に戻しました。空き容量を確認してください。');return false;
 }
}
function cpuTurn(){
 if(!match||match.game.winner!==null||match.game.active!==1||page!=='battle'||cpuTimer!==null||document.hidden)return;
 cpuBusy=true;const running=match;render();
 cpuTimer=setTimeout(()=>{cpuTimer=null;cpuBusy=false;if(match!==running||page!=='battle'||running.game.winner!==null||document.hidden)return;try{const r=runCpuTurn(running.game,running.game.difficulty);apply(r)}catch(e){setMessage(e.message)}},280);
}
function pauseMatch(){
 if(!match)return;
 save(recordSolo(profile,match));clearCpu();match=null;selection=null;setPage('solo');
}
function leaveMatch(){
 save(endSuspendedSolo(profile));clearCpu();match=null;selection=null;setPage('home');
}
function use(index){
 closeDialog();const g=match.game;
 if(g.active!==0||!getPlayableCards(g).includes(index))throw new Error('今は使用できません。');
 const c=getCard(g.players[0].hand[index]);
 if(c.effect.kind==='fusion'){
  const p=g.players[0],materials=getFusionMaterials(g);
  openDialog('<form id="fusion-form"><h2>合成召喚</h2><p>特殊魔獣を1体、素材を1枚以上選択。</p><div class="choices">'+p.special.map((id,i)=>'<label><input required type="radio" name="special" value="'+i+'" '+(i===0?'checked':'')+'>'+esc(label(id))+'</label>').join('')+'</div><h3>素材</h3><div class="choices">'+materials.map((m,i)=>'<label><input type="checkbox" name="material" value="'+i+'">'+esc(({hand:'手札',field:'出場',grave:'お墓'})[m.zone]+' · '+label(m.cardId))+'</label>').join('')+'</div><button class="primary">合成召喚</button>'+act('close','キャンセル')+'<p id="fusion-error" role="status"></p></form>');
  dialog.querySelector('form').dataset.index=String(index);return;
 }
 if(getLegalTargets(g,index).length){selection={kind:'play',index};render();return}
 apply(playCard(g,index));
}
function target(player,uid){
 if(!selection||!isTarget(player,uid))return false;
 const t=uid?{player,uid}:{player,core:true},g=match.game;
 apply(selection.kind==='attack'?attack(g,selection.uid,t):playCard(g,selection.index,t));return true;
}
document.addEventListener('submit',async e=>{
 const f=e.target;if(!['onboard','filters','fusion-form','operator-form'].includes(f.id))return;e.preventDefault();
 try{
  const d=new FormData(f);
  if(f.id==='operator-form'){const code=String(d.get('code')||'');f.reset();await inspectOperator(code);return;}
  if(f.id==='onboard'){save(initialProfile(d.get('name'),d.get('origin'),d.get('starter')));page='home';render()}
  if(f.id==='filters'){filter={q:String(d.get('q')||'').trim(),type:d.get('type'),origin:d.get('origin'),rarity:d.get('rarity'),pack:d.get('pack'),page:0};render()}
  if(f.id==='fusion-form'){
   const g=match.game,materials=getFusionMaterials(g),selected=d.getAll('material').map(i=>materials[Number(i)]).filter(Boolean);
   const r=playCard(g,Number(f.dataset.index),{specialIndex:Number(d.get('special')),materials:selected});
   if(!r.ok){experience.sound('deny');f.querySelector('#fusion-error').textContent=r.error;return}closeDialog();apply(r);
  }
 }catch(err){experience.sound('deny');setMessage(err.message)}
});
document.addEventListener('click',async e=>{
 const el=e.target.closest('[data-act]');if(!el||el.disabled)return;
 const a=el.dataset.act,id=el.dataset.id,idx=Number(el.dataset.index);
 if(starting&&a!=='bgm-toggle')return;
 if(packOpening&&a==='purchase')return;
 try{switch(a){
  case 'nav':if(!starting)setPage(el.dataset.page);break;
  case 'cloud-open':case 'cloud-refresh':await showCloud();break;
  case 'cloud-save':await cloudAction('save');break;
  case 'cloud-restore':await cloudAction('restore');break;
  case 'cloud-recover':await cloudAction('recover');break;
  case 'zone-list':if(page==='battle')zoneList(Number(el.dataset.player));break;
  case 'zone-card-effect':{const i=Number(el.dataset.player),p=match?.game?.players?.[i],c=getCard(id);if(page!=='battle'||![0,1].includes(i)||!p||!c)break;const ids=[...p.field.map(u=>u.cardId),...p.grave,...p.banished,...(p.lastMiracle?[p.lastMiracle]:[]),...(i===0?[...p.hand,...p.special,...p.traps.map(t=>t.cardId)]:[])];if(ids.includes(id))detail(c,'','',i===0&&match?.mode==='kirahara');break;}
  case 'bgm-toggle':save({...profile,bgm:!profile.bgm});syncMusic();if(profile.bgm)music.unlock();render();break;
  case 'effects-settings':experienceSettings();break;
  case 'effects-sound':experience.sync({enabled:!experience.getPreferences().enabled});syncExperience();experienceSettings();experience.sound('confirm');break;
  case 'effects-motion':experience.sync({motion:!experience.getPreferences().motion});syncExperience();experienceSettings();break;
  case 'resume':await resumeMatch();break;
  case 'discard-match':if(profile.suspendedMatch&&(profile.suspendedMatch.game.winner!==null||confirm('中断中の対戦を降参して終了しますか？'))){leaveMatch()}break;
  case 'pause-match':pauseMatch();break;
  case 'brand':{const now=Date.now();if(now-brandAt>2000)brandTaps=0;brandAt=now;if(++brandTaps>=7){brandTaps=0;if(profile&&page!=='battle')await inspectOperator();}break;}
  case 'operator-select':{const grant=await operatorClient.status();if(!grant.entitled)throw Error('利用権を確認できません。');operatorGrant=grant;operatorSelected=true;closeDialog();render();setMessage('𠮷良原デッキを選択しました。');break;}
  case 'operator-off':operatorSelected=false;closeDialog();render();break;
  case 'prev':filter.page=Math.max(0,filter.page-1);render();break;
  case 'next':filter.page++;render();break;
  case 'shop-prev':shopPage=Math.max(0,shopPage-1);render();break;
  case 'shop-next':shopPage++;render();break;
  case 'operator-card-detail':if(operatorSelected&&operatorGrant?.entitled&&id===SECOND_REGALIA_ID)detail(getCard(id),'','',true);break;
  case 'detail':detail(getCard(id));break;
  case 'add-detail':detail(getCard(id),'add','data-id="'+id+'"');break;
  case 'add':{
   const c=getCard(id),zone=c.type==='fusion'?'special':'main',limit=zone==='special'?4:32;
   if(draft[zone].length>=limit)throw new Error('デッキが満杯です。先にカードを減らしてください。');
   const n=counts(draft[zone])[id]||0,same=draft[zone].filter(x=>getCard(x)?.name===getCard(id)?.name).length;if(same>=2||n>=(profile.collection[id]||0))throw new Error('同名2枚または所持枚数の上限です。');
   draft[zone].push(id);closeDialog();render();break;}
  case 'remove':{const l=draft[el.dataset.zone],i=l.indexOf(id);if(i>=0)l.splice(i,1);render();break}
  case 'preset':{const s=STARTERS.find(x=>x.id===document.querySelector('#starter-select').value);if(!s||!checkDeck(profile,s.ids,s.specialIds).valid){setMessage('未所持のスターターは購入・収集後に利用できます。');break}draft={main:[...s.ids],special:[...s.specialIds]};render();break}
  case 'discard':draft={main:[...profile.main],special:[...profile.special]};render();break;
  case 'save-deck':save(saveDeck(profile,draft.main,draft.special));setMessage('デッキを保存しました。');break;
  case 'select-pack':if(el.dataset.pack==='starters'||PACKS.some(p=>p.id===el.dataset.pack)){shopPack=el.dataset.pack;render()}break;
  case 'starter-buy':{const q=quoteStarterPurchase(profile,id);if(!q.ok){setMessage(q.error);break}starterQuote=q;openDialog('<h2>'+esc(q.starter.name)+'</h2><p>価格 '+q.cost+'秘宝 · 追加 '+q.received+'枚 · 変換 +'+q.bonusTreasure+'秘宝</p><p>購入後 '+q.treasure+'秘宝。現在のデッキは変更しません。</p><div class="actions">'+act('close','キャンセル')+act('starter-buy-confirm','購入する','data-id="'+id+'"','primary')+'</div>');break}
  case 'starter-buy-confirm':{if(page!=='shop'||shopPack!=='starters'||!dialog.open||starterQuote?.starterId!==id)break;const q=quoteStarterPurchase(profile,id);if(!q.ok||q.received!==starterQuote.received||q.bonusTreasure!==starterQuote.bonusTreasure){starterQuote=null;closeDialog();render();setMessage(q.error||'購入内容を再確認してください。');break}const r=purchaseStarter(profile,id);starterQuote=null;closeDialog();if(!r.ok){setMessage(r.error);break}save({...profile,treasure:r.treasure,collection:r.collection});render();setMessage(esc(r.starter.name)+'を購入しました。');break}
  case 'purchase':await purchaseWithPresentation();break;
  case 'campaign':await start('normal',idx);break;
  case 'replay':{const v=document.querySelector('#replay').value;if(v!=='')await start('normal',Number(v));break}
  case 'practice':await start(el.dataset.level);break;
  case 'hand':{const g=match.game,c=getCard(g.players[0].hand[idx]);detail(c,g.active===0&&getPlayableCards(g).includes(idx)?'use':'','data-index="'+idx+'"',match?.mode==='kirahara');break}
  case 'use':use(idx);break;
  case 'core':target(Number(el.dataset.player));break;
  case 'unit':{const g=match.game,p=Number(el.dataset.player),uid=el.dataset.uid;if(target(p,uid))break;if(p===0&&g.active===0&&canAttack(g,uid)){selection={kind:'attack',uid};render()}else{const u=g.players[p].field.find(x=>x.uid===uid);if(u)detail(getCard(u.cardId),'','',p===0&&match?.mode==='kirahara')}break}
  case 'end-turn':if(match.game.active===0&&match.game.winner===null){if(apply(endTurn(match.game)))cpuTurn()}break;
  case 'cancel-target':selection=null;render();break;
  case 'forfeit':if(confirm('降参しますか？ 秘宝報酬はありません。'))leaveMatch();break;
  case 'leave':leaveMatch();break;
  case 'close':starterQuote=null;closeDialog();break;
 }}catch(err){experience.sound('deny');if(dialog.open){const p=document.createElement('p');p.setAttribute('role','alert');p.textContent=err.message;dialog.appendChild(p)}else setMessage(err.message)}
});
document.addEventListener('input',e=>{if(e.target.id==='bgm-volume'&&profile){const value=Number(e.target.value);music.sync({volume:value/100});const out=document.querySelector('#volume-number');if(out)out.textContent=value+'%'}});
document.addEventListener('change',e=>{if(e.target.id==='bgm-volume'&&profile){try{save({...profile,bgmVolume:Math.max(0,Math.min(1,Number(e.target.value)/100))});syncMusic()}catch{render();setMessage('音量設定を保存できません。')}}});
function unlockMusic(){const s=music.getState();if(s.enabled&&!s.playing&&['locked','blocked','paused','error'].includes(s.status))music.unlock()}
document.addEventListener('pointerdown',unlockMusic,{passive:true,capture:true});document.addEventListener('keydown',unlockMusic,{capture:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearCpu();else cpuTurn()});
window.addEventListener('pagehide',clearCpu);
window.addEventListener('pageshow',()=>{cpuTurn()});
document.addEventListener('contextmenu',e=>{if(e.target.closest('.card,.art,img'))e.preventDefault()});
document.addEventListener('dragstart',e=>{if(e.target.closest('.card,.art,img'))e.preventDefault()});
document.addEventListener('dblclick',e=>{if(!e.target.closest('input,textarea,select'))e.preventDefault()});
let resizeTimer;const resizeLayout=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(profile&&['catalog','deck','shop'].includes(page))render()},120)};
addEventListener('resize',resizeLayout);addEventListener('beastking:viewport',resizeLayout);
render();

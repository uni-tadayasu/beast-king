import {CARDS,ORIGINS,TYPE_LABELS,RARITY_LABELS,MODEL_LABELS,STARTER_DECKS,PACKS,getCard} from './catalog.js';
import {CARD_ART_CROPS} from '../card-art-layouts.js';
import {newGame,playCard,attack,endTurn,runCpuTurn,getLegalTargets,getAttackTargets,getPlayableCards,getFusionMaterials,canAttack} from './engine.js';
import {CAMPAIGN_BATTLES} from '../campaign.js';
import {STARTERS,initialProfile,loadProfile,persistProfile,checkDeck,saveDeck,chooseStarter,counts,purchase,settle} from './profile.js';
const root=document.querySelector('#app'),dialog=document.querySelector('#detail');
const esc=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt=n=>Number(n).toLocaleString('ja-JP');
const origin=id=>ORIGINS.find(x=>x.id===id);
const byType=Object.entries(TYPE_LABELS);
const label=id=>getCard(id)?.name||id;
let profile=loadProfile(localStorage),page='home',message='',draft=null,match=null,selection=null,cpuBusy=false,filter={q:'',type:'',origin:'',rarity:'',pack:'',page:0};
let shopPage=0,shopPack='BK01';
const nav=[['home','王庭'],['solo','ソロ対戦'],['deck','デッキ工房'],['catalog','カード図鑑'],['shop','秘宝ショップ'],['rules','遊び方']];
function save(next){persistProfile(localStorage,next);profile=next}
function setMessage(s){message=s;const node=document.querySelector('#status');if(node)node.textContent=s}
function act(action,text,extra='',cls=''){return '<button type="button" class="'+cls+'" data-act="'+action+'" '+extra+'>'+esc(text)+'</button>'}
function setPage(p){
 if(match&&match.game.winner===null&&p!=='battle'){setMessage('対戦を終了してから移動してください。');return}
 if(p==='deck'&&!draft)draft={main:[...profile.main],special:[...profile.special]};
 if(page!==p){filter={q:'',type:'',origin:'',rarity:'',pack:'',page:0};shopPage=0}
 page=p;message='';render();
}
function art(c){
 if(c.artStatus==='pending')return 'background:radial-gradient(ellipse at 50% 30%,'+(origin(c.origin)?.color||'#afc2b9')+'33,#0a201e 80%)';
 if(c.id==='B0512')return "background-image:url('../assets/design-v2/cards/individual/king.webp');background-position:center;background-size:cover";
 const n=Number(c.id.slice(1))-1,b=String(Math.floor(n/16)+1).padStart(2,'0'),cell=n%16;
 const base="background-image:url('../assets/design-v2/cards/individual/"+c.type+"-"+b+".webp');",crop=CARD_ART_CROPS[c.id];
 if(crop)return base+'background-position:'+crop.x*100/(crop.width-crop.size)+'% '+crop.y*100/(crop.height-crop.size)+'%;background-size:'+crop.width*100/crop.size+'% '+crop.height*100/crop.size+'%';
 return base+'background-position:'+((cell%4+.01)*100/3.02)+'% '+((Math.floor(cell/4)+.01)*100/3.02)+'%;background-size:408.163% 408.163%';
}
function card(c,{action='detail',data='',className='',unit=null,owned=null}={}){
 if(!c)return '';
 const attrs=action?'data-act="'+action+'" data-id="'+esc(c.id)+'" '+data:'disabled';
 return '<button type="button" class="card '+c.type+' '+c.rarity+' '+className+'" '+attrs+' title="'+esc(c.name)+'"><span class="cardtop"><span class="cost">'+(c.type==='fusion'?'合':c.cost)+'</span><span class="cardname">'+esc(c.name)+'</span></span><span class="art '+(c.artStatus==='pending'?'pending-art':'')+'" aria-hidden="true" style="'+art(c)+'">'+(c.artStatus==='pending'?'<span class="art-placeholder">'+(c.operatorOnly?'専用イラスト制作前':'イラスト制作前')+'</span>':'')+'</span><span class="cardtop"><span>'+TYPE_LABELS[c.type]+' · '+esc(origin(c.origin)?.name)+'</span><span class="rarity">'+RARITY_LABELS[c.rarity]+'</span></span><span class="effect">'+esc(c.text)+'</span><span class="cardbottom">'+(['beast','fusion'].includes(c.type)?'<b>攻 '+(unit?.attack??c.attack)+'</b><b>守 '+(unit?.hp??c.hp)+'</b>':esc(c.id))+(owned!==null?'<span>所持 '+owned+'</span>':'')+'</span></button>';
}
function onboard(){
 root.innerHTML='<div class="onboard"><form id="onboard" class="panel"><div class="intro"><img src="../assets/icon.svg" alt=""><div><small>THE FIRST CHRONICLE · 新生版</small><h1>BEAST KING</h1><p>最初の契約を結ぶ</p></div></div><label>プレイヤー名<input name="name" type="text" maxlength="32" required autocomplete="nickname" placeholder="1〜16文字"></label><section><h3>プロフィールアイコン</h3><div class="origins">'+ORIGINS.map((o,i)=>'<label><input type="radio" name="origin" value="'+o.id+'" '+(!i?'checked':'')+'><span style="color:'+o.color+'"> '+o.glyph+' '+o.name+'</span></label>').join('')+'</div></section><section><h3>最初のスターター</h3><div class="starter-grid">'+STARTERS.map((s,i)=>'<label><input type="radio" name="starter" value="'+s.id+'" '+(!i?'checked':'')+'><span>'+esc(s.name)+'</span><p>'+esc(s.subtitle)+'</p></label>').join('')+'</div></section><p class="muted">名前とアイコンはこの端末で初回のみ設定します。スターター4種類を利用できます。開発版の保存は現行版と独立しています。</p><button type="submit" class="primary">契約してゲームを開始</button><p id="status" role="status"></p></form></div>';
}
function shell(body){
 const o=origin(profile.origin);
 root.innerHTML='<div class="shell"><header><div class="brand"><img src="../assets/icon.svg" alt=""><div><b>BEAST KING</b><small>新生版 · FOUNDATION</small></div></div><div class="identity"><span style="color:'+o.color+'">'+o.glyph+' '+esc(profile.name)+'</span><span class="balance">秘宝 '+fmt(profile.treasure)+'</span></div></header><nav aria-label="メインメニュー">'+nav.map(([id,name])=>act('nav',name,'data-page="'+id+'" '+(page===id?'aria-current="page"':'')+(page==='battle'&&match?.game.winner===null?' disabled':''))).join('')+'</nav><main>'+body+'</main><footer><span>© 2026 Beast King · 開発プレビュー</span><span id="status" role="status">'+esc(message)+'</span></footer></div>';
}
function home(){
 const s=STARTERS.find(x=>x.id===profile.starterId);
 return '<div class="home"><section class="panel hero"><p class="eyebrow">THE FIRST CHRONICLE</p><h1>六源の覚醒</h1><p>獣の契約を結び、ハートポイントを巡る決闘へ。自分だけの36枚で王冠を目指す。</p>'+act('nav','ソロの冒険へ','data-page="solo"','primary')+'<small>第一弾・第二弾 2,304枚 · 7オリジン · 6段階のレアリティ</small></section><div class="home-side"><section class="panel"><div class="panel-head"><h2>戦績</h2><span class="sub">'+esc(s?.name||'カスタムデッキ')+'</span></div><div class="summary"><div><small>所持種類</small><strong>'+Object.keys(profile.collection).length+'</strong></div><div><small>勝利</small><strong>'+profile.wins+'</strong></div><div><small>章の進行</small><strong>'+profile.completed+' / 20</strong></div><div><small>デッキ</small><strong>32 + 4</strong></div></div></section><section class="panel modes">'+[['solo','ソロ','全20戦と練習戦'],['deck','デッキ工房','36枚の編成'],['catalog','図鑑','全カードを確認'],['shop','ショップ','12枚入りパック']].map(([id,t,d])=>'<button class="mode" data-act="nav" data-page="'+id+'"><b>'+t+'</b><span>'+d+'</span></button>').join('')+'</section></div></div>';
}
function solo(){
 const next=CAMPAIGN_BATTLES[profile.completed];
 return '<div class="home"><section class="panel hero"><small>SOLO CHRONICLE</small><h1>'+(next?esc(next.chapterTitle):'全章クリア')+'</h1><p>'+(next?esc(next.title)+' — '+esc(next.description):'すべての試練を突破しました。')+'</p>'+(next?act('campaign','次の決闘へ','data-index="'+profile.completed+'"','primary'):'')+'<p>達成 '+profile.completed+' / 20</p><h3>クリア済みの戦い</h3><select id="replay"><option value="">再戦を選ぶ</option>'+CAMPAIGN_BATTLES.slice(0,profile.completed).map((b,i)=>'<option value="'+i+'">'+(i+1)+' · '+esc(b.title)+'</option>').join('')+'</select>'+act('replay','再戦を開始',profile.completed?'':'disabled')+'</section><section class="panel modes">'+[['easy','見習い'],['normal','策士'],['hard','覇王']].map(([id,t])=>'<button class="mode" data-act="practice" data-level="'+id+'"><b>'+t+'</b><span>自由な練習戦</span></button>').join('')+'<div class="panel"><h3>使用デッキ</h3><p>メイン '+profile.main.length+'枚</p><p>特殊 '+profile.special.length+'枚</p>'+act('nav','デッキ確認','data-page="deck"')+'</div></section></div>';
}
function pageSize(){return innerWidth<=600&&innerHeight>innerWidth?9:innerWidth<900?8:12}
function opts(items,val){return items.map(([id,t])=>'<option value="'+esc(id)+'" '+(id===val?'selected':'')+'>'+esc(t)+'</option>').join('')}
function catalog(edit){
 const list=CARDS.filter(c=>(!edit||profile.collection[c.id])&&(!filter.q||(c.name+' '+c.text+' '+c.id).toLowerCase().includes(filter.q.toLowerCase()))&&(!filter.type||c.type===filter.type)&&(!filter.origin||c.origin===filter.origin)&&(!filter.rarity||c.rarity===filter.rarity)&&(!filter.pack||c.pack===filter.pack));
 const size=pageSize(),total=Math.max(1,Math.ceil(list.length/size));filter.page=Math.min(filter.page,total-1);
 const shown=list.slice(filter.page*size,(filter.page+1)*size);
 return '<section class="panel catalog-layout"><div><div class="panel-head"><h2>'+(edit?'所持カード':'全カード図鑑')+'</h2><span class="sub">'+fmt(list.length)+'種類</span></div><form class="filters" id="filters"><input name="q" aria-label="カード検索" placeholder="カード名・効果・ID" value="'+esc(filter.q)+'"><select name="type" aria-label="種類">'+opts([['','全種類'],...byType],filter.type)+'</select><select name="origin" aria-label="オリジン">'+opts([['','全オリジン'],...ORIGINS.map(o=>[o.id,o.name])],filter.origin)+'</select><select name="rarity" aria-label="レアリティ">'+opts([['','全レア'],...Object.entries(RARITY_LABELS)],filter.rarity)+'</select><select name="pack" aria-label="収録弾">'+opts([['','全収録弾'],...PACKS.map(p=>[p.id,p.name])],filter.pack)+'</select><button>検索</button></form></div><div class="card-grid">'+shown.map(c=>card(c,{action:edit?'add-detail':'detail',owned:profile.collection[c.id]||0})).join('')+(shown.length?'':'<p class="muted">カードが見つかりません。</p>')+'</div><div class="pagination">'+act('prev','前へ',filter.page===0?'disabled':'')+'<span>'+(filter.page+1)+' / '+total+'</span>'+act('next','次へ',filter.page+1===total?'disabled':'')+'</div></section>';
}
function deck(){
 const valid=checkDeck(profile,draft.main,draft.special);
 const sections=[['main','メイン',draft.main,32],['special','特殊',draft.special,4]];
 return '<div class="deck-layout">'+catalog(true)+'<section class="panel deck-list"><div><h2>編成中のデッキ</h2><p>メイン '+draft.main.length+'/32 · 特殊 '+draft.special.length+'/4</p><small>同名2枚まで · 所持枚数以内</small></div><div class="deck-rows">'+sections.map(([zone,t,ids,n])=>'<h3>'+t+' '+ids.length+'/'+n+'</h3>'+Object.entries(counts(ids)).map(([id,k])=>'<button data-act="remove" data-zone="'+zone+'" data-id="'+id+'"><span>'+esc(label(id))+' ×'+k+'</span><span>−</span></button>').join('')).join('')+'</div><div class="actions"><select id="starter-select" aria-label="スターター">'+opts(STARTERS.map(s=>[s.id,s.name]),profile.starterId)+'</select>'+act('preset','適用')+act('discard','元に戻す')+act('save-deck','保存',valid.valid?'':'disabled','primary')+'</div></section></div>';
}
function shop(){
 const pack=PACKS.find(p=>p.id===shopPack)||PACKS[0],last=PACKS.find(p=>p.id===(profile.lastPackId||'BK01'));
 const pulls=profile.lastPack||[],size=pageSize(),total=Math.max(1,Math.ceil(pulls.length/size));shopPage=Math.min(shopPage,total-1);
 return '<section class="panel shop"><div class="shop-info"><div><h2>'+esc(pack.name)+'</h2><p>1パック 100秘宝 · 12枚 · レア以上1枚保証</p><small>各弾1,152枚。通常のパックから運営専用イラストは排出されません。</small><div class="pack-tabs">'+PACKS.map(p=>'<button data-act="select-pack" data-pack="'+p.id+'" aria-pressed="'+(p.id===pack.id)+'">'+(p.number===1?'第一弾':'第二弾')+'</button>').join('')+'</div></div>'+act('purchase','パックを開封',profile.treasure<100?'disabled':'','primary')+'</div><div class="card-grid">'+(pulls.length?pulls.slice(shopPage*size,(shopPage+1)*size).map(x=>card(getCard(x.cardId),{owned:profile.collection[x.cardId]||0,className:x.converted?'converted':''})).join(''):'<p class="muted">ここに開封結果が表示されます。</p>')+'</div><div class="pagination">'+act('shop-prev','前へ',shopPage===0?'disabled':'')+'<span>'+(pulls.length?'開封結果：'+esc(last?.name||'')+' · ':'')+(shopPage+1)+' / '+total+'</span>'+act('shop-next','次へ',shopPage+1===total?'disabled':'')+'</div></section>';
}
function rules(){return '<section class="panel rules"><h2>基本ルール</h2><h3>デッキと勝利条件</h3><p>メイン32枚＋合成魔獣4枚。同名2枚まで。ハートポイント5,000で開始し、相手を0にすると勝利します。</p><h3>ターンと出場ゾーン</h3><p>最大エーテルが自分のターンごとに1増加（最大10）。手札は最大4枚、出場魔獣は4体、ギミックは2枚。魔獣は通常、召喚した次の自分のターンから攻撃できます。</p><h3>攻撃と守護</h3><p>守護がある場合は優先して攻撃。通常アタック型は攻撃を受けると消滅し、持ち主に攻撃力分のダメージ。ディフェンス型・合成魔獣は攻撃力が守備力を上回ると消滅し、超過分のみダメージ。通常戦闘で反撃はありません。</p><h3>合成召喚</h3><p>コスト3のミラクル「合成」で特殊デッキから合成魔獣を選び、手札・場・お墓の魔獣を1枚以上異世界へ。素材2枚目以降、攻撃力・守備力が各100上昇します。</p><h3>開発版について</h3><p>第一弾・第二弾とCPU対戦の独立した新画面です。第二弾と運営専用版のイラストは制作前です。オンライン対戦、クラウド同期、運営認証は未接続です。現行公開版のデータには影響しません。</p></section>'}
function targetList(){
 if(!selection||!match||match.game.active!==0||match.game.winner!==null)return [];
 return selection.kind==='attack'?getAttackTargets(match.game,selection.uid):getLegalTargets(match.game,selection.index);
}
function isTarget(player,uid){return targetList().some(t=>t.player===player&&(uid?t.uid===uid:t.core===true))}
function playerStrip(p,i){
 const name=i?p.name:profile.name;
 return '<div class="player-strip"><span>'+esc(name)+' · 手札 '+p.hand.length+' · 山札 '+p.deck.length+'</span><button type="button" class="hp '+(isTarget(i)?'target':'')+'" data-act="core" data-player="'+i+'">♥ '+fmt(p.core)+'</button><span>結界 '+fmt(p.shield)+' · エーテル '+p.energy+'/'+p.maxEnergy+' · 罠 '+p.traps.length+' · 墓 '+p.grave.length+' · 異世界 '+p.banished.length+' · 特殊 '+p.special.length+'</span></div>';
}
function units(p,i){return '<div class="zones">'+p.field.map(u=>card(getCard(u.cardId),{action:'unit',data:'data-player="'+i+'" data-uid="'+u.uid+'"',unit:u,className:(isTarget(i,u.uid)?'target ':'')+(selection?.uid===u.uid?'selected':'')})).join('')+Array.from({length:Math.max(0,4-p.field.length)},()=>'<div class="slot">出場ゾーン</div>').join('')+'</div>'}
function battle(){
 const g=match.game,[own,enemy]=g.players,ended=g.winner!==null,playable=g.active===0?getPlayableCards(g):[];
 const result=ended?(g.winner==='draw'?'引き分け':g.winner===0?'勝利！':'敗北'):(g.active===0?'あなたのターン':'CPUのターン');
 return '<div class="arena"><section class="table">'+playerStrip(enemy,1)+units(enemy,1)+'<div class="centerline">TURN '+g.turn+' · '+result+(selection?' · 対象を選択してください':'')+'</div>'+units(own,0)+playerStrip(own,0)+'<div class="hand">'+own.hand.map((id,i)=>card(getCard(id),{action:'hand',data:'data-index="'+i+'"',className:playable.includes(i)?'selected':''})).join('')+Array.from({length:Math.max(0,4-own.hand.length)},()=>'<div class="slot">手札</div>').join('')+'</div></section><aside class="panel side"><h3>決闘ログ</h3><div class="log" role="log">'+g.log.slice(-35).reverse().map(l=>'<p><small>T'+l.turn+'</small> '+esc(l.text)+'</p>').join('')+'</div><div class="actions">'+(ended?act('leave','王庭へ戻る','','primary'):act('end-turn','ターン終了',g.active!==0||cpuBusy?'disabled':'','primary')+act('cancel-target','選択を解除',selection?'':'disabled')+act('forfeit','降参'))+'</div></aside></div>';
}
function render(){
 if(!profile){onboard();return}
 const views={home,solo,deck,catalog:()=>catalog(false),shop,rules,battle};
 shell((views[page]||home)());
}
function closeDialog(){if(dialog.open)dialog.close()}
function openDialog(html){closeDialog();dialog.innerHTML=html;dialog.showModal()}
function detail(c,action='',data=''){
 const own=profile.collection[c.id]||0;
 openDialog('<div class="detail"><div class="preview">'+card(c,{action:'',owned:own})+'</div><section><h2>'+esc(c.name)+'</h2><p>'+TYPE_LABELS[c.type]+' · '+RARITY_LABELS[c.rarity]+' · '+esc(origin(c.origin)?.name)+'</p><p>'+esc(MODEL_LABELS[c.model]||'')+'</p><p>'+esc(c.text)+'</p><p class="muted">'+esc(c.flavor)+'</p>'+(action?act(action,action==='add'?'デッキに追加':'カードを使用',data,'primary'):'')+act('close','閉じる')+'</section></div>');
}
function start(level,index=null){
 const status=checkDeck(profile,profile.main,profile.special);if(!status.valid)throw new Error(status.errors[0]);
 const chapter=index===null?null:CAMPAIGN_BATTLES[index];
 if(index!==null&&(!chapter||index>profile.completed))throw new Error('この回戦は未解放です。');
 const cpu=chapter?STARTER_DECKS.find(s=>s.id===chapter.cpuDeckId):STARTER_DECKS[2];
 const game=newGame({playerDeck:profile.main,playerSpecialDeck:profile.special,cpuDeck:cpu.ids,cpuSpecialDeck:cpu.specialIds,difficulty:chapter?.difficulty||level});
 game.players[0].name=profile.name;if(chapter)game.players[1].name=chapter.opponentName;
 match={game,id:globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random(),chapter:index};selection=null;cpuBusy=false;page='battle';message='';render();
}
function finish(){
 if(match.game.winner===null)return;
 const w=match.game.winner;save(settle(profile,match.id,w===0?'win':w===1?'loss':'draw',match.chapter));
}
function apply(result){
 if(!result.ok){setMessage(result.error);return}
 selection=null;finish();render();
}
function cpuTurn(){
 if(!match||match.game.winner!==null||match.game.active!==1)return;
 cpuBusy=true;const running=match;render();
 setTimeout(()=>{if(match!==running||page!=='battle'||running.game.winner!==null){cpuBusy=false;return}try{const r=runCpuTurn(running.game,running.game.difficulty);cpuBusy=false;apply(r)}catch(e){cpuBusy=false;setMessage(e.message)}},280);
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
document.addEventListener('submit',e=>{
 const f=e.target;if(!['onboard','filters','fusion-form'].includes(f.id))return;e.preventDefault();
 try{
  const d=new FormData(f);
  if(f.id==='onboard'){save(initialProfile(d.get('name'),d.get('origin'),d.get('starter')));page='home';render()}
  if(f.id==='filters'){filter={q:String(d.get('q')||'').trim(),type:d.get('type'),origin:d.get('origin'),rarity:d.get('rarity'),pack:d.get('pack'),page:0};render()}
  if(f.id==='fusion-form'){
   const g=match.game,materials=getFusionMaterials(g),selected=d.getAll('material').map(i=>materials[Number(i)]).filter(Boolean);
   const r=playCard(g,Number(f.dataset.index),{specialIndex:Number(d.get('special')),materials:selected});
   if(!r.ok){f.querySelector('#fusion-error').textContent=r.error;return}closeDialog();apply(r);
  }
 }catch(err){setMessage(err.message)}
});
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-act]');if(!el||el.disabled)return;
 const a=el.dataset.act,id=el.dataset.id,idx=Number(el.dataset.index);
 try{switch(a){
  case 'nav':setPage(el.dataset.page);break;
  case 'prev':filter.page=Math.max(0,filter.page-1);render();break;
  case 'next':filter.page++;render();break;
  case 'shop-prev':shopPage=Math.max(0,shopPage-1);render();break;
  case 'shop-next':shopPage++;render();break;
  case 'detail':detail(getCard(id));break;
  case 'add-detail':detail(getCard(id),'add','data-id="'+id+'"');break;
  case 'add':{
   const c=getCard(id),zone=c.type==='fusion'?'special':'main',limit=zone==='special'?4:32;
   if(draft[zone].length>=limit)throw new Error('デッキが満杯です。先にカードを減らしてください。');
   const n=counts(draft[zone])[id]||0,same=draft[zone].filter(x=>getCard(x)?.name===getCard(id)?.name).length;if(same>=2||n>=(profile.collection[id]||0))throw new Error('同名2枚または所持枚数の上限です。');
   draft[zone].push(id);closeDialog();render();break;}
  case 'remove':{const l=draft[el.dataset.zone],i=l.indexOf(id);if(i>=0)l.splice(i,1);render();break}
  case 'preset':{const s=STARTERS.find(x=>x.id===document.querySelector('#starter-select').value);draft={main:[...s.ids],special:[...s.specialIds]};render();break}
  case 'discard':draft={main:[...profile.main],special:[...profile.special]};render();break;
  case 'save-deck':save(saveDeck(profile,draft.main,draft.special));setMessage('デッキを保存しました。');break;
  case 'select-pack':if(PACKS.some(p=>p.id===el.dataset.pack)){shopPack=el.dataset.pack;render()}break;
  case 'purchase':save(purchase(profile,Math.random,shopPack));shopPage=0;render();setMessage('12枚のカードを開封しました。');break;
  case 'campaign':start('normal',idx);break;
  case 'replay':{const v=document.querySelector('#replay').value;if(v!=='')start('normal',Number(v));break}
  case 'practice':start(el.dataset.level);break;
  case 'hand':{const g=match.game,c=getCard(g.players[0].hand[idx]);detail(c,g.active===0&&getPlayableCards(g).includes(idx)?'use':'','data-index="'+idx+'"');break}
  case 'use':use(idx);break;
  case 'core':target(Number(el.dataset.player));break;
  case 'unit':{const g=match.game,p=Number(el.dataset.player),uid=el.dataset.uid;if(target(p,uid))break;if(p===0&&g.active===0&&canAttack(g,uid)){selection={kind:'attack',uid};render()}else{const u=g.players[p].field.find(x=>x.uid===uid);if(u)detail(getCard(u.cardId))}break}
  case 'end-turn':if(match.game.active===0&&match.game.winner===null){apply(endTurn(match.game));cpuTurn()}break;
  case 'cancel-target':selection=null;render();break;
  case 'forfeit':if(confirm('降参しますか？ 秘宝報酬はありません。')){save(settle(profile,match.id,'forfeit',match.chapter));match=null;selection=null;setPage('home')}break;
  case 'leave':match=null;selection=null;setPage('home');break;
  case 'close':closeDialog();break;
 }}catch(err){if(dialog.open){const p=document.createElement('p');p.setAttribute('role','alert');p.textContent=err.message;dialog.appendChild(p)}else setMessage(err.message)}
});
document.addEventListener('contextmenu',e=>{if(e.target.closest('.card,.art'))e.preventDefault()});
document.addEventListener('dragstart',e=>{if(e.target.closest('.card,.art,img'))e.preventDefault()});
document.addEventListener('dblclick',e=>{if(!e.target.closest('input,textarea,select'))e.preventDefault()});
let resizeTimer;addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(profile&&['catalog','deck','shop'].includes(page))render()},120)});
render();

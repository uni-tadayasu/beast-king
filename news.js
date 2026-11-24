import {ONLINE_API_BASE} from './online.js?v=20261124-26';
/** Built-in release notices. Update these entries when a new game version is published. */
export const NEWS_ITEMS = Object.freeze([
 {date:'2026.11.24',title:'王庭を一新 — 鮮やかな画面と新しい演出',text:'王庭・デッキ・ショップ・3つの決闘場を刷新。お気に入りとデッキ分析を追加しました。画面切り替え・召喚・攻撃・合成・パック開封に演出と効果音を追加し、設定から音量や演出の強さを調節できます。'},
 {date:'2026.11.24',title:'全カードのバランスを見直しました',text:'全2,304枚を見直し、1,915枚のコスト・能力値・効果を調整しました。所持カードと保存デッキはそのまま使えます。対戦前にカード詳細とデッキ分析で新しい性能をご確認ください。'},
 {date:'2026.11.24',title:'カードアートを統一・144枚を描き直し',text:'全カードの色調と描画の仕上げを統一し、144枚を新しいイラストに差し替えました。運営専用レガリアは利用権の確認後に自動適用され、イラスト設定は不要です。'},
 {date:'2026.11.24',title:'4種類のスターターデッキを販売',text:'初回は4種類から1種類だけ無料で選択。残りは秘宝ショップで各300秘宝で購入できます。未所持のスターターの読み込みと自動補充を廃止しました。既存の所持カード・保存デッキは維持します。'},
 {date:'2026.11.24',title:'第二弾「王源の継承」1,152枚を追加',text:'第一弾と合わせて2,304枚に。レガリアも第二弾から入手できます。どちらの弾のカードも組み合わせ、ソロ・マルチ・ランクで使えます。'},
 {date:'2026.11.24',title:'PC・スマホ・タブレットでスクロール不要',text:'画面の大きさに合わせて配置を切り替え、カード一覧やルールはページ送りで大きく表示。画面移動や新しいカード画像の読み込みにはロード表示を加えました。'},
 {date:'2026.11.24',title:'新オリジン「王」が登場',text:'山・川・種・草・花・木に「王」を追加。通常魔獣「王冠竜 レガリア」は最大コスト8・ギラギラレア。図鑑とプロフィールで「王」を選べます。'},
 {date:'2026.11.24',title:'全2,304枚の個別アートと6段階の輝き',text:'カードごとに異なるイラストへ。レアリティに応じて光沢・箔・虹色の反射を施し、文字と数値は読みやすく表示します。'},
 {date:'2026.11.24',title:'同じプレイヤーで端末を連携',text:'設定の「端末連携と同期」から、元の端末で発行したコードを別の端末に入力。所持カード・秘宝・デッキ・ソロ進行を同じプレイヤーで同期できます。'},
 {date:'2026.11.24',title:'自分の手札の効果を左に表示',text:'手持ちのカードを選ぶと、画面左側でカード効果の全文を確認できます。相手ターン中も確認でき、選んだ内容は相手には表示されません。'},
 {date:'2026.11.24',title:'HP半分以下でバトルBGMが変化',text:'自分または相手のハートポイントが2,500以下になると、専用のクライマックスBGMへ切り替わります。ソロ・マルチ・ランクすべてに対応し、音量設定も引き継ぎます。'},
 {date:'2026.11.24',title:'ソロモードは全10章・各章2回戦',text:'全10章、各章2回戦の合計20戦。勝利して次の回戦へ進み、進行は自動保存。クリア済みの回戦にも再挑戦できます。'},
 {date:'2026.11.24',title:'スマホ・タブレットは横画面で表示',text:'対応端末では横向き固定を試み、固定できないブラウザでもゲーム画面を横長に回転して表示します。端末を横にすると、その向きに合わせて表示します。'},
 {date:'2026.11.24',title:'第一弾「六源の覚醒」',text:'通常魔獣512枚・合成魔獣128枚・ミラクル256枚・ギミック256枚、全1,152枚。秘宝ショップで12枚入りパックを開封できます。'},
 {date:'2026.11.24',title:'3つのモードと専用フィールド',text:'ソロ・マルチ・ランクをメニューから選択。マルチはルームコードで1対1、ランクは60秒マッチしない場合にBOT戦へ切り替わります。'},
 {date:'2026.11.24',title:'対戦デッキは32枚＋4枚・同名2枚まで',text:'通常デッキ32枚と、合成魔獣の特殊デッキ4枚を使います。通常・特殊ともに、同じカードは2枚までです。合成魔獣はアタック・ディフェンス型を兼ねます。'},
 {date:'2026.11.24',title:'7つのオリジンのプロフィール',text:'名前とアイコンの登録は端末のブラウザで最初の1回だけ。次回から王庭が開き、プロフィール設定でいつでも変更できます。'}
]);
let publicNotice={notice:'',maintenance:false};
const noticeItems=()=>[...(publicNotice.maintenance?[{date:'現在の受付',title:'オンライン対戦はメンテナンス中',text:'新しいルーム作成・入室・ランクマッチの受付を一時停止しています。進行中の対戦は続けられます。'}]:[]),...(publicNotice.notice?[{date:'最新のお知らせ',title:publicNotice.notice,text:publicNotice.notice}]:[]),...NEWS_ITEMS];
export function setPublicNotice(status={}){
 const next={notice:typeof status.notice==='string'?status.notice.slice(0,200):'',maintenance:status.maintenance===true};
 if(next.notice===publicNotice.notice&&next.maintenance===publicNotice.maintenance)return;
 publicNotice=next;if(typeof document!=='undefined')mountNews();
}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pauseIcon='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4v12M13 4v12"/></svg>';
const playIcon='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 3 10 7-10 7Z"/></svg>';
// A native top-layer dialog owns its layout. It never passes through the
// game's global scaling controller. Measure each actual article and paginate
// whole rows, preserving the first visible article across viewport changes.
let newsFirst=0,newsPages=[],newsLayoutPending=false;
function renderNewsItems(dialog){
 const items=dialog.querySelector('.news-items');
 items.innerHTML=noticeItems().map((item,i)=>`<article data-news-index="${i}"><time>${escape(item.date)}</time><h3>${escape(item.title===item.text?'運営からのお知らせ':item.title)}</h3><p>${escape(item.text)}</p></article>`).join('');
 if(dialog.open)layoutNews(dialog);
}
function showNewsPage(dialog,index){
 const grid=dialog.querySelector('.news-items'),page=newsPages[index];
 if(!page)return;
 const cards=[...grid.children];newsFirst=page.start;dialog.dataset.newsPage=String(index);
 cards.forEach((card,i)=>card.hidden=i<page.start||i>=page.end);
 grid.style.gridTemplateRows=page.heights.map(height=>'minmax('+height+'px,1fr)').join(' ');
 const prev=dialog.querySelector('.news-prev'),next=dialog.querySelector('.news-next');
 prev.disabled=index<=0;next.disabled=index>=newsPages.length-1;
 dialog.querySelector('.news-page-count').textContent=(index+1)+' / '+newsPages.length+' ページ';
 dialog.querySelector('.news-range').textContent=(page.start+1)+'–'+page.end+' / '+cards.length+'件';
}
function layoutNews(dialog){
 if(!dialog.open)return;
 const grid=dialog.querySelector('.news-items'),cards=[...grid.children];
 if(!cards.length)return;
 const available=grid.clientHeight,width=grid.clientWidth;
 if(available<1||width<1)return;
 let cols=width>=1450?4:width>=1040?3:width>=610?2:1;
 grid.style.setProperty('--news-columns',String(cols));
 grid.classList.add('news-measuring');grid.style.gridTemplateRows='none';
 cards.forEach(card=>card.hidden=false);
 let heights=cards.map(card=>card.offsetHeight);
 // A long official notice on a shallow display can use the entire width.
 if(Math.max(...heights)>available&&cols>1){
  cols=1;grid.style.setProperty('--news-columns','1');
  heights=cards.map(card=>card.offsetHeight);
 }
 const gap=Number.parseFloat(getComputedStyle(grid).rowGap)||0;
 let start=0,rows=[],used=0,pages=[];
 for(let i=0;i<cards.length;i+=cols){
  const end=Math.min(cards.length,i+cols),height=Math.max(...heights.slice(i,end))+1;
  if(rows.length&&used+gap+height>available-1){pages.push({start,end:i,heights:rows});start=i;rows=[];used=0;}
  rows.push(height);used+=height+(rows.length>1?gap:0);
 }
 if(rows.length)pages.push({start,end:cards.length,heights:rows});
 newsPages=pages;
 const index=Math.max(0,pages.findIndex(p=>newsFirst>=p.start&&newsFirst<p.end));
 grid.classList.remove('news-measuring');showNewsPage(dialog,index);
}
function scheduleNewsLayout(){
 if(newsLayoutPending)return;newsLayoutPending=true;
 requestAnimationFrame(()=>{newsLayoutPending=false;const dialog=document.getElementById('news-dialog');if(dialog?.open)layoutNews(dialog);});
}
function openNewsDialog(){
 let dialog=document.getElementById('news-dialog');
 if(!dialog){
  dialog=document.createElement('dialog');dialog.id='news-dialog';dialog.className='news-dialog';
  dialog.setAttribute('aria-labelledby','news-dialog-heading');
  dialog.innerHTML=`<header class="news-dialog-header"><div><p class="news-eyebrow">BEAST KING NEWS</p><h2 id="news-dialog-heading">最新情報</h2><p class="news-dialog-intro">アップデート・運営からのお知らせ</p></div><form method="dialog"><button class="news-close" aria-label="お知らせを閉じる">×</button></form></header><div class="news-items"></div><footer class="news-dialog-footer"><div class="news-page-nav" aria-label="お知らせのページ切り替え"><button type="button" class="news-prev" aria-label="前のページ">前へ</button><div class="news-page-info"><strong class="news-page-count" aria-live="polite"></strong><small class="news-range"></small></div><button type="button" class="news-next" aria-label="次のページ">次へ</button></div><form method="dialog"><button class="news-return">ゲームに戻る</button></form></footer>`;
  document.body.append(dialog);
  dialog.querySelector('.news-prev').addEventListener('click',()=>showNewsPage(dialog,Math.max(0,Number(dialog.dataset.newsPage||0)-1)));
  dialog.querySelector('.news-next').addEventListener('click',()=>showNewsPage(dialog,Math.min(newsPages.length-1,Number(dialog.dataset.newsPage||0)+1)));
 }
 if(dialog.open)return;
 newsFirst=0;renderNewsItems(dialog);dialog.showModal();layoutNews(dialog);scheduleNewsLayout();
}

function mountNews(){
 const root=document.getElementById('news-root');if(!root)return;
 let paused=false;try{paused=localStorage.getItem('beast-king-news-paused')==='true';}catch{}
 const text=noticeItems().map(item=>`<span><b>${escape(item.title)}</b><i>✦</i></span>`).join('');
 root.innerHTML=`<aside class="news-ticker" aria-label="最新情報のお知らせ"><button class="news-open" type="button" aria-label="最新情報を全文読む"><span>NEWS</span><b>最新情報</b></button><div class="news-window" aria-hidden="true"><div class="news-track"><div class="news-run">${text}</div><div class="news-run">${text}</div></div></div><button class="news-toggle" type="button" aria-label="お知らせの流れを一時停止" aria-pressed="false"></button></aside>`;
 const toggle=root.querySelector('.news-toggle'),ticker=root.querySelector('.news-ticker');
 const update=()=>{ticker.classList.toggle('news-paused',paused);toggle.setAttribute('aria-pressed',String(paused));toggle.setAttribute('aria-label',paused?'お知らせの流れを再開':'お知らせの流れを一時停止');toggle.title=paused?'スクロール再開':'一時停止';toggle.innerHTML=paused?playIcon:pauseIcon;};
 toggle.addEventListener('click',()=>{paused=!paused;update();try{localStorage.setItem('beast-king-news-paused',String(paused));}catch{}});
 root.querySelector('.news-open').addEventListener('click',openNewsDialog);
 const opened=document.getElementById('news-dialog');if(opened?.open)renderNewsItems(opened);
 update();
}
if(typeof document!=='undefined'){
 mountNews();
 window.addEventListener('resize',scheduleNewsLayout,{passive:true});window.visualViewport?.addEventListener('resize',scheduleNewsLayout,{passive:true});window.addEventListener('beastking:viewport',scheduleNewsLayout);document.fonts?.ready.then(scheduleNewsLayout);
 const refresh=async()=>{if(document.hidden)return;try{const response=await fetch(ONLINE_API_BASE+'/public-status',{credentials:'omit',cache:'no-store'});if(!response.ok)return;const status=await response.json();if(status.ok===true)setPublicNotice(status);}catch{}};
 void refresh();setInterval(refresh,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
}

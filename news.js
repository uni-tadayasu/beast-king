import {ONLINE_API_BASE} from './online.js?v=20261125-37';
import {bindOutsideDismiss,isDialogBackdrop} from './overlay-dismiss.js?v=20261125-37';
/** Built-in release notices. Update these entries when a new game version is published. */
export const NEWS_ITEMS = Object.freeze([
 {date:'2026.11.25',title:'新しい獣冠の紋章と、王宮の共有画像',text:'黒と淡い金の獣冠アイコンへ刷新。ブラウザのタブやホーム画面でも見分けやすくなりました。リンクを共有した時の画像も、王宮に輝く王冠とBEAST KINGのタイトルに統一しました。'},
 {date:'2026.11.25',title:'黒と金で彩る、新しい王庭',text:'王庭・デッキ・図鑑・ショップ・設定の画面を、深い黒と淡い金で統一しました。王宮の書庫を描いた背景と、王冠の紋章を配したロード画面を追加。見出し・ボタン・案内の文字も整えました。'},
 {date:'2026.11.25',title:'背景なしの魔獣と、最上位カードのレリーフ加工',text:'対戦中の魔獣を、原画の色や顔を保った背景なしの立体レリーフとしてカードの上に表示します。場にいる間は姿が残り、召喚・攻撃・発動に反応。アニメーションをオフにしても静止した姿が残ります。最上位GGRの大型魔獣・合成魔獣402枚には、絵柄に沿った浮き彫りと金属の縁取りを追加しました。'},
 {date:'2026.11.25',title:'自分側の斜め視点で戦うバトル画面',text:'自分の陣地の斜め手前から相手を見る視点へ変更。手前のカードを大きく、奥を小さく映し、盤面と魔獣の高さを表現します。原画の魔獣がカードの上に立ち、名前・能力値・操作位置も視点に合わせます。'},
 {date:'2026.11.25',title:'カード原画を使った魔獣の常時立体投影',text:'自分と相手の魔獣を、カード原画の姿と色を保ってカードの上に立体投影します。場にいる間は表示が続き、召喚・攻撃・発動に反応。アニメーションをオフにしても静止した姿が残り、場を離れると消えます。'},
 {date:'2026.11.25',title:'サブ画面の外側で閉じる・右クリックを無効化',text:'設定・カード詳細・お知らせ・対戦中の小窓は、外側をクリックまたはタップすると閉じられます。画面内から外へドラッグした時は閉じません。サイト内の右クリックメニューも無効化しました。'},
 {date:'2026.11.24',title:'第五弾「幻彩の夢界」— 新テーマ96枚',text:'折紙・玻璃・影絵・彩墨の4系統が登場。手札の残り枚数、結界、魔獣の数、手札の種類を使う新戦術と、それぞれの構築例を追加しました。専用イラスト96点を収録。12枚入り・100秘宝・レア以上1枚保証で、全収録カードは4,721枚です。'},
 {date:'2026.11.24',title:'端末連携・設定を大きく見やすく',text:'端末連携を画面全体に表示し、同期・コード発行・コード入力・連携端末の4タブに整理。設定、プロフィール編集、デッキ分析も横幅を活用する配置へ。入力中の連携コードはタブを移動しても残ります。'},
 {date:'2026.11.24',title:'サイバーUI・操作音・デッキ削除',text:'濃紺とシアンの画面へ刷新。文字と操作ボタンを大きくし、小さい画面では表示件数を調整。操作ごとに異なる短いシステム音を追加しました。デッキ設定から不要な保存デッキを削除できます。所持カードは減りません。'},
 {date:'2026.11.24',title:'王冠竜プレミアム — 18種すべてGGR',text:'王冠竜レガリアを強化し、専用カード17種を追加しました。新GGRは第一弾に5種、第二・第三・第四弾に各4種を収録し、全4,625枚へ。全員が通常パックから同じ性能で入手できます。ショップのプレミアム構築例は、必要な36枚を所持すると読み込めます。'},
 {date:'2026.11.24',title:'セルヴァ8種を、指定された原画へ',text:'セルヴァの8派生に、ユーザー指定の同一原画を適用しました。背景や色を変更せず、カードごとのレアリティ演出を維持します。この8種は同じキャラクターの原画を共有する明示的な例外です。'},
 {date:'2026.11.24',title:'イベント戦に専用BGMを追加',text:'32構築へ挑む環境デッキ戦を専用の曲で楽しめます。自分か相手のHPが2,500以下になると危機曲へ切り替わり、両者が2,500を超えるとイベント戦の曲へ戻ります。音量・ミュート設定は共通です。'},
 {date:'2026.11.24',title:'第三弾「継承の共鳴」発売 — 既存デッキを強化',text:'発売時に新カード1,152枚を収録。第一弾・第二弾の魔獣を強化・修復・回収するサポートが登場しました。ショップで混合デッキ4種類の構築例と必要な所持枚数を確認できます。12枚入り・100秘宝・レア以上1枚保証です。'},
 {date:'2026.11.24',title:'第四弾「星界の創世」発売 — 4つの新系統',text:'発売時に星巡・残響・命誓・封機の4系統、計1,152枚が登場。第四弾だけで組める構築例を用意しました。この発売時点の全収録カードは4,608枚でした。図鑑では収録弾と系統で絞り込めます。'},
 {date:'2026.11.24',title:'運営のお知らせ・プレゼント・イベントを刷新',text:'公開期間に応じたお知らせ、ゲーム内システムメール、カードや秘宝のプレゼント、イベント報酬に対応。受信箱から確認・受け取りできます。メンテナンス予定も最新情報へ表示します。'},
 {date:'2026.11.24',title:'王庭を一新 — 鮮やかな画面と新しい演出',text:'王庭・デッキ・ショップ・3つの決闘場を刷新。お気に入りとデッキ分析を追加しました。画面切り替え・召喚・攻撃・合成・パック開封に演出と効果音を追加し、設定から音量や演出の強さを調節できます。'},
 {date:'2026.11.24',title:'第一弾・第二弾のバランスを調整',text:'第一弾・第二弾の2,304枚を見直し、1,915枚のコスト・能力値・効果を調整しました。新規対戦では後攻の最初の2ターンにエーテル+1（2→3→3→4…）を適用します。所持カード・保存デッキ・中断中の対戦は引き継げます。'},
 {date:'2026.11.24',title:'第一弾・第二弾の144枚を描き直し',text:'第一弾・第二弾の色調と描画の仕上げを統一し、そのうち144枚を新しいイラストに差し替えました。運営専用レガリアは利用権の確認後に自動適用され、イラスト設定は不要です。'},
 {date:'2026.11.24',title:'4種類のスターターデッキを販売',text:'初回は4種類から1種類だけ無料で選択。残りは秘宝ショップで各300秘宝で購入できます。未所持のスターターの読み込みと自動補充を廃止しました。既存の所持カード・保存デッキは維持します。'},
 {date:'2026.11.24',title:'第二弾「王源の継承」の発売時構成',text:'発売時は全1,152枚を収録。レガリアはこの第二弾から入手できます。現在は専用GGR4種を加え1,156枚となり、各弾のカードを組み合わせて対戦できます。'},
 {date:'2026.11.24',title:'PC・スマホ・タブレットでスクロール不要',text:'画面の大きさに合わせて配置を切り替え、カード一覧やルールはページ送りで大きく表示。画面移動や新しいカード画像の読み込みにはロード表示を加えました。'},
 {date:'2026.11.24',title:'新オリジン「王」が登場',text:'山・川・種・草・花・木に「王」を追加。通常魔獣「王冠竜 レガリア」は最大コスト8・ギラギラレア。図鑑とプロフィールで「王」を選べます。'},
 {date:'2026.11.24',title:'第四弾発売時の4,608枚と6段階の輝き',text:'第四弾発売時に、4,608枚へ個別のイラストを用意しました。現在は新17種を追加し、セルヴァ8種のみ指定原画を共有します。レアリティに応じた光沢・箔・虹色の反射と、読みやすい文字・数値を維持します。'},
 {date:'2026.11.24',title:'同じプレイヤーで端末を連携',text:'設定の「端末連携と同期」から、元の端末で発行したコードを別の端末に入力。所持カード・秘宝・デッキ・ソロ進行を同じプレイヤーで同期できます。'},
 {date:'2026.11.24',title:'自分の手札の効果を左に表示',text:'手持ちのカードを選ぶと、画面左側でカード効果の全文を確認できます。相手ターン中も確認でき、選んだ内容は相手には表示されません。'},
 {date:'2026.11.24',title:'HP半分以下でバトルBGMが変化',text:'自分または相手のハートポイントが2,500以下になると、専用のクライマックスBGMへ切り替わります。ソロ・マルチ・ランクすべてに対応し、音量設定も引き継ぎます。'},
 {date:'2026.11.24',title:'ソロモードは全10章・各章2回戦',text:'全10章、各章2回戦の合計20戦。勝利して次の回戦へ進み、進行は自動保存。クリア済みの回戦にも再挑戦できます。'},
 {date:'2026.11.24',title:'スマホ・タブレットは横画面で表示',text:'対応端末では横向き固定を試み、固定できないブラウザでもゲーム画面を横長に回転して表示します。端末を横にすると、その向きに合わせて表示します。'},
 {date:'2026.11.24',title:'第一弾「六源の覚醒」の発売時構成',text:'発売時は通常魔獣512枚・合成魔獣128枚・ミラクル256枚・ギミック256枚、全1,152枚。現在は専用GGR5種を加え1,157枚です。秘宝ショップで12枚入りパックを開封できます。'},
 {date:'2026.11.24',title:'ソロ・マルチ・ランクの公開',text:'初期の3モードに、現在は32構築へ挑むイベント戦も加わりました。マルチはルームコードで1対1、ランクは60秒マッチしない場合にBOT戦へ切り替わります。'},
 {date:'2026.11.24',title:'対戦デッキは32枚＋4枚・同名2枚まで',text:'通常デッキ32枚と、合成魔獣の特殊デッキ4枚を使います。通常・特殊ともに、同じカードは2枚までです。合成魔獣はアタック・ディフェンス型を兼ねます。'},
 {date:'2026.11.24',title:'7つのオリジンのプロフィール',text:'名前とアイコンの登録は端末のブラウザで最初の1回だけ。次回から王庭が開き、プロフィール設定でいつでも変更できます。'}
]);
export function normalizePublicStatus(status={}){
 const notices=(Array.isArray(status.notices)?status.notices:[]).filter(n=>n&&typeof n.title==='string'&&typeof n.body==='string'&&(!n.phase||n.phase==='active')&&(!n.status||n.status==='published')).slice(0,20).map(n=>({id:String(n.id||''),title:n.title.slice(0,160),body:n.body.slice(0,4000),startAt:n.startAt,revision:n.revision}));
 const upcoming=status.upcomingMaintenance;
 return {notice:typeof status.notice==='string'?status.notice.slice(0,200):'',notices,maintenance:status.maintenance===true,maintenanceMessage:typeof status.maintenanceMessage==='string'?status.maintenanceMessage.slice(0,2000):'',upcomingMaintenance:upcoming&&Number.isFinite(upcoming.startAt)?{startAt:upcoming.startAt,endAt:Number.isFinite(upcoming.endAt)?upcoming.endAt:null,message:typeof upcoming.message==='string'?upcoming.message.slice(0,2000):''}:null};
}
const noticeDate=value=>Number.isFinite(value)&&value>0?new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value)):'運営からのお知らせ';
let publicNotice=normalizePublicStatus();
export function publicNewsItems(status={}){
 const p=normalizePublicStatus(status),items=[];
 if(p.maintenance)items.push({date:'現在の受付',title:'オンライン対戦はメンテナンス中',text:[p.maintenanceMessage,'新しいルーム作成・入室・ランクマッチの成立を一時停止しています。進行中の対戦と、待機中のマッチングの取り消しは利用できます。'].filter(Boolean).join('\n')});
 if(p.upcomingMaintenance){const m=p.upcomingMaintenance;items.push({date:'メンテナンス予定 / 日本時間',title:noticeDate(m.startAt)+'から受付を一時停止',text:[m.message,m.endAt?'終了予定：'+noticeDate(m.endAt):'終了時刻は決まり次第お知らせします。','進行中の対戦は続けられます。'].filter(Boolean).join('\n')});}
 items.push(...p.notices.map(n=>({date:noticeDate(n.startAt),title:n.title,text:n.body})));
 if(p.notice&&!p.notices.some(n=>n.title===p.notice))items.push({date:'最新のお知らせ',title:'運営からのお知らせ',text:p.notice});
 return items;
}
const noticeItems=()=>[...publicNewsItems(publicNotice),...NEWS_ITEMS];
export function setPublicNotice(status={}){
 const next=normalizePublicStatus(status);
 if(JSON.stringify(next)===JSON.stringify(publicNotice))return;
 publicNotice=next;if(typeof document!=='undefined')mountNews();
}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pauseIcon='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4v12M13 4v12"/></svg>';
const playIcon='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 3 10 7-10 7Z"/></svg>';
// A native top-layer dialog owns its layout. It never passes through the
// game's global scaling controller. Measure each actual article and paginate
// whole rows, preserving the first visible article across viewport changes.
let newsFirst=0,newsPages=[],newsLayoutPending=false;
const newsArticle=(item,i)=>`<article data-news-index="${i}" data-news-source="${i}" data-news-offset="0"><time>${escape(item.date)}</time><h3>${escape(item.title===item.text?'運営からのお知らせ':item.title)}</h3><p>${escape(item.text)}</p></article>`;
function renderNewsItems(dialog){
 dialog.querySelector('.news-items').innerHTML=noticeItems().map(newsArticle).join('');
 if(dialog.open)layoutNews(dialog);
}
// Long operator notices are split by actual rendered height. Every character
// stays reachable with the same page controls, even on a shallow phone display.
function splitNewsArticles(grid,available){
 for(const original of [...grid.children]){
  if(original.offsetHeight<=available-2)continue;
  const title=original.querySelector('h3').textContent,chars=Array.from(original.querySelector('p').textContent);
  let offset=0,part=0;
  while(offset<chars.length){
   const article=original.cloneNode(true),paragraph=article.querySelector('p');
   article.dataset.newsOffset=String(offset);
   if(part)article.querySelector('h3').textContent=title+'（続き）';
   grid.insertBefore(article,original);
   let low=1,high=chars.length-offset,best=1;
   while(low<=high){const mid=Math.floor((low+high)/2);paragraph.textContent=chars.slice(offset,offset+mid).join('');if(article.offsetHeight<=available-2){best=mid;low=mid+1;}else high=mid-1;}
   paragraph.textContent=chars.slice(offset,offset+best).join('');offset+=best;part++;
  }
  original.remove();
 }
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
 const grid=dialog.querySelector('.news-items'),anchor=grid.children[newsFirst]?.dataset;
 grid.innerHTML=noticeItems().map(newsArticle).join('');
 let cards=[...grid.children];
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
 if(Math.max(...heights)>available-2){splitNewsArticles(grid,available);cards=[...grid.children];heights=cards.map(card=>card.offsetHeight);}
 cards.forEach((card,index)=>card.dataset.newsIndex=String(index));
 if(anchor){const same=cards.map((card,i)=>({card,i})).filter(x=>x.card.dataset.newsSource===anchor.newsSource&&Number(x.card.dataset.newsOffset)<=Number(anchor.newsOffset));if(same.length)newsFirst=same.at(-1).i;}
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
  bindOutsideDismiss(dialog,{getLayer:()=>dialog.open?dialog:null,isOutside:isDialogBackdrop,onDismiss:()=>dialog.close()});
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});
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

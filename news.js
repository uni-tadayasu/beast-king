import {ONLINE_API_BASE} from './online.js';
/** Built-in release notices. Update these entries when a new game version is published. */
export const NEWS_ITEMS = Object.freeze([
 {date:'2026.11.24',title:'同じプレイヤーで端末を連携',text:'設定の「端末連携と同期」から、元の端末で発行したコードを別の端末に入力。所持カード・秘宝・デッキ・ソロ進行を同じプレイヤーで同期できます。'},
 {date:'2026.11.24',title:'自分の手札の効果を左に表示',text:'手持ちのカードを選ぶと、画面左側でカード効果の全文を確認できます。相手ターン中も確認でき、選んだ内容は相手には表示されません。'},
 {date:'2026.11.24',title:'HP半分以下でバトルBGMが変化',text:'自分または相手のハートポイントが2,500以下になると、専用のクライマックスBGMへ切り替わります。ソロ・マルチ・ランクすべてに対応し、音量設定も引き継ぎます。'},
 {date:'2026.11.24',title:'ソロモードは全10章・各章2回戦',text:'全10章、各章2回戦の合計20戦。勝利して次の回戦へ進み、進行は自動保存。クリア済みの回戦にも再挑戦できます。'},
 {date:'2026.11.24',title:'効果ログとスマホ横画面に対応',text:'バトル中のカード効果を右側のログに記録。スマホ・タブレットは横画面で遊べます。縦向きの場合は、画面の案内に沿って端末を回転してください。'},
 {date:'2026.11.24',title:'第一弾「六源の覚醒」',text:'通常魔獣512枚・合成魔獣128枚・ミラクル256枚・ギミック256枚、全1,152枚。秘宝ショップで12枚入りパックを開封できます。'},
 {date:'2026.11.24',title:'3つのモードと専用フィールド',text:'ソロ・マルチ・ランクをメニューから選択。マルチはルームコードで1対1、ランクは60秒マッチしない場合にBOT戦へ切り替わります。'},
 {date:'2026.11.24',title:'対戦デッキは32枚＋4枚・同名2枚まで',text:'通常デッキ32枚と、合成魔獣の特殊デッキ4枚を使います。通常・特殊ともに、同じカードは2枚までです。合成魔獣はアタック・ディフェンス型を兼ねます。'},
 {date:'2026.11.24',title:'6つのオリジンのプロフィール',text:'山・川・種・草・花・木からアイコンを選び、プレイヤー名を決めて開始。名前とアイコンは、あとからプロフィール設定で変更できます。'}
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
function mountNews(){
 const root=document.getElementById('news-root');if(!root)return;
 let paused=false;try{paused=localStorage.getItem('beast-king-news-paused')==='true';}catch{}
 const text=noticeItems().map(item=>`<span><b>${escape(item.title)}</b><i>✦</i></span>`).join('');
 root.innerHTML=`<aside class="news-ticker" aria-label="最新情報のお知らせ"><button class="news-open" type="button" aria-label="最新情報を全文読む"><span>NEWS</span><b>最新情報</b></button><div class="news-window" aria-hidden="true"><div class="news-track"><div class="news-run">${text}</div><div class="news-run">${text}</div></div></div><button class="news-toggle" type="button" aria-label="お知らせの流れを一時停止" aria-pressed="false"></button></aside>`;
 const toggle=root.querySelector('.news-toggle'),ticker=root.querySelector('.news-ticker');
 const update=()=>{ticker.classList.toggle('news-paused',paused);toggle.setAttribute('aria-pressed',String(paused));toggle.setAttribute('aria-label',paused?'お知らせの流れを再開':'お知らせの流れを一時停止');toggle.title=paused?'スクロール再開':'一時停止';toggle.innerHTML=paused?playIcon:pauseIcon;};
 toggle.addEventListener('click',()=>{paused=!paused;update();try{localStorage.setItem('beast-king-news-paused',String(paused));}catch{}});
 root.querySelector('.news-open').addEventListener('click',()=>{
  let dialog=document.getElementById('news-dialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='news-dialog';dialog.className='news-dialog';dialog.setAttribute('aria-labelledby','news-dialog-heading');dialog.innerHTML=`<form method="dialog"><button class="news-close" aria-label="お知らせを閉じる">×</button></form><p class="news-eyebrow">BEAST KING NEWS</p><h2 id="news-dialog-heading">最新情報</h2><div class="news-items">${noticeItems().map(item=>`<article><time>${escape(item.date)}</time><h3>${escape(item.title)}</h3><p>${escape(item.text)}</p></article>`).join('')}</div><form method="dialog"><button class="news-return">ゲームに戻る</button></form>`;document.body.append(dialog);dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});}
  const items=dialog.querySelector('.news-items');if(items)items.innerHTML=noticeItems().map(item=>`<article><time>${escape(item.date)}</time><h3>${escape(item.title)}</h3><p>${escape(item.text)}</p></article>`).join('');
  dialog.showModal();
 });
 update();
}
if(typeof document!=='undefined'){
 mountNews();
 const refresh=async()=>{if(document.hidden)return;try{const response=await fetch(ONLINE_API_BASE+'/public-status',{credentials:'omit',cache:'no-store'});if(!response.ok)return;const status=await response.json();if(status.ok===true)setPublicNotice(status);}catch{}};
 void refresh();setInterval(refresh,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
}

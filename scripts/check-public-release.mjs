// Read-only public deployment probe. No account tokens or private data are used.
import {CARDS} from '../catalog.js';
import {PREMIUM_CARD_IDS} from '../premium-cards.js';
import {PREMIUM_CARD_ART} from '../card-art-premium.js';
import {CARD_ART_FIFTH} from '../card-art-fifth.js';
import {CARD_FOREGROUND_MASKS} from '../card-foreground-masks.js';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const total=CARDS.length.toLocaleString('en-US');
const releaseRevision='20261125-37';
const sourceMatches=file=>async response=>(await response.text())===(await readFile(new URL('../'+file,import.meta.url),'utf8'));
const binaryMatches=file=>async response=>{
 const [actual,expected]=await Promise.all([response.arrayBuffer(),readFile(new URL('../'+file,import.meta.url))]);
 const hash=bytes=>createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
 return hash(actual)===hash(expected);
};
const image=async response=>{
 const bytes=new Uint8Array(await response.arrayBuffer());
 return bytes.length>10000&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
};
const checks=[
 ['main','https://www.beast-king.com/',r=>r.text().then(s=>{
  const styles=[...s.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map(match=>match[1]);
  return (s.includes('BEAST KING')||s.includes('ビーストキング'))&&s.includes(total)&&s.includes('cyber-ui.css?v='+releaseRevision)&&s.includes('modal-layout.css?v='+releaseRevision)&&s.includes('data-ui-theme="cyber"')&&s.includes('data-ui-finish="prestige"')&&styles.at(-1)==='prestige-ui.css?v='+releaseRevision;
 })],
 ['rebuild','https://www.beast-king.com/rebuild/',r=>r.text().then(s=>s.includes('2,304')&&s.includes('旧セーブ互換版'))],
 ['rebuild-js','https://www.beast-king.com/rebuild/app.js',sourceMatches('rebuild/app.js')],
 ['rebuild-about','https://www.beast-king.com/rebuild/about.html',r=>r.text().then(s=>s.includes('2,304'))],
 ['worker-health','https://beast-king.hisa-0128-1996.chatgpt.site/api/health',r=>r.json().then(x=>x.ok===true&&x.contentRevision===releaseRevision)],
 ['rebuild-cloud','https://beast-king.hisa-0128-1996.chatgpt.site/api/rebuild/status',r=>r.json().then(x=>x.ok===true&&x.cloudSaveVersion===1)]
];
if(CARDS.length>=4608)checks.push(
 ['expansion-catalog','https://www.beast-king.com/catalog.js',r=>r.text().then(s=>s.includes('additional-set-data.js'))],
 ['expansion-illustrations','https://www.beast-king.com/card-art-expansion.js',async r=>{
  const text=await r.text(),json=text.match(/Object\.freeze\((\{[\s\S]*\})\);?\s*$/)?.[1];
  if(!json)return false;
  const map=JSON.parse(json),expected=CARDS.filter(c=>!PREMIUM_CARD_IDS.includes(c.id)&&(c.setId==='BK03'||c.setId==='BK04'));
  return Object.keys(map).length===2304&&expected.every(c=>map[c.id]?.src&&map[c.id]?.sha256)&&new Set(Object.values(map).map(c=>c.src)).size===96;
 }],
 ['bk03-last-atlas','https://www.beast-king.com/assets/design-v3/cards/bk03-atlas-48.webp',image],
 ['bk04-last-atlas','https://www.beast-king.com/assets/design-v3/cards/bk04-atlas-48.webp',image],
 ['operator-recipe','https://www.beast-king.com/operator-deck.js?v='+releaseRevision,sourceMatches('operator-deck.js')],
 ['event-decks','https://www.beast-king.com/event-decks.js?v='+releaseRevision,sourceMatches('event-decks.js')],
 ['event-progress','https://www.beast-king.com/event-battles.js?v='+releaseRevision,sourceMatches('event-battles.js')]
);
for(const file of ['catalog.js','fifth-set-data.js','card-art-fifth.js','product-views.js','entry.js','rules-view.js','expansion-recipes.js','premium-cards.js','premium-deck.js','engine.js','shop.js','app.js','music.js','hand-inspector.js','card-art-user.js','card-art-premium.js','cyber-ui.css','cyber-shop.css','modal-layout.css','prestige-ui.css','loading.js','loading.css','account-views.js','account-views.css','news.js','experience-fx.js','cloud-sync.js','reading-pages.js','account-ui.js','fit-screen.js','viewport.js','overlay-dismiss.js','interaction-guard.js','experience-static.js','summon-scene.js','summon-art.js','summon-scene.css','battle-camera.js','battle-renderer.js','card-relief.js','card-relief.css','rarity-fx.js','rarity-fx.css','summon-foreground.js','summon-mask.js','card-foreground-masks.js','summon-geometry.js','orientation.css'])checks.push([file,'https://www.beast-king.com/'+file+'?v='+releaseRevision,sourceMatches(file)]);
for(const file of ['assets/audio/battle-event.mp3','assets/user-art/selva-20261124.png','assets/design-v3/packs/bk05-cover.webp','assets/design-v4/royal-archive.webp',...new Set(Object.values(CARD_ART_FIFTH).map(art=>art.src)),...Object.values(PREMIUM_CARD_ART).map(art=>art.src),...new Set(Object.values(CARD_FOREGROUND_MASKS).map(mask=>new URL(mask.src,'https://www.beast-king.com/').pathname.slice(1)))])checks.push([file,'https://www.beast-king.com/'+file+'?v='+releaseRevision,binaryMatches(file)]);
for(const file of ['index.html','about.html','manifest.webmanifest','rebuild/manifest.webmanifest','robots.txt','sitemap.xml'])checks.push(['seo:'+file,'https://www.beast-king.com/'+file,sourceMatches(file)]);
for(const file of ['assets/icon.svg','assets/favicon.svg','assets/favicon.ico','assets/favicon-16.png','assets/favicon-32.png','assets/favicon-48.png','assets/favicon-96.png','assets/apple-touch-icon.png','assets/icon-192.png','assets/icon-512.png','assets/icon-maskable-192.png','assets/icon-maskable-512.png','assets/design-v2/brand/crest.svg','assets/design-v2/brand/wordmark.svg','assets/brand/social-ogp-r37.jpg','assets/social-ogp.jpg'])checks.push(['brand:'+file,'https://www.beast-king.com/'+file,binaryMatches(file)]);
// Large artwork files must finish reading before another request takes the slot.
// Avoid exhausting connections and falsely failing an otherwise healthy release.
const results=new Array(checks.length);let nextCheck=0;
await Promise.all(Array.from({length:6},async()=>{
 while(nextCheck<checks.length){
  const index=nextCheck++,[name,url,verify]=checks[index];
  try{const r=await fetch(url,{signal:AbortSignal.timeout(30000),redirect:'follow',cache:'no-store'});results[index]={name,url,status:r.status,verified:r.ok&&await verify(r)}}catch(e){results[index]={name,url,verified:false,error:e.cause?.code||e.name}}
 }
}));
console.log('PUBLIC_RELEASE_RESULTS '+JSON.stringify(results));
if(process.argv.includes('--strict')&&results.some(r=>!r.verified))process.exitCode=1;

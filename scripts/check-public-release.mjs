// Read-only public deployment probe. No account tokens or private data are used.
import {CARDS} from '../catalog.js';
import {PREMIUM_CARD_IDS} from '../premium-cards.js';
import {PREMIUM_CARD_ART} from '../card-art-premium.js';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const total=CARDS.length.toLocaleString('en-US');
const releaseRevision='20261124-29';
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
 ['main','https://www.beast-king.com/',r=>r.text().then(s=>(s.includes('BEAST KING')||s.includes('ビーストキング'))&&s.includes(total)&&s.includes('imperial-ui.css'))],
 ['rebuild','https://www.beast-king.com/rebuild/',r=>r.text().then(s=>s.includes('2,304')&&s.includes('旧セーブ互換版'))],
 ['rebuild-js','https://www.beast-king.com/rebuild/app.js',r=>r.text().then(s=>s.includes('function render')&&s.includes('SECOND_REGALIA_ID'))],
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
for(const file of ['catalog.js','premium-cards.js','premium-deck.js','engine.js','shop.js','app.js','music.js','hand-inspector.js','card-art-user.js','card-art-premium.js'])checks.push([file,'https://www.beast-king.com/'+file+'?v='+releaseRevision,sourceMatches(file)]);
for(const file of ['assets/audio/battle-event.mp3','assets/user-art/selva-20261124.png',...Object.values(PREMIUM_CARD_ART).map(art=>art.src)])checks.push([file,'https://www.beast-king.com/'+file+'?v='+releaseRevision,binaryMatches(file)]);
const results=await Promise.all(checks.map(async([name,url,verify])=>{
 try{const r=await fetch(url,{signal:AbortSignal.timeout(9000),redirect:'follow',cache:'no-store'});return {name,url,status:r.status,verified:r.ok&&await verify(r)}}catch(e){return {name,url,verified:false,error:e.cause?.code||e.name}}
}));
console.log('PUBLIC_RELEASE_RESULTS '+JSON.stringify(results));
if(process.argv.includes('--strict')&&results.some(r=>!r.verified))process.exitCode=1;

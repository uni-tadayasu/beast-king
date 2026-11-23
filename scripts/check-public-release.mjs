// Read-only public deployment probe. No account tokens or private data are used.
const checks=[
 ['legacy','https://www.beast-king.com/',r=>r.text().then(s=>s.includes('BEAST KING')||s.includes('ビーストキング'))],
 ['rebuild','https://www.beast-king.com/rebuild/',r=>r.text().then(s=>s.includes('2,304')&&s.includes('先行公開'))],
 ['rebuild-js','https://www.beast-king.com/rebuild/app.js',r=>r.text().then(s=>s.includes('function render')&&s.includes('SECOND_REGALIA_ID'))],
 ['rebuild-about','https://www.beast-king.com/rebuild/about.html',r=>r.text().then(s=>s.includes('2,304'))],
 ['worker-health','https://beast-king.hisa-0128-1996.chatgpt.site/api/health',r=>r.json().then(x=>x.ok===true)],
 ['rebuild-cloud','https://beast-king.hisa-0128-1996.chatgpt.site/api/rebuild/status',r=>r.json().then(x=>x.ok===true&&x.cloudSaveVersion===1)]
];
const results=await Promise.all(checks.map(async([name,url,verify])=>{
 try{const r=await fetch(url,{signal:AbortSignal.timeout(9000),redirect:'follow',cache:'no-store'});return {name,url,status:r.status,verified:r.ok&&await verify(r)}}catch(e){return {name,url,verified:false,error:e.cause?.code||e.name}}
}));
console.log('PUBLIC_RELEASE_RESULTS '+JSON.stringify(results));
if(process.argv.includes('--strict')&&results.some(r=>!r.verified))process.exitCode=1;

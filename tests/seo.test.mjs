import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {guideSectionIndex} from '../guide-pages.js';

const run=promisify(execFile),script=fileURLToPath(new URL('../scripts/configure-seo.mjs',import.meta.url));
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'beast-seo-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'rebuild'));
 for(const [file,path] of [['index.html',''],['about.html','about.html'],['rebuild/index.html','rebuild/'],['rebuild/about.html','rebuild/about.html'],['404.html','404.html']]){
  const url='https://old.example/beast/'+path;
  await writeFile(join(root,file),`<html><head><title>Beast King</title><link rel="canonical" href="${url}"><link rel="canonical" href="https://wrong.invalid/#screen"><meta name="robots" content="index,follow"><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'WebPage',url,'@id':url+'#page',isPartOf:{'@id':'https://old.example/beast/#website'}})}</script></head><body>Guide</body></html>`);
 }
 return root;
}

test('SEO build emits one canonical, isolates legacy saves from indexing, and excludes errors from sitemap',async t=>{
 const root=await fixture(t);
 await run(process.execPath,[script,'https://www.beast-king.com/',root]);
 const main=await readFile(join(root,'index.html'),'utf8'),guide=await readFile(join(root,'about.html'),'utf8');
 assert.equal((main.match(/rel="canonical"/g)||[]).length,1);assert(main.includes('href="https://www.beast-king.com/"'));assert(guide.includes('href="https://www.beast-king.com/about.html"'));
 const legacy=await readFile(join(root,'rebuild/about.html'),'utf8'),legacyEntry=await readFile(join(root,'rebuild/index.html'),'utf8');
 for(const html of [legacy,legacyEntry])assert(html.includes('name="robots" content="noindex,follow"'));
 assert(legacy.includes('"@id":"https://www.beast-king.com/rebuild/about.html#page"'));
 assert(legacy.includes('"@id":"https://www.beast-king.com/#website"'));
 assert(legacyEntry.includes('href="https://www.beast-king.com/rebuild/"'));
 const missing=await readFile(join(root,'404.html'),'utf8');assert(!missing.includes('rel="canonical"'));assert(missing.includes('noindex,follow'));
 const sitemap=await readFile(join(root,'sitemap.xml'),'utf8');assert.equal((sitemap.match(/<loc>/g)||[]).length,2);assert(!sitemap.includes('rebuild'));assert(!sitemap.includes('404'));assert(!sitemap.includes('#'));
 const robots=await readFile(join(root,'robots.txt'),'utf8');assert(robots.includes('Allow: /'));assert(!robots.includes('Disallow: /rebuild'));assert(robots.includes('https://www.beast-king.com/sitemap.xml'));
});

test('bad structured data fails before any SEO file is rewritten',async t=>{
 const root=await fixture(t),before=await readFile(join(root,'index.html'),'utf8');
 await writeFile(join(root,'about.html'),'<html><head><script type="application/ld+json">broken</script></head></html>');
 await assert.rejects(run(process.execPath,[script,'https://www.beast-king.com/',root]),/JSON-LD/);
 assert.equal(await readFile(join(root,'index.html'),'utf8'),before);
});

test('guide deep links select real sections and recover from malformed fragments',()=>{
 const sections=['welcome','start','attack','fusion','save'];
 assert.equal(guideSectionIndex(sections,'#fusion'),3);assert.equal(guideSectionIndex(sections,'#attack'),2);
 for(const hash of ['','#unknown','#%ZZ'])assert.equal(guideSectionIndex(sections,hash),0);
});

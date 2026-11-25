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
const production='https://www.beast-king.com/',socialPath='assets/brand/social-ogp-r37.jpg';
const pagePaths=[['index.html',''],['about.html','about.html'],['rebuild/index.html','rebuild/'],['rebuild/about.html','rebuild/about.html'],['404.html','404.html']];
const tags=(html,name)=>[...html.matchAll(new RegExp('<'+name+'\\b[^>]*>','gi'))].map(([tag])=>Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map(([,key,,value])=>[key,value])));
const meta=(html,attribute,key)=>tags(html,'meta').filter(tag=>tag[attribute]===key).map(tag=>tag.content);
const structured=html=>[...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(([,json])=>JSON.parse(json));
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'beast-seo-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'rebuild'));
 for(const [file,path] of pagePaths){
  const url='https://old.example/beast/'+path;
  const data={'@context':'https://schema.org','@type':'WebPage',url,'@id':url+'#page',isPartOf:{'@id':'https://old.example/beast/#website'},image:['https://old.example/beast/assets/social-ogp.jpg?v=20261124-28',{'@type':'ImageObject',url:'https://old.example/beast/'+socialPath,contentUrl:'https://old.example/beast/assets/social-ogp.png#poster'}],sameAs:'https://external.example/reference'};
  await writeFile(join(root,file),`<html><head><title>Beast King</title><link rel="canonical" href="${url}"><link rel="canonical" href="https://wrong.invalid/#screen"><meta name="robots" content="index,follow"><meta property="og:image" content="https://old.example/beast/assets/social-ogp.jpg"><meta property="og:image" content="https://wrong.invalid/duplicate.jpg"><script type="application/ld+json">${JSON.stringify(data)}</script></head><body>Guide</body></html>`);
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

test('SEO relocation round-trips root and subpath URLs and converges old and new social images',async t=>{
 const root=await fixture(t),files=[...pagePaths.map(([file])=>file),'robots.txt','sitemap.xml'];
 let previous;
 for(const [index,argument] of ['https://preview.example/cards','https://preview.example/cards',production].entries()){
  await run(process.execPath,[script,argument,root]);
  const base=argument.endsWith('/')?argument:argument+'/',image=new URL(socialPath,base).href;
  const output=Object.fromEntries(await Promise.all(files.map(async file=>[file,await readFile(join(root,file),'utf8')])));
  if(index===1)assert.deepEqual(output,previous,'A second run must not alter already configured output');
  for(const [file,path] of pagePaths){
   const html=output[file],url=new URL(path,base).href,canonical=tags(html,'link').filter(tag=>tag.rel==='canonical');
   assert.deepEqual(canonical.map(tag=>tag.href),file==='404.html'?[]:[url]);
   assert.deepEqual(meta(html,'property','og:url'),[url]);
   for(const [attribute,key,value] of [['property','og:image',image],['name','twitter:image',image],['property','og:image:width','1200'],['property','og:image:height','630'],['property','og:image:type','image/jpeg']])assert.deepEqual(meta(html,attribute,key),[value]);
   const alt=meta(html,'property','og:image:alt');assert.equal(alt.length,1);assert.match(alt[0],/金の王冠/);assert.deepEqual(meta(html,'name','twitter:image:alt'),alt);
   const [data]=structured(html);
   assert.equal(data.url,url);assert.equal(data['@id'],url+'#page');assert.equal(data.isPartOf['@id'],base+'#website');
   assert.equal(data.image[0],image);assert.equal(data.image[1].url,image);assert.equal(data.image[1].contentUrl,image);
   assert.equal(data['@context'],'https://schema.org');assert.equal(data.sameAs,'https://external.example/reference');
  }
  assert(output['sitemap.xml'].includes('<loc>'+base+'</loc>'));assert(output['sitemap.xml'].includes('<loc>'+base+'about.html</loc>'));
  assert(output['robots.txt'].includes('Sitemap: '+base+'sitemap.xml'));
  previous=output;
 }
});

test('published page metadata uses the current shared image and stable branded icon URLs',async()=>{
 const expectedIcons=['assets/favicon.ico','assets/favicon-48.png','assets/favicon-96.png','assets/favicon.svg','assets/apple-touch-icon.png'];
 const titles=[];
 for(const [file,path] of pagePaths){
  const html=await readFile(new URL('../'+file,import.meta.url),'utf8'),title=html.match(/<title>(.*?)<\/title>/s)?.[1],pageUrl=new URL(path,production);
  assert.ok(title?.includes('ビーストキング')&&title.includes('BEAST KING'),file+' has both recognizable brand names');titles.push(title);
  assert.deepEqual(meta(html,'property','og:title'),[title]);assert.deepEqual(meta(html,'name','twitter:title'),[title]);
  assert.deepEqual(meta(html,'property','og:site_name'),['ビーストキング']);
  for(const [attribute,key] of [['property','og:image'],['name','twitter:image']])assert.deepEqual(meta(html,attribute,key),[new URL(socialPath,production).href]);
  assert.deepEqual(meta(html,'name','twitter:image:alt'),meta(html,'property','og:image:alt'));assert.equal(meta(html,'property','og:image:alt').length,1);
  const icons=tags(html,'link').filter(tag=>['icon','apple-touch-icon'].includes(tag.rel));
  assert.deepEqual(icons.map(tag=>{const url=new URL(tag.href,pageUrl);assert.equal(url.origin,new URL(production).origin);assert.equal(url.search,'');assert.equal(url.hash,'');return url.pathname.slice(1);}),expectedIcons);
  assert.equal(icons.find(tag=>tag.href.endsWith('favicon-96.png')).sizes,'96x96');
  const documents=structured(html),graph=documents.flatMap(data=>data['@graph']||[]),page=graph.find(node=>['WebPage','AboutPage'].includes(node['@type']));
  if(page){
   const image=graph.find(node=>node['@id']===page.primaryImageOfPage?.['@id']);
   assert.equal(image?.['@type'],'ImageObject');assert.equal(image.contentUrl,new URL(socialPath,production).href);assert.deepEqual([image.width,image.height,image.encodingFormat],[1200,630,'image/jpeg']);
  }
  if(file==='index.html'){
   const site=graph.find(node=>node['@type']==='WebSite'),game=graph.find(node=>Array.isArray(node['@type'])&&node['@type'].includes('VideoGame'));
   assert.equal(site.name,'ビーストキング');assert.equal(site.alternateName,'BEAST KING');
   assert.equal(game.isAccessibleForFree,true);assert.equal(Number(game.offers.price),0);assert.equal(game.offers.priceCurrency,'JPY');
   assert.equal(game.image['@id'],page.primaryImageOfPage['@id']);assert.equal(game.aggregateRating,undefined);assert.equal(game.review,undefined);
   assert(!JSON.stringify(documents).includes('SearchAction'));
  }
 }
 assert.equal(new Set(titles).size,pagePaths.length,'Each page retains a distinct purpose');
});

test('main and legacy manifests keep app identity and separate regular and maskable icon files',async()=>{
 for(const [file,path] of [['manifest.webmanifest',''],['rebuild/manifest.webmanifest','rebuild/']]){
  const manifest=JSON.parse(await readFile(new URL('../'+file,import.meta.url),'utf8')),manifestUrl=new URL(file,production);
  for(const key of ['id','start_url','scope']){assert.equal(manifest[key],'./');assert.equal(new URL(manifest[key],manifestUrl).href,new URL(path,production).href);}
  assert.equal(manifest.icons.length,4);assert.equal(new Set(manifest.icons.map(icon=>icon.src)).size,4);
  for(const purpose of ['any','maskable'])for(const size of [192,512]){
   const icon=manifest.icons.find(icon=>icon.purpose===purpose&&icon.sizes===size+'x'+size);assert.ok(icon,purpose+' '+size+' icon');
   const asset='assets/'+(purpose==='any'?'icon-':'icon-maskable-')+size+'.png';
   assert.equal(new URL(icon.src,manifestUrl).href,new URL(asset,production).href);assert.equal(icon.type,'image/png');
   const bytes=await readFile(new URL('../'+asset,import.meta.url));assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
   assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],[size,size],asset+' actual dimensions match its manifest');
  }
 }
});

test('guide deep links select real sections and recover from malformed fragments',()=>{
 const sections=['welcome','start','attack','fusion','save'];
 assert.equal(guideSectionIndex(sections,'#fusion'),3);assert.equal(guideSectionIndex(sections,'#attack'),2);
 for(const hash of ['','#unknown','#%ZZ'])assert.equal(guideSectionIndex(sections,hash),0);
});

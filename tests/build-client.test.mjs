import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,readdir,rm,symlink,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildClient} from '../scripts/build-client.mjs';

async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'beast-client-test-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const write=async(path,data)=>{await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),data);};
 const page='<html><head><link rel="canonical" href="https://old.example/"></head><body><script type="module" src="app.js"></script></body></html>';
 const entries={
  'index.html':page,'about.html':page,'app.js':"import {cards} from './catalog.js'; export const total=cards.length;",'catalog.js':'export const cards=[];',
  'CNAME':'www.beast-king.com\n','.nojekyll':'','robots.txt':'old robots','sitemap.xml':'old sitemap','manifest.webmanifest':'{"icons":[]}',
  'rebuild/index.html':'<html><head></head><body>Saved game</body></html>','rebuild/profile.js':'export const saved=true;',
  'rebuild/README.md':'private implementation notes','assets/icon.svg':'<svg xmlns="http://www.w3.org/2000/svg"/>',
  'assets/production.json':'{"private":"art production metadata"}',
  'server/account.js':'private server source','tests/case.js':'private tests','scripts/secret.js':'private tooling',
  'design-kit/prompts.json':'private prompts','docs/ARTWORK.md':'private notes','.env':'PRIVATE=not-for-pages',
  '.openai/hosting.json':'{"private":"hosting metadata"}','package.json':'{"private":true}',
  'dist/server/index.js':'existing worker bundle','dist/.openai/hosting.json':'existing worker metadata',
 };
 for(const [path,data] of Object.entries(entries))await write(path,data);
 return {root,write,page};
}

test('browser packaging excludes private source and production metadata, keeps saved-game modules and Worker output',async t=>{
 const {root,page}=await fixture(t);
 const result=await buildClient(root),output=result.directory;
 assert.equal(await readFile(join(output,'assets/icon.svg'),'utf8'),'<svg xmlns="http://www.w3.org/2000/svg"/>');
 assert.equal(await readFile(join(output,'rebuild/profile.js'),'utf8'),'export const saved=true;');
 const paths=await readdir(output,{recursive:true});
 for(const name of ['server','tests','scripts','design-kit','docs','.openai','.env','package.json','assets/production.json','rebuild/README.md'])assert(!paths.includes(name),'Unexpected private file: '+name);
 assert.equal(await readFile(join(root,'dist/server/index.js'),'utf8'),'existing worker bundle');
 assert.equal(await readFile(join(root,'dist/.openai/hosting.json'),'utf8'),'existing worker metadata');
 assert((await readFile(join(output,'index.html'),'utf8')).includes('href="https://www.beast-king.com/"'));
 assert((await readFile(join(output,'robots.txt'),'utf8')).includes('https://www.beast-king.com/sitemap.xml'));
 assert.equal(await readFile(join(root,'index.html'),'utf8'),page,'Packaging must not rewrite source SEO');
});

test('a missing browser module fails without replacing the last good package',async t=>{
 const {root,write}=await fixture(t);
 const {directory}=await buildClient(root),before=await readFile(join(directory,'app.js'),'utf8');
 await write('app.js',"import './missing.js';");
 await assert.rejects(buildClient(root),/Missing browser dependency: app\.js -> \.\/missing\.js/);
 assert.equal(await readFile(join(directory,'app.js'),'utf8'),before);
});

test('a fresh browser entry rejects stale module, page, and manifest cache queries before replacing output',async t=>{
 const {root,write,page}=await fixture(t);
 await write('index.html',page.replace('src="app.js"','src="app.js?v=20261125-35"'));
 await write('app.js',"import {cards} from './catalog.js?v=20261125-35'; export const total=cards.length;");
 const {directory}=await buildClient(root),before=await readFile(join(directory,'app.js'),'utf8');
 for(const [path,valid,stale] of [
  ['app.js',before,before.replace('20261125-35','20261124-28')],
  ['about.html',page,page.replace('src="app.js"','src="app.js?v=20261124-28"')],
  ['rebuild/profile.js','export const saved=true;',"import '../catalog.js?v=20261124-26';"],
  ['manifest.webmanifest','{"icons":[]}','{"icons":[{"src":"assets/icon.svg?v=20261124-28"}]}'],
 ]){
  await write(path,stale);
  await assert.rejects(buildClient(root),/Mixed browser cache revisions/);
  assert.equal(await readFile(join(directory,'app.js'),'utf8'),before);
  await write(path,valid);
 }
 // Asset hashes are independently versioned and do not share release numbers.
 await write('manifest.webmanifest','{"icons":[{"src":"assets/icon.svg?v=acf789012345"}]}');
 await buildClient(root);
});

test('an asset symlink cannot copy private data into the browser package',async t=>{
 const {root}=await fixture(t);
 await symlink(join(root,'.env'),join(root,'assets/leak.svg'));
 await assert.rejects(buildClient(root),/Public files must be regular files/);
});

test('browser packaging ships public mask media without inference code or models',async t=>{
 const {root,write}=await fixture(t);
 await write('card-foreground-masks.js','export const CARD_FOREGROUND_MASKS=Object.freeze({});');
 await write('assets/foreground/atlas-001.png','public grayscale mask atlas fixture');
 await write('assets/summon-runtime/ort.wasm.min.mjs','obsolete inference code');
 await write('assets/summon-runtime/ort-wasm-simd-threaded.wasm','obsolete inference binary');
 await write('assets/summon-runtime/u2netp-192.onnx','obsolete model');
 await write('assets/summon-runtime/LICENSE-ONNX.txt','obsolete runtime attribution');
 await write('assets/unreviewed.wasm','not browser media');
 await write('assets/unreviewed.onnx','not browser media');
 await write('assets/summon-runtime/unreviewed.mjs','not reviewed code');
 const {directory}=await buildClient(root),paths=await readdir(directory,{recursive:true});
 for(const name of ['card-foreground-masks.js','assets/foreground/atlas-001.png'])assert(paths.includes(name));
 for(const name of ['assets/unreviewed.wasm','assets/unreviewed.onnx','assets/summon-runtime/unreviewed.mjs','assets/summon-runtime/ort.wasm.min.mjs','assets/summon-runtime/ort-wasm-simd-threaded.wasm','assets/summon-runtime/u2netp-192.onnx','assets/summon-runtime/LICENSE-ONNX.txt'])assert(!paths.includes(name));
});

/** Package the browser application for GitHub Pages without publishing sources
 * used only by the Worker, tests, or artwork production. The independent Sites
 * Worker output at dist/server and its deployment metadata are left intact.
 */
import assert from 'node:assert/strict';
import {copyFile,lstat,mkdir,mkdtemp,readFile,readdir,rename,rm} from 'node:fs/promises';
import {dirname,extname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const scriptRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const run=promisify(execFile);
const browserExtensions=new Set(['.html','.js','.css','.webmanifest']);
const mediaExtensions=new Set(['.svg','.webp','.png','.jpg','.jpeg','.ico','.mp3','.ogg','.wav','.woff','.woff2','.ttf']);
// Only these reviewed inference assets may ship as code/binaries under assets.
const summonRuntimeFiles=new Set(['ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm','u2netp.onnx','u2netp-192.onnx','LICENSE-ONNX.txt','LICENSE-U2NET.txt','NOTICE.txt'].map(name=>'assets/summon-runtime/'+name));
const rootFiles=new Set(['CNAME','.nojekyll','robots.txt','sitemap.xml']);
const hidden=name=>name.startsWith('.')||/^__qa/i.test(name);
const exists=path=>lstat(path).then(()=>true).catch(error=>{if(error.code==='ENOENT')return false;throw error;});

export async function buildClient(sourceRoot=scriptRoot){
 const root=resolve(sourceRoot),dist=join(root,'dist'),output=join(dist,'client');
 assert.equal((await readFile(join(root,'CNAME'),'utf8')).trim(),'www.beast-king.com','Keep the established production domain in CNAME.');
 const files=new Map();
 async function collect(directory,prefix,kind){
  for(const entry of await readdir(directory,{withFileTypes:true})){
   const name=entry.name,path=prefix?prefix+'/'+name:name,source=join(directory,name);
   if(hidden(name)&&!(kind==='root'&&name==='.nojekyll'))continue;
   if(kind==='root'&&['assets','rebuild'].includes(name)){
    assert(entry.isDirectory()&&!entry.isSymbolicLink(),'Public asset directories must be real directories: '+path);
    await collect(source,path,name);continue;
   }
   if(kind==='root'&&!browserExtensions.has(extname(name))&&!rootFiles.has(name))continue;
   if(kind!=='root'&&entry.isDirectory()){await collect(source,path,kind);continue;}
   if(kind==='assets'&&!mediaExtensions.has(extname(name))&&!summonRuntimeFiles.has(path))continue;
   if(kind==='rebuild'&&!browserExtensions.has(extname(name)))continue;
   assert(entry.isFile()&&!entry.isSymbolicLink(),'Public files must be regular files: '+path);
   files.set(path,source);
  }
 }
 await collect(root,'','root');
 for(const name of ['index.html','about.html','app.js','catalog.js','CNAME','robots.txt','sitemap.xml','manifest.webmanifest','rebuild/index.html'])assert(files.has(name),'Missing public entry: '+name);

 // A fresh entry must not pull rules or UI from an older browser cache. Keep
 // dated release queries aligned while allowing content-addressed art hashes.
 const entry=await readFile(files.get('index.html'),'utf8');
 const cacheRevision=entry.match(/<script\b[^>]*\bsrc\s*=\s*['"](?:\.\/)?app\.js\?v=(\d{8}-\d+)['"]/i)?.[1];

 // Fail before replacing the last output if an import or linked asset is lost.
 const localUrl=(owner,value)=>{
  if(!value||value.startsWith('#')||/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)||value.includes('${'))return;
  const url=new URL(value,'https://package.invalid/'+owner);
  if(url.origin!=='https://package.invalid')return;
  const revision=url.searchParams.get('v');
  if(cacheRevision&&/^\d{8}-\d+$/.test(revision||''))assert.equal(revision,cacheRevision,'Mixed browser cache revisions: '+owner+' -> '+value+' (entry '+cacheRevision+')');
  let path=decodeURIComponent(url.pathname).slice(1);
  if(path.endsWith('/')||!path)path+='index.html';
  assert(files.has(path),'Missing browser dependency: '+owner+' -> '+value);
 };
 for(const [path,source] of files){
  const extension=extname(path);if(!['.js','.mjs','.html','.css','.webmanifest'].includes(extension))continue;
  const text=await readFile(source,'utf8');
  if(extension==='.js'||extension==='.mjs')for(const match of text.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)(['"])(\.{1,2}\/[^'"]+)\1/g))localUrl(path,match[2]);
  if(extension==='.html')for(const match of text.matchAll(/\b(?:src|href)\s*=\s*(['"])([^'"]+)\1/g))localUrl(path,match[2]);
  if(extension==='.css')for(const match of text.matchAll(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g))localUrl(path,match[2]);
  if(extension==='.webmanifest')for(const icon of JSON.parse(text).icons||[])localUrl(path,icon.src);
 }
 await mkdir(dist,{recursive:true});
 assert((await lstat(dist)).isDirectory()&&!(await lstat(dist)).isSymbolicLink(),'dist must be a real build directory.');
 const stage=await mkdtemp(join(dist,'.client-stage-'));
 try{
  for(const [path,source] of files){const destination=join(stage,path);await mkdir(dirname(destination),{recursive:true});await copyFile(source,destination);}
  if(!files.has('.nojekyll'))throw new Error('The public .nojekyll marker is missing.');
  await run(process.execPath,[join(scriptRoot,'scripts/configure-seo.mjs'),'https://www.beast-king.com/',stage]);
  if(await exists(output))assert((await lstat(output)).isDirectory()&&!(await lstat(output)).isSymbolicLink(),'Refusing to replace a non-directory output.');
  await rm(output,{recursive:true,force:true});await rename(stage,output);
  return {directory:output,files:files.size,canonical:'https://www.beast-king.com/',workerOutputPreserved:true};
 }finally{await rm(stage,{recursive:true,force:true});}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,2,'Usage: node scripts/build-client.mjs');
 console.log(JSON.stringify(await buildClient(),null,2));
}

/** Prepare a flattened GitHub Pages main/root checkout. No Git or network I/O.
 * Usage: node scripts/github-snapshot.mjs /absolute/path/to/beastking-github
 * Existing .git, .github, CNAME and .nojekyll are kept byte-for-byte. A populated
 * destination must already be a BEAST KING checkout; unrelated folders fail.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,lstat,realpath,rm,rename,mkdtemp} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute,join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';

assert(process.argv.length<=3,'Usage: node scripts/github-snapshot.mjs [target-directory]');
const root=await realpath(resolve(dirname(fileURLToPath(import.meta.url)),'..'));
const requested=resolve(process.argv[2]??join(dirname(root),'beast-king-pages'));
const exists=async path=>lstat(path).then(()=>true).catch(error=>{if(error.code==='ENOENT')return false;throw error;});
const beneath=(base,path)=>{const rel=relative(base,path);return rel===''||(!rel.startsWith('..')&&!isAbsolute(rel));};
await mkdir(dirname(requested),{recursive:true});
const parent=await realpath(dirname(requested)),target=join(parent,basename(requested));
assert(!beneath(root,target)&&!beneath(target,root),'Snapshot target must be outside, and not above, the source checkout');
if(await exists(target))assert((await lstat(target)).isDirectory()&&!(await lstat(target)).isSymbolicLink(),'Target must be a real directory');
const preserved=new Set(['.git','.github','CNAME','.nojekyll']);
const existing=await exists(target)?await readdir(target):[];
if(existing.some(name=>!preserved.has(name))){
  let projectName=null;try{projectName=JSON.parse(await readFile(join(target,'package.json'),'utf8')).name;}catch{}
  let gamePage=false;try{gamePage=/BEAST KING|ビーストキング/.test(await readFile(join(target,'index.html'),'utf8'));}catch{}
  assert(projectName==='beast-king'||gamePage,'Refusing to replace an unrelated populated directory');
}
const saved=new Map();
for(const name of ['CNAME','.nojekyll'])if(await exists(join(target,name))){
  assert((await lstat(join(target,name))).isFile(),`${name} must be a regular file`);
  saved.set(name,await readFile(join(target,name)));
}
const rootFrontend=await exists(join(root,'catalog.js'));
const frontend=rootFrontend?root:join(root,'dist');
assert(await exists(join(frontend,'index.html')),'Frontend index.html is missing');
const skipRoot=new Set(['server','.openai','_appgen_meta','.git','.github','dist','scripts','tests','drizzle','node_modules','.sites-runtime','.wrangler','.cache','README.md','CONTRACT.md','package.json','package-lock.json']);
const files=new Map();
const isQa=path=>path.split('/').some(segment=>/^__qa/i.test(segment));
async function collect(directory,prefix='',frontendTree=false){
  for(const name of await readdir(directory)){
    if(frontendTree&&prefix===''&&(skipRoot.has(name)||(name.startsWith('.')&&name!=='.nojekyll')))continue;
    const path=prefix?prefix+'/'+name:name;if(isQa(path))continue;
    const source=join(directory,name),info=await lstat(source);
    assert(!info.isSymbolicLink(),`Source snapshot cannot contain symlinks: ${path}`);
    if(info.isDirectory())await collect(source,path,frontendTree);
    else{assert(info.isFile(),`Source is not a regular file: ${path}`);files.set(path,source);}
  }
}
await collect(frontend,'',true);
for(const directory of ['server','tests','scripts','drizzle'])await collect(join(root,directory),directory);
if(await exists(join(root,'design-kit')))await collect(join(root,'design-kit'),'design-kit');
for(const file of ['package.json','package-lock.json','README.md','CONTRACT.md'])if(await exists(join(root,file)))files.set(file,join(root,file));
files.set('.openai/hosting.json',join(root,'.openai/hosting.json'));
for(const name of saved.keys())files.delete(name);

function rewriteSource(path,text){
  // Only module specifiers and module-relative URL literals change. General
  // documentation wording stays untouched for the release owner's review.
  text=text.replace(/(\bfrom\s*['"]|\bimport\s*\(\s*['"]|\bnew\s+URL\(\s*['"])(\.\.\/)dist\//g,'$1$2');
  if(path==='scripts/configure-seo.mjs')text=text.replace("const dist = resolve(root, 'dist');",'const dist = root;');
  return text;
}
function rewriteReadme(text){
  return text.replace(/`dist\/(?!server\/)([^`]+)`/g,'`$1`');
}
const stage=await mkdtemp(join(parent,'.beastking-snapshot-'));
try{
  for(const [path,source] of files){
    let data=await readFile(source);
    if(/\.(?:mjs|js)$/.test(path)&&/^(?:server|tests|scripts)\//.test(path))data=Buffer.from(rewriteSource(path,data.toString('utf8')));
    if(path==='README.md')data=Buffer.from(rewriteReadme(data.toString('utf8')));
    await mkdir(dirname(join(stage,path)),{recursive:true});await writeFile(join(stage,path),data);
  }
  if(!saved.has('.nojekyll')&&!files.has('.nojekyll'))await writeFile(join(stage,'.nojekyll'),'');
  assert(await exists(join(stage,'index.html'))&&await exists(join(stage,'catalog.js'))&&await exists(join(stage,'server/worker.js')),'Incomplete snapshot');
  assert(!(await exists(join(stage,'dist'))),'Generated dist output must not be flattened into publication sources');
  await mkdir(target,{recursive:true});
  for(const name of await readdir(target))if(!preserved.has(name))await rm(join(target,name),{recursive:true,force:true});
  for(const name of await readdir(stage)){
    if(preserved.has(name)&&await exists(join(target,name)))continue;
    await rename(join(stage,name),join(target,name));
  }
  for(const [name,original] of saved)assert.deepEqual(await readFile(join(target,name)),original,`${name} changed`);
  console.log(JSON.stringify({target,files:files.size,preserved:[...preserved].filter(name=>existing.includes(name)),layout:'GitHub Pages main/root',generatedWorkerCopied:false,readme:'Frontend file links match the flattened repository'},null,2));
}finally{await rm(stage,{recursive:true,force:true});}

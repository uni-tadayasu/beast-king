/** Dependency-free build for the Worker modules and their D1 schema.
 * Supported source syntax is deliberately small: relative named imports,
 * exported const/function/class declarations, and one expression default export.
 * Unsupported module syntax fails closed instead of producing a partial bundle.
 * Browser sources may live in dist/ (Sites checkout) or at the repository root
 * (GitHub Pages main/root). Existing browser files are never rewritten.
 */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,readdir,stat} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readPrivateOperatorArtwork,injectPrivateOperatorArtwork} from './private-operator-art.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=new Set(process.argv.slice(2));
assert([...args].every(a=>['--init-migration','--check-schema'].includes(a)),'Supported options: --init-migration, --check-schema');
const read=path=>readFile(resolve(root,path),'utf8');
const write=async(path,text)=>{await mkdir(dirname(resolve(root,path)),{recursive:true});await writeFile(resolve(root,path),text);};
const json=value=>JSON.stringify(value,null,2)+'\n';
const sha=value=>createHash('sha256').update(value).digest('hex');
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const cleanSql=sql=>sql.replace(/^\s*--.*$/gm,'').replace(/\bIF\s+NOT\s+EXISTS\b/gi,'').replace(/\bPRAGMA\s+foreign_keys\s*=\s*ON\s*;/gi,'').trim();

function checkExpressions(sql){
  const expressions=[],pattern=/\bCHECK\s*\(/gi;let match;
  while((match=pattern.exec(sql))){
    let depth=1,quoted=false,index=pattern.lastIndex,start=index;
    for(;index<sql.length&&depth;index++){
      const ch=sql[index];
      if(ch==="'"){if(quoted&&sql[index+1]==="'"){index++;continue;}quoted=!quoted;}
      else if(!quoted){if(ch==='(')depth++;if(ch===')')depth--;}
    }
    assert.equal(depth,0,'Unbalanced CHECK constraint');
    expressions.push(sql.slice(start,index-1).trim());pattern.lastIndex=index;
  }
  return expressions;
}
function describeDatabase(db){
  const tables={};
  for(const table of db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()){
    const columns=db.prepare(`PRAGMA table_info(${quote(table.name)})`).all().map(c=>({name:c.name,type:c.type.toLowerCase(),notNull:Boolean(c.notnull),default:c.dflt_value,primaryKey:c.pk}));
    const indexes=db.prepare(`PRAGMA index_list(${quote(table.name)})`).all().map(index=>({name:index.name,origin:index.origin,unique:Boolean(index.unique),columns:db.prepare(`PRAGMA index_info(${quote(index.name)})`).all().sort((a,b)=>a.seqno-b.seqno).map(c=>c.name)})).sort((a,b)=>a.name.localeCompare(b.name));
    const foreignKeys=db.prepare(`PRAGMA foreign_key_list(${quote(table.name)})`).all().map(f=>({id:f.id,seq:f.seq,table:f.table,from:f.from,to:f.to,onUpdate:f.on_update.toLowerCase(),onDelete:f.on_delete.toLowerCase()})).sort((a,b)=>a.id-b.id||a.seq-b.seq);
    tables[table.name]={name:table.name,columns,indexes,foreignKeys,checks:checkExpressions(table.sql)};
  }
  return tables;
}
function drizzleSnapshot(tables){
  const snapshot={version:'6',dialect:'sqlite',id:randomUUID(),prevId:'00000000-0000-0000-0000-000000000000',tables:{},views:{},enums:{},_meta:{schemas:{},tables:{},columns:{}},internal:{indexes:{}}};
  for(const table of Object.values(tables)){
    const out={name:table.name,columns:{},indexes:{},foreignKeys:{},compositePrimaryKeys:{},uniqueConstraints:{},checkConstraints:{}};
    const pk=table.columns.filter(c=>c.primaryKey).sort((a,b)=>a.primaryKey-b.primaryKey).map(c=>c.name);
    for(const c of table.columns){
      const column={name:c.name,type:c.type,primaryKey:pk.length===1&&pk[0]===c.name,notNull:c.notNull,autoincrement:false};
      if(c.default!==null)column.default=/^-?\d+(?:\.\d+)?$/.test(c.default)?Number(c.default):c.default;
      out.columns[c.name]=column;
    }
    for(const index of table.indexes){
      if(index.origin==='pk')continue;
      if(index.origin==='u'){
        const name=`${table.name}_${index.columns.join('_')}_unique`;
        out.uniqueConstraints[name]={name,columns:index.columns};
      }else out.indexes[index.name]={name:index.name,columns:index.columns,isUnique:index.unique};
    }
    for(const id of new Set(table.foreignKeys.map(f=>f.id))){
      const parts=table.foreignKeys.filter(f=>f.id===id),f=parts[0],columnsFrom=parts.map(v=>v.from),columnsTo=parts.map(v=>v.to);
      const name=`${table.name}_${columnsFrom.join('_')}_${f.table}_${columnsTo.join('_')}_fk`;
      out.foreignKeys[name]={name,tableFrom:table.name,tableTo:f.table,columnsFrom,columnsTo,onDelete:f.onDelete,onUpdate:f.onUpdate};
    }
    if(pk.length>1){const name=`${table.name}_${pk.join('_')}_pk`;out.compositePrimaryKeys[name]={name,columns:pk};}
    table.checks.forEach((value,i)=>{const name=`${table.name}_check_${i+1}`;out.checkConstraints[name]={name,value};});
    snapshot.tables[table.name]=out;
  }
  return snapshot;
}
async function initializeMigration(schema){
  let entries=[];try{entries=await readdir(resolve(root,'drizzle'));}catch(error){if(error.code!=='ENOENT')throw error;}
  assert.equal(entries.length,0,'Initial migration already exists. Keep applied SQL and metadata immutable; append later migrations.');
  const db=new DatabaseSync(':memory:');let snapshot;
  try{db.exec(schema);snapshot=drizzleSnapshot(describeDatabase(db));}finally{db.close();}
  const tag='0000_beast_king_online';
  const statements=cleanSql(schema).split(';').map(s=>s.trim()).filter(Boolean);
  assert(statements.every(s=>/^CREATE\s+(?:TABLE|(?:UNIQUE\s+)?INDEX)\b/i.test(s)),'Initial migration must contain schema-only CREATE statements');
  await write(`drizzle/${tag}.sql`,statements.map(s=>s+';').join('\n--> statement-breakpoint\n')+'\n');
  await write('drizzle/meta/0000_snapshot.json',json(snapshot));
  await write('drizzle/meta/_journal.json',json({version:'7',dialect:'sqlite',entries:[{idx:0,version:'6',when:Date.now(),tag,breakpoints:true}]}));
  console.log(`Created schema-only initial migration: ${tag} (${Object.keys(snapshot.tables).length} tables)`);
}
async function validateMigrations(schema){
  const journal=JSON.parse(await read('drizzle/meta/_journal.json'));
  assert.equal(journal.version,'7');assert.equal(journal.dialect,'sqlite');assert(journal.entries.length>0);
  const expected=new DatabaseSync(':memory:'),actual=new DatabaseSync(':memory:');
  try{
    expected.exec(schema);let previousId='00000000-0000-0000-0000-000000000000';
    for(const [index,entry] of journal.entries.entries()){
      assert.equal(entry.idx,index);assert.equal(entry.version,'6');assert.equal(entry.breakpoints,true);assert(Number.isFinite(entry.when));assert(/^\d{4}_[A-Za-z0-9_]+$/.test(entry.tag));
      const sql=await read(`drizzle/${entry.tag}.sql`);
      for(const part of sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean)){
        const creates=/^CREATE\s+(?:TABLE|(?:UNIQUE\s+)?INDEX)\b/i.test(part);
        const adds=/^ALTER\s+TABLE\s+["`]?\w+["`]?\s+ADD\s+COLUMN\s+["`]?\w+["`]?\s+(?:TEXT|INTEGER|REAL|BLOB)\b/i.test(part);
        assert(creates||adds,'Migrations must contain bounded schema-only CREATE or ADD COLUMN statements');
        if(adds){
          if(/\bNOT\s+NULL\b/i.test(part))assert(/\bDEFAULT\s+(?:'(?:[^']|'')*'|[-+]?\d+(?:\.\d+)?)\s*(?:CHECK\b|;)/i.test(part),'NOT NULL additions require a constant non-null default');
          if(/\bREFERENCES\b/i.test(part))assert(!/\bNOT\s+NULL\b/i.test(part)&&(!/\bDEFAULT\b/i.test(part)||/\bDEFAULT\s+NULL\b/i.test(part)),'Added references must be nullable with a null default');
        }
        actual.exec(part);
      }
      const snapshot=JSON.parse(await read(`drizzle/meta/${String(index).padStart(4,'0')}_snapshot.json`));
      assert.equal(snapshot.version,'6');assert.equal(snapshot.dialect,'sqlite');assert.equal(snapshot.prevId,previousId);assert(/^[a-f0-9-]{36}$/i.test(snapshot.id));previousId=snapshot.id;
      const normalized=drizzleSnapshot(describeDatabase(actual));delete normalized.id;delete normalized.prevId;
      const saved={...snapshot};delete saved.id;delete saved.prevId;
      assert.deepEqual(saved,normalized,'Snapshot metadata must match the actual migration schema');
    }
    assert.deepEqual(describeDatabase(actual),describeDatabase(expected),'Migrations and server/schema.sql must describe the same schema');
    const tables=Object.keys(describeDatabase(actual));
    assert(['bk_profiles','bk_matches','bk_sessions','bk_cloud_saves','bk_operator','bk_reward_claims'].every(table=>tables.includes(table)),'Required online and account tables are missing');console.log(`Validated ${journal.entries.length} migrations, ${tables.length} tables, journal and SQLite snapshot`);
  }finally{expected.close();actual.close();}
}
async function bundleWorker(){
  const modules=[],loaded=new Map(),visiting=new Set();
  const privateArtwork=await readPrivateOperatorArtwork(root);
  const rootFrontend=await stat(resolve(root,'catalog.js')).then(s=>s.isFile()).catch(()=>false);
  const frontend=rootFrontend?'':'dist/';
  async function visit(file){
    file=resolve(root,file);const rel=relative(root,file);
    assert(!rel.startsWith('..')&&!isAbsolute(rel),'Module is outside the project');
    if(loaded.has(file))return loaded.get(file);
    assert(!visiting.has(file),'Circular modules are not supported by this focused build');visiting.add(file);
    const originalSource=await readFile(file,'utf8');
    const source=rel==='server/operator-art.js'?injectPrivateOperatorArtwork(originalSource,privateArtwork):originalSource,imports=[];
    const pattern=/^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2\s*;?\s*$/gm;
    let match;
    while((match=pattern.exec(source))){
      assert(match[3].startsWith('.'),'Worker must not retain external dependencies');
      // Browser imports may append a cache version. The Worker bundles the same physical source.
      const dependency=await visit(resolve(dirname(file),match[3].split(/[?#]/,1)[0]));
      const names=match[1].split(',').map(s=>s.trim()).filter(Boolean).map(name=>{
        assert(/^[A-Za-z_$][\w$]*(?:\s+as\s+[A-Za-z_$][\w$]*)?$/.test(name),'Unsupported import declaration');
        const [imported,local=imported]=name.split(/\s+as\s+/);assert(dependency.exports.includes(imported),`Missing module export ${imported}`);return imported===local?imported:`${imported}:${local}`;
      });
      imports.push(`const {${names.join(',')}}=__bkModule${dependency.id};`);
    }
    assert(!source.includes('__bkBundleDefault'),'Reserved bundler identifier used by source');
    let transformed=source.replace(pattern,'').replace(/^export\s+default\s+/gm,'const __bkBundleDefault = ').replace(/^export\s+(?=(?:const|(?:async\s+)?function|class)\b)/gm,'');
    assert(!/^\s*(?:import|export)\b/m.test(transformed),'Unsupported import/export syntax: '+rel);
    assert(!/\bimport\s*\(|\bimport\.meta\b/.test(transformed),'Dynamic imports and import.meta require a general-purpose bundler');
    const original=await import(pathToFileURL(file).href),exports=Object.keys(original),id=modules.length;
    const returned=exports.map(name=>`${JSON.stringify(name)}:${name==='default'?'__bkBundleDefault':name}`).join(',');
    const code=`// ${rel}\nconst __bkModule${id}=(()=>{\n${imports.join('\n')}\n${transformed}\nreturn Object.freeze({${returned}});\n})();\n`;
    const module={id,file,rel,exports,code,source,original};modules.push(module);loaded.set(file,module);visiting.delete(file);return module;
  }
  const entry=await visit('server/worker.js');
  const digest=sha(modules.map(m=>m.rel+'\n'+m.source).join('\n'));
  const named=entry.exports.filter(n=>n!=='default').map(name=>`export const ${name}=__bkModule${entry.id}.${name};`).join('\n');
  const bundle=`// BEAST KING Worker. Generated by scripts/build-online.mjs. Source SHA-256 ${digest}\n${modules.map(m=>m.code).join('\n')}\n${named}\nexport default __bkModule${entry.id}.default;\n`;
  const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
  const built=await import(url(bundle));assert.equal(typeof built.default?.fetch,'function');assert.deepEqual(Object.keys(built),entry.exports);
  const inspection=await import(url(bundle+'\nexport const __inspection=['+modules.map(m=>'__bkModule'+m.id).join(',')+'];\n'));
  for(const m of modules)assert.deepEqual(Object.keys(inspection.__inspection[m.id]),m.exports,'Bundled exports must match '+m.rel);
  if(privateArtwork){
    const artModule=modules.find(m=>m.rel==='server/operator-art.js');assert(artModule,'Private artwork module is missing');
    assert.equal(await inspection.__inspection[artModule.id].operatorRegaliaArtwork('build-validation'),privateArtwork,'Private illustration must be the automatic Worker default');
    assert.equal(await inspection.__inspection[artModule.id].operatorRegaliaArtwork(null),null,'An absent entitlement seed must not return artwork');
  }
  const catalog=modules.find(m=>m.file===resolve(root,frontend+'catalog.js')),engine=modules.find(m=>m.file===resolve(root,frontend+'engine.js'));assert(catalog&&engine);
  const builtCatalog=inspection.__inspection[catalog.id],builtEngine=inspection.__inspection[engine.id];
  assert.deepEqual(builtCatalog.CARDS,catalog.original.CARDS);assert.deepEqual(builtCatalog.STARTER_DECKS,catalog.original.STARTER_DECKS);
  const initial={seed:0x12345,difficulty:'normal'},sourceGame=engine.original.newGame(initial),builtGame=builtEngine.newGame(initial);
  assert.deepEqual(builtGame,sourceGame);
  engine.original.endTurn(sourceGame);builtEngine.endTurn(builtGame);engine.original.runCpuTurn(sourceGame);builtEngine.runCpuTurn(builtGame);assert.deepEqual(builtGame,sourceGame,'Bundled module scopes must preserve card and engine behavior');
  const redirect=await built.default.fetch(new Request('https://beast-king.hisa-0128-1996.chatgpt.site/'),{},{});assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),'https://www.beast-king.com/');
  await write('dist/server/index.js',bundle);
  return {bytes:Buffer.byteLength(bundle),modules:modules.map(m=>m.rel),sourceHash:digest,operatorArtwork:privateArtwork?'private-illustration':'procedural-fallback'};
}

const schema=await read('server/schema.sql');
if(args.has('--init-migration'))await initializeMigration(schema);
await validateMigrations(schema);
if(!args.has('--check-schema')){
  const hosting=JSON.parse(await read('.openai/hosting.json'));
  assert.equal(hosting.project_id,'appgprj_6b0457b337188191820a1e919e5ef417');assert.equal(hosting.static,undefined);assert.equal(hosting.d1,'DB');assert.equal(hosting.r2,null);
  const result=await bundleWorker();
  await write('dist/.openai/hosting.json',json(hosting));
  // The Sites packager also copies this source tree; keeping the sidecar makes
  // a directly inspected build contain the complete deployment metadata.
  for(const entry of await readdir(resolve(root,'drizzle'),{recursive:true})){
    const source=resolve(root,'drizzle',entry);if((await stat(source)).isFile())await write('dist/.openai/drizzle/'+entry,await readFile(source,'utf8'));
  }
  console.log(JSON.stringify({worker:'dist/server/index.js',...result,validation:'ESM fetch, isolated exports, 2304 cards, seeded engine turn, redirect, migrations',frontend:'preserved'},null,2));
}

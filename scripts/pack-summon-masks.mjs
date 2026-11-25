/** Pack source-bound public coverage masks. Original artwork is read only to
 * verify its hash; it is never decoded or composited into these atlases. All
 * quality checks and PNG round-trip checks finish before public files change. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,rename,rm,realpath} from 'node:fs/promises';
import {dirname,resolve,relative,join,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {CARDS} from '../catalog.js';
import {resolveSummonArt} from '../summon-art.js';
import {summonMaskSourceKey} from '../summon-mask.js';
import {CARD_FOREGROUND_MASKS} from '../card-foreground-masks.js';
import {MASK_FINISH,finishForegroundCoverage,assertCorrectionSource,contourMaskSVG,foregroundMaskStats} from './finish-summon-masks.mjs';
import {maximumForegroundCoverage} from './foreground-mask-quality.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const TILE=256,SIDE=8,EDGE=TILE*SIDE;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const hashPattern=/^[a-f\d]{64}$/;
const inside=(directory,path)=>{const rel=relative(directory,path);return rel!==''&&!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep);};

async function containedFile(directory,file){
 assert(typeof file==='string'&&file&&!isAbsolute(file),'A mask/correction file must be relative');
 const path=resolve(directory,file);assert(inside(directory,path),'A mask/correction file must remain inside its directory');
 const actual=await realpath(path);assert(inside(await realpath(directory),actual),'A mask/correction link must remain inside its directory');
 return actual;
}

/** Do not turn arbitrary RGB art into a mask by converting it to grayscale.
 * Decode the PNG as a browser would, require identical RGB and opaque alpha,
 * then retain just the coverage channel. */
export async function decodeForegroundMask(bytes,{width=TILE,height=TILE}={}){
 const metadata=await sharp(bytes,{limitInputPixels:EDGE*EDGE}).metadata();
 assert.equal(metadata.format,'png','Coverage must be PNG');
 assert.equal(metadata.width,width,'Unexpected coverage width');assert.equal(metadata.height,height,'Unexpected coverage height');
 assert.equal(metadata.depth,'uchar','Coverage must be 8-bit');
 assert(!metadata.icc,'Coverage PNG must not carry an illustration color profile');
 const decoded=await sharp(bytes,{limitInputPixels:EDGE*EDGE}).ensureAlpha().raw({depth:'uchar'}).toBuffer({resolveWithObject:true});
 assert.equal(decoded.info.channels,4,'Coverage decoder must produce RGBA');
 const mask=Buffer.alloc(width*height);
 for(let i=0;i<mask.length;i++){
  const p=i*4,value=decoded.data[p];
  assert(value===decoded.data[p+1]&&value===decoded.data[p+2],'Illustration RGB is not permitted in a coverage mask');
  assert.equal(decoded.data[p+3],255,'Coverage must be encoded in grayscale, not PNG transparency');
  mask[i]=value;
 }
 return mask;
}

async function encodeForegroundMask(mask,width=TILE,height=TILE){
 assert.equal(mask.length,width*height);
 return sharp(mask,{raw:{width,height,channels:1}}).toColourspace('b-w').png({compressionLevel:9}).toBuffer();
}

function makeIssue(stage,source,error){
 return {stage,sourceKey:source?.sourceKey??null,cardIds:Array.isArray(source?.cardIds)?[...source.cardIds]:[],message:String(error?.message??error)};
}

function qualityProblems(maskStats,source){
 if(maskStats.nativeAlpha)return [];
 const reasons=[],coverage=maskStats.alphaSum/(maskStats.pixels*255);
 if(maskStats.clearPixels<4)reasons.push('missing-clear-background');
 if(maskStats.visiblePixels<4)reasons.push('empty-foreground');
 if(coverage<.03||coverage>maximumForegroundCoverage(source))reasons.push('coverage-out-of-range');
 return reasons;
}

/** A reviewed contour replaces an unreliable prediction. A selected prediction
 * marked finished is copied exactly, including its reviewed edge exclusions. */
export function finishSourceMask(source,rawMask,correction=null){
 assert.equal(rawMask.length,TILE*TILE);
 const nativeAlpha=source.mode==='native-alpha';
 if(nativeAlpha){
  assert(!correction,'Native source alpha must not be replaced');
  return {mask:Buffer.from(finishForegroundCoverage(rawMask,{nativeAlpha:true})),processing:{method:'native-alpha',finishing:{applied:false,reason:'native-alpha-preserved'}}};
 }
 if(correction){
  assertCorrectionSource(correction.record,source);
  assert.equal(correction.mask.length,TILE*TILE);
  if(correction.kind==='contour')return {mask:Buffer.from(correction.mask),processing:{method:'reviewed-contour',finishing:{applied:false,reason:'reviewed-contour'}}};
  assert.equal(correction.kind,'prediction','Unsupported foreground correction kind');
  const finishing=correction.record.finishing;
  assert(typeof finishing?.applied==='boolean','Selected prediction must declare its finishing state');
  if(finishing.applied){
   for(const key of ['method','low','high'])assert.equal(finishing[key],MASK_FINISH[key],'Selected prediction uses a different finishing policy');
   return {mask:Buffer.from(correction.mask),processing:{method:'selected-prediction',finishing:{...finishing,appliedByPacker:false}}};
  }
  return {mask:Buffer.from(finishForegroundCoverage(correction.mask)),processing:{method:'selected-prediction',finishing:{...MASK_FINISH,applied:true,appliedByPacker:true}}};
 }
 return {mask:Buffer.from(finishForegroundCoverage(rawMask)),processing:{method:'generated-prediction',finishing:{...MASK_FINISH,applied:true,appliedByPacker:true}}};
}

export async function loadForegroundCorrections(registryPath,sources){
 const corrections=new Map(),issues=[];
 let registry;
 try{registry=JSON.parse(await readFile(registryPath,'utf8'));assert.equal(registry.schemaVersion,1);assert(Array.isArray(registry.records),'Correction registry must contain records');}
 catch(error){return {corrections,issues:[makeIssue('correction-registry',null,error)]};}
 const directory=dirname(registryPath);
 for(const entry of registry.records){
  let record=entry;
  try{
   assert(entry&&['prediction','contour'].includes(entry.kind),'Unsupported foreground correction kind');
   const path=await containedFile(directory,entry.file),bytes=await readFile(path),fileSha256=digest(bytes);
   if(entry.kind==='contour')record=JSON.parse(bytes.toString('utf8'));
   const source=sources.get(record.sourceKey);assert(source,'Correction has no exact generated public source');
   assertCorrectionSource(record,source);
   assert(!corrections.has(record.sourceKey),'Duplicate correction for one illustration/crop');
   let mask;
   if(entry.kind==='prediction'){
    assert(hashPattern.test(record.maskSha256),'A selected prediction needs its PNG SHA-256');
    assert.equal(fileSha256,record.maskSha256,'Selected prediction PNG changed after review');
    if(record.width!==undefined)assert.equal(record.width,TILE);
    if(record.height!==undefined)assert.equal(record.height,TILE);
    mask=await decodeForegroundMask(bytes);
   }else{
    const svg=contourMaskSVG(record,source);
    mask=await decodeForegroundMask(await sharp(Buffer.from(svg)).png().toBuffer());
   }
   corrections.set(record.sourceKey,{kind:entry.kind,record,mask,provenance:{...record,kind:entry.kind,file:entry.file,fileSha256}});
  }catch(error){issues.push(makeIssue('correction',record,error));}
 }
 return {corrections,issues};
}

/** Build one atlas from raw coverage bytes. Read the encoded PNG back and
 * compare every tile, including soft edge values, before it can be published. */
export async function buildForegroundAtlas(group){
 assert(group.length>0&&group.length<=SIDE*SIDE);
 const coverage=Buffer.alloc(EDGE*EDGE);
 for(let index=0;index<group.length;index++){
  const mask=group[index].finalMask;assert.equal(mask.length,TILE*TILE);
  const left=(index%SIDE)*TILE,top=Math.floor(index/SIDE)*TILE;
  for(let y=0;y<TILE;y++)Buffer.from(mask.buffer,mask.byteOffset+y*TILE,TILE).copy(coverage,(top+y)*EDGE+left);
 }
 const png=await encodeForegroundMask(coverage,EDGE,EDGE);
 const decoded=await decodeForegroundMask(png,{width:EDGE,height:EDGE});
 const tiles=[],issues=[];
 for(let index=0;index<group.length;index++){
  const source=group[index],left=(index%SIDE)*TILE,top=Math.floor(index/SIDE)*TILE,tile=Buffer.alloc(TILE*TILE);
  for(let y=0;y<TILE;y++)decoded.copy(tile,y*TILE,(top+y)*EDGE+left,(top+y)*EDGE+left+TILE);
  if(!tile.equals(source.finalMask))issues.push(makeIssue('atlas-round-trip',source,'Packed tile differs from final mask bytes'));
  const maskStats=foregroundMaskStats(tile,{nativeAlpha:source.mode==='native-alpha'});
  tiles.push({crop:{x:left,y:top,width:TILE,height:TILE},maskStats,finalMaskPixelSha256:digest(tile)});
 }
 return {png,tiles,issues};
}

export async function packForegroundMasks(inputDirectories,{write=true,repairReport=process.env.FOREGROUND_REPAIR_REPORT,correctionRegistry=join(root,'scripts/foreground-corrections/manifest.json')}={}){
 assert(inputDirectories.length,'Usage: node scripts/pack-summon-masks.mjs <shard-directory> [...]');
 if(repairReport){repairReport=resolve(repairReport);assert(!inside(root,repairReport)&&repairReport!==root,'FOREGROUND_REPAIR_REPORT must be outside the repository');}
 const expected=CARDS.filter(card=>['beast','fusion'].includes(card.type)),sources=new Map(),cardKeys=new Map(),issues=[];
 let model;
 for(const input of inputDirectories){
  const directory=resolve(input);let manifest;
  try{
   manifest=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));assert.equal(manifest.schemaVersion,1,'Unsupported foreground manifest schema');
   assert(Array.isArray(manifest.sources)&&manifest.cards,'Incomplete foreground shard');
   if(model)assert.deepEqual(manifest.model,model,'Raw shards must use the same model/settings');else model=manifest.model;
  }catch(error){issues.push(makeIssue('shard',null,error));continue;}
  for(const [id,key] of Object.entries(manifest.cards)){
   if(cardKeys.has(id)&&cardKeys.get(id)!==key)issues.push(makeIssue('card-source',{cardIds:[id],sourceKey:key},'Conflicting card source'));
   else cardKeys.set(id,key);
  }
  for(const rawGeneration of manifest.sources){
   try{
    assert(typeof rawGeneration.sourceKey==='string'&&rawGeneration.sourceKey&&hashPattern.test(rawGeneration.sourceHash),'Missing original source provenance');
    assert(Array.isArray(rawGeneration.cardIds)&&rawGeneration.cardIds.length,'Missing source card identities');
    const old=sources.get(rawGeneration.sourceKey);
    if(old){assert.equal(old.maskSha256,rawGeneration.maskSha256,'Conflicting duplicate raw mask');assert.equal(old.sourceHash,rawGeneration.sourceHash);continue;}
    const source={...rawGeneration,rawGeneration};sources.set(source.sourceKey,source);
    const path=await containedFile(directory,source.file),bytes=await readFile(path);
    assert.equal(digest(bytes),source.maskSha256,'Raw mask changed after generation');
    source.rawMask=await decodeForegroundMask(bytes);
   }catch(error){issues.push(makeIssue('raw-mask',rawGeneration,error));}
  }
 }
 if(![512,768,1024].includes(model?.inputSize)||model?.maskSize!==TILE)issues.push(makeIssue('model',null,'Unsupported base mask dimensions'));
 const expectedIds=new Set(expected.map(card=>card.id));
 for(const id of cardKeys.keys())if(!expectedIds.has(id))issues.push(makeIssue('card-source',{cardIds:[id],sourceKey:cardKeys.get(id)},'Unexpected public card'));
 const originalHashes=new Map(),canonicalKeys=new Set();
 for(const card of expected){
  const art=resolveSummonArt(card),key=summonMaskSourceKey(art),source=sources.get(key);canonicalKeys.add(key);
  try{
   assert.equal(cardKeys.get(card.id),key,'Missing or stale source/crop');assert(source,'Missing generated source');
   assert(source.cardIds.includes(card.id),'Raw source omits its canonical card identity');
   const url=new URL(art.src,'https://public.invalid/');assert(url.pathname.startsWith('/assets/'),'Only public artwork can be packed');
   const path=url.pathname.slice(1);
   // Hash the original file without decoding its RGB or passing it to Sharp.
   if(!originalHashes.has(path))originalHashes.set(path,digest(await readFile(join(root,path))));
   assert.equal(originalHashes.get(path),source.sourceHash,'Original artwork changed');
  }catch(error){issues.push(makeIssue('source-binding',{sourceKey:key,cardIds:[card.id]},error));}
 }
 for(const source of sources.values())if(!canonicalKeys.has(source.sourceKey))issues.push(makeIssue('source-binding',source,'Unused or noncanonical generated source'));
 const loaded=await loadForegroundCorrections(correctionRegistry,sources);issues.push(...loaded.issues);
 const ordered=[...sources.values()].sort((a,b)=>a.sourceKey.localeCompare(b.sourceKey,'en'));
 const invalidMasks=[];
 for(const source of ordered){
  if(!source.rawMask)continue;
  try{
   const correction=loaded.corrections.get(source.sourceKey)??null;
   const result=finishSourceMask(source,source.rawMask,correction);
   source.rawMask=null;source.finalMask=result.mask;source.processing=result.processing;source.correction=correction?.provenance??null;
   source.maskStats=foregroundMaskStats(source.finalMask,{nativeAlpha:source.mode==='native-alpha'});
   source.finalMaskPixelSha256=digest(source.finalMask);
   const reasons=qualityProblems(source.maskStats,source);
   if(reasons.length){
    invalidMasks.push({sourceKey:source.sourceKey,sourceHash:source.sourceHash,cardIds:source.cardIds,reasons,maskStats:source.maskStats,processing:source.processing});
    issues.push(makeIssue('final-mask',source,reasons.join(', ')));
   }
  }catch(error){issues.push(makeIssue('mask-finish',source,error));}
 }
 const audit={schemaVersion:1,status:'pending',cardCount:expected.length,sourceCount:sources.size,correctionCount:loaded.corrections.size,model,finishing:MASK_FINISH,invalidMasks,issues};
 const writeAudit=async()=>{if(repairReport){await mkdir(dirname(repairReport),{recursive:true});await writeFile(repairReport,JSON.stringify(audit,null,2)+'\n');}};
 const fail=async()=>{audit.status='failed';await writeAudit();const error=new Error('Foreground validation failed: '+issues.length+' issue(s), '+invalidMasks.length+' invalid mask(s)');error.issues=issues;error.audit=audit;throw error;};
 // No public mkdir/write/rename/remove occurs above this gate.
 if(issues.length)await fail();
 const records=new Map(),atlases=[];
 for(let offset=0;offset<ordered.length;offset+=SIDE*SIDE){
  const group=ordered.slice(offset,offset+SIDE*SIDE);
  try{
   for(const source of group)source.finalMaskSha256=digest(await encodeForegroundMask(source.finalMask));
   const atlas=await buildForegroundAtlas(group);issues.push(...atlas.issues);
   const sha256=digest(atlas.png),src='assets/foreground/mask-'+sha256.slice(0,20)+'.png';
   atlases.push({src,sha256,width:EDGE,height:EDGE,tiles:group.length,bytes:atlas.png.length,png:atlas.png});
   for(let index=0;index<group.length;index++){
    const source=group[index],tile=atlas.tiles[index];source.maskStats=tile.maskStats;source.finalMaskPixelSha256=tile.finalMaskPixelSha256;
    const reasons=qualityProblems(tile.maskStats,source);if(reasons.length)issues.push(makeIssue('packed-mask',source,reasons.join(', ')));
    records.set(source.sourceKey,{sourceKey:source.sourceKey,src,sourceWidth:EDGE,sourceHeight:EDGE,crop:tile.crop,
     sha256,sourceSha256:source.sourceHash,maskStats:tile.maskStats,finalMaskSha256:source.finalMaskSha256,finalMaskPixelSha256:tile.finalMaskPixelSha256});
   }
  }catch(error){for(const source of group)issues.push(makeIssue('atlas',source,error));}
 }
 if(issues.length)await fail();
 const registry=Object.fromEntries(expected.sort((a,b)=>a.id.localeCompare(b.id,'en')).map(card=>[card.id,records.get(cardKeys.get(card.id))]));
 const publicAtlases=atlases.map(({png,...metadata})=>metadata);
 const production={schemaVersion:1,model,finishing:MASK_FINISH,cardCount:expected.length,uniqueSources:ordered.length,tileSize:TILE,atlasSize:EDGE,
  channels:'grayscale-coverage-only',originalArtworkDecoded:false,atlasTileVerification:'decoded PNG tiles equal final uint8 coverage byte-for-byte',atlases:publicAtlases,
  sources:ordered.map(source=>({sourceKey:source.sourceKey,sourceHash:source.sourceHash,cardIds:source.cardIds,
   maskSha256:source.finalMaskSha256,finalMaskPixelSha256:source.finalMaskPixelSha256,maskStats:source.maskStats,
   rawGeneration:source.rawGeneration,processing:source.processing,correction:source.correction}))};
 audit.status='passed';audit.atlasCount=atlases.length;audit.verifiedTiles=ordered.length;await writeAudit();
 if(write){
  await mkdir(join(root,'assets/foreground'),{recursive:true});
  for(const atlas of atlases){const path=join(root,atlas.src),temporary=path+'.tmp';await writeFile(temporary,atlas.png);await rename(temporary,path);}
  const productionPath=join(root,'docs/summon-mask-production.json');await mkdir(dirname(productionPath),{recursive:true});
  await writeFile(productionPath+'.tmp',JSON.stringify(production,null,2)+'\n');await rename(productionPath+'.tmp',productionPath);
  const generated='/** Generated by scripts/pack-summon-masks.mjs. Alpha only; exact public source/crop binding. */\nexport const CARD_FOREGROUND_MASKS = Object.freeze('+JSON.stringify(registry,null,1)+');\n';
  const registryPath=join(root,'card-foreground-masks.js');await writeFile(registryPath+'.tmp',generated);await rename(registryPath+'.tmp',registryPath);
  const used=new Set(atlases.map(atlas=>atlas.src));
  for(const src of new Set(Object.values(CARD_FOREGROUND_MASKS).map(row=>row.src)))if(/^assets\/foreground\/mask-[a-f\d]{20}\.png$/.test(src)&&!used.has(src))await rm(join(root,src),{force:true});
 }
 return {cards:expected.length,uniqueSources:ordered.length,atlases:atlases.length,bytes:atlases.reduce((sum,atlas)=>sum+atlas.bytes,0),corrections:loaded.corrections.size,verifiedTiles:ordered.length,written:write};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 packForegroundMasks(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(JSON.stringify({error:error.message,issues:error.issues?.length,invalidMasks:error.audit?.invalidMasks.length,report:process.env.FOREGROUND_REPAIR_REPORT??null}));process.exitCode=1;});
}

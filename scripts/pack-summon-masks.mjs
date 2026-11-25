/** Pack verified build-time foreground masks. No card RGB is included in this
 * cache: each grayscale tile contains only coverage for its exact source crop. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {dirname,resolve,relative,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {CARDS} from '../catalog.js';
import {resolveSummonArt} from '../summon-art.js';
import {summonMaskSourceKey} from '../summon-mask.js';
import {CARD_FOREGROUND_MASKS} from '../card-foreground-masks.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const TILE=256,SIDE=8,EDGE=TILE*SIDE;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const inputs=process.argv.slice(2);
assert(inputs.length,'Usage: node scripts/pack-summon-masks.mjs <shard-directory> [...]');
const expected=CARDS.filter(card=>['beast','fusion'].includes(card.type));
const sources=new Map(),cardKeys=new Map();
let model;
for(const input of inputs){
 const directory=resolve(input),manifest=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));
 assert.equal(manifest.schemaVersion,1,'Unsupported foreground manifest schema');
 if(model)assert.deepEqual(manifest.model,model,'Mask shards must use the same model/settings');else model=manifest.model;
 for(const [id,key] of Object.entries(manifest.cards)){
  if(cardKeys.has(id))assert.equal(cardKeys.get(id),key,'Conflicting card source '+id);
  cardKeys.set(id,key);
 }
 for(const source of manifest.sources){
  assert(source.sourceKey&&/^[a-f\d]{64}$/.test(source.sourceHash),'Missing original source provenance');
  const path=resolve(directory,source.file);
  assert(!relative(directory,path).startsWith('..'),'Mask must remain inside its shard directory');
  const bytes=await readFile(path);
  assert.equal(digest(bytes),source.maskSha256,'Mask changed after generation: '+source.file);
  const info=await sharp(bytes).metadata();
  assert.equal(info.width,TILE);assert.equal(info.height,TILE);
  const decoded=await sharp(bytes).toColourspace('b-w').removeAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(decoded.info.channels,1);
  const maskStats={clearPixels:0,visiblePixels:0,alphaSum:0,pixels:TILE*TILE,nativeAlpha:source.mode==='native-alpha'};
  for(const value of decoded.data){if(value<=8)maskStats.clearPixels++;if(value>=128)maskStats.visiblePixels++;maskStats.alphaSum+=value;}
  if(!maskStats.nativeAlpha){
   assert(maskStats.clearPixels>=4&&maskStats.visiblePixels>=4,'Empty or rectangular foreground: '+source.cardIds.join(','));
   const coverage=maskStats.alphaSum/(maskStats.pixels*255);
   assert(coverage>=.03&&coverage<=.97,'Foreground coverage needs review: '+source.cardIds.join(','));
  }
  const old=sources.get(source.sourceKey);
  if(old){assert.equal(old.maskSha256,source.maskSha256,'Conflicting duplicate mask');assert.equal(old.sourceHash,source.sourceHash);}
  else sources.set(source.sourceKey,{...source,path,maskStats});
 }
}
assert([512,768,1024].includes(model?.inputSize));assert.equal(model?.maskSize,TILE);
assert.deepEqual([...cardKeys.keys()].sort(),expected.map(card=>card.id).sort(),'Every published beast/fusion must have a mask');
const originalHashes=new Map();
for(const card of expected){
 const art=resolveSummonArt(card),key=summonMaskSourceKey(art),source=sources.get(key);
 assert.equal(cardKeys.get(card.id),key,'Stale source/crop for '+card.id);assert(source,'Missing source '+card.id);
 const url=new URL(art.src,'https://public.invalid/');
 assert(url.pathname.startsWith('/assets/'),'Only public artwork can be packed');
 const path=url.pathname.slice(1);
 if(!originalHashes.has(path))originalHashes.set(path,digest(await readFile(join(root,path))));
 assert.equal(originalHashes.get(path),source.sourceHash,'Original artwork changed: '+card.id);
}
assert.equal(new Set(cardKeys.values()).size,sources.size,'Unused or missing generated masks');
const ordered=[...sources.values()].sort((a,b)=>a.sourceKey.localeCompare(b.sourceKey,'en'));
const target=join(root,'assets/foreground');await mkdir(target,{recursive:true});
const records=new Map(),atlases=[];
for(let offset=0;offset<ordered.length;offset+=SIDE*SIDE){
 const group=ordered.slice(offset,offset+SIDE*SIDE);
 const png=await sharp({create:{width:EDGE,height:EDGE,channels:3,background:'#000000'}})
  .composite(group.map((source,index)=>({input:source.path,left:(index%SIDE)*TILE,top:Math.floor(index/SIDE)*TILE})))
  .removeAlpha().toColourspace('b-w').png({compressionLevel:9}).toBuffer();
 const sha256=digest(png),src='assets/foreground/mask-'+sha256.slice(0,20)+'.png';
 await writeFile(join(root,src),png);
 atlases.push({src,sha256,width:EDGE,height:EDGE,tiles:group.length,bytes:png.length});
 for(let index=0;index<group.length;index++){
  const source=group[index];
  records.set(source.sourceKey,{sourceKey:source.sourceKey,src,sourceWidth:EDGE,sourceHeight:EDGE,
   crop:{x:(index%SIDE)*TILE,y:Math.floor(index/SIDE)*TILE,width:TILE,height:TILE},sha256,sourceSha256:source.sourceHash,maskStats:source.maskStats});
 }
}
const registry=Object.fromEntries(expected.sort((a,b)=>a.id.localeCompare(b.id,'en')).map(card=>[card.id,records.get(cardKeys.get(card.id))]));
const generated='/** Generated by scripts/pack-summon-masks.mjs. Alpha only; exact public source/crop binding. */\nexport const CARD_FOREGROUND_MASKS = Object.freeze('+JSON.stringify(registry,null,1)+');\n';
const temporary=join(root,'card-foreground-masks.js.tmp');await writeFile(temporary,generated);await rename(temporary,join(root,'card-foreground-masks.js'));
const used=new Set(atlases.map(atlas=>atlas.src));
for(const src of new Set(Object.values(CARD_FOREGROUND_MASKS).map(row=>row.src)))if(/^assets\/foreground\/mask-[a-f\d]{20}\.png$/.test(src)&&!used.has(src))await rm(join(root,src),{force:true});
const production={schemaVersion:1,model,cardCount:expected.length,uniqueSources:ordered.length,tileSize:TILE,atlasSize:EDGE,atlases,
 sources:ordered.map(({sourceKey,sourceHash,maskSha256,cardIds,metrics})=>({sourceKey,sourceHash,maskSha256,cardIds,metrics}))};
await writeFile(join(root,'docs/summon-mask-production.json'),JSON.stringify(production,null,2)+'\n');
console.log(JSON.stringify({cards:expected.length,uniqueSources:ordered.length,atlases:atlases.length,bytes:atlases.reduce((sum,atlas)=>sum+atlas.bytes,0)}));

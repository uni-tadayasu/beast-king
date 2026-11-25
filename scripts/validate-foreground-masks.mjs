/** Verify public source bindings and hashed mask atlases without an ML runtime. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveSummonArt} from '../summon-art.js';
import {resolveSummonMask,summonMaskSourceKey} from '../summon-mask.js';
import {maximumForegroundCoverage} from './foreground-mask-quality.mjs';

const BASE='https://beast-king.invalid/';
const TILE=256,ATLAS=2048;
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

function localAssetPath(value,prefix='assets/'){
 const url=new URL(value,BASE),path=decodeURIComponent(url.pathname).slice(1);
 assert.equal(url.origin,new URL(BASE).origin,'Foreground provenance must use public same-origin files.');
 assert(!url.username&&!url.password&&!url.hash&&path.startsWith(prefix)&&path.split('/').every(part=>part&&part!=='.'&&part!=='..'),'Unsafe foreground asset path: '+value);
 return path;
}

function pngDimensions(bytes,path){
 assert(bytes.length>=33,'Truncated foreground PNG: '+path);
 assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a','Invalid foreground PNG signature: '+path);
 assert.equal(bytes.readUInt32BE(8),13,'Invalid foreground PNG header: '+path);
 assert.equal(bytes.toString('ascii',12,16),'IHDR','Invalid foreground PNG header: '+path);
 return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
}

export async function validateForegroundMaskManifest(registry,cards,options={}){
 assert(registry&&typeof registry==='object'&&!Array.isArray(registry),'Missing public foreground mask registry.');
 const creatures=cards.filter(card=>card.type==='beast'||card.type==='fusion');
 assert.equal(new Set(creatures.map(card=>card.id)).size,creatures.length,'Duplicate public creature identity.');
 assert.deepEqual(Object.keys(registry).sort(),creatures.map(card=>card.id).sort(),'Every public creature needs one foreground entry, with no spell/trap entries.');
 const root=resolve(options.root??fileURLToPath(new URL('../',import.meta.url)));
 const readAsset=options.readAsset??(path=>readFile(resolve(root,path)));
 const resolveArt=options.resolveArt??resolveSummonArt;
 const sources=new Map(),atlases=new Map(),cells=new Map(),sourceKeys=new Set();
 for(const card of creatures){
  const row=registry[card.id],art=resolveArt(card),expectedKey=summonMaskSourceKey(art,BASE);
  assert(expectedKey,'No approved public source for foreground: '+card.id);
  assert(row&&typeof row==='object','Missing foreground record: '+card.id);
  assert.equal(row.sourceKey,expectedKey,'Stale or mismatched original illustration/crop: '+card.id);
  const descriptor=resolveSummonMask(art,BASE,registry);
  assert(descriptor,'Invalid public mask descriptor: '+card.id);
  assert.deepEqual([row.sourceWidth,row.sourceHeight],[ATLAS,ATLAS],'Foreground atlas must be 2048 × 2048: '+card.id);
  const crop=row.crop;
  assert(crop&&[crop.x,crop.y,crop.width,crop.height].every(Number.isInteger),'Foreground crop must contain integer pixel coordinates: '+card.id);
  assert.equal(crop.width,TILE,'Foreground tile width must be 256: '+card.id);
  assert.equal(crop.height,TILE,'Foreground tile height must be 256: '+card.id);
  assert(crop.x>=0&&crop.y>=0&&crop.x%TILE===0&&crop.y%TILE===0&&crop.x+TILE<=ATLAS&&crop.y+TILE<=ATLAS,'Foreground tile must stay on the 8 × 8 atlas grid: '+card.id);
  assert(digest(row.sourceSha256),'Missing original source sha256: '+card.id);
  assert(digest(row.sha256),'Missing foreground atlas sha256: '+card.id);
  // The packer measures these counts from the final decoded PNG tile, and
  // the atlas digest below pins those exact bytes. This gate needs no decoder.
  const stats=row.maskStats,pixels=TILE*TILE;
  assert(stats&&typeof stats==='object','Missing foreground mask statistics: '+card.id);
  assert.equal(stats.pixels,pixels,'Foreground statistics must describe one 256px tile: '+card.id);
  assert.equal(typeof stats.nativeAlpha,'boolean','Foreground native-alpha provenance must be explicit: '+card.id);
  assert([stats.clearPixels,stats.visiblePixels,stats.alphaSum].every(Number.isInteger),'Foreground statistics must contain integer counts: '+card.id);
  assert(stats.clearPixels>=0&&stats.visiblePixels>=0&&stats.clearPixels+stats.visiblePixels<=pixels&&stats.alphaSum>=0&&stats.alphaSum<=pixels*255,'Foreground statistics are outside pixel bounds: '+card.id);
  assert(stats.alphaSum>=stats.visiblePixels*128&&stats.alphaSum<=stats.clearPixels*8+(pixels-stats.clearPixels)*255,'Foreground statistics are internally inconsistent: '+card.id);
  if(!stats.nativeAlpha){
   const coverage=stats.alphaSum/(pixels*255);
   assert(stats.clearPixels>=4&&stats.visiblePixels>=4&&stats.alphaSum>0&&stats.alphaSum<pixels*255,'Foreground mask is empty or effectively opaque: '+card.id);
   assert(coverage>=.03&&coverage<=maximumForegroundCoverage(row),'Foreground mask coverage requires visual repair/review: '+card.id);
  }
  const sourcePath=localAssetPath(art.src),atlasPath=localAssetPath(row.src,'assets/foreground/');
  assert(atlasPath.endsWith('.png'),'Foreground masks must be PNG atlases: '+card.id);
  if(!sources.has(sourcePath))sources.set(sourcePath,sha256(await readAsset(sourcePath)));
  assert.equal(row.sourceSha256,sources.get(sourcePath),'Original artwork changed after foreground production: '+card.id);
  if(!atlases.has(atlasPath)){
   const bytes=await readAsset(atlasPath);
   assert.deepEqual(pngDimensions(bytes,atlasPath),[ATLAS,ATLAS],'Actual foreground atlas dimensions differ from the registry: '+atlasPath);
   atlases.set(atlasPath,sha256(bytes));
  }
  assert.equal(row.sha256,atlases.get(atlasPath),'Foreground atlas changed after packaging: '+card.id);
  const cell=atlasPath+':'+crop.x+':'+crop.y;
  if(cells.has(cell))assert.equal(cells.get(cell),expectedKey,'Different original illustrations share one foreground tile: '+card.id);
  else cells.set(cell,expectedKey);
  sourceKeys.add(expectedKey);
 }
 return {cards:creatures.length,uniqueSources:sourceKeys.size,sourceFiles:sources.size,atlases:atlases.size,tiles:cells.size,tileSize:TILE,atlasSize:ATLAS,allFilesVerified:true};
}

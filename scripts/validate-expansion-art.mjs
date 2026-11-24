/** Pure, strict validation of the complete BK03/BK04 native-illustration release. */
import assert from 'node:assert/strict';
import {PREMIUM_CARD_IDS} from '../premium-cards.js';

export function validateExpansionArtManifest(manifest,cards,browser){
 const expansion=cards.filter(c=>!PREMIUM_CARD_IDS.includes(c.id)&&['BK03','BK04'].includes(c.setId));
 assert.equal(expansion.length,2304,'Exactly 2,304 new catalogue cards must have their own illustration.');
 assert.equal(manifest.total,2304);assert.equal(manifest.complete,true);assert.equal(manifest.method,'built-in-imagegen');
 assert.equal(manifest.columns,6);assert.equal(manifest.rows,4);
 const columns=manifest.columns,rows=manifest.rows;
 assert.equal(manifest.atlasCount,96);
 assert.equal(manifest.atlases.length,manifest.atlasCount);
 assert.equal(manifest.cards.length,2304);assert.equal(manifest.uniqueCropHashes,2304);
 assert(Number.isFinite(manifest.nativeCellPixelsMinimum)&&manifest.nativeCellPixelsMinimum>=256,'Native cells must not be replaced with upscaled small images.');
 assert.equal(manifest.atlasSafetyInset,.04);
 const catalog=new Map(expansion.map(c=>[c.id,c]));
 assert.equal(catalog.size,2304);
 assert.deepEqual(Object.keys(browser).sort(),[...catalog.keys()].sort(),'Every expansion card needs one explicit browser crop.');
 const atlases=new Map(),atlasIds=new Set();
 for(const atlas of manifest.atlases){
  assert(/^assets\/design-v3\/cards\/bk0[34]-atlas-\d{2}\.webp$/.test(atlas.src),'Unexpected expansion illustration path.');
  assert(!atlases.has(atlas.src),'Repeated atlas file.');atlases.set(atlas.src,atlas);
  assert.equal(atlas.visualReview,'reviewed','An image-generation record is not a visual review.');
  assert.equal(atlas.nativeDimensionsPreserved,true);
  assert.equal(atlas.columns,columns);assert.equal(atlas.rows,rows);
  assert(Number.isInteger(atlas.width)&&atlas.width>=256*columns&&Number.isInteger(atlas.height)&&atlas.height>=256*rows);
  assert(Math.abs(atlas.width/columns-atlas.height/rows)<=1,'Atlas cells are not square.');
  assert.equal(atlas.cardIds.length,columns*rows);
  for(const id of atlas.cardIds){assert(catalog.has(id)&&!atlasIds.has(id),'Unknown or duplicate atlas card: '+id);atlasIds.add(id);}
  for(const [axis,end,count] of [[atlas.x,atlas.width,columns],[atlas.y,atlas.height,rows]]){
   assert(Array.isArray(axis)&&axis.length===count+1&&axis.every(Number.isInteger));
   assert.equal(axis[0],0);assert.equal(axis.at(-1),end);
   assert(axis.every((n,i)=>!i||n>axis[i-1]),'Non-increasing atlas boundaries.');
  }
  for(const key of ['sha256','sourceSha256','promptSha256'])assert(/^[a-f0-9]{64}$/.test(atlas[key]),'Missing image provenance: '+key);
 }
 const seen=new Set(),cells=new Set(),hashes=new Set();
 for(const entry of manifest.cards){
  const card=catalog.get(entry.id);assert(card&&!seen.has(entry.id),'Unknown or duplicate new artwork: '+entry.id);seen.add(entry.id);
  for(const key of ['name','setId','type','family','origin'])assert.equal(entry[key],card[key],'Catalogue/illustration mismatch: '+entry.id+' '+key);
  assert.notEqual(entry.origin,'king','Public expansions must not acquire the operator identity.');
  assert.equal(entry.status,'illustrated-original');assert.equal(entry.method,'built-in-imagegen');
  const atlas=atlases.get(entry.src);assert(atlas,'Unregistered image source: '+entry.id);
  assert.equal(entry.sha256,atlas.sha256);
  const index=atlas.cardIds.indexOf(entry.id);assert(index>=0);
  assert.equal(entry.column,index%columns);assert.equal(entry.row,Math.floor(index/columns));
  assert.equal(entry.columns,columns);assert.equal(entry.rows,rows);
  assert.deepEqual(entry.sourceSize,[atlas.width,atlas.height]);
  assert(Array.isArray(entry.pixelCrop)&&entry.pixelCrop.length===4&&entry.pixelCrop.every(Number.isInteger));
  const [x,y,width,height]=entry.pixelCrop;assert.equal(width,height);assert(width>0);
  assert(x>=atlas.x[entry.column]&&y>=atlas.y[entry.row]&&x+width<=atlas.x[entry.column+1]&&y+height<=atlas.y[entry.row+1],'Crop crosses into an adjacent illustration: '+entry.id);
  assert.deepEqual(browser[entry.id],{src:entry.src,sha256:entry.sha256,x,y,size:width,width:atlas.width,height:atlas.height},'Browser and reviewed crop differ: '+entry.id);
  const cell=[entry.src,x,y,width].join(':');assert(!cells.has(cell),'Two cards reuse an illustration crop.');cells.add(cell);
  assert(/^[a-f0-9]{64}$/.test(entry.cellSha256)&&!hashes.has(entry.cellSha256),'Duplicate or missing individual image hash.');hashes.add(entry.cellSha256);
  assert(typeof entry.subject==='string'&&entry.subject.length>80&&typeof entry.palette==='string','Missing individual scene direction.');
 }
 assert.equal(seen.size,2304);assert.equal(cells.size,2304);assert.equal(hashes.size,2304);
 return manifest;
}

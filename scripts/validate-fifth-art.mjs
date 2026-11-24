/** Native, independently illustrated artwork contract for BK05's 96 authored cards. */
import assert from 'node:assert/strict';

const FAMILIES=['origami','glass','shadow','pigment'];
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

export function validateFifthArtManifest(manifest,cards,browser){
 const fifth=cards.filter(card=>card.setId==='BK05'),catalog=new Map(fifth.map(card=>[card.id,card]));
 assert.equal(fifth.length,96,'The fifth set has 96 individually illustrated cards.');
 assert.equal(catalog.size,96);
 assert.equal(manifest.version,1);assert.equal(manifest.complete,true);
 assert.equal(manifest.method,'built-in-imagegen');
 assert.equal(manifest.total,96);assert.equal(manifest.atlasCount,4);
 assert.equal(manifest.columns,6);assert.equal(manifest.rows,4);
 assert.equal(manifest.atlasSafetyInset,.04);
 assert.equal(manifest.cards.length,96);assert.equal(manifest.uniqueCropHashes,96);
 assert.equal(manifest.atlases.length,4);
 assert(manifest.nativeCellPixelsMinimum>=256,'Do not upscale small source cells.');
 assert.deepEqual(Object.keys(browser).sort(),[...catalog.keys()].sort(),'Every fifth-set card needs an explicit browser crop.');
 assert.deepEqual(manifest.atlases.map(atlas=>atlas.family).sort(),[...FAMILIES].sort());
 const atlases=new Map(),atlasCards=new Set(),sourceHashes=new Set();
 for(const atlas of manifest.atlases){
  assert.equal(atlas.id,'bk05-'+atlas.family);
  assert.equal(atlas.src,'assets/design-v5/cards/'+atlas.id+'.webp');
  assert(!atlases.has(atlas.src),'Duplicate fifth-set atlas.');atlases.set(atlas.src,atlas);
  assert.equal(atlas.visualReview,'reviewed','A generation receipt is not a visual review.');
  assert.equal(atlas.nativeDimensionsPreserved,true);
  assert.equal(atlas.columns,6);assert.equal(atlas.rows,4);
  assert(Number.isInteger(atlas.width)&&atlas.width>=1536&&Number.isInteger(atlas.height)&&atlas.height>=1024);
  assert(Math.abs(atlas.width/6-atlas.height/4)<=1,'Atlas cells must be square.');
  assert.equal(atlas.cardIds.length,24);
  for(const key of ['sha256','sourceSha256','promptSha256'])assert(digest(atlas[key]),'Missing native image provenance: '+key);
  assert(!sourceHashes.has(atlas.sourceSha256),'Each family requires its own source image.');sourceHashes.add(atlas.sourceSha256);
  for(const [axis,end,count] of [[atlas.x,atlas.width,6],[atlas.y,atlas.height,4]]){
   assert(Array.isArray(axis)&&axis.length===count+1&&axis.every(Number.isInteger));
   assert.equal(axis[0],0);assert.equal(axis.at(-1),end);
   assert(axis.every((n,i)=>!i||n>axis[i-1]),'Non-increasing atlas boundaries.');
  }
  for(const id of atlas.cardIds){
   assert(catalog.has(id)&&!atlasCards.has(id),'Unknown or repeated fifth-set card.');
   assert.equal(catalog.get(id).family,atlas.family);atlasCards.add(id);
  }
 }
 const seen=new Set(),cells=new Set(),hashes=new Set();
 for(const entry of manifest.cards){
  const card=catalog.get(entry.id);assert(card&&!seen.has(entry.id),'Unknown or duplicate fifth-set artwork: '+entry.id);seen.add(entry.id);
  for(const key of ['name','setId','type','family','origin'])assert.equal(entry[key],card[key],'Catalogue/illustration mismatch: '+entry.id+' '+key);
  assert.notEqual(entry.origin,'king','The fifth set must not acquire the operator identity.');
  assert.equal(entry.status,'illustrated-original');assert.equal(entry.method,'built-in-imagegen');
  const atlas=atlases.get(entry.src);assert(atlas,'Unregistered fifth-set source.');
  assert.equal(entry.sha256,atlas.sha256);
  const index=atlas.cardIds.indexOf(entry.id);assert(index>=0);
  assert.equal(entry.column,index%6);assert.equal(entry.row,Math.floor(index/6));
  assert.equal(entry.columns,6);assert.equal(entry.rows,4);
  assert.deepEqual(entry.sourceSize,[atlas.width,atlas.height]);
  const crop=entry.pixelCrop;
  assert(Array.isArray(crop)&&crop.length===4&&crop.every(Number.isInteger));
  const [x,y,width,height]=crop;assert.equal(width,height);assert(width>0);
  assert(x>=atlas.x[entry.column]&&y>=atlas.y[entry.row]&&x+width<=atlas.x[entry.column+1]&&y+height<=atlas.y[entry.row+1],'Crop crosses into an adjacent illustration: '+entry.id);
  assert.deepEqual(browser[entry.id],{src:entry.src,sha256:entry.sha256,x,y,size:width,width:atlas.width,height:atlas.height},'Browser differs from the reviewed crop: '+entry.id);
  const cell=[entry.src,x,y,width].join(':');assert(!cells.has(cell),'Two fifth-set cards share a crop.');cells.add(cell);
  assert(digest(entry.cellSha256)&&!hashes.has(entry.cellSha256),'Missing or duplicated individual image hash.');hashes.add(entry.cellSha256);
  assert(typeof entry.subject==='string'&&entry.subject.length>=40,'An individually authored scene direction is required.');
 }
 assert.equal(seen.size,96);assert.equal(cells.size,96);assert.equal(hashes.size,96);
 const cover=manifest.cover;
 assert.equal(cover.src,'assets/design-v3/packs/bk05-cover.webp');
 assert.equal(cover.width,1024);assert.equal(cover.height,1536);
 assert.equal(cover.nativeDimensionsPreserved,true);assert.equal(cover.method,'built-in-imagegen');
 assert.equal(cover.visualReview,'reviewed');assert.equal(cover.alpha,true);
 for(const key of ['sha256','sourceSha256','promptSha256'])assert(digest(cover[key]),'Missing fifth pack cover provenance.');
 return manifest;
}

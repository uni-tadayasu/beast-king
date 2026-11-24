/** Check the files actually shipped, including every illustrated card. */
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CARDS,STARTER_DECKS,getCardsForSet} from '../catalog.js';
import {CARD_ART_CROPS} from '../card-art-layouts.js';
import {CARD_ART_OVERRIDES} from '../card-art-overrides.js';
import {CARD_ART_EXPANSIONS} from '../card-art-expansion.js';
import {validateCardArtManifest} from './validate-card-art.mjs';
import {validateExpansionArtManifest} from './validate-expansion-art.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const directory='assets/design-v2/cards/individual/';
const read=path=>readFile(resolve(root,path));
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const manifest=JSON.parse(await read(directory+'manifest.json'));
const production=JSON.parse(await read(directory+'production.json'));
const artReview=JSON.parse(await read('assets/design-v2/art-direction-review.json'));
const expansion=JSON.parse(await read('assets/design-v3/cards/manifest.json'));
const premium=JSON.parse(await read('assets/design-v3/premium-assets.json'));
validateCardArtManifest(manifest,CARDS);
validateExpansionArtManifest(expansion,CARDS,CARD_ART_EXPANSIONS);
assert.equal(CARDS.length,4608,'The complete four-set release must contain 4,608 cards.');
assert(production.complete,'The card illustration release is incomplete.');
assert.equal(production.atlases.length,144,'Expected 144 completed illustration atlases.');
assert.equal(production.missing.length,0,'Missing native illustration atlases.');
const verified=new Map();
for(const atlas of production.atlases){
 const path=directory+atlas.atlas+'.webp',bytes=await read(path);
 assert.equal(hash(bytes),atlas.sha256,'Artwork changed after packaging: '+path);
 assert.equal(bytes.toString('ascii',0,4),'RIFF','Invalid WebP asset: '+path);
 assert.equal(bytes.toString('ascii',8,12),'WEBP','Invalid WebP asset: '+path);
 assert(atlas.width>=1000&&atlas.height>=1000,'Illustration master is too small: '+path);
 verified.set(path,atlas.sha256);
}
const king=directory+'king.webp';
verified.set(king,hash(await read(king)));
const cells=new Set();
for(const card of manifest.cards){
 assert.equal(card.sha256,verified.get(card.src),'Card references an unverified illustration: '+card.id);
 const cell=[card.src,card.column,card.row].join(':');
 assert(!cells.has(cell),'Two cards share one illustration cell: '+card.id);cells.add(cell);
 if(card.id==='B0512'){assert.equal(card.status,'preserved');continue;}
 assert.equal(card.status,'redrawn','Illustration has not been replaced: '+card.id);
 const crop=CARD_ART_CROPS[card.id];assert(crop,'Browser crop missing: '+card.id);
 assert.deepEqual([crop.x,crop.y,crop.size,crop.size],card.pixelCrop,'Browser crop differs from the production manifest: '+card.id);
 assert(crop.x>=0&&crop.y>=0&&crop.size>0&&crop.x+crop.size<=crop.width&&crop.y+crop.size<=crop.height,'Invalid crop bounds: '+card.id);
}
assert.equal(cells.size,2304);
const replacementFiles=new Map(),replacementCells=new Set();
for(const [id,r] of Object.entries(CARD_ART_OVERRIDES)){
 assert(id!=='B0512'&&CARDS.some(c=>c.id===id),'Invalid or protected override: '+id);
 assert(/^assets\/design-v2\/cards\/individual\/illustration-update-\d+\.webp$/.test(r.src),'Invalid override path');
 assert([r.x,r.y,r.size,r.width,r.height].every(Number.isInteger)&&r.x>=0&&r.y>=0&&r.size>0&&r.x+r.size<=r.width&&r.y+r.size<=r.height,'Invalid replacement crop: '+id);
 if(!replacementFiles.has(r.src)){const bytes=await read(r.src);assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');replacementFiles.set(r.src,hash(bytes));}
 assert.equal(replacementFiles.get(r.src),r.sha256,'Replacement image hash mismatch');
 const key=[r.src,r.x,r.y,r.size].join(':');assert(!replacementCells.has(key),'Duplicate replacement cell');replacementCells.add(key);
}
const reviewedIds=artReview.atlases.flatMap(atlas=>atlas.cardIds);
assert.equal(new Set(reviewedIds).size,artReview.redrawnCardCount,'A redrawn illustration must have one reviewed identity.');
const expectedReplacements=[...reviewedIds,...artReview.retainedPriorCardIds].sort();
assert.deepEqual(Object.keys(CARD_ART_OVERRIDES).sort(),expectedReplacements,'Browser overrides differ from the visually reviewed release.');
assert.equal(replacementCells.size,artReview.activeReplacementCount);
for(const atlas of artReview.atlases){
 assert.equal(atlas.cardIds.length,16,'A reviewed atlas must have all 16 cells.');
 assert.equal(replacementFiles.get(atlas.src),atlas.sha256,'Reviewed atlas hash mismatch.');
 for(const id of atlas.cardIds)assert.equal(CARD_ART_OVERRIDES[id].src,atlas.src,'Reviewed card points to a different illustration: '+id);
}
for(const setId of ['BK01','BK02','BK03','BK04'])assert.equal(getCardsForSet(setId).length,1152);
assert.equal(STARTER_DECKS.length,4);
for(const deck of STARTER_DECKS){
 assert.equal(deck.ids.length,32);assert.equal(deck.specialIds.length,4);
 for(const id of [...deck.ids,...deck.specialIds])assert(manifest.cards.some(c=>c.id===id&&c.status==='redrawn'),'Starter artwork missing: '+id);
}
const fields=await Promise.all(['solo','multi','rank'].map(name=>read('assets/design-v2/backgrounds/'+name+'.webp')));
assert.equal(new Set(fields.map(hash)).size,3,'Each game mode needs a different battlefield.');
const illustratedFields=new Set();
for(const background of artReview.backgrounds){
 const bytes=await read(background.src);
 assert.equal(hash(bytes),background.sha256,'Reviewed background changed: '+background.id);
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
 if(['solo','multi','rank'].includes(background.id))illustratedFields.add(hash(bytes));
}
assert.equal(illustratedFields.size,3,'The illustrated release must have three distinct arenas.');
assert((await read('card-art-direction.js')).includes('bk-card-painted-ink'),'Missing shared illustration finish.');
function webpDimensions(bytes){
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
 for(let at=12;at+8<=bytes.length;){
  const type=bytes.toString('ascii',at,at+4),length=bytes.readUInt32LE(at+4),data=at+8;
  assert(data+length<=bytes.length,'Truncated WebP chunk.');
  if(type==='VP8X')return [bytes.readUIntLE(data+4,3)+1,bytes.readUIntLE(data+7,3)+1];
  if(type==='VP8 ')return [bytes.readUInt16LE(data+6)&0x3fff,bytes.readUInt16LE(data+8)&0x3fff];
  if(type==='VP8L'){const bits=bytes.readUInt32LE(data+1);return [(bits&0x3fff)+1,((bits>>>14)&0x3fff)+1];}
  at=data+length+(length%2);
 }
 throw new Error('WebP contains no image dimensions.');
}
const expansionFiles=new Set();
for(const atlas of expansion.atlases){
 const bytes=await read(atlas.src);
 assert.equal(hash(bytes),atlas.sha256,'Expansion illustration changed after review: '+atlas.id);
 assert.deepEqual(webpDimensions(bytes),[atlas.width,atlas.height],'Expansion native image dimensions differ from the crop registry.');
 assert(!expansionFiles.has(atlas.sha256),'Two expansion atlases reuse an identical image.');expansionFiles.add(atlas.sha256);
}
assert.equal(expansionFiles.size,96);
assert.deepEqual(premium.assets.map(a=>a.id).sort(),['bk01','bk02','bk03','bk04','realm']);
const premiumHashes=new Set();
for(const asset of premium.assets){
 const bytes=await read(asset.src);
 assert.equal(hash(bytes),asset.sha256,'Premium illustration changed after review: '+asset.id);
 assert.deepEqual(webpDimensions(bytes),[asset.width,asset.height]);
 assert.equal(asset.nativeDimensionsPreserved,true);assert.equal(asset.method,'built-in-imagegen');
 assert(!premiumHashes.has(asset.sha256),'Each edition and realm needs distinct imagery.');premiumHashes.add(asset.sha256);
}
for(const path of ['assets/icon.svg','assets/favicon-32.png','assets/apple-touch-icon.png','assets/social-ogp.jpg','assets/audio/menu.mp3','assets/audio/battle.mp3','assets/audio/battle-danger.mp3'])assert((await stat(resolve(root,path))).size>0,'Missing shipped asset: '+path);
console.log(JSON.stringify({cards:CARDS.length,uniqueIllustrations:cells.size+expansion.cards.length,atlases:production.atlases.length+expansionFiles.size,originalAtlasIllustrations:manifest.cards.filter(c=>c.status==='redrawn').length,newlyRedrawnIllustrations:artReview.redrawnCardCount,newExpansionIllustrations:expansion.cards.length,newExpansionAtlases:expansionFiles.size,preserved:['B0512'],packs:[1152,1152,1152,1152],starters:4,battlefields:3,illustrationReplacements:replacementCells.size,premiumAssets:premiumHashes.size,allFilesVerified:true}));

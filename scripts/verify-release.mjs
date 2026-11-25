/** Check the files actually shipped, including every illustrated card. */
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CARDS,STARTER_DECKS,getCardsForSet,getCard,validateDeck,validateSpecialDeck} from '../catalog.js';
import {CARD_ART_CROPS} from '../card-art-layouts.js';
import {CARD_ART_OVERRIDES} from '../card-art-overrides.js';
import {CARD_ART_EXPANSIONS} from '../card-art-expansion.js';
import {CARD_ART_FIFTH} from '../card-art-fifth.js';
import {CARD_ART_USER_OVERRIDES,CARD_ART_USER_GROUPS} from '../card-art-user.js';
import {PREMIUM_CARD_ART} from '../card-art-premium.js';
import {PREMIUM_CARD_IDS,PREMIUM_SET_ADDITIONS,PREMIUM_CARD_SET_ASSIGNMENTS,REGALIA_CARD_ID} from '../premium-cards.js';
import {PREMIUM_DECK} from '../premium-deck.js';
import {validateCardArtManifest} from './validate-card-art.mjs';
import {validateExpansionArtManifest} from './validate-expansion-art.mjs';
import {validateFifthArtManifest} from './validate-fifth-art.mjs';
import {CARD_FOREGROUND_MASKS} from '../card-foreground-masks.js';
import {validateForegroundMaskManifest} from './validate-foreground-masks.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const directory='assets/design-v2/cards/individual/';
const read=path=>readFile(resolve(root,path));
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const foregroundMasks=await validateForegroundMaskManifest(CARD_FOREGROUND_MASKS,CARDS,{root});
assert.equal(foregroundMasks.cards,2625,'Every public beast/fusion must have a verified mask.');
const manifest=JSON.parse(await read(directory+'manifest.json'));
const production=JSON.parse(await read(directory+'production.json'));
const artReview=JSON.parse(await read('assets/design-v2/art-direction-review.json'));
const expansion=JSON.parse(await read('assets/design-v3/cards/manifest.json'));
const fifth=JSON.parse(await read('assets/design-v5/cards/manifest.json'));
const premium=JSON.parse(await read('assets/design-v3/premium-assets.json'));
validateCardArtManifest(manifest,CARDS);
validateExpansionArtManifest(expansion,CARDS,CARD_ART_EXPANSIONS);
validateFifthArtManifest(fifth,CARDS,CARD_ART_FIFTH);
assert.equal(CARDS.length,4721,'The fifth release adds 96 Dream Realm cards while preserving all 4625 prior cards.');
assert.equal(getCardsForSet('BK05').length,96);
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
for(const setId of ['BK01','BK02','BK03','BK04'])assert.equal(getCardsForSet(setId).length,1152+PREMIUM_SET_ADDITIONS[setId]);
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
const fifthHashes=new Set();
for(const asset of [...fifth.atlases,fifth.cover]){
 const bytes=await read(asset.src);
 assert.equal(hash(bytes),asset.sha256,'Fifth-set artwork changed after review: '+asset.id);
 assert.deepEqual(webpDimensions(bytes),[asset.width,asset.height],'Fifth-set native dimensions differ from the manifest.');
 assert(!fifthHashes.has(asset.sha256),'Fifth-set assets must be independently illustrated.');
 assert(!expansionFiles.has(asset.sha256),'Fifth-set artwork must not reuse earlier expansion art.');
 fifthHashes.add(asset.sha256);
}
assert.equal(fifthHashes.size,5,'Four new atlases and one distinct cover are required.');

assert.deepEqual(premium.assets.map(a=>a.id).sort(),['bk01','bk02','bk03','bk04','realm']);
const premiumHashes=new Set();
for(const asset of premium.assets){
 const bytes=await read(asset.src);
 assert.equal(hash(bytes),asset.sha256,'Premium illustration changed after review: '+asset.id);
 assert.deepEqual(webpDimensions(bytes),[asset.width,asset.height]);
 assert.equal(asset.nativeDimensionsPreserved,true);assert.equal(asset.method,'built-in-imagegen');
 assert(!premiumHashes.has(asset.sha256),'Each edition and realm needs distinct imagery.');premiumHashes.add(asset.sha256);
}
for(const path of ['assets/icon.svg','assets/favicon-32.png','assets/apple-touch-icon.png','assets/social-ogp.jpg','assets/audio/menu.mp3','assets/audio/battle.mp3','assets/audio/battle-event.mp3','assets/audio/battle-danger.mp3'])assert((await stat(resolve(root,path))).size>0,'Missing shipped asset: '+path);
assert.equal(hash(await read('assets/audio/battle-event.mp3')),'999c21d7bb4d7e58c088eeaf3e2fe7dc065b7bf10dcf07bb3c905e5ab221fb81','Event music must be the unchanged uploaded MP3.');
function pngDimensions(bytes){
 assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a','Expected an unchanged native PNG.');
 assert.equal(bytes.toString('ascii',12,16),'IHDR');
 return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
}
const nativePremium=JSON.parse(await read('assets/design-v4/premium/manifest.json'));
assert.equal(nativePremium.status,'complete');assert.equal(nativePremium.completedCount,17);
assert.equal(nativePremium.generationTool,'built-in-imagegen');assert.equal(nativePremium.generationMode,'one-call-per-asset');
assert.deepEqual(Object.keys(PREMIUM_CARD_ART).sort(),[...PREMIUM_CARD_IDS].sort(),'Every new premium card needs its own illustration.');
assert.deepEqual(nativePremium.assets.map(a=>a.id).sort(),[...PREMIUM_CARD_IDS].sort());
const nativeHashes=new Set();
for(const record of nativePremium.assets){
 const card=getCard(record.id),art=PREMIUM_CARD_ART[record.id],bytes=await read(art.src);
 assert.equal(card.rarity,'GGR');assert.equal(card.setId,PREMIUM_CARD_SET_ASSIGNMENTS[card.id]);
 assert.equal(record.status,'complete');assert.equal(record.visualReview.status,'passed');
 assert.equal(art.provenance,'built-in-imagegen');assert.equal(art.src,record.src);
 assert.equal(hash(bytes),art.sha256);assert.equal(record.sha256,art.sha256);assert.equal(record.nativeOutput.sha256,art.sha256);
 assert.equal(bytes.length,record.bytes);assert.equal(bytes.length,record.nativeOutput.bytes);
 assert.deepEqual(pngDimensions(bytes),[art.width,art.height]);assert.deepEqual([record.nativeOutput.width,record.nativeOutput.height],[art.width,art.height]);
 assert(art.width>=1024&&art.height>=1024,'Premium native image is too small: '+card.id);
 assert(!nativeHashes.has(art.sha256),'New premium cards must not reuse an image.');nativeHashes.add(art.sha256);
}
assert.equal(validateDeck(PREMIUM_DECK.ids).valid,true);assert.equal(validateSpecialDeck(PREMIUM_DECK.specialIds).valid,true);
assert.deepEqual([...new Set([...PREMIUM_DECK.ids,...PREMIUM_DECK.specialIds])].sort(),[REGALIA_CARD_ID,...PREMIUM_CARD_IDS].sort());
for(const id of [REGALIA_CARD_ID,...PREMIUM_CARD_IDS])assert.equal(getCard(id).rarity,'GGR','All premium deck cards must be GGR: '+id);
const selva=CARD_ART_USER_GROUPS['selva-family-20261124'];
assert.equal(selva.exactOriginal,true);assert.equal(selva.provenance,'user-provided');assert.equal(selva.cardIds.length,8);
assert.deepEqual(Object.keys(CARD_ART_USER_OVERRIDES).sort(),[...selva.cardIds].sort());
const selvaBytes=await read(selva.src);assert.equal(hash(selvaBytes),'4dc15129aedbccf18d4d8d89d512a72b8645cbf3f13283c2ab01bcd3bbf943a6');
assert.equal(selvaBytes.length,selva.bytes);assert.deepEqual(pngDimensions(selvaBytes),[1086,1448]);
for(const id of selva.cardIds){
 const art=CARD_ART_USER_OVERRIDES[id];assert(getCard(id).name.includes('セルヴァ'));
 assert.equal(art.sharedGroup,'selva-family-20261124');assert.equal(art.src,selva.src);assert.equal(art.sha256,hash(selvaBytes));
 assert.deepEqual([art.width,art.height],[1086,1448]);assert.equal(art.fit,'cover');
}
// Count the illustrations actually selected by the browser, including the
// explicitly requested shared Selva portrait, rather than obsolete atlas cells.
const originalMap=new Map(manifest.cards.map(card=>[card.id,card])),effective=new Map();
for(const card of CARDS){
 const art=CARD_ART_USER_OVERRIDES[card.id]||PREMIUM_CARD_ART[card.id]||CARD_ART_FIFTH[card.id]||CARD_ART_EXPANSIONS[card.id]||CARD_ART_OVERRIDES[card.id]||originalMap.get(card.id);
 assert(art,'No effective public illustration: '+card.id);
 const crop=art.pixelCrop||(art.size?[art.x,art.y,art.size,art.size]:null);
 const identity=art.sha256+':'+(crop?crop.join(','):'full');
 if(!effective.has(identity))effective.set(identity,[]);effective.get(identity).push(card.id);
}
const shared=[...effective.values()].filter(ids=>ids.length>1);
assert.equal(shared.length,1);assert.deepEqual(shared[0].sort(),[...selva.cardIds].sort());
assert.equal(effective.size,4714);
console.log(JSON.stringify({cards:CARDS.length,uniqueIllustrations:effective.size,explicitSharedArtwork:{selva:selva.cardIds.length},newPremiumIllustrations:nativeHashes.size,premiumDeckGgrTypes:18,atlases:production.atlases.length+expansionFiles.size+fifth.atlases.length,originalAtlasIllustrations:manifest.cards.filter(c=>c.status==='redrawn').length,newlyRedrawnIllustrations:artReview.redrawnCardCount,newExpansionIllustrations:expansion.cards.length,newExpansionAtlases:expansionFiles.size,preserved:['B0512'],fifthIllustrations:fifth.cards.length,fifthAtlases:fifth.atlases.length,packs:['BK01','BK02','BK03','BK04','BK05'].map(id=>getCardsForSet(id).length),starters:4,battlefields:3,illustrationReplacements:replacementCells.size,premiumAssets:premiumHashes.size,foregroundMasks,allFilesVerified:true}));

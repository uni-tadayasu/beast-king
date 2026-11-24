import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CARDS} from '../catalog.js';
import {validateExpansionArtManifest} from '../scripts/validate-expansion-art.mjs';

// Synthetic metadata tests the release boundary, not whether generated pixels
// look good. Actual files, dimensions and hashes are checked by verify:release.
const plan=JSON.parse(readFileSync(new URL('../assets/design-v3/cards/generation-jobs.json',import.meta.url),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(){
 const browser={},cards=[],atlases=[];
 for(const job of plan.jobs){
  const sha256=hash(job.id),atlas={id:job.id,src:job.src,sha256,sourceSha256:hash(job.id+'source'),promptSha256:hash(job.prompt),width:1536,height:1024,columns:6,rows:4,x:[0,256,512,768,1024,1280,1536],y:[0,256,512,768,1024],nativeDimensionsPreserved:true,visualReview:'reviewed',cardIds:job.cardIds};
  atlases.push(atlas);
  for(const [i,c] of job.cards.entries()){
   const column=i%6,row=Math.floor(i/6),x=column*256+10,y=row*256+10;
   cards.push({...c,src:job.src,column,row,columns:6,rows:4,sourceSize:[1536,1024],pixelCrop:[x,y,235,235],sha256,cellSha256:hash(c.id),status:'illustrated-original',method:'built-in-imagegen'});
   browser[c.id]={src:job.src,sha256,x,y,size:235,width:1536,height:1024};
  }
 }
 return {browser,manifest:{version:1,method:'built-in-imagegen',total:2304,atlasCount:96,columns:6,rows:4,nativeCellPixelsMinimum:256,atlasSafetyInset:.04,complete:true,uniqueCropHashes:2304,cards,atlases}};
}
test('expansion release contract covers exactly every new card with an independently directed cell',()=>{
 const {manifest,browser}=fixture();assert.equal(validateExpansionArtManifest(manifest,CARDS,browser),manifest);
 assert.equal(new Set(plan.jobs.flatMap(j=>j.cards.map(c=>c.subject+' '+c.palette))).size,2304,'Repeated scene direction would produce avoidable composition reuse.');
});
test('a partial development map cannot pass the production release boundary',()=>{
 const {manifest,browser}=fixture();delete browser.B1537;
 assert.throws(()=>validateExpansionArtManifest(manifest,CARDS,browser),/explicit browser crop/);
});
test('a crop cannot include an adjacent scene even when the browser map agrees',()=>{
 const {manifest,browser}=fixture(),entry=manifest.cards[0];entry.pixelCrop[0]=200;browser[entry.id].x=200;
 assert.throws(()=>validateExpansionArtManifest(manifest,CARDS,browser),/adjacent illustration/);
});
test('different cell addresses cannot hide a reused image',()=>{
 const {manifest,browser}=fixture();manifest.cards[1].cellSha256=manifest.cards[0].cellSha256;
 assert.throws(()=>validateExpansionArtManifest(manifest,CARDS,browser),/Duplicate or missing individual image hash/);
});
test('unreviewed generation output is not treated as a visual approval',()=>{
 const {manifest,browser}=fixture();manifest.atlases[0].visualReview='pending';
 assert.throws(()=>validateExpansionArtManifest(manifest,CARDS,browser),/not a visual review/);
});
test('small upscaled images and operator identities cannot enter the expansion mapping',()=>{
 let {manifest,browser}=fixture();manifest.nativeCellPixelsMinimum=156.75;
 assert.throws(()=>validateExpansionArtManifest(manifest,CARDS,browser),/upscaled small images/);
 ({manifest,browser}=fixture());manifest.cards[0].id='B0512';
 assert.throws(()=>validateExpansionArtManifest(manifest,CARDS,browser),/Unknown or duplicate new artwork/);
});

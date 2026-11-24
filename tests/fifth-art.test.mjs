import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CARDS} from '../catalog.js';
import {CARD_ART_FIFTH} from '../card-art-fifth.js';
import {validateFifthArtManifest} from '../scripts/validate-fifth-art.mjs';

const root=new URL('../',import.meta.url);
const fixture=()=>JSON.parse(readFileSync(new URL('assets/design-v5/cards/manifest.json',root),'utf8'));
const browser=()=>structuredClone(CARD_ART_FIFTH);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('the fifth set ships 96 reviewed original crops and the matching native source bytes',()=>{
 const manifest=fixture();validateFifthArtManifest(manifest,CARDS,CARD_ART_FIFTH);
 for(const atlas of [...manifest.atlases,manifest.cover])assert.equal(hash(readFileSync(new URL(atlas.src,root))),atlas.sha256,atlas.src);
 for(const atlas of manifest.atlases){
  const record=JSON.parse(readFileSync(new URL('assets/design-v5/cards/generation-records/'+atlas.id+'.json',root),'utf8'));
  assert.equal(record.sha256,atlas.sha256);assert.equal(record.visualReview,'reviewed');
  assert.equal(record.promptSha256,hash(readFileSync(new URL('assets/design-v5/cards/prompts/'+atlas.id+'.txt',root))));
 }
 assert.equal(manifest.cover.promptSha256,hash(readFileSync(new URL('assets/design-v5/cover-prompt.txt',root))));
});
test('a missing fifth-set crop or unreviewed atlas blocks publication',()=>{
 const map=browser();delete map.B2056;
 assert.throws(()=>validateFifthArtManifest(fixture(),CARDS,map),/explicit browser crop/);
 const manifest=fixture();manifest.atlases[0].visualReview='pending';
 assert.throws(()=>validateFifthArtManifest(manifest,CARDS,CARD_ART_FIFTH),/not a visual review/);
});
test('duplicate fifth-set paintings cannot be hidden under different card identifiers',()=>{
 const manifest=fixture();manifest.cards[1].cellSha256=manifest.cards[0].cellSha256;
 assert.throws(()=>validateFifthArtManifest(manifest,CARDS,CARD_ART_FIFTH),/duplicated individual image hash/);
});
test('fifth-set crops may not cross into the neighbouring illustration',()=>{
 const manifest=fixture(),map=browser(),entry=manifest.cards[0];entry.pixelCrop[0]=200;map[entry.id].x=200;
 assert.throws(()=>validateFifthArtManifest(manifest,CARDS,map),/adjacent illustration/);
});

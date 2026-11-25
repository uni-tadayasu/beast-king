import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import * as catalog from '../catalog.js';
import * as compatibility from '../rebuild/catalog.js';
import {CARD_ART_CROPS} from '../card-art-layouts.js';
import {CARD_ART_OVERRIDES} from '../card-art-overrides.js';
import {CARD_ART_EXPANSIONS} from '../card-art-expansion.js';
import {ARTWORK_OVERRIDES} from '../rebuild/artwork-manifest.js';
import {CARD_ART_USER_OVERRIDES,CARD_ART_USER_GROUPS} from '../card-art-user.js';
import {isApexReliefCard} from '../card-relief.js';

const SELVA_IDS=['B0263','B0271','B0279','B0287','B0295','B0303','B0311','B0319'];
const ORIGINAL_SHA256='4dc15129aedbccf18d4d8d89d512a72b8645cbf3f13283c2ab01bcd3bbf943a6';
const ORIGINAL_PATH='assets/user-art/selva-20261124.png';
const GROUP_ID='selva-family-20261124';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function section(source,start,end){
 const first=source.indexOf(start),last=source.indexOf(end,first);
 assert.ok(first>=0&&last>first,'The real frontend rendering functions must be present');
 return source.slice(first,last);
}
async function mainRenderer(){
 const source=read('app.js');
 const artwork={CARD_ART_CROPS,CARD_ART_OVERRIDES,CARD_ART_EXPANSIONS,CARD_ART_USER_OVERRIDES};
 for(const match of source.matchAll(/^import\s+[^\n]+\s+from\s+['"](\.\/card-art-[^'"]+)['"]/gm)){
  Object.assign(artwork,await import(new URL(match[1].split('?')[0],new URL('../app.js',import.meta.url))));
 }
 return vm.runInNewContext(section(source,'function artStyle(','const navItems=')+'\n({artStyle,cardMarkup});',{
  ...catalog,...artwork,isApexReliefCard,
  REGALIA_ID:'B0512',elementMap:Object.fromEntries(catalog.ELEMENTS.map(element=>[element.id,element])),
  typeColors:{beast:'#f00',fusion:'#0f0',miracle:'#00f',gimmick:'#fff'},
  regaliaStatus:()=> 'public',operatorRegaliaArt:()=>null,esc,icon:()=>'<svg></svg>'
 });
}
function compatibilityRenderer(){
 const source=read('rebuild/app.js');
 return vm.runInNewContext(section(source,'function artOverride(','function save(')+'\n'+section(source,'function art(c,','function onboard(')+'\n({art,card});',{
  ...compatibility,ARTWORK_OVERRIDES,CARD_ART_CROPS,CARD_ART_OVERRIDES,CARD_ART_USER_OVERRIDES,
  operatorGrant:null,origin:id=>compatibility.ORIGINS.find(origin=>origin.id===id),
  typeIcons:{beast:'beast',fusion:'fusion',miracle:'spark',gimmick:'trap'},esc,icon:()=>'<svg></svg>'
 });
}

test('the supplied Selva PNG remains byte-identical at its native portrait dimensions',()=>{
 const bytes=readFileSync(new URL('../'+ORIGINAL_PATH,import.meta.url));
 assert.equal(bytes.length,3717674);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),ORIGINAL_SHA256);
 assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 assert.equal(bytes.toString('ascii',12,16),'IHDR');
 assert.equal(bytes.readUInt32BE(16),1086);
 assert.equal(bytes.readUInt32BE(20),1448);
});

test('only the eight Selva printings share the explicitly declared user illustration',()=>{
 assert.deepEqual(Object.keys(CARD_ART_USER_OVERRIDES).sort(),SELVA_IDS);
 assert.deepEqual(catalog.CARDS.filter(card=>card.name.includes('セルヴァ')).map(card=>card.id).sort(),SELVA_IDS);
 assert.deepEqual(compatibility.CARDS.filter(card=>card.name.includes('セルヴァ')).map(card=>card.id).sort(),SELVA_IDS);
 assert.deepEqual(Object.keys(CARD_ART_USER_GROUPS),[GROUP_ID]);
 const group=CARD_ART_USER_GROUPS[GROUP_ID];
 assert.deepEqual(group.cardIds,SELVA_IDS);
 assert.equal(group.exactOriginal,true);
 assert.equal(group.provenance,'user-provided');
 assert.equal(group.bytes,3717674);
 assert.ok(group.reason.length>0);
 for(const id of SELVA_IDS){
  const original=CARD_ART_USER_OVERRIDES[id];
  assert.equal(original.src,ORIGINAL_PATH);
  assert.equal(original.sha256,ORIGINAL_SHA256);
  assert.equal(original.sharedGroup,GROUP_ID);
  assert.equal(original.fit,'cover');
  assert.equal(original.position,'center');
  for(const key of ['src','sha256','width','height','provenance'])assert.equal(original[key],group[key]);
  for(const cropKey of ['x','y','size'])assert.equal(original[cropKey],undefined,'Native originals must not become square atlas cells');
 }
 assert.equal(new Set(SELVA_IDS.map(id=>CARD_ART_USER_OVERRIDES[id].sha256)).size,1);
});

test('main card rendering uses the full PNG for every Selva rarity and retains its finish',async()=>{
 const renderer=await mainRenderer();
 for(const id of SELVA_IDS){
  const card=catalog.getCard(id),style=renderer.artStyle(card),markup=renderer.cardMarkup(card);
  assert.ok(style.includes(ORIGINAL_PATH+'?v='+ORIGINAL_SHA256.slice(0,12)));
  assert.ok(style.includes('background-size:cover'));
  assert.ok(style.includes('background-position:center'));
  assert.ok(style.includes('background-repeat:no-repeat'));
  assert.ok(!style.includes('NaN')&&!style.includes('Infinity'));
  assert.ok(markup.includes('game-card rarity-'+card.rarity));
  assert.ok(markup.includes('card-finish rarity-'+card.rarity));
  assert.ok(markup.includes('data-id="'+id+'"'));
 }
 assert.ok(!renderer.artStyle(catalog.getCard('B0262')).includes('assets/user-art/'));
 assert.ok(renderer.artStyle(catalog.getCard('B0512')).includes('king.webp'));
});

test('old-save client uses the same PNG in its shared card renderer and retains rarity classes',()=>{
 const renderer=compatibilityRenderer();
 for(const id of SELVA_IDS){
  const card=compatibility.getCard(id),style=renderer.art(card),markup=renderer.card(card);
  assert.ok(style.includes('../'+ORIGINAL_PATH+'?v='+ORIGINAL_SHA256.slice(0,12)));
  assert.ok(style.includes('background-size:cover'));
  assert.ok(style.includes('background-position:center'));
  assert.ok(markup.includes('class="card beast '+card.rarity+' '));
  assert.ok(markup.includes('data-id="'+id+'"'));
 }
 assert.ok(!renderer.art(compatibility.getCard('B0262')).includes('assets/user-art/'));
 assert.ok(renderer.art(compatibility.getCard(compatibility.SECOND_REGALIA_ID)).includes('king.webp'));
});

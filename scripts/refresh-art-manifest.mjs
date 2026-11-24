/** Finish a complete, native-resolution atlas release. No image synthesis or edits. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CARDS,STARTER_DECKS,getCardsForSet} from '../catalog.js';
import {validateCardArtManifest} from './validate-card-art.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const directory='assets/design-v2/cards/individual/';
const read=path=>readFile(resolve(root,path),'utf8');
const production=JSON.parse(await read(directory+'production.json'));
assert(production.complete&&production.atlases.length===144,'All 144 atlas originals must be present before release.');
const layouts=JSON.parse(await read(directory+'layouts.json'));
assert.equal(Object.keys(layouts.atlases).length,144);
const sha=data=>createHash('sha256').update(data).digest('hex');
const sources=new Map();
for(const item of production.atlases){
 const src=directory+item.atlas+'.webp',bytes=await readFile(resolve(root,src));
 assert.equal(sha(bytes),item.sha256,'Changed artwork bytes: '+src);
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
 sources.set(src,item.sha256);
}
const king=await readFile(resolve(root,directory+'king.webp'));
sources.set(directory+'king.webp',sha(king));
const inset=.012,crops={},keys=new Set();
const cards=CARDS.filter(card=>['BK01','BK02'].includes(card.setId)).map(card=>{
 const n=Number(card.id.slice(1))-1,protectedKing=card.id==='B0512';
 const src=directory+(protectedKing?'king':card.type+'-'+String(Math.floor(n/16)+1).padStart(2,'0'))+'.webp';
 const column=protectedKing?0:n%4,row=protectedKing?0:Math.floor(n%16/4);
 const entry={id:card.id,name:card.name,setId:card.setId,src,column,row,columns:protectedKing?1:4,rows:protectedKing?1:4,sha256:sources.get(src),status:protectedKing?'preserved':'redrawn'};
 assert(entry.sha256,'Missing source: '+src);
 const key=src+':'+column+':'+row;assert(!keys.has(key),'Two cards share an artwork cell: '+key);keys.add(key);
 if(!protectedKing){
  const {width,height,x,y}=layouts.atlases[src.split('/').at(-1)];
  const cw=x[column+1]-x[column],ch=y[row+1]-y[row],size=Math.floor(Math.min(cw,ch)*(1-inset*2));
  const px=Math.round(x[column]+(cw-size)/2),py=Math.round(y[row]+(ch-size)/2);
  entry.pixelCrop=[px,py,size,size];entry.sourceSize=[width,height];
  crops[card.id]={x:px,y:py,size,width,height};
 }
 return entry;
});
const manifest={version:3,copyright:'© 2026 Beast King',total:cards.length,edition:'2026-11-24',atlasSafetyInset:inset,layout:{columns:4,rows:4},cards};
validateCardArtManifest(manifest,CARDS);
assert(STARTER_DECKS.flatMap(d=>[...d.ids,...d.specialIds]).every(id=>cards.some(c=>c.id===id&&c.status==='redrawn')),'Every starter card must use the new illustrations.');
for(const id of ['BK01','BK02'])assert.equal(getCardsForSet(id).length,1152);
await writeFile(resolve(root,directory+'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(resolve(root,'card-art-layouts.js'),'/** Native atlas crops shared by both game frontends. */\nexport const CARD_ART_CROPS = Object.freeze('+JSON.stringify(crops,null,2)+');\n');
await writeFile(resolve(root,'rebuild/artwork-manifest.js'),`/** All 2,304 cards use the complete shared atlas release.\n * Normal Regalia printings retain the established king.webp illustration.\n * This map is reserved for future individually approved replacements. */\nexport const ARTWORK_OVERRIDES=Object.freeze({});\nexport const ARTWORK_EDITION='2026-11-24';\n`);
console.log(JSON.stringify({cards:cards.length,uniqueArtworkCells:keys.size,atlases:production.atlases.length,redrawn:cards.filter(c=>c.status==='redrawn').length,preserved:cards.filter(c=>c.status==='preserved').map(c=>c.id),starters:STARTER_DECKS.length}));

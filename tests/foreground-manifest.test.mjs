import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateForegroundMaskManifest} from '../scripts/validate-foreground-masks.mjs';
import {summonMaskSourceKey} from '../summon-mask.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function pngHeader(width=2048,height=2048){
 const bytes=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a','hex').copy(bytes);
 bytes.writeUInt32BE(13,8);bytes.write('IHDR',12,'ascii');bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);bytes[24]=8;
 return bytes;
}
function fixture(){
 const cards=[{id:'B0001',type:'beast'},{id:'B0002',type:'beast'},{id:'F0001',type:'fusion'},{id:'M0001',type:'miracle'}];
 const files=new Map([['assets/original.webp',Buffer.from('original public atlas bytes')],['assets/foreground/atlas-001.png',pngHeader()]]),reads=[];
 const arts=Object.fromEntries(cards.map((card,index)=>[card.id,{cardId:card.id,src:'assets/original.webp?v=original',sourceWidth:1024,sourceHeight:1024,crop:{x:index*256,y:0,width:256,height:256}}]));
 const rows=Object.fromEntries(cards.filter(card=>card.type!=='miracle').map((card,index)=>[card.id,{sourceKey:summonMaskSourceKey(arts[card.id]),src:'assets/foreground/atlas-001.png?v=mask',sourceWidth:2048,sourceHeight:2048,crop:{x:index*256,y:0,width:256,height:256},sourceSha256:hash(files.get('assets/original.webp')),sha256:hash(files.get('assets/foreground/atlas-001.png')),maskStats:{pixels:65536,clearPixels:32768,visiblePixels:32768,alphaSum:32768*255,nativeAlpha:false}}]));
 const options={resolveArt:card=>arts[card.id],readAsset:async path=>{reads.push(path);if(!files.has(path))throw Error('Missing fixture '+path);return files.get(path);}};
 return {cards,files,reads,arts,rows,options};
}

test('foreground release verifies exact coverage and reads each original/atlas only once',async()=>{
 const f=fixture(),report=await validateForegroundMaskManifest(f.rows,f.cards,f.options);
 assert.deepEqual(report,{cards:3,uniqueSources:3,sourceFiles:1,atlases:1,tiles:3,tileSize:256,atlasSize:2048,allFilesVerified:true});
 assert.deepEqual(f.reads,['assets/original.webp','assets/foreground/atlas-001.png']);
});

test('missing creatures, extra spell entries, and stale original crops cannot pass release',async()=>{
 const missing=fixture();delete missing.rows.B0002;
 await assert.rejects(validateForegroundMaskManifest(missing.rows,missing.cards,missing.options),/Every public creature/);
 const extra=fixture();extra.rows.M0001={...extra.rows.B0001};
 await assert.rejects(validateForegroundMaskManifest(extra.rows,extra.cards,extra.options),/Every public creature/);
 const stale=fixture();stale.arts.B0001.crop.x=1;
 await assert.rejects(validateForegroundMaskManifest(stale.rows,stale.cards,stale.options),/Stale or mismatched/);
});

test('source and mask hash mismatches fail before a changed illustration can reuse old alpha',async()=>{
 const source=fixture();source.files.set('assets/original.webp',Buffer.from('changed original'));
 await assert.rejects(validateForegroundMaskManifest(source.rows,source.cards,source.options),/Original artwork changed/);
 const atlas=fixture();atlas.files.get('assets/foreground/atlas-001.png')[32]=1;
 await assert.rejects(validateForegroundMaskManifest(atlas.rows,atlas.cards,atlas.options),/Foreground atlas changed/);
 for(const key of ['sourceSha256','sha256']){
  const f=fixture();delete f.rows.B0001[key];
  await assert.rejects(validateForegroundMaskManifest(f.rows,f.cards,f.options),/Missing .*sha256/);
 }
});

test('mask tiles must be exact grid-aligned 256px crops in real 2048px PNG atlases',async()=>{
 for(const change of [row=>row.crop.x=1,row=>row.crop.width=255,row=>row.crop.x=2048,row=>row.sourceWidth=1024]){
  const f=fixture();change(f.rows.B0001);
  await assert.rejects(validateForegroundMaskManifest(f.rows,f.cards,f.options),/Foreground|foreground|Invalid public mask/);
 }
 const dimensions=fixture();dimensions.files.set('assets/foreground/atlas-001.png',pngHeader(1024,2048));
 await assert.rejects(validateForegroundMaskManifest(dimensions.rows,dimensions.cards,dimensions.options),/Actual foreground atlas dimensions/);
 const signature=fixture();signature.files.get('assets/foreground/atlas-001.png')[0]=0;
 await assert.rejects(validateForegroundMaskManifest(signature.rows,signature.cards,signature.options),/Invalid foreground PNG signature/);
});

test('only identical approved original sources can share a mask cell',async()=>{
 const f=fixture();f.rows.B0002.crop={...f.rows.B0001.crop};
 await assert.rejects(validateForegroundMaskManifest(f.rows,f.cards,f.options),/Different original illustrations share/);
 f.arts.B0002={...f.arts.B0001,cardId:'B0002'};f.rows.B0002.sourceKey=summonMaskSourceKey(f.arts.B0002);
 const report=await validateForegroundMaskManifest(f.rows,f.cards,f.options);
 assert.equal(report.uniqueSources,2);assert.equal(report.tiles,2);
});

test('private sources and external or traversing mask locations cannot become release assets',async()=>{
 for(const src of ['https://external.example/mask.png','data:image/png;base64,AAAA','assets/foreground/../private.png','assets/foreground/%2e%2e/private.png']){
  const f=fixture();f.rows.B0001.src=src;
  await assert.rejects(validateForegroundMaskManifest(f.rows,f.cards,f.options),/Invalid public mask|Unsafe foreground/);
 }
 const privateSource=fixture();privateSource.arts.B0001.src='data:image/webp;base64,AAAA';
 await assert.rejects(validateForegroundMaskManifest(privateSource.rows,privateSource.cards,privateSource.options),/No approved public source/);
});

test('gross mask failures and malformed statistics block the complete catalog gate',async()=>{
 for(const change of [
  row=>delete row.maskStats,
  row=>row.maskStats.nativeAlpha='false',
  row=>row.maskStats.pixels=1,
  row=>row.maskStats.clearPixels=.5,
  row=>row.maskStats.alphaSum=-1,
  row=>Object.assign(row.maskStats,{clearPixels:65536,visiblePixels:1,alphaSum:255}),
  row=>Object.assign(row.maskStats,{clearPixels:65536,visiblePixels:0,alphaSum:0}),
  row=>Object.assign(row.maskStats,{clearPixels:0,visiblePixels:65536,alphaSum:65536*255}),
  row=>Object.assign(row.maskStats,{clearPixels:65000,visiblePixels:536,alphaSum:536*255}),
  row=>Object.assign(row.maskStats,{clearPixels:536,visiblePixels:65000,alphaSum:65000*255}),
 ]){
  const f=fixture();change(f.rows.B0001);
  await assert.rejects(validateForegroundMaskManifest(f.rows,f.cards,f.options),/Foreground|foreground/);
 }
});

test('native alpha may have a white cache tile but must retain explicit measured provenance',async()=>{
 const f=fixture();Object.assign(f.rows.B0001.maskStats,{nativeAlpha:true,clearPixels:0,visiblePixels:65536,alphaSum:65536*255});
 assert.equal((await validateForegroundMaskManifest(f.rows,f.cards,f.options)).allFilesVerified,true);
 f.rows.B0001.maskStats.alphaSum=65536*255+1;
 await assert.rejects(validateForegroundMaskManifest(f.rows,f.cards,f.options),/outside pixel bounds/);
});

/** Build-time public foreground masks. This never resolves private artwork,
 * changes original images, or writes anything outside the chosen output dir.
 *
 * node scripts/build-summon-masks.mjs --model /path/model.onnx --output /tmp/masks \
 *   --ids B0001,B0512,F0513 --review --threads 2 --input-size 512 --model-family lite
 * --shard uses zero-based indices, e.g. 0/4, 1/4, 2/4, 3/4.
 * Omitting --ids selects every canonical beast/fusion; do that only after QA.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,realpath,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {CARDS} from '../catalog.js';
import {resolveSummonArt,computeSummonArtCrop} from '../summon-art.js';
import {summonMaskSourceKey,applySummonMask} from '../summon-mask.js';
import {sampleSummonCrop,normalizeBiRefNetInput,prepareLogitMask,prepareProbabilityMask,grayscaleRgba,nativeForegroundAlpha,measureMask} from './summon-mask-utils.mjs';

// ONNX Runtime's documented process-wide opt-out must precede native loading.
// The build sends no runtime telemetry or image data to external services.
process.env.ORT_DISABLE_TELEMETRY='1';
assert.equal(process.env.ORT_DISABLE_TELEMETRY,'1','Native inference requires telemetry to be disabled');
const require=createRequire(import.meta.url),sharp=require('sharp'),ort=require('onnxruntime-node');
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..'),MASK_SIZE=256;
const MODEL_FAMILIES={
 lite:{id:'senty-au/BiRefNet_lite-ONNX-dynamic',sha256:'1e0da42f0fde010e32e938bad388457ecefe35806fde9d923421997861ae9391',
  url:'https://huggingface.co/senty-au/BiRefNet_lite-ONNX-dynamic/resolve/173d635935b93839608b9b9039da8d1d212471e9/onnx/model.onnx',
  inputName:'input_image',outputName:'output_image',outputEncoding:'logits',weightsHash:null,weightsUrl:null,weightsFile:null},
 dynamic:{id:'knowicki/rembg-models/birefnet_dynamic',sha256:'26b3231fe7d0790995456ba6e49e7e377a7a0ee1da50fc91d1c732acb30d29f0',
  url:'https://huggingface.co/knowicki/rembg-models/resolve/8d33a6ad9ce2666ebd682a8fd28e8310aee87a14/birefnet_dynamic/birefnet_dynamic.onnx',
  inputName:'input',outputName:'alpha',outputEncoding:'probabilities',weightsHash:'b26e42e6bdf7a664c0bbfed5051316e98b82ab7bd4fc6fe9bdc9c1a74a770eff',
  weightsUrl:'https://huggingface.co/knowicki/rembg-models/resolve/8d33a6ad9ce2666ebd682a8fd28e8310aee87a14/birefnet_dynamic/birefnet_dynamic.onnx.data',weightsFile:'birefnet_dynamic.onnx.data'}
};
const VERSION='birefnet-public-mask-v3',sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const textCompare=(a,b)=>a<b?-1:a>b?1:0;
const options={ids:null,output:null,model:null,modelFamily:'lite',shard:{index:0,total:1},threads:2,inputSize:512,review:false};
for(let i=2;i<process.argv.length;i++){
 const name=process.argv[i];
 if(name==='--review'){options.review=true;continue;}
 assert.ok(['--ids','--output','--model','--shard','--threads','--input-size','--model-family'].includes(name),'Unknown option: '+name);
 const value=process.argv[++i];assert.ok(value&&!value.startsWith('--'),'Missing value for '+name);
 if(name==='--ids')options.ids=[...new Set(value.split(',').filter(Boolean))];
 if(name==='--output')options.output=resolve(value);
 if(name==='--model')options.model=resolve(value);
 if(name==='--model-family')options.modelFamily=value;
 if(name==='--threads')options.threads=Number(value);
 if(name==='--input-size')options.inputSize=Number(value);
 if(name==='--shard'){
  const match=value.match(/^(\d+)\/(\d+)$/);assert.ok(match,'Expected zero-based --shard i/n');
  options.shard={index:Number(match[1]),total:Number(match[2])};
 }
}
assert.ok(options.model&&options.output,'--model and --output are required');
assert.ok(Number.isInteger(options.threads)&&options.threads>=1&&options.threads<=16,'--threads must be 1..16');
assert.ok([512,768,1024].includes(options.inputSize),'--input-size must be 512, 768 or 1024');
const INPUT_SIZE=options.inputSize;
assert.ok(Object.hasOwn(MODEL_FAMILIES,options.modelFamily),'--model-family must be lite or dynamic');
const MODEL=MODEL_FAMILIES[options.modelFamily],MODEL_SHA256=MODEL.sha256;
const normalization={mean:[.485,.456,.406],std:[.229,.224,.225],divisor:255};
const preprocessingKey=JSON.stringify({normalization,inputSize:INPUT_SIZE,maskSize:MASK_SIZE,outputEncoding:MODEL.outputEncoding});
assert.ok(options.shard.total>=1&&options.shard.total<=256&&options.shard.index<options.shard.total,'Invalid zero-based shard');
assert.equal(ort.env.versions.node,'1.31.1','This pipeline is verified with onnxruntime-node 1.31.1');
assert.equal(sharp.versions.sharp,'0.34.5','Pinned Sharp decoding is required for reproducible masks');
sharp.cache({memory:64,files:0,items:32});sharp.concurrency(1);

async function fileHash(path){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
assert.equal(await fileHash(options.model),MODEL_SHA256,'Unexpected foreground model checksum');
if(MODEL.weightsFile)assert.equal(await fileHash(resolve(dirname(options.model),MODEL.weightsFile)),MODEL.weightsHash,'Unexpected external model weights checksum');
const cards=CARDS.filter(card=>card.type==='beast'||card.type==='fusion'),cardMap=new Map(cards.map(card=>[card.id,card]));
if(options.ids)for(const id of options.ids)assert.ok(cardMap.has(id),'Not a canonical public creature: '+id);
const groups=new Map();
for(const card of cards){
 const art=resolveSummonArt(card),sourceKey=summonMaskSourceKey(art);assert.ok(sourceKey,'No public source for '+card.id);
 if(!groups.has(sourceKey)){
  const {cardId,...source}=art;groups.set(sourceKey,{sourceKey,source,art,cardIds:[]});
 }
 groups.get(sourceKey).cardIds.push(card.id);
}
const selected=[...groups.values()].filter(group=>!options.ids||group.cardIds.some(id=>options.ids.includes(id)))
 .sort((a,b)=>textCompare(a.source.src,b.source.src)||textCompare(a.sourceKey,b.sourceKey));
const assigned=selected.filter((_,index)=>index%options.shard.total===options.shard.index);
if(options.review)assert.ok(assigned.length<=48,'Review sheets are limited to 48 sources; use --ids for a pilot');
await mkdir(options.output,{recursive:true});
const manifest={schemaVersion:1,generator:VERSION,model:{...MODEL,family:options.modelFamily,
 inputSize:INPUT_SIZE,maskSize:MASK_SIZE,normalization,postprocess:(MODEL.outputEncoding==='logits'?'sigmoid; ':'native alpha; ')+'pixel-center bilinear downsample; round to uint8; no threshold or morphology'},
 shard:options.shard,canonicalCardCount:cards.length,canonicalSourceCount:groups.size,selectedSourceCount:selected.length,cards:{},sources:[]};
const sourceHashes=new Map(),decodedImages=new Map(),reviewRecords=[];
let session=null,loadMilliseconds=null,totalInferenceMilliseconds=0,resumed=0;

async function publicImage(art){
 const url=new URL(art.src,'https://beast-king.invalid/');
 assert.equal(url.origin,'https://beast-king.invalid');assert.ok(url.pathname.startsWith('/assets/'));
 assert.ok(!/(?:^|\/)(?:private|operator-art)(?:\/|$)/i.test(url.pathname),'Private asset path rejected');
 const path=await realpath(resolve(ROOT,decodeURIComponent(url.pathname.slice(1))));
 assert.ok(path.startsWith(resolve(ROOT,'assets')+sep),'Public source escaped the assets directory');
 if(decodedImages.has(path)){const cached=decodedImages.get(path);decodedImages.delete(path);decodedImages.set(path,cached);return cached;}
 const bytes=await readFile(path);if(!sourceHashes.has(path))sourceHashes.set(path,sha256(bytes));
 const decoded=await sharp(bytes).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(decoded.info.channels,4);
 const image={data:decoded.data,width:decoded.info.width,height:decoded.info.height,sourceHash:sourceHashes.get(path),sourceFile:relative(ROOT,path).split(sep).join('/')};
 decodedImages.set(path,image);while(decodedImages.size>2)decodedImages.delete(decodedImages.keys().next().value);
 return image;
}

async function infer(source){
 if(!session){
  const started=performance.now();session=await ort.InferenceSession.create(options.model,{executionProviders:['cpu'],graphOptimizationLevel:'all',intraOpNumThreads:options.threads,interOpNumThreads:1,enableCpuMemArena:false,enableMemPattern:false});
  loadMilliseconds=Math.round(performance.now()-started);
  assert.deepEqual(session.inputNames,[MODEL.inputName]);assert.deepEqual(session.outputNames,[MODEL.outputName]);
  console.log(JSON.stringify({stage:'model-ready',loadMilliseconds,threads:options.threads}));
 }
 const input=new ort.Tensor('float32',normalizeBiRefNetInput(source),[1,3,INPUT_SIZE,INPUT_SIZE]);let outputs;
 try{
  const started=performance.now();outputs=await session.run({[MODEL.inputName]:input},[MODEL.outputName]);
  const inferenceMilliseconds=Math.round(performance.now()-started),output=outputs[MODEL.outputName];
  assert.deepEqual(output.dims,[1,1,INPUT_SIZE,INPUT_SIZE]);assert.equal(output.type,'float32');
  const prepared=MODEL.outputEncoding==='logits'?prepareLogitMask(output.data,INPUT_SIZE,INPUT_SIZE,MASK_SIZE,MASK_SIZE):prepareProbabilityMask(output.data,INPUT_SIZE,INPUT_SIZE,MASK_SIZE,MASK_SIZE);
  return {...prepared,inferenceMilliseconds};
 }finally{input.dispose();if(outputs)for(const value of Object.values(outputs))value.dispose();}
}

function verifyOriginalRgb(original,result){
 assert.equal(original.data.length,result.data.length);let changed=0,alphaIncreased=0;
 for(let p=0;p<original.data.length;p+=4){for(let c=0;c<3;c++)if(original.data[p+c]!==result.data[p+c])changed++;if(result.data[p+3]>original.data[p+3])alphaIncreased++;}
 assert.equal(changed,0);assert.equal(alphaIncreased,0);return {rgbChanged:changed,alphaIncreased};
}

try{
 for(const [index,group] of assigned.entries()){
  const image=await publicImage(group.art),crop=computeSummonArtCrop(group.art,image.width,image.height);assert.ok(crop,'Invalid public crop');
  const digest=sha256(Buffer.from([VERSION,options.modelFamily,preprocessingKey,group.sourceKey,image.sourceHash,MODEL_SHA256,MODEL.weightsHash||''].join('\n'))),file=digest+'.png',sidecar=digest+'.json';
  let entry=null,mask=null,probabilities=null;
  try{
   const existing=JSON.parse(await readFile(resolve(options.output,sidecar),'utf8'));
   if(existing.sourceKey===group.sourceKey&&existing.sourceHash===image.sourceHash&&existing.modelHash===MODEL_SHA256&&existing.modelFamily===options.modelFamily&&existing.weightsHash===MODEL.weightsHash&&existing.preprocessingKey===preprocessingKey&&existing.generator===VERSION&&existing.inputSize===INPUT_SIZE&&existing.file===file&&existing.width===MASK_SIZE&&existing.height===MASK_SIZE){
    const png=await readFile(resolve(options.output,file));assert.equal(sha256(png),existing.maskSha256);
    const decoded=await sharp(png).greyscale().raw().toBuffer({resolveWithObject:true});assert.equal(decoded.info.channels,1);assert.equal(decoded.data.length,MASK_SIZE*MASK_SIZE);
    entry=existing;mask=new Uint8ClampedArray(decoded.data);resumed++;
   }
  }catch(error){if(error.code!=='ENOENT')console.warn('Rebuilding stale mask '+group.cardIds[0]+': '+error.message);}
  if(!entry){
   const square=sampleSummonCrop(image,crop,INPUT_SIZE,INPUT_SIZE),nativeAlpha=nativeForegroundAlpha(square);
   const result=nativeAlpha?{mask:new Uint8ClampedArray(MASK_SIZE*MASK_SIZE).fill(255),inferenceMilliseconds:0}:await infer(square);
   mask=result.mask;probabilities=result.probabilities;totalInferenceMilliseconds+=result.inferenceMilliseconds;
   const png=await sharp(Buffer.from(mask),{raw:{width:MASK_SIZE,height:MASK_SIZE,channels:1}}).toColourspace('b-w').png({compressionLevel:9,palette:false}).toBuffer();
   const info=await sharp(png).metadata();assert.equal(info.channels,1);assert.equal(info.width,MASK_SIZE);assert.equal(info.height,MASK_SIZE);
   entry={generator:VERSION,inputSize:INPUT_SIZE,modelFamily:options.modelFamily,modelHash:MODEL_SHA256,weightsHash:MODEL.weightsHash,preprocessingKey,sourceKey:group.sourceKey,sourceHash:image.sourceHash,source:group.source,cardIds:group.cardIds,
    sourceFile:image.sourceFile,imageWidth:image.width,imageHeight:image.height,actualCrop:crop,file,maskSha256:sha256(png),width:MASK_SIZE,height:MASK_SIZE,
    mode:nativeAlpha?'native-alpha':'birefnet',inferenceMilliseconds:result.inferenceMilliseconds,metrics:{...measureMask(mask,MASK_SIZE,MASK_SIZE),logits:result.logits||null,probabilityRange:result.probabilityRange||null}};
   await writeFile(resolve(options.output,file),png);await writeFile(resolve(options.output,sidecar),JSON.stringify(entry,null,2)+'\n');
  }
  // Alias membership may change while the exact source and its mask stay valid.
  entry.cardIds=[...group.cardIds];manifest.sources.push(entry);for(const id of group.cardIds)manifest.cards[id]=group.sourceKey;
  if(options.review){
   const aspect=crop.width/crop.height,width=Math.round(aspect>=1?256:256*aspect),height=Math.round(aspect>=1?256/aspect:256);
   const original=sampleSummonCrop(image,crop,width,height),cutout=applySummonMask(original,grayscaleRgba(mask,MASK_SIZE,MASK_SIZE));
   const integrity=verifyOriginalRgb(original,cutout),id=options.ids?.find(id=>group.cardIds.includes(id))||group.cardIds[0];
   const originalPng=await sharp(Buffer.from(original.data),{raw:{width,height,channels:4}}).png().toBuffer();
   const cutoutPng=await sharp(Buffer.from(cutout.data),{raw:{width,height,channels:4}}).png().toBuffer();
   reviewRecords.push({id,name:cardMap.get(id).name,entry,width,height,originalPng,cutoutPng,integrity,probabilities});
  }
  if(assigned.length<=48||(index+1)%25===0||index+1===assigned.length||entry.metrics.flags.length)console.log(JSON.stringify({stage:'mask',completed:index+1,total:assigned.length,id:group.cardIds[0],aliases:group.cardIds.length,inferenceMilliseconds:entry.inferenceMilliseconds,coverage:Number(entry.metrics.alphaCoverage.toFixed(4)),flags:entry.metrics.flags}));
 }
}finally{await session?.release();decodedImages.clear();}

manifest.summary={sourceCount:manifest.sources.length,cardCount:Object.keys(manifest.cards).length,uniqueSourceFiles:sourceHashes.size,resumed,loadMilliseconds,totalInferenceMilliseconds,
 flagged:manifest.sources.filter(entry=>entry.mode!=='native-alpha'&&entry.metrics.flags.length).map(entry=>({cardIds:entry.cardIds,flags:entry.metrics.flags}))};
await writeFile(resolve(options.output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');

function xml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
if(options.review&&reviewRecords.length){
 reviewRecords.sort((a,b)=>options.ids?options.ids.indexOf(a.id)-options.ids.indexOf(b.id):a.id.localeCompare(b.id));
 const columns=Math.min(3,reviewRecords.length),tileWidth=568,tileHeight=356,padding=20,gap=16,top=108;
 const sheetWidth=padding*2+columns*tileWidth+(columns-1)*gap,sheetHeight=top+Math.ceil(reviewRecords.length/columns)*(tileHeight+gap)+24;
 const layers=[],labels=[`<rect width="100%" height="100%" fill="#07121d"/><text x="20" y="38" fill="#edf8ff" font-size="26" font-weight="700">BEAST KING · PUBLIC FOREGROUND REVIEW</text><text x="20" y="72" fill="#a4c6d9" font-size="16">BiRefNet ${options.modelFamily} ${INPUT_SIZE} · grayscale masks 256 · original RGB retained · semantic outline review required</text>`];
 await mkdir(resolve(options.output,'review'),{recursive:true});
 const checker=Buffer.alloc(256*256*4);
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){const light=(Math.floor(x/16)+Math.floor(y/16))%2,p=(y*256+x)*4;checker[p]=light?53:31;checker[p+1]=light?69:47;checker[p+2]=light?81:59;checker[p+3]=255;}
 const checkerPng=await sharp(checker,{raw:{width:256,height:256,channels:4}}).png().toBuffer();
 for(const [index,record] of reviewRecords.entries()){
  const x=padding+index%columns*(tileWidth+gap),y=top+Math.floor(index/columns)*(tileHeight+gap),left=x+16,right=x+296,imageTop=y+62;
  labels.push(`<rect x="${x}" y="${y}" width="${tileWidth}" height="${tileHeight}" fill="#0c1c2a" stroke="#315063"/><text x="${x+16}" y="${y+25}" fill="#edf8ff" font-size="17" font-weight="700">${xml(record.id+'  '+record.name)}</text><text x="${left}" y="${y+49}" fill="#aecad9" font-size="13">ORIGINAL</text><text x="${right}" y="${y+49}" fill="#aecad9" font-size="13">MASK APPLIED</text><text x="${x+16}" y="${y+342}" fill="#b9e6d1" font-size="14">alpha ${(record.entry.metrics.alphaCoverage*100).toFixed(1)}% · RGB Δ 0 · ${(record.entry.inferenceMilliseconds/1000).toFixed(2)}s · ${record.entry.metrics.flags.join(', ')||'review outline'}</text>`);
  for(const [imageX,buffer] of [[left,record.originalPng],[right,record.cutoutPng]]){
   layers.push({input:checkerPng,left:imageX,top:imageTop});layers.push({input:buffer,left:imageX+Math.floor((256-record.width)/2),top:imageTop+Math.floor((256-record.height)/2)});
  }
  await writeFile(resolve(options.output,'review',record.id+'-original.png'),record.originalPng);await writeFile(resolve(options.output,'review',record.id+'-cutout.png'),record.cutoutPng);
  if(record.probabilities)await writeFile(resolve(options.output,'review',record.id+'-probabilities.f32'),Buffer.from(record.probabilities.buffer,record.probabilities.byteOffset,record.probabilities.byteLength));
 }
 const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}"><g font-family="sans-serif">${labels.join('')}</g></svg>`);
 await sharp({create:{width:sheetWidth,height:sheetHeight,channels:4,background:'#07121d'}}).composite([{input:svg,left:0,top:0},...layers]).png().toFile(resolve(options.output,'review.png'));
 const html=`<!doctype html><meta charset="utf-8"><title>Public foreground review</title><style>body{margin:24px;background:#07121d;color:#edf8ff;font:16px system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(540px,1fr));gap:20px}article{background:#102435;padding:16px}figure{display:inline-block;margin:0 8px 0 0;width:256px;height:256px;background:repeating-conic-gradient(#354551 0% 25%,#1f2f3b 0% 50%) 0/32px 32px}img{width:100%;height:100%;object-fit:contain}h2{font-size:20px}.metrics{color:#b9e6d1}</style><h1>BiRefNet public foreground pilot</h1><p>Original source left; alpha-only result right. RGB is preserved. Inspect entire bodies, wings, tails, feet and background removal.</p><main>${reviewRecords.map(r=>`<article><h2>${xml(r.id+' '+r.name)}</h2><figure><img src="review/${r.id}-original.png" alt="Original"></figure><figure><img src="review/${r.id}-cutout.png" alt="Foreground"></figure><p class="metrics">Alpha ${(r.entry.metrics.alphaCoverage*100).toFixed(1)}%; RGB changes ${r.integrity.rgbChanged}; ${r.entry.metrics.flags.join(', ')||'No gross numeric flags'}</p></article>`).join('')}</main>`;
 await writeFile(resolve(options.output,'review.html'),html);
 await writeFile(resolve(options.output,'review.json'),JSON.stringify(reviewRecords.map(({id,name,entry,integrity})=>({id,name,file:entry.file,sourceKey:entry.sourceKey,metrics:entry.metrics,...integrity})),null,2)+'\n');
}
console.log(JSON.stringify({stage:'complete',output:options.output,...manifest.summary}));

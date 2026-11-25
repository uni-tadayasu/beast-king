/**
 * Reproduce the local CPU foreground runtime and the 192 px U2-Net-P model.
 *
 *   npm ci
 *   node scripts/prepare-summon-runtime.mjs
 *   node scripts/prepare-summon-runtime.mjs --source /path/to/u2netp.onnx
 *   node scripts/prepare-summon-runtime.mjs --source /path/to/u2netp.onnx --check
 *
 * The default source is the checksum-pinned rembg release URL below. --source
 * permits an offline copy of exactly those original bytes. No image is read,
 * generated, or modified. --check verifies existing artifacts without writes.
 *
 * Attribution: ONNX Runtime Web 1.20.1, Microsoft Corporation, MIT License.
 * https://github.com/microsoft/onnxruntime — see LICENSE-ONNX.txt.
 * U2-Net: Xuebin Qin, Zichen Zhang, Chenyang Huang, Masood Dehghan,
 * Osmar R. Zaiane, Martin Jagersand. Pattern Recognition 106 (2020), 107404.
 * https://github.com/xuebinqin/U-2-Net — Apache-2.0, see LICENSE-U2NET.txt.
 * ONNX conversion: https://github.com/danielgatis/rembg
 * This derivative changes only input/output spatial shape metadata to 192.
 * Operators and learned weights are unchanged. Full attribution is maintained
 * in assets/summon-runtime/NOTICE.txt; this script never rewrites that notice.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';

const ORT_VERSION='1.20.1',MODEL_SIZE=192;
const SOURCE_URL='https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx';
const SOURCE_BYTES=4_574_861;
const SOURCE_SHA256='309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8';
const MODEL_SHA256='0022dc72eb3f891abcb975063186ddc06e49b04cb63c5df62f681b3dc5ec8cf0';
const OPERATORS_WEIGHTS_SHA256='5612ac9601aa9af5a1d19b36336499b70f81e5738717022e00e9213d79ac5876';
const RUNTIME_SHA256={
 'ort.wasm.min.mjs':'f53ed4792e758e7232f779d479eb8931b97ff3ab2e3b9a33ee00d1251ffdaad6',
 'ort-wasm-simd-threaded.mjs':'745eb7c0ce6f18a6aa521971b2877babc7ffb27eecb58ab3bc6e5ef4692672e8',
 'ort-wasm-simd-threaded.wasm':'207d02be4591c156b0a98f024f3d58005b5b04c92274d759fb390338c63559ea'
};
const root=new URL('../',import.meta.url),outputRoot=new URL('assets/summon-runtime/',root);
const packageRoot=new URL('node_modules/onnxruntime-web/',root),require=createRequire(import.meta.url);
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const gitBlobSha=bytes=>createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');

let sourcePath=null,checkOnly=false;
for(let i=2;i<process.argv.length;i++){
 const argument=process.argv[i];
 if(argument==='--source'){
  assert.ok(process.argv[i+1]&&!process.argv[i+1].startsWith('--'),'--source requires a local path');
  sourcePath=resolve(process.argv[++i]);
 }else if(argument==='--check')checkOnly=true;
 else throw new Error('Unknown argument: '+argument);
}

const packageMetadata=JSON.parse(await readFile(new URL('package.json',packageRoot),'utf8'));
assert.equal(packageMetadata.version,ORT_VERSION,'Run npm ci with the pinned package-lock.json before preparing the runtime');
const {onnx}=require('../node_modules/onnxruntime-web/lib/onnxjs/ort-schema/protobuf/onnx.js');

let original;
if(sourcePath)original=await readFile(sourcePath);
else {
 const response=await fetch(SOURCE_URL,{signal:AbortSignal.timeout(60_000)});
 assert.ok(response.ok,'Original model download failed: HTTP '+response.status);
 original=Buffer.from(await response.arrayBuffer());
}
assert.equal(original.length,SOURCE_BYTES,'Unexpected original model size');
assert.equal(sha256(original),SOURCE_SHA256,'Original model checksum mismatch; no artifacts were written');

const model=onnx.ModelProto.decode(original);
const shapes=[...model.graph.input,...model.graph.output];
assert.deepEqual(model.graph.input.map(value=>value.name),['input.1']);
assert.deepEqual(model.graph.output.map(value=>value.name),['1959','1960','1961','1962','1963','1964','1965']);
assert.deepEqual(model.graph.input[0].type.tensorType.shape.dim.map(value=>Number(value.dimValue)),[1,3,320,320]);

function operatorsAndWeightsHash(graph){
 const hash=createHash('sha256');
 for(const node of graph.node)hash.update(onnx.NodeProto.encode(node).finish());
 for(const tensor of graph.initializer)hash.update(onnx.TensorProto.encode(tensor).finish());
 return hash.digest('hex');
}
assert.equal(operatorsAndWeightsHash(model.graph),OPERATORS_WEIGHTS_SHA256);
for(const value of shapes){
 const dimensions=value.type.tensorType.shape.dim;
 assert.equal(dimensions.length,4,'Expected an NCHW input/output');
 for(let axis=2;axis<4;axis++){
  delete dimensions[axis].dimParam;
  dimensions[axis].dimValue=MODEL_SIZE;
 }
}
assert.equal(onnx.ModelProto.verify(model),null,'Modified model does not conform to the ONNX protobuf schema');
const converted=onnx.ModelProto.encode(model).finish();
assert.equal(sha256(converted),MODEL_SHA256,'192 model encoding changed; inspect the pinned schema/dependencies before updating its checksum');
const decoded=onnx.ModelProto.decode(converted);
assert.equal(operatorsAndWeightsHash(decoded.graph),OPERATORS_WEIGHTS_SHA256,'Model operators or learned weights changed');
const objectOptions={longs:String,bytes:String};
assert.deepEqual(onnx.ModelProto.toObject(decoded,objectOptions),onnx.ModelProto.toObject(model,objectOptions),'Re-encoding changed model semantics');

const artifacts=[{name:'u2netp-192.onnx',bytes:converted,sha256:MODEL_SHA256}];
for(const [name,expected] of Object.entries(RUNTIME_SHA256)){
 const bytes=await readFile(new URL('dist/'+name,packageRoot));
 assert.equal(sha256(bytes),expected,'Pinned ONNX Runtime file checksum mismatch: '+name);
 artifacts.push({name,bytes,sha256:expected});
}
// Validate all inputs before writing any output. The original 320 model is
// intentionally not copied into the production artifact directory.
if(!checkOnly)await mkdir(outputRoot,{recursive:true});
for(const artifact of artifacts){
 const target=new URL(artifact.name,outputRoot);
 if(checkOnly)assert.equal(sha256(await readFile(target)),artifact.sha256,'Prepared artifact differs: '+artifact.name);
 else await writeFile(target,artifact.bytes);
}
console.log(JSON.stringify({
 action:checkOnly?'verified':'prepared',runtimeVersion:ORT_VERSION,
 source:{url:SOURCE_URL,bytes:SOURCE_BYTES,sha256:SOURCE_SHA256},
 transformation:{spatialSize:MODEL_SIZE,operatorsAndWeightsUnchanged:true,operatorsAndWeightsSha256:OPERATORS_WEIGHTS_SHA256},
 artifacts:artifacts.map(({name,bytes,sha256:checksum})=>({path:'assets/summon-runtime/'+name,bytes:bytes.length,sha256:checksum,gitBlobSha:gitBlobSha(bytes)}))
},null,2));

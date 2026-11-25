import test from 'node:test';
import assert from 'node:assert/strict';
import {finishForegroundCoverage,contourMaskSVG,assertCorrectionSource,foregroundMaskStats} from '../scripts/finish-summon-masks.mjs';

test('confidence finish removes faint background and preserves native coverage without mutating input',()=>{
 const raw=new Uint8Array([0,16,40,128,141,255]),copy=raw.slice();
 const result=finishForegroundCoverage(raw);
 assert.deepEqual(raw,copy);assert.notEqual(result,raw);
 assert.deepEqual([...result.subarray(0,3)],[0,0,0]);assert.equal(result[4],255);assert.equal(result[5],255);
 assert(result[3]>raw[3]);assert.deepEqual(finishForegroundCoverage(raw,{nativeAlpha:true}),raw);
});

const source={sourceKey:'exact-source-with-query-and-crop',sourceHash:'a'.repeat(64),cardIds:['B0001']};
const contour={schemaVersion:1,cardIds:['B0001'],sourceKey:source.sourceKey,sourceSha256:source.sourceHash,viewBox:[0,0,256,256],fillRule:'nonzero',paths:[{operation:'include',d:'M 1 2 L 240 2 L 120 250 Z'},{operation:'exclude',d:'M 100 20 L 130 20 L 115 60 Z'}]};

test('reviewed contours are bound to exact original bytes, crop and card identity',()=>{
 assert.doesNotThrow(()=>assertCorrectionSource(contour,source));
 for(const change of [{sourceKey:'changed-query'},{sourceHash:'b'.repeat(64)},{cardIds:['F0522']}])assert.throws(()=>assertCorrectionSource(contour,{...source,...change}));
 const svg=contourMaskSVG(contour,source);
 assert(svg.includes('fill="#fff"'));assert(svg.includes('fill="#000"'));assert(!svg.includes('<image'));
});

test('clipping data cannot inject external resources, markup or open paths',()=>{
 for(const d of ['M 1 2 L 3 4','M 0 0 Z"/><image href="https://invalid/"/>','M NaN 0 Z'])assert.throws(()=>contourMaskSVG({...contour,paths:[{operation:'include',d}]},source));
 assert.throws(()=>contourMaskSVG({...contour,viewBox:[0,0,512,512]},source));
 assert.throws(()=>contourMaskSVG({...contour,paths:[...contour.paths,{operation:'include',d:'M 0 0 L 1 1 Z'}]},source));
});

test('statistics use the same exact alpha thresholds as the release gate',()=>{
 const mask=new Uint8Array(65536);mask.set([8,9,127,128,255]);
 const stats=foregroundMaskStats(mask);
 assert.equal(stats.clearPixels,65532);assert.equal(stats.visiblePixels,2);assert.equal(stats.alphaSum,527);assert.equal(stats.nativeAlpha,false);
});

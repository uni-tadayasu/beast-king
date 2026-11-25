/** Pure build helpers: foreground confidence and reviewed clipping geometry.
 * These helpers never read or alter illustration RGB. */
import assert from 'node:assert/strict';

export const MASK_FINISH=Object.freeze({method:'smoothstep',low:.16,high:.55});

export function finishForegroundCoverage(mask,{nativeAlpha=false}={}){
 assert(mask instanceof Uint8Array||mask instanceof Uint8ClampedArray,'Coverage must be 8-bit grayscale');
 const result=new Uint8Array(mask.length);
 for(let i=0;i<mask.length;i++){
  const t=Math.max(0,Math.min(1,(mask[i]/255-MASK_FINISH.low)/(MASK_FINISH.high-MASK_FINISH.low)));
  result[i]=nativeAlpha?mask[i]:Math.round(t*t*(3-2*t)*255);
 }
 return result;
}

export function assertCorrectionSource(record,source){
 assert(record&&record.schemaVersion===1,'Unsupported foreground correction');
 assert.equal(record.sourceKey,source.sourceKey,'Correction belongs to different illustration/crop');
 assert.equal(record.sourceSha256,source.sourceHash,'Correction belongs to different original bytes');
 assert(Array.isArray(record.cardIds)&&record.cardIds.length&&record.cardIds.every(id=>source.cardIds.includes(id)),'Correction belongs to different card identity');
}

export function contourMaskSVG(record,source){
 assertCorrectionSource(record,source);
 const viewBox=record.viewBox??[0,0,record.width,record.height];
 assert.deepEqual(viewBox,[0,0,256,256],'Reviewed clipping geometry must use a 256px tile');
 assert(['nonzero','evenodd'].includes(record.fillRule),'Unsupported contour fill rule');
 assert(Array.isArray(record.paths)&&record.paths.length,'Empty clipping geometry');
 const paths=record.paths.map(value=>typeof value==='string'?{operation:'include',d:value}:value);
 assert(paths.some(path=>path.operation==='include'),'A contour needs a visible body');
 let exclusions=false;
 for(const path of paths){
  assert(path&&['include','exclude'].includes(path.operation),'Unsupported contour operation');
  assert(typeof path.d==='string'&&/^[MmLlHhVvCcSsQqTtAaZz\d\s.,+\-]+$/.test(path.d)&&/[zZ]\s*$/.test(path.d),'Only closed numeric SVG path data is allowed');
  if(path.operation==='exclude')exclusions=true;
  else assert(!exclusions,'All body contours must precede exclusions');
 }
 return '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="#000"/>'+
  paths.map(path=>'<path fill="'+(path.operation==='include'?'#fff':'#000')+'" fill-rule="'+record.fillRule+'" d="'+path.d+'"/>').join('')+'</svg>';
}

export function foregroundMaskStats(mask,{nativeAlpha=false}={}){
 assert.equal(mask.length,256*256,'Statistics require one complete mask tile');
 const stats={clearPixels:0,visiblePixels:0,alphaSum:0,pixels:mask.length,nativeAlpha};
 for(const value of mask){assert(Number.isInteger(value)&&value>=0&&value<=255);if(value<=8)stats.clearPixels++;if(value>=128)stats.visiblePixels++;stats.alphaSum+=value;}
 return stats;
}

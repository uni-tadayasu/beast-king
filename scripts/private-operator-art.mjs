/** Private production artwork enters only the Worker bundle. The public GitHub
 * checkout intentionally contains no raster or base64 copy of this image. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {isRegaliaRasterArtwork} from '../regalia-art-format.js';

const MARKER='const BUILTIN_REGALIA_ARTWORK = null;';

export async function readPrivateOperatorArtwork(root,explicitPath=process.env.BEAST_KING_OPERATOR_ART_FILE){
 const path=explicitPath?resolve(explicitPath):resolve(root,'server/private/operator-regalia.webp');
 let bytes;
 try{bytes=await readFile(path);}catch(error){if(!explicitPath&&error.code==='ENOENT')return null;throw error;}
 const artwork='data:image/webp;base64,'+bytes.toString('base64');
 assert(isRegaliaRasterArtwork(artwork),'Private operator artwork must be a static WebP under 540KB.');
 return artwork;
}

export function injectPrivateOperatorArtwork(source,artwork){
 assert.equal(source.split(MARKER).length,2,'Private artwork insertion point must occur exactly once.');
 if(artwork===null)return source;
 assert(isRegaliaRasterArtwork(artwork),'Refusing to bundle invalid private operator artwork.');
 return source.replace(MARKER,'const BUILTIN_REGALIA_ARTWORK = '+JSON.stringify(artwork)+';');
}

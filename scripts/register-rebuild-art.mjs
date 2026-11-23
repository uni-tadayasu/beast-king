/** Register manually approved, individual WebP artwork. No generated placeholders.
 * Input filenames are exact card IDs, e.g. B0513.webp. Original Regalia is locked.
 * Duplicate images are rejected by SHA-256. Run from the repository root.
 */
import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {getCard} from '../rebuild/catalog.js';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=resolve(root,'assets/rebuild/cards');
await mkdir(dir,{recursive:true});
const result={},seen=new Map();
for(const item of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
 if(!item.isFile()||!item.name.endsWith('.webp'))continue;
 const id=item.name.slice(0,-5),card=getCard(id);
 if(!/^[BMGF][0-9]{4}$/.test(id)||!card||card.name==='王冠竜 レガリア')throw Error('Invalid or protected artwork: '+item.name);
 const data=await readFile(resolve(dir,item.name));
 if(data.length<32||data.length>2_000_000||data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,12)!=='WEBP')throw Error('Invalid or oversized WebP: '+item.name);
 const hash=createHash('sha256').update(data).digest('hex');
 if(seen.has(hash))throw Error('Duplicate artwork: '+seen.get(hash)+' / '+id);
 seen.set(hash,id);result[id]='assets/rebuild/cards/'+item.name;
}
await writeFile(resolve(root,'rebuild/artwork-manifest.js'),'/** Approved individual artwork paths. Regalia remains unchanged. */\nexport const ARTWORK_OVERRIDES=Object.freeze('+JSON.stringify(result,null,2)+');\n');
console.log('Registered approved individual illustrations:',Object.keys(result).length);

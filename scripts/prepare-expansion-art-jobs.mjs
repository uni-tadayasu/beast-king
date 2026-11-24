/** Prepare explicit, reproducible imagegen directions; this script makes no API calls. */
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CARDS} from '../catalog.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]};
const grid=Number(arg('--grid','4'));
if(![4,6,8].includes(grid))throw new Error('Supported layouts: 4×4, 6×4 or 8×8.');
const columns=grid,rowCount=grid===6?4:grid,cellCount=columns*rowCount;
const output=resolve(root,arg('--output','assets/design-v3/cards/generation-jobs.json'));
const legacy=[
 ['ivory star-antlered stag','ivory/gold, starlit azure'],
 ['sleek turquoise river fox with flowing multiple tails','ivory/gold, turquoise and sapphire'],
 ['coral-maned red wolf with ember-patterned coat','ivory/gold, coral and vermilion'],
 ['white winged horse with long windblown mane','ivory/gold, jade and mint'],
 ['elegant flower crane with layered petal plumage','ivory/gold, rose and lilac'],
 ['powerful moss bear with living branch armor','ivory/gold, forest green and jade'],
 ['massive crystal rhinoceros with faceted stone armor','ivory/gold, cobalt and smoky quartz'],
 ['silver panther with flowing moon markings','ivory/gold, violet and midnight blue'],
];
const families={
 orbit:{palette:'indigo, cyan, ivory and pale gold; constellation tracery and orbital rings',species:['cosmic stag with constellation antlers','great astral whale with winglike fins','star owl with broad feathered wings','long ivory orbit serpent','star fox with three comet tails','satellite tortoise with a cratered moon-shell','celestial eagle-lion griffin','sky dragon with a long elegant sapphire body']},
 echo:{palette:'violet, silver, lavender and dark blue; spectral memories and musical trails',species:['violet ghost wolf','silver patterned memory moth','mirror-feathered crane','silver panther with tuning-fork horns','translucent dream whale','amethyst crystal fox','antlered leonine memory spirit','long-necked purple memory dragon']},
 vow:{palette:'crimson, rose-gold, warm ivory and restrained teal; oath ribbons and pulse crystals',species:['rose-antlered crimson stag','ivory tiger with crimson crystal stripes','scarlet eagle with gilded wings','long-eared ivory rabbit with floating oath ribbons','crimson armored rhinoceros','red fox with wing-shaped tails','gold-maned lion spirit with crimson oath threads','ivory-and-crimson oath dragon']},
 forge:{palette:'copper, teal, verdigris, brass and ivory; engraved mechanical plates with sealed cores',species:['copper plated crab with articulated jade claws','bronze ring-horned bull','brass key-winged bird','clockwork lizard with glowing furnace belly','teal mechanical wolf with copper armor','bronze tortoise with interlocking gear shell','four-armed sealed reliquary titan','sinuous copper-and-ivory segmented dragon']},
};
const actions=['leaping forward across a broken bridge','standing alert on a high windblown ledge','descending toward a luminous pool','turning toward the viewer amid drifting leaves','rising into the air in a powerful upward curve','prowling low along a narrow ancient causeway','sweeping diagonally across the frame','rearing or stretching upward beside a giant crystal'];
const environments=['a ruined ivory observatory above an ocean of stars','turquoise cascades through an ancestral sanctuary','a coral garden of floating golden terraces','a violet moonlit grove with giant flowering roots','a shattered crystal canyon crossed by a silver stream','a vast cloud citadel seen from a hanging bridge','sunken library arches lit by luminous fish','a copper and jade forge carved into living stone'];
const ornaments=['a delicate engraved neck harness and long silk ribbons','layered scale armor with small floating gemstones','a sweeping feather mantle and gilt anatomical markings','a luminous chest crystal with trailing ceremonial cords','light crownlike antlers or decorative crest and orbiting fireflies','antique shoulder plates and small ancestral bells','curling botanical engravings and crystal-tipped plumes','a flowing two-tone mantle and linked gold rings'];
const angles=['low three-quarter view','side view with the face turned toward the viewer','dramatic elevated three-quarter view','front three-quarter view','full-body diagonal action view','rear three-quarter view with visible expressive face','close dynamic view with the entire main silhouette inside the tile','wide cinematic view with the creature large in the foreground'];
const miracles=['a towering river of crystal lightning splitting a sanctuary','a radiant ancestral tree suddenly blooming above ceremonial stairs','an open floating codex releasing living animal-shaped memories','a dimensional light doorway unfolding within a ruined cathedral','several falling stars converging into a great luminous tide','a spiral of healing petals rebuilding ancient tree roots','ribbons of elemental energy weaving a protective canopy over beasts','a crown-shaped aurora reuniting two distant floating islands'];
const devices=['an elaborate mechanical jaw trap with curved jeweled teeth and a tensioned glowing core','a monumental mirror doorway with thick gold hinges and flowing reflective light','a suspended astrolabe with many kinetic crystalline arms and a woven hanging standard','a healing furnace with visible pipework, an open luminous heart and twisting smoke','a celestial ballista with articulated limbs and a drawn beam of light','a many-layered barrier projector with movable mirror leaves','a floating prism engine above an engraved three-tier stone dais','a reliquary garden machine whose living roots and glowing channels restore a pool'];
const hybrids=['phoenix-stag with enormous feathered wings and branching antlers','sea dragon-lion with a flowing fin mane and powerful clawed limbs','wolf-griffin with layered feather wings and a long streaming tail','butterfly-dragon with huge patterned wings and a serpentine body','whale-serpent curling around a small floating sanctuary','rhinoceros-phoenix with massive plated shoulders and fiery feather wings','crab-dragon with articulated claws, segmented tail and multiple horns','two-headed wolf-crane with contrasting fur and long feather crests'];

function direction(c){
 const ordinal=Number(c.id.slice(1))-1,type=c.type,group=c.family==='legacy'?Number(c.series.split('-').at(-1)):['orbit','echo','vow','forge'].indexOf(c.family);
 const groupSize={beast:c.family==='legacy'?64:128,fusion:c.family==='legacy'?16:32,miracle:c.family==='legacy'?32:64,gimmick:c.family==='legacy'?32:64}[type];
 const local=ordinal%groupSize,role=local%8,tier=Math.floor(local/8),family=families[c.family];
 const species=type==='fusion'?hybrids[(local+group)%hybrids.length]:family?.species[role]??legacy[group][0];
 const palette=family?.palette??legacy[group][1],environment=environments[(tier+group+role*3)%8];
 const action=actions[(role+tier*3)%8],ornament=ornaments[(tier+role*2+group)%8],angle=angles[(tier*3+role+group)%8];
 let subject;
 if(type==='beast'||type==='fusion')subject=`${species}, ${action}, ${angle}, wearing ${ornament}; ${environment}. ${tier<2?'Agile young creature with finely drawn anatomy':tier<6?'Powerful mature creature, elaborate flowing silhouette':'Ancient majestic creature, large expressive silhouette and complex flowing details'}`;
 else if(type==='miracle')subject=`${miracles[role]}, happening in ${environment}; ${angle}; ${['diagonal flow from upper left','an upward spiral','two intersecting arcs of light','a wide sweeping crescent','a branching central burst','a curtain of falling light','a layered wave across the foreground','a deep perspective through monumental arches'][tier%8]}. Tiny ${family?.species[(role+3)%8]??legacy[group][0]} figures establish scale and story`;
 else subject=`${devices[role]}, physically constructed in ${environment}; ${angle}; ${['open and charging','partially unfolded','projecting a diagonal beam','surrounded by floating broken stones','with luminous threads reaching into the ground','reflecting a spirit animal in its core','with ornamental outer rings in motion','releasing a curved wave of energy'][tier%8]}. Detailed perspective and grounded cast shadows`;
 return {id:c.id,name:c.name,setId:c.setId,type,family:c.family,origin:c.origin,subject,palette,composition:{group,local,role,tier,angle,environment,action,ornament}};
}
const jobs=[],cards=CARDS.filter(c=>['BK03','BK04'].includes(c.setId));
function addJob(records,id,setId,type){
 if(records.length!==cellCount)throw new Error('Atlas is not full: '+id);
 const rows=[];for(let row=0;row<rowCount;row++)rows.push(`ROW ${row+1}, left to right: `+records.slice(row*columns,(row+1)*columns).map((c,col)=>`CELL ${col+1}: ${c.subject}. Palette: ${c.palette}.`).join('\n'));
 const format=columns===rowCount?'a square image at the maximum supported native resolution':'a LANDSCAPE 3:2 image at 1536×1024 pixels or larger; exactly six columns and four rows';
 const prompt=`Create a final production illustration atlas for an original premium fantasy trading card game. EXACTLY ${cellCount} separate SQUARE paintings in an EXACT ${columns} columns × ${rowCount} rows edge-to-edge grid. Output ${format}. All cells exactly equal in width and height. NO gutters, NO outer margins, NO borders, NO labels, NO lettering, NO card UI, NO numbers. Every creature and scene must stay entirely inside its own square with a 6% safe inset around the subject. No cross-cell elements.\n\nVISUAL DIRECTION: richly hand-inked 2D Japanese fantasy TCG illustration. Sophisticated organic anatomy, expressive curved silhouettes, fine ink contours, sculpted cel-shadows, luminous gouache color, ornamental gold linework, intricate layered feathers/fur/scales drawn as shapes, deep jeweled colors and ivory highlights. Every cell is a complete cinematic illustration with a substantial creature or event dominating an individually painted environment. Illustrated, not photographic, not realistic3D, not flat vector geometry, not an icon, not an emblem. Unified elegant painting style across every cell. Each painting has a different pose, camera angle and composition as directed.\n\nThe subjects below correspond to catalogue cards, but NEVER PRINT their names or identifiers. Paint precisely in reading order:\n${rows.join('\n\n')}\n\nStrict final check: ${columns} equal columns and ${rowCount} equal rows, ${cellCount} full-bleed independent square paintings, no text, no frame, no gaps. Keep all heads, horns, limbs and tails fully inside their cell. Make the individual scenes richly illustrated and clearly distinct.`;
 jobs.push({id,setId,type,grid,columns,rows:rowCount,widthCells:columns,heightCells:rowCount,src:`assets/design-v3/cards/${id}.webp`,cardIds:records.map(c=>c.id),cards:records,prompt});
}
for(const setId of ['BK03','BK04']){
 const setOrder=[];
 for(const type of ['beast','fusion','miracle','gimmick']){
  const members=cards.filter(c=>c.setId===setId&&c.type===type),buckets=new Map();
  for(const c of members){const k=c.family==='legacy'?c.series:c.family;if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(c);}
  // Interleave clans/families, keeping every ID and species association explicit.
  const groups=[...buckets.values()],ordered=[];
  for(let i=0;i<Math.max(...groups.map(g=>g.length));i++)for(const g of groups)if(g[i])ordered.push(g[i]);
  if(columns!==rowCount){setOrder.push(...ordered);continue;}
  for(let offset=0;offset<ordered.length;offset+=cellCount)addJob(ordered.slice(offset,offset+cellCount).map(direction),`${setId.toLowerCase()}-${type}-${String(offset/cellCount+1).padStart(2,'0')}`,setId,type);
 }
 if(columns!==rowCount)for(let offset=0;offset<setOrder.length;offset+=cellCount){const records=setOrder.slice(offset,offset+cellCount).map(direction);addJob(records,`${setId.toLowerCase()}-atlas-${String(offset/cellCount+1).padStart(2,'0')}`,setId,new Set(records.map(c=>c.type)).size===1?records[0].type:'mixed');}
}
if(cards.length!==2304||new Set(jobs.flatMap(j=>j.cardIds)).size!==2304)throw new Error('Expansion art job coverage is incomplete.');
await mkdir(dirname(output),{recursive:true});
await writeFile(output,JSON.stringify({version:1,mode:'built-in-imagegen',grid,columns,rows:rowCount,cardCount:cards.length,atlasCount:jobs.length,jobs},null,2)+'\n');
console.log(JSON.stringify({output,columns,rows:rowCount,cards:cards.length,atlases:jobs.length}));

import {mkdir,writeFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {CARDS} from '../catalog.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const webRoot=await access(resolve(root,'catalog.js')).then(()=>root,()=>resolve(root,'dist'));
const series=['dawn','tide','ember','gale','grove','stone','dusk','aether'];
const breeds=[
 ['flower-crowned winged dragon','proud silver-maned lion','four-winged feather beast','long-eared petal fox','slender antlered qilin','large ivory owl','powerful ceremonial riding beast','white deer'],
 ['great whale','long finned sea dragon','water fox','curled seahorse','crab-shelled quadruped','sea snake','winged ray fish','small finned water spirit'],
 ['ember wolf','dark-winged fire dragon','cinnabar phoenix','fire fox','charcoal-maned lion','horned volcanic beast','lava snake','two-legged ember demon beast'],
 ['hawk','wind dragon','long-tailed swallow','winged horse','winged wolf','thunderbird','cloud-maned storm beast','small seed-winged wind spirit'],
 ['deer','tree dragon','flower fox','forest bear','moss tortoise','leaf owl','branched-antler elk','small flower spirit'],
 ['fortress tortoise','rock dragon','crystal lion','stone bull','steel rhino','sand scorpion','mountain goat','small rock spirit'],
 ['panther','shadow dragon','moon fox','night raven','tapir-like dream eater','black wolf','shadow snake','small mist spirit'],
 ['ancient mechanical knight','mechanical dragon','mechanical lion','clockwork bird','wheel-legged quadruped','ancient plated beast','lantern moth','small mechanical spirit']
];
const fusionBreeds=[
 ['four-winged ivory dragon','crowned lion-eagle gryphon','long-eared celestial antler beast','regal layered-feather phoenix'],
 ['river-tusk dragon','antlered silver whale','broad coral-winged quadruped','fin-crowned sea serpent'],
 ['volcanic lion','winged ember dragon','cinnabar phoenix','flame-crowned wolf'],
 ['winged antler beast','storm-crowned eagle','cloud-running dragon','flowing-maned sky horse'],
 ['blossoming branch-antler deer','leaf-winged tree dragon','moss-maned lion','round-bodied forest guardian'],
 ['mineral-winged dragon','mountain-backed tortoise','crystal-horned bull','rock-maned lion'],
 ['night-winged panther','shadow-crowned dragon','three-tailed moon fox','silk-feathered dream raven'],
 ['hinged-wing mechanical dragon','copper furnace beast','ceremonial resonant knight','segmented-feather clockwork bird']
];
const palettes=['silver, muted rose, midnight blue','river teal, coral, cobalt','charcoal, cinnabar, amber','jade, slate, ivory','fern, silver, lilac','slate, ochre, amethyst','ink, violet, muted mauve','pewter, copper, desaturated blue'];
const habitats=[
 ['dew-covered poppy ridge','silver birch grove','broken petal arch','sloping lily meadow','quiet marble spring','wind-carved chalk crag','walled night garden','distant dawn mountain'],
 ['reed-lined riverbank','basalt tidal pool','submerged stone arch','deep coral canyon','silver waterfall ledge','still flooded cavern','moonlit estuary','rolling open sea'],
 ['black ash hillside','red clay ravine','charred orchard','warm obsidian vent','cracked terracotta plain','copper-colored cliff','dark ember cavern','distant volcanic ridge'],
 ['high reed meadow','swept sandstone ridge','cloud-shadow valley','grassy ruin','rain-wet sky bridge','wind-bent willow slope','deep mountain pass','dawn cloud sea'],
 ['fern-covered glade','hollow cedar grove','violet blossom thicket','mossy root bridge','quiet lily pond','ancient stump garden','sunken woodland shrine','deep green canopy'],
 ['layered slate ledge','ochre quarry','amethyst grotto','weathered stone arch','granite river gorge','sand-carved hollow','high scree ridge','vast stratified mountain'],
 ['mauve mist hollow','silent black reed bank','moonlit ruin','shadowed plum grove','violet stone garden','still dark lake','narrow nocturnal canyon','twilight horizon'],
 ['abandoned copper workshop','pewter clock tower','ivy-wrapped mechanism court','silent ceramic foundry','silver rail terrace','crystal lens chamber','ancient gear garden','high mechanical observatory']
];
const poses=[
 'three-quarter forward stance, alert eyes, full body and generous breathing room',
 'strong side profile crossing the scene diagonally, one clear sweeping movement',
 'turning toward the viewer, body in a graceful S-curve, focus on face and balance',
 'low watchful pose guarding an object, broad quiet silhouette and layered foreground',
 'dynamic movement appropriate to its anatomy, clear separated limbs or fins',
 'perched or poised above a ledge, low camera angle, large calm silhouette',
 'rear three-quarter view looking back, unusual but readable silhouette',
 'regal frontal approach with a wide environmental vista, powerful mature proportions'
];
const details=['smooth young contours and one small seed accent','flowing ridge plates and an asymmetric ear notch','layered leaf or mineral edges','broad sculptural crest and restrained surface markings','weathered material with distinct growth ridges','long swept silhouette and contrasting underside','old-growth layered forms and a narrow crown','strong simplified monumental form and fine engraved natural motifs'];
const devices=['folded fan','arched lens','layered stone gate','spiral shell mechanism','suspended bridge device','hollow seed vessel','branch-and-gear instrument','faceted standing mirror'];
const miracleScenes={damage_core:'a single carefully formed luminous spear cuts a visible path through the scene',heal:'a clear spring nourishes a delicate flowering branch, visible before-and-after growth',draw:'a blank-page botanical folio unfolds into distinct floating leaf-shaped records',buff_all:'a seed-shaped banner unites several small original beast silhouettes',damage_all:'one sweeping natural force crosses a broad landscape, silhouettes remain readable',shield:'a layered leaf-and-stone canopy shelters a precious seed',fusion:'two entirely different animal silhouettes intertwine into one new antlered beast, a readable transformation'};
const gimmickScenes={reflect:'a folded mirror returns one diagonal amber strike',shield:'an engineered shell barrier shelters a living seed',buff_all:'a botanical mechanism sends ordered strengthening paths toward small beast silhouettes',heal:'a carved vessel releases a new spring beneath a wounded tree'};
function brief(c){
 if(c.id==='B0512')return 'B0512 reserved cell: unused concept of an antique golden crown on a violet stone pedestal. Final B0512 uses the separately edited user-provided King dragon artwork king.webp; do not reuse this cell for a card.';
 const n=Number(c.id.slice(1))-1,s=series.indexOf(c.series),local=n%(c.type==='beast'?64:c.type==='fusion'?16:32),tier=Math.floor(local/(c.type==='beast'?8:c.type==='fusion'?4:8));
 const scene=habitats[s][(tier+(local%8))%8];
 if(c.type==='beast')return `${c.id} ${c.name}: ${breeds[s][local%8]}; ${poses[tier]}; ${details[(tier+s)%8]}; setting ${scene}; palette ${palettes[s]}.`;
 if(c.type==='fusion')return `${c.id} ${c.name}: ${fusionBreeds[s][local%4]}; ${poses[(tier*2+local%4)%8]}; two natural materials visibly integrated into one coherent anatomy, ${details[(tier*2+s)%8]}; setting ${scene}; palette ${palettes[s]}.`;
 if(c.type==='miracle')return `${c.id} ${c.name}: ${miracleScenes[c.effect.kind]||'a precisely organized natural miracle with visible cause and effect'}; a unique ${devices[(local+s)%8]} is the focal object; ${poses[(local+tier)%8].split(',')[0]} composition; setting ${scene}; palette ${palettes[s]}.`;
 return `${c.id} ${c.name}: ${gimmickScenes[c.effect.kind]||'a deliberate mechanical device protecting or strengthening a beast'}; a unique ${devices[(local+s)%8]} made of region-specific natural materials; ${poses[(local+Math.floor(local/4))%8].split(',')[0]} composition; setting ${scene}; palette ${palettes[s]}.`;
}
const common=`Use case: stylized-concept. Production atlas of SIXTEEN different original BEAST KING card illustrations. EXACT 4 columns by 4 rows, each equal square cell; highest practical square resolution. No outer margin, gutters, borders, lettering or UI. Each square is a separate finished illustration and no creature, limb, effect, or object crosses its cell boundary. Row-major order follows the sixteen briefs below. The IDs and Japanese names are instructions only and MUST NOT appear in the picture. Every card must have a genuinely distinct silhouette, pose, composition, focal design and setting, never a color swap or copy. Confident precision ink outlines and controlled crosshatching with opaque gouache color planes: a refined fantasy natural-history print collection. Coherent carefully drawn anatomy, full subject with breathing room, intricate intentional materials, clear small-scale readability. Quiet indigo-violet ambient backgrounds, controlled palette accents from the brief, distinct focal lighting. No shiny generic 3D CGI, no photorealism, no random decorative spikes, no glowing particle clutter or magic circles, no real brands or famous franchise characters. Treat these as individually commissioned art-book plates sharing one artist direction, not repetitive icons. Draw all SIXTEEN scenes in the exact 4x4 layout. `;
const output=resolve(root,'design-kit/card-art-jobs');await mkdir(output,{recursive:true});
const map={version:2,copyright:'© 2026 Beast King',total:CARDS.length,layout:{columns:4,rows:4},atlasSafetyInset:0.01,cards:[]};
for(const type of ['beast','miracle','gimmick','fusion']){
 const cards=CARDS.filter(c=>c.type===type),jobs=[];
 for(let at=0;at<cards.length;at+=16){const batch=String(at/16+1).padStart(2,'0'),selected=cards.slice(at,at+16),filename=`${type}-${batch}.webp`;
  jobs.push({type,batch,filename,ids:selected.map(c=>c.id),prompt:common+selected.map((c,i)=>`ROW ${Math.floor(i/4)+1} COLUMN ${i%4+1}: ${brief(c)}`).join('\n')});
  selected.forEach((c,i)=>map.cards.push(c.id==='B0512'?{id:c.id,name:c.name,src:'assets/design-v2/cards/individual/king.webp',column:0,row:0,columns:1,rows:1,origin:'king',userProvidedReference:true}:{id:c.id,name:c.name,src:`assets/design-v2/cards/individual/${filename}`,column:i%4,row:Math.floor(i/4)}));
 }
 await writeFile(resolve(output,`${type}.json`),JSON.stringify(jobs,null,2)+'\n');
}
await mkdir(resolve(webRoot,'assets/design-v2/cards/individual'),{recursive:true});
await writeFile(resolve(webRoot,'assets/design-v2/cards/individual/manifest.json'),JSON.stringify(map,null,2)+'\n');
console.log(JSON.stringify({cards:map.total,jobs:72,distinctCells:new Set(map.cards.map(c=>`${c.src}:${c.column}:${c.row}`)).size,output}));

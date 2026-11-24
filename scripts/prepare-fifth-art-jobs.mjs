/** Authored BK05 image directions; no network calls or generated image claims. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FIFTH_ART_DIRECTION} from '../fifth-set-data.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const directory=resolve(root,'assets/design-v5/cards');
const families={
 origami:{palette:'warm ivory washi, coral-red folds, indigo ink details and turquoise light; paper-cut theatre and suspended folded landscapes',material:'The creatures are physically made of elaborate folded paper. Expressive folded animal anatomy with visible creases, layered washi edges and sweeping angular silhouettes. Never mechanical, never a generic real animal.'},
 glass:{palette:'iridescent transparent aqua glass, pale lilac, silver, opal and refracted amber; luminous glass gardens and mirrored halls',material:'The creatures are alive and made from luminous transparent glass, with elegant curved translucent anatomy and carefully drawn refracted light. The scenery is painted glass architecture, not outer space and not a 3D render.'},
 shadow:{palette:'inky black and deep violet silhouettes, garnet velvet, moon-silver rim light and warm coral backlighting; elaborate theatrical shadow stages',material:'Living animal silhouettes have layered black-violet paper-cut bodies and delicate silver edges, expressive eyes and sinuous poses. Clear readable foreground anatomy against luminous painted scenery, magical shadow theatre, not flat icons and not pure black blank cells.'},
 pigment:{palette:'saturated cyan, vivid coral, ultramarine, magenta and ivory; flowing ink rivers and vividly painted dream gardens',material:'Living creatures emerge from sweeping painted ink and luminous flowing pigment, with expressive recognizable animal bodies and calligraphic tails. Rich substantial brush-painted anatomy, not abstract swatches, no written lettering.'},
};
const types=['beast','miracle','gimmick','fusion'];
const angles=['low three-quarter view','graceful diagonal side view','front three-quarter view','slightly elevated cinematic view','dynamic upward-curving composition','broad foreground silhouette with deep scenic perspective'];
const jobs=[];
for(const [family,style] of Object.entries(families)){
 const cards=FIFTH_ART_DIRECTION.filter(card=>card.family===family).sort((a,b)=>types.indexOf(a.type)-types.indexOf(b.type)||a.id.localeCompare(b.id));
 assert.equal(cards.length,24,'Each fifth-set family needs 24 authored cards.');
 const records=cards.map((card,index)=>{
  assert(typeof card.subject==='string'&&card.subject.trim().length>8,'Missing authored art subject: '+card.id);
  return {id:card.id,name:card.name,setId:'BK05',type:card.type,family:card.family,origin:card.origin,
   subject:card.subject.trim()+'. '+angles[index%angles.length]+'. '+(card.type==='beast'||card.type==='fusion'?'The complete large creature silhouette, face, limbs, wings and tails are fully inside its own square; ornate individually painted surroundings establish scale.':'A clearly identifiable detailed magical event or physical device dominates a richly illustrated environment; never an icon or diagram.'),
   palette:style.palette};
 });
 const id='bk05-'+family;
 const rows=Array.from({length:4},(_,row)=>'ROW '+(row+1)+' left to right:\n'+records.slice(row*6,(row+1)*6).map((card,column)=>'CELL '+(column+1)+': '+card.subject).join('\n'));
 const prompt=`Use case: stylized-concept. Final production artwork atlas for the original fantasy trading card expansion 幻彩の夢界. EXACTLY 24 separate SQUARE illustrations in a mathematically exact SIX columns by FOUR rows edge-to-edge grid. A LANDSCAPE 3:2 image at 1536×1024 pixels. All 24 cells equal size. NO gutters, NO outer margins, NO card frames, NO borders, NO labels, NO lettering, NO numbers. Every scene fully contained in its own square, no cross-cell elements. Keep heads, wings, tails and important subject details within a six-percent inset.\n\nSTYLE: exquisite richly hand-inked 2D Japanese fantasy trading-card illustration, sophisticated anatomy, expressive curved silhouettes, visible artistic contours, sculpted cel shadows and luminous gouache colors. Highly detailed complete scenes with clear silhouettes and refined painterly depth. An individually painted environment in every cell. No photorealism, no 3D, no vector icon, no logo, no diagram. Entirely original designs. Every cell is distinct and follows the exact subject list.\n\nFAMILY ART DIRECTION: ${style.material}\nPALETTE AND WORLD: ${style.palette}.\n\nRead every individual subject and paint EXACTLY in row-major order; identifiers and names must NEVER appear in the image:\n${rows.join('\n\n')}\n\nFINAL CHECK: 6 equal columns, 4 equal rows, 24 full-bleed independent square paintings, each a distinct subject in the required place, no lettering, no frame, no gaps, no limb crossing into adjacent cells. Crisp refined premium illustration, detailed but legible at card thumbnail size.\n`;
 jobs.push({id,family,src:'assets/design-v5/cards/'+id+'.webp',columns:6,rows:4,cardIds:records.map(card=>card.id),cards:records,prompt});
}
assert.equal(jobs.flatMap(job=>job.cards).length,96);
assert.equal(new Set(jobs.flatMap(job=>job.cards.map(card=>card.subject))).size,96,'Every card requires an individually directed scene.');
await mkdir(resolve(directory,'prompts'),{recursive:true});
for(const job of jobs)await writeFile(resolve(directory,'prompts',job.id+'.txt'),job.prompt);
await writeFile(resolve(directory,'generation-jobs.json'),JSON.stringify({version:1,method:'built-in-imagegen',cardCount:96,atlasCount:4,columns:6,rows:4,jobs},null,2)+'\n');
console.log(JSON.stringify({cards:96,atlases:4,directory}));

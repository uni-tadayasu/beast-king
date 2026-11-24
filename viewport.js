/** Card pages keep their controls in view; the artwork keeps its physical ratio. */
export function calculateCardLayout({width,height,desktop=true,edit=false}={}) {
  if(!desktop)return {columns:0,rows:0,cardWidth:0,pageSize:edit?18:24};
  const availableWidth=Math.max(120,Number(width)||120);
  const availableHeight=Math.max(170,(Number(height)||250)-70);
  const gap=14,caption=22,ratio=520/360;
  let best=null;
  for(let rows=1;rows<=3;rows++)for(let columns=1;columns<=12;columns++){
    const cardWidth=Math.floor(Math.min(278,(availableWidth-gap*(columns-1))/columns,((availableHeight-gap*(rows-1))/rows-caption)/ratio));
    if(cardWidth<138)continue;
    const score=cardWidth*cardWidth*columns*rows*(1+Math.min(cardWidth/220,1.2)*.08);
    if(!best||score>best.score)best={columns,rows,cardWidth,pageSize:columns*rows,score};
  }
  if(!best){const cardWidth=Math.max(90,Math.floor(Math.min(availableWidth,(availableHeight-caption)/ratio)));return {columns:1,rows:1,cardWidth,pageSize:1};}
  const {score,...layout}=best;return layout;
}

/** Real pane dimensions, after the header, navigation and filters. Card
 *  controls have an explicit budget; choose a full-width physical-card grid
 *  without shrinking unrelated UI. */
export function calculateFittedCardLayout({width,height,edit=false,compact=false}={}){
 const w=Math.max(1,Math.floor(Number(width)||1)-12);
 const h=Math.max(1,Math.floor(Number(height)||1)-8);
 const gap=compact?8:14,caption=edit?76:28,ratio=520/360;
 const min=compact?68:120,max=compact?230:360;
 let best=null;
 for(let rows=1;rows<=3;rows++)for(let columns=1;columns<=14;columns++){
  const cardWidth=Math.floor(Math.min(max,(w-gap*(columns-1))/columns,((h-gap*(rows-1))/rows-caption)/ratio));
  if(cardWidth<min)continue;
  // Cover the available canvas, preferring legibility on equally filled grids.
  const score=cardWidth*cardWidth*rows*columns*(.45+Math.min(cardWidth/180,2)*1.15);
  if(!best||score>best.score)best={columns,rows,cardWidth,pageSize:columns*rows,score};
 }
 if(!best){
  const cardWidth=Math.max(compact?54:68,Math.min(max,Math.floor(w),Math.floor(Math.max(0,h-caption)/ratio)));
  const columns=Math.max(1,Math.min(14,Math.floor((w+gap)/(cardWidth+gap))));
  return {columns,rows:1,cardWidth,pageSize:columns};
 }
 const {score,...layout}=best;return layout;
}

/** Independent card tiles in the dual 50/50 editor. The grid budget includes
 * the entire card, a fixed count/action footer, grid padding and row gaps.
 * Never force a card to be wider/taller than the space that is available. */
export function calculateWorkshopTileLayout({width,height,compact=false}={}){
 const w=Math.max(1,Math.floor(Number(width)||1)-10);
 const h=Math.max(1,Math.floor(Number(height)||1)-10);
 const gap=6,footer=58,ratio=520/360,max=compact?210:300,min=compact?65:110;
 let best=null;
 for(let rows=1;rows<=4;rows++)for(let columns=1;columns<=10;columns++){
  const cardWidth=Math.floor(Math.min(max,(w-gap*(columns-1))/columns,((h-gap*(rows-1))/rows-footer)/ratio));
  if(cardWidth<min)continue;
  const score=cardWidth*cardWidth*columns*rows*(.8+Math.min(cardWidth/200,1.4));
  if(!best||score>best.score)best={columns,rows,cardWidth,pageSize:columns*rows,score};
 }
 if(!best){
  const cardWidth=Math.max(1,Math.min(max,w,Math.floor((h-footer)/ratio)));
  const columns=Math.max(1,Math.min(10,Math.floor((w+gap)/(cardWidth+gap))));
  return {columns,rows:1,cardWidth,pageSize:columns};
 }
 const {score,...result}=best;return result;
}

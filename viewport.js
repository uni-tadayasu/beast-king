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
 const gap=compact?8:14,caption=edit?84:36,ratio=520/360;
 const min=compact?86:148,max=compact?260:380;
 let best=null;
 // A second row earns its space only on tall panes. Prefer fewer readable
 // illustrations to a dense grid that forces the surrounding labels to shrink.
 const maxRows=h>=520?2:1;
 for(let rows=1;rows<=maxRows;rows++)for(let columns=1;columns<=10;columns++){
  const cardWidth=Math.floor(Math.min(max,(w-gap*(columns-1))/columns,((h-gap*(rows-1))/rows-caption)/ratio));
  if(cardWidth<min)continue;
  // Cover the available canvas, preferring legibility on equally filled grids.
  const score=cardWidth*cardWidth*rows*columns*Math.pow(cardWidth/160,1.5);
  if(!best||score>best.score)best={columns,rows,cardWidth,pageSize:columns*rows,score};
 }
 if(!best){
  // Tiny canvases may need thumbnail-sized art, but must not overflow just to
  // preserve an arbitrary minimum width. The owned-card label keeps its budget.
  const cardWidth=Math.max(1,Math.min(max,Math.floor(w),Math.floor(Math.max(0,h-caption)/ratio)));
  const columns=Math.max(1,Math.min(10,Math.floor((w+gap)/(cardWidth+gap))));
  return {columns,rows:1,cardWidth,pageSize:columns};
 }
 const {score,...layout}=best;return layout;
}

/** Independent card tiles in the dual 50/50 editor. The grid budget includes
 * the entire card, a fixed count/action footer, grid padding and row gaps.
 * Never force a card to be wider/taller than the space that is available. */
export function calculateWorkshopTileLayout({width,height,compact=false,horizontal=false}={}){
 const w=Math.max(1,Math.floor(Number(width)||1)-10);
 const h=Math.max(1,Math.floor(Number(height)||1)-10);
 // Controls retain physical reading space even when the illustration must be
 // a small thumbnail: 22px quantity row + 32px action row + 6px gaps + 4px slack.
 // A horizontal tile places name/quantity beside the image, leaving just a
 // 32px action row and 8px spacing below it. Keep the label column independent
 // from the image so short canvases do not shrink the readable controls.
 // tileWidth belongs to the grid; cardWidth belongs to the artwork.
 const gap=6,footer=horizontal?40:64,ratio=520/360,max=compact?240:320;
 const artworkWidth=tileWidth=>horizontal?Math.max(1,tileWidth-8-Math.max(Math.min(84,Math.max(0,tileWidth-9)),tileWidth*.48)):tileWidth;
 const minTile=Math.min(w,144),maxRows=h>=520?2:1;
 const maxColumns=h<165?2:compact?4:8;
 let best=null;
 for(let rows=1;rows<=maxRows;rows++)for(let columns=1;columns<=maxColumns;columns++){
  const tileWidth=Math.floor(Math.min(max,(w-gap*(columns-1))/columns));
  const cardWidth=Math.floor(Math.min(artworkWidth(tileWidth),((h-gap*(rows-1))/rows-footer)/ratio));
  if(tileWidth<minTile||cardWidth<1)continue;
  const score=cardWidth*cardWidth*columns*rows*Math.pow(cardWidth/150,1.5);
  if(!best||score>best.score)best={columns,rows,cardWidth,tileWidth,...(horizontal?{labelWidth:Math.max(0,tileWidth-cardWidth-8)}:{}),pageSize:columns*rows,score};
 }
 if(!best){
  const tileWidth=Math.min(max,w);
  const cardWidth=Math.max(1,Math.min(Math.floor(artworkWidth(tileWidth)),Math.floor((h-footer)/ratio)));
  return {columns:1,rows:1,cardWidth,tileWidth,...(horizontal?{labelWidth:Math.max(0,tileWidth-cardWidth-8)}:{}),pageSize:1};
 }
 const {score,...result}=best;return result;
}

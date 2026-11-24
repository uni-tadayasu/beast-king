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

/** A pinhole camera looking across a horizontal battle table from the player's
 * near edge. All positions are local CSS pixels; no DOM or game state enters
 * this module. The same projection drives the canvas and the hit targets. */
const ELEVATION=36, DISTANCE=11, BODY_BASE=.22, MAX_BODY_HEIGHT=2.3;
const CARD_WIDTH=1.75, CARD_DEPTH=1.2, CARD_Y=.025, BODY_MAX_WIDTH=1.75;
const COLUMNS=[-3.6,-1.2,1.2,3.6], ROW_DISTANCE=2.5;
const BOARD={left:-5,right:5,far:-3.4,near:3.4};
const HIT_PAD=2, LABEL_GAP=3;
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;

function bounds(points){
 const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x));
 const top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y));
 return {x:left,y:top,width:right-left,height:bottom-top};
}
function rectPoints(rect){return [{x:rect.x,y:rect.y},{x:rect.x+rect.width,y:rect.y+rect.height}];}
function union(rectangles){return bounds(rectangles.flatMap(rectPoints));}
function boardWorldCorners(){return [
 {x:BOARD.left,y:0,z:BOARD.far},{x:BOARD.right,y:0,z:BOARD.far},
 {x:BOARD.right,y:0,z:BOARD.near},{x:BOARD.left,y:0,z:BOARD.near}
];}

/** World +y is up and +z is towards the local player. `scale` is pixels per
 * world unit at that point, while depth is distance along the camera axis. */
export function projectBattlePoint(camera,point){
 const x=finite(point?.x,0),y=finite(point?.y,0),z=finite(point?.z,0);
 const depth=Math.max(.01,camera.distance-y*camera.sinElevation-z*camera.cosElevation);
 const scale=camera.focal/depth;
 return {x:camera.centerX+x*scale,y:camera.centerY+(z*camera.sinElevation-y*camera.cosElevation)*scale,depth,scale};
}

function projectedParts(camera,owner,index,bodyWidth,bodyHeight){
 const world={x:COLUMNS[index],y:0,z:owner===0?ROW_DISTANCE:-ROW_DISTANCE};
 const x=world.x,z=world.z,half=bodyWidth/2;
 const bodyCorners=[
  {x:x-half,y:BODY_BASE+bodyHeight,z},{x:x+half,y:BODY_BASE+bodyHeight,z},
  {x:x+half,y:BODY_BASE,z},{x:x-half,y:BODY_BASE,z}
 ].map(p=>projectBattlePoint(camera,p));
 const cardCorners=[
  {x:x-CARD_WIDTH/2,y:CARD_Y,z:z-CARD_DEPTH/2},{x:x+CARD_WIDTH/2,y:CARD_Y,z:z-CARD_DEPTH/2},
  {x:x+CARD_WIDTH/2,y:CARD_Y,z:z+CARD_DEPTH/2},{x:x-CARD_WIDTH/2,y:CARD_Y,z:z+CARD_DEPTH/2}
 ].map(p=>projectBattlePoint(camera,p));
 return {world,bodyCorners,cardCorners,bodyBounds:bounds(bodyCorners),cardBounds:bounds(cardCorners),basePoint:projectBattlePoint(camera,world)};
}

function slotGeometry(camera,owner,index,bodyWidth,bodyHeight){
 const parts=projectedParts(camera,owner,index,bodyWidth,bodyHeight);
 const occupied=union([parts.bodyBounds,parts.cardBounds]);
 const labelBounds={x:occupied.x,y:occupied.y+occupied.height+LABEL_GAP,width:occupied.width,height:camera.labelHeight};
 const combined=union([occupied,labelBounds]);
 const hitBounds={x:combined.x-HIT_PAD,y:combined.y-HIT_PAD,width:combined.width+HIT_PAD*2,height:combined.height+HIT_PAD*2};
 return {owner,index,...parts,bodyWidth,bodyHeight,bodyBaseY:BODY_BASE,labelBounds,hitBounds,depthScale:camera.distance/parts.basePoint.depth};
}

function candidate(rect,bodyHeight,labelHeight,padding){
 const radians=ELEVATION*Math.PI/180;
 const camera={rect:{...rect},elevationDeg:ELEVATION,sinElevation:Math.sin(radians),cosElevation:Math.cos(radians),distance:DISTANCE,
  focal:1,centerX:0,centerY:0,bodyHeight,bodyBaseY:BODY_BASE,labelHeight,padding,
  cardWidth:CARD_WIDTH,cardDepth:CARD_DEPTH,cardY:CARD_Y,bodyMaxWidth:BODY_MAX_WIDTH,columnX:[...COLUMNS],rowDistance:ROW_DISTANCE,
  boardWorldBounds:{...BOARD},boardWorldCorners:boardWorldCorners()};
 // Reserve a rectangle as tall and as wide as any supported illustration.
 // Actual art is fitted inside it without changing its aspect ratio.
 const raw=Array.from({length:8},(_,i)=>projectedParts(camera,i<4?1:0,i%4,BODY_MAX_WIDTH,bodyHeight));
 const board=camera.boardWorldCorners.map(p=>projectBattlePoint(camera,p));
 const worldBounds=bounds([...board,...raw.flatMap(s=>[...s.bodyCorners,...s.cardCorners])]);
 const availableWidth=Math.max(1,rect.width-padding*2-HIT_PAD*2),availableHeight=Math.max(1,rect.height-padding*2);
 let focal=availableWidth/Math.max(.001,worldBounds.width);
 const top=worldBounds.y;
 // Each bottom edge is affine in focal length. Label height is in CSS pixels,
 // so subtract its allowance before fitting the corresponding world span.
 focal=Math.min(focal,(availableHeight-HIT_PAD)/Math.max(.001,Math.max(...board.map(p=>p.y))-top));
 for(const part of raw){
  const bottom=Math.max(part.bodyBounds.y+part.bodyBounds.height,part.cardBounds.y+part.cardBounds.height);
  focal=Math.min(focal,(availableHeight-labelHeight-LABEL_GAP-HIT_PAD*2)/Math.max(.001,bottom-top));
 }
 camera.focal=Math.max(.001,focal);
 const slots=Array.from({length:8},(_,i)=>slotGeometry(camera,i<4?1:0,i%4,BODY_MAX_WIDTH,bodyHeight));
 const occupied=union([bounds(camera.boardWorldCorners.map(p=>projectBattlePoint(camera,p))),...slots.map(s=>s.hitBounds)]);
 camera.centerX=rect.x+(rect.width-occupied.width)/2-occupied.x;
 camera.centerY=rect.y+(rect.height-occupied.height)/2-occupied.y;
 camera.boardCorners=camera.boardWorldCorners.map(p=>projectBattlePoint(camera,p));
 const farBottom=Math.max(...slots.slice(0,4).map(s=>s.hitBounds.y+s.hitBounds.height));
 const nearTop=Math.min(...slots.slice(4).map(s=>s.hitBounds.y));
 camera.rowGap=nearTop-farBottom;
 camera.columnGap=Math.min(...[0,4].flatMap(start=>[0,1,2].map(index=>slots[start+index+1].hitBounds.x-slots[start+index].hitBounds.x-slots[start+index].hitBounds.width)));
 return camera;
}

/** Fit the low, near-side view to the available field rectangle. Screen-sized
 * name/stat panels remain readable, while creature height adapts so the nearer
 * row never covers the opponent's labels or hit targets. */
export function createBattleCamera(input={}){
 const rect={x:finite(input.x,0),y:finite(input.y,0),width:Math.max(1,finite(input.width,1)),height:Math.max(1,finite(input.height,1))};
 const padding=Math.min(10,Math.max(3,Math.min(rect.width,rect.height)*.025));
 const labelHeight=Math.max(1,Math.min(rect.height>260?32:28,Math.floor((rect.height-padding*2)/4)));
 const desiredGap=Math.min(8,Math.max(3,rect.height*.02));
 const desiredColumnGap=Math.min(6,Math.max(2,rect.width*.006));
 let low=0,high=MAX_BODY_HEIGHT,best=candidate(rect,low,labelHeight,padding);
 for(let step=0;step<20;step++){
  const mid=(low+high)/2,current=candidate(rect,mid,labelHeight,padding);
  if(current.rowGap>=desiredGap&&current.columnGap>=desiredColumnGap){low=mid;best=current;}else high=mid;
 }
 best.bodyHeight=Math.max(0,best.bodyHeight);
 return best;
}

/** owner 0 is the player's nearer row; owner 1 is the opponent's farther row.
 * Corner order is top-left, top-right, bottom-right, bottom-left on screen.
 * `hitBounds` includes the flat card and the separate name/stat label area. */
export function getBattleSlot(camera,owner,index,aspect=1){
 if(![0,1].includes(owner)||!Number.isInteger(index)||index<0||index>3)return null;
 const ratio=Number.isFinite(aspect)&&aspect>0?aspect:1;
 const height=Math.min(camera.bodyHeight,BODY_MAX_WIDTH/ratio),width=height*ratio;
 return slotGeometry(camera,owner,index,width,height);
}

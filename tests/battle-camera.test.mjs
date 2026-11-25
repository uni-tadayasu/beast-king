import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleCamera,projectBattlePoint,getBattleSlot} from '../battle-camera.js';

const edgeLength=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const overlaps=(a,b)=>Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)+.001&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y)+.001;
function contains(outer,inner,label){
 assert.ok(inner.x>=outer.x-.001&&inner.y>=outer.y-.001&&inner.x+inner.width<=outer.x+outer.width+.001&&inner.y+inner.height<=outer.y+outer.height+.001,label+': '+JSON.stringify({outer,inner}));
}

test('the camera looks across the table: the near edge and creatures are larger, and world height rises above the card',()=>{
 const camera=createBattleCamera({x:30,y:50,width:950,height:400});
 assert.ok(camera.elevationDeg>=32&&camera.elevationDeg<=38,'low, oblique viewpoint');
 const [farLeft,farRight,nearRight,nearLeft]=camera.boardCorners;
 assert.ok(edgeLength(nearLeft,nearRight)>edgeLength(farLeft,farRight)*1.5,'the table visibly recedes towards the opponent');
 for(let column=0;column<4;column++){
  const near=getBattleSlot(camera,0,column),far=getBattleSlot(camera,1,column);
  assert.ok(near.basePoint.y>far.basePoint.y,'own row is nearer and lower');
  assert.ok(near.depthScale>far.depthScale*1.3,'own models have stronger perspective scale');
  assert.ok(edgeLength(near.bodyCorners[0],near.bodyCorners[1])>edgeLength(far.bodyCorners[0],far.bodyCorners[1])*1.3);
  const foot=projectBattlePoint(camera,near.world),head=projectBattlePoint(camera,{...near.world,y:near.bodyBaseY+near.bodyHeight});
  assert.ok(head.y<foot.y,'creatures stand above their ground plane');
 }
});

test('eight creature targets, their ground cards, and readable labels fit without overlap on desktop and compact boards',()=>{
 for(const [width,height] of [[950,400],[500,210],[400,150]]){
  const rect={x:23,y:41,width,height},camera=createBattleCamera(rect);
  // The reserved rectangle is the worst case: maximum width and full height.
  // Mixed aspect ratios cover the actual square, portrait and wide paintings.
  for(const aspects of [Array(8).fill(camera.bodyMaxWidth/camera.bodyHeight),[.45,1,2.5,.8,1.6,.5,1,3]]){
   const slots=aspects.map((aspect,index)=>getBattleSlot(camera,index<4?1:0,index%4,aspect));
   for(const [index,slot] of slots.entries()){
    contains(rect,slot.hitBounds,width+'x'+height+' target '+index);
    contains(slot.hitBounds,slot.bodyBounds,'body stays inside its target');
    contains(slot.hitBounds,slot.cardBounds,'ground card stays inside its target');
    contains(slot.hitBounds,slot.labelBounds,'both text rows stay inside their target');
    assert.ok(slot.labelBounds.height>=28,'name and stats retain screen-sized space');
    assert.ok(slot.labelBounds.y>=slot.cardBounds.y+slot.cardBounds.height,'labels sit below the card front');
    for(let other=index+1;other<slots.length;other++)assert.equal(overlaps(slot.hitBounds,slots[other].hitBounds),false,width+'x'+height+' targets '+index+' and '+other+' do not overlap');
   }
  }
  assert.ok(camera.bodyHeight>.9,'compact fitting retains visible creature height');
 }
});

test('illustrations retain their complete aspect ratio on upright surfaces and use a separate horizontal card surface',()=>{
 const camera=createBattleCamera({width:950,height:400});
 for(const aspect of [.45,.75,1,1.8,3.2]){
  const slot=getBattleSlot(camera,0,1,aspect);
  assert.ok(Math.abs(slot.bodyWidth/slot.bodyHeight-aspect)<1e-10,'the original illustration is not stretched');
  assert.ok(slot.bodyWidth<=camera.bodyMaxWidth+.000001);
  assert.ok(slot.bodyHeight<=camera.bodyHeight+.000001);
  assert.ok(slot.bodyCorners[0].y<slot.bodyCorners[3].y,'upright art top is above its bottom');
  assert.ok(edgeLength(slot.cardCorners[2],slot.cardCorners[3])>edgeLength(slot.cardCorners[0],slot.cardCorners[1]),'ground card front edge is wider than its distant edge');
  assert.ok(slot.bodyCorners[2].y<slot.basePoint.y,'the original image floats above its card instead of lying on the floor');
  if(aspect<=1)assert.ok(slot.bodyBounds.height>slot.cardBounds.height,'portrait and square beasts stand taller than their foreshortened cards');
 }
});

test('camera data is serializable and gives the canvas and HTML targets identical stable coordinates',()=>{
 const camera=createBattleCamera({x:12,y:34,width:500,height:210}),restored=JSON.parse(JSON.stringify(camera));
 assert.deepEqual(getBattleSlot(restored,0,2,.7),getBattleSlot(camera,0,2,.7));
 assert.deepEqual(projectBattlePoint(restored,{x:1.2,y:1,z:-2.5}),projectBattlePoint(camera,{x:1.2,y:1,z:-2.5}));
 const near=getBattleSlot(camera,0,0),far=getBattleSlot(camera,1,0);
 assert.equal(near.labelBounds.height,far.labelBounds.height,'perspective never shrinks text rows');
 assert.equal(getBattleSlot(camera,2,0),null);
 assert.equal(getBattleSlot(camera,0,4),null);
 assert.equal(getBattleSlot(camera,0,1.5),null);
});

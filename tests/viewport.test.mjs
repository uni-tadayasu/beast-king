import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateFittedCardLayout,calculateWorkshopTileLayout} from '../viewport.js';

const cardRatio=520/360;

test('collection pages reserve the enlarged ownership row without overflowing the canvas',()=>{
 for(const [width,height,compact] of [[1800,650,false],[970,380,false],[540,260,true],[330,180,true],[568,132,true]]){
  const result=calculateFittedCardLayout({width,height,compact});
  const gap=compact?8:14;
  assert.equal(result.pageSize,result.columns*result.rows);
  assert.ok(result.columns*result.cardWidth+(result.columns-1)*gap<=width-12);
  assert.ok(result.rows*(result.cardWidth*cardRatio+36)+(result.rows-1)*gap<=height-8);
  if(height<528)assert.equal(result.rows,1,'Short panes preserve one complete row.');
 }
});

test('short editor panes preserve quantity and action space independently from thumbnail width',()=>{
 for(const [width,height] of [[256,114],[376,132],[180,165],[130,145],[540,340],[890,510],[1200,750]]){
  const result=calculateWorkshopTileLayout({width,height,compact:height<=165||width<300});
  assert.equal(result.pageSize,result.columns*result.rows);
  assert.ok(result.cardWidth>0&&result.cardWidth<=result.tileWidth);
  assert.ok(result.columns*result.tileWidth+(result.columns-1)*6<=width-10);
  // Mirrors the physical contract with CSS, including all two-row control
  // labels and spacing, rather than checking only the illustration itself.
  assert.ok(result.rows*(result.cardWidth*cardRatio+64)+(result.rows-1)*6<=height-10);
  if(width>=154)assert.ok(result.tileWidth>=144,'Two 14px action labels need a useful tile width.');
  if(height<175){
   assert.equal(result.rows,1);
   assert.ok(result.columns<=2,'Shallow panes do not fill themselves with tiny thumbnails.');
   assert.ok(result.tileWidth>result.cardWidth,'Controls are not limited to the small illustration width.');
  }
 }
});

test('horizontal editor tiles reserve a full action row and a separate readable label column',()=>{
 for(const [width,height] of [[256,80],[256,120],[376,120],[376,155],[180,155],[130,145],[540,340]]){
  const result=calculateWorkshopTileLayout({width,height,compact:true,horizontal:true});
  assert.equal(result.pageSize,result.columns*result.rows);
  assert.ok(result.columns*result.tileWidth+(result.columns-1)*6<=width-10);
  assert.ok(result.rows*(result.cardWidth*cardRatio+40)+(result.rows-1)*6<=height-10);
  assert.ok(result.cardWidth+8+result.labelWidth<=result.tileWidth);
  assert.ok(result.labelWidth>=84,'The name and quantity column remains independent of image size.');
  if(width>=154)assert.ok(result.tileWidth>=144);
  if(height<175){assert.equal(result.rows,1);assert.ok(result.columns<=2);}
 }
 const budget={width:256,height:120,compact:true};
 const horizontal=calculateWorkshopTileLayout({...budget,horizontal:true});
 const vertical=calculateWorkshopTileLayout(budget);
 assert.ok(horizontal.cardWidth>vertical.cardWidth,'Moving the quantities alongside the image increases artwork size.');
});


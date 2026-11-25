import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCreatureGeometry} from '../summon-geometry.js';

function image(width,height,alpha){
 const data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const offset=(y*width+x)*4,value=alpha(x,y);
  data[offset]=(x*31+y*7)%256;data[offset+1]=(x*3+y*43)%256;data[offset+2]=(x*13+y*17)%256;data[offset+3]=typeof value==='boolean'?(value?255:0):value;
 }
 return {data,width,height};
}
const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} should equal ${b}`);
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);

function covered(mesh,sourceX,sourceY){
 const point={x:(sourceX-mesh.bounds.x)/mesh.bounds.width-.5,y:1-(sourceY-mesh.bounds.y)/mesh.bounds.height};
 for(let i=0;i<mesh.indices.length;i+=3){
  const a=mesh.vertices[mesh.indices[i]],b=mesh.vertices[mesh.indices[i+1]],c=mesh.vertices[mesh.indices[i+2]];
  if(cross(a,b,point)>=-1e-8&&cross(b,c,point)>=-1e-8&&cross(c,a,point)>=-1e-8)return true;
 }
 return false;
}

function validMesh(mesh){
 assert.ok(mesh&&mesh.vertices.length>2&&mesh.indices.length>=3);
 assert.equal(mesh.indices.length%3,0);
 assert.ok(mesh.vertices.length<65536,'all indices fit the renderer Uint16 buffer');
 assert.equal(mesh.uvs.length,mesh.vertices.length);assert.equal(mesh.depth.length,mesh.vertices.length);assert.equal(mesh.normals.length,mesh.vertices.length);
 for(let i=0;i<mesh.vertices.length;i++){
  const vertex=mesh.vertices[i],uv=mesh.uvs[i],normal=mesh.normals[i];
  assert.ok(Object.values(vertex).every(Number.isFinite)&&Object.values(uv).every(Number.isFinite)&&Object.values(normal).every(Number.isFinite));
  assert.ok(vertex.x>=-.5&&vertex.x<=.5&&vertex.y>=0&&vertex.y<=1&&mesh.depth[i]>=0&&mesh.depth[i]<=1);
  assert.ok(uv.u>=0&&uv.u<=1&&uv.v>=0&&uv.v<=1);
  near(vertex.z,mesh.depth[i]*mesh.thickness);near(Math.hypot(normal.x,normal.y,normal.z),1);
  assert.ok(normal.z>0,'front surface normals face towards the camera');
 }
 for(let i=0;i<mesh.indices.length;i+=3){
  const ids=mesh.indices.slice(i,i+3);
  assert.ok(ids.every(index=>Number.isInteger(index)&&index>=0&&index<mesh.vertices.length));
  const [a,b,c]=ids.map(index=>mesh.vertices[index]);
  assert.ok(cross(a,b,c)>0,'triangles have nondegenerate positive-z winding');
 }
 for(const edge of mesh.contourEdges)for(const index of edge){assert.ok(index>=0&&index<mesh.vertices.length);assert.equal(mesh.depth[index],0,'the contour meets the back plane');}
}

test('a cropped creature keeps full-source UVs, original pixels, upright feet, and rounded normalized depth',()=>{
 const source=image(80,100,(x,y)=>x>=18&&x<62&&y>=12&&y<84),before=source.data.slice();
 const mesh=buildCreatureGeometry(source);validMesh(mesh);
 assert.deepEqual(mesh.bounds,{x:18,y:12,width:44,height:72});near(mesh.aspect,44/72);
 assert.deepEqual(mesh.grid,{columns:24,rows:24});assert.equal(mesh.opaquePixels,44*72);
 near(Math.min(...mesh.vertices.map(v=>v.x)),-.5);near(Math.max(...mesh.vertices.map(v=>v.x)),.5);
 near(Math.min(...mesh.vertices.map(v=>v.y)),0);near(Math.max(...mesh.vertices.map(v=>v.y)),1);
 near(Math.min(...mesh.uvs.map(uv=>uv.u)),18/80);near(Math.max(...mesh.uvs.map(uv=>uv.u)),62/80);
 near(Math.min(...mesh.uvs.map(uv=>uv.v)),12/100);near(Math.max(...mesh.uvs.map(uv=>uv.v)),84/100);
 for(let i=0;i<mesh.vertices.length;i++)if(mesh.vertices[i].y===0)near(mesh.uvs[i].v,84/100);
 near(Math.max(...mesh.depth),1);near(Math.max(...mesh.vertices.map(v=>v.z)),.14);
 const middle=mesh.vertices.findIndex(v=>Math.abs(v.x)<1e-7&&Math.abs(v.y-.5)<1e-7);
 assert.ok(mesh.depth[middle]>.95);assert.ok(mesh.normals.some(n=>Math.abs(n.x)>.1),'curved sides produce useful lighting normals');
 assert.equal(mesh.contours.length,1);assert.equal(mesh.contours[0][0],mesh.contours[0].at(-1));
 assert.deepEqual(source.data,before,'RGB and alpha are not rewritten');
 assert.deepEqual(JSON.parse(JSON.stringify(mesh)),mesh,'geometry is serializable without source pixels');
});

test('transparent corners and a large interior hole are absent from the surface',()=>{
 const source=image(128,128,(x,y)=>{const distance=Math.hypot(x-64,y-64);return distance<50&&distance>28;});
 const mesh=buildCreatureGeometry(source);validMesh(mesh);
 assert.equal(covered(mesh,64.5,64.5),false,'the hole does not become a rectangular panel');
 assert.equal(covered(mesh,16.5,16.5),false,'transparent crop corners are clipped');
 for(const [x,y] of [[64.5,20.5],[108.5,64.5],[64.5,108.5],[20.5,64.5]])assert.equal(covered(mesh,x,y),true,'the visible ring is preserved');
 assert.equal(mesh.contours.length,2,'the outer edge and interior hole each have a contour');
 assert.ok(mesh.contours.every(contour=>contour[0]===contour.at(-1)));
});

test('one-pixel whiskers and detached details survive a grid coarser than their width',()=>{
 const source=image(128,128,(x,y)=>Math.hypot(x-40,y-64)<24||(y===37&&x>=40&&x<=120)||(x===121&&y===102));
 const mesh=buildCreatureGeometry(source,{grid:12});validMesh(mesh);
 for(let x=40;x<=120;x++)assert.equal(covered(mesh,x+.5,37.5),true,'whisker pixel '+x+' is retained');
 assert.equal(covered(mesh,121.5,102.5),true,'a detached pixel is retained');
 assert.equal(covered(mesh,110.5,90.5),false,'separate details do not fill a broad transparent gap');
 for(let y=41;y<88;y+=3)for(let x=18;x<63;x+=3)if(source.data[(y*128+x)*4+3])assert.equal(covered(mesh,x+.5,y+.5),true,'body coverage survives clipping');
});

test('separated creatures remain separated and tiny dimensions produce finite usable meshes',()=>{
 const separated=buildCreatureGeometry(image(80,64,(x,y)=>(x>=4&&x<16&&y>=5&&y<51)||(x>=60&&x<76&&y>=30&&y<56)));
 validMesh(separated);assert.equal(separated.contours.length,2);assert.equal(covered(separated,40,40),false);
 for(const [width,height] of [[1,1],[1,37],[39,1]]){
  const mesh=buildCreatureGeometry(image(width,height,()=>true));validMesh(mesh);
  assert.deepEqual(mesh.bounds,{x:0,y:0,width,height});near(mesh.aspect,width/height);near(Math.max(...mesh.depth),1);
  assert.equal(covered(mesh,width/2,height/2),true);
 }
});

test('alpha threshold ignores transparent color and weak matte noise, while bad or empty input is harmless',()=>{
 const source=image(20,20,(x,y)=>x===10&&y===8?16:15);
 const mesh=buildCreatureGeometry(source);validMesh(mesh);assert.deepEqual(mesh.bounds,{x:10,y:8,width:1,height:1});assert.equal(mesh.opaquePixels,1);
 assert.equal(buildCreatureGeometry(source,{alphaThreshold:17}),null);
 for(const invalid of [null,{},image(3,3,()=>0),{width:0,height:2,data:[]},{width:1.5,height:2,data:new Uint8Array(16)},{width:2,height:2,data:new Uint8Array(15)},{width:Infinity,height:1,data:[]},{width:4_194_305,height:1,data:[]}])assert.equal(buildCreatureGeometry(invalid),null);
});

test('resolution, thickness and noisy inputs stay bounded, and building twice is deterministic',()=>{
 const source=image(65,65,(x,y)=>(x+y)%3!==0);
 for(const [grid,expected] of [[-10,10],[12,12],[16,16],[24,24],[100,28],[NaN,24]]){
  const mesh=buildCreatureGeometry(source,{grid,thickness:0});validMesh(mesh);assert.deepEqual(mesh.grid,{columns:expected,rows:expected});assert.ok(mesh.vertices.every(vertex=>vertex.z===0));
 }
 const options={grid:22,thickness:.21},first=buildCreatureGeometry(source,options),second=buildCreatureGeometry(source,options);
 assert.deepEqual(first,second);assert.equal(first.thickness,.21);near(Math.max(...first.vertices.map(vertex=>vertex.z)),.21);
});

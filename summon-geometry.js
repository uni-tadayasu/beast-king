/** Build a lightweight front surface from an already-authorized RGBA source.
 * The source remains the texture: this module only reads its alpha channel.
 * It does not load images, infer ownership, or retain the supplied pixel data.
 *
 * Vertices use x = -0.5..0.5 across the cropped width, y = 0..1 upwards from
 * the feet, and z in units of the cropped height. Multiply x by bodyWidth,
 * and y/z by bodyHeight. UVs refer to the complete, unmodified source image.
 * Boundary cells conservatively cover opaque pixels; the original texture
 * alpha supplies their exact contour, including details smaller than a cell.
 */
const MAX_PIXELS=4_194_304, EPS=1e-9, SQRT2=Math.SQRT2;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);

function convexHull(points){
 points.sort((a,b)=>a.x-b.x||a.y-b.y);
 const unique=[];
 for(const point of points){
  const last=unique.at(-1);
  if(!last||Math.abs(point.x-last.x)>EPS||Math.abs(point.y-last.y)>EPS)unique.push(point);
 }
 if(unique.length<3)return [];
 const lower=[],upper=[];
 for(const point of unique){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),point)<=EPS)lower.pop();lower.push(point);}
 for(let i=unique.length-1;i>=0;i--){const point=unique[i];while(upper.length>1&&cross(upper.at(-2),upper.at(-1),point)<=EPS)upper.pop();upper.push(point);}
 lower.pop();upper.pop();return lower.concat(upper);
}

/** Clip a polygon against a line, with nonnegative distances on its inside. */
function clipPolygon(polygon,distance){
 if(!polygon.length)return polygon;
 const result=[];
 let previous=polygon.at(-1),previousDistance=distance(previous);
 for(const current of polygon){
  const currentDistance=distance(current),inside=currentDistance>=-EPS,previousInside=previousDistance>=-EPS;
  if(inside!==previousInside){
   const fraction=previousDistance/(previousDistance-currentDistance);
   result.push({x:previous.x+(current.x-previous.x)*fraction,y:previous.y+(current.y-previous.y)*fraction});
  }
  if(inside)result.push(current);
  previous=current;previousDistance=currentDistance;
 }
 return result;
}

function polygonArea(polygon){
 let area=0;
 for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length];area+=a.x*b.y-b.x*a.y;}
 return Math.abs(area)/2;
}

function pixelRect(x0,y0,x1,y1){return [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];}

function distanceField(mask,width,height){
 const stride=width+2,field=new Float32Array(stride*(height+2));
 let maximum=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(mask[y*width+x])field[(y+1)*stride+x+1]=width+height+2;
 for(let y=1;y<=height;y++)for(let x=1;x<=width;x++){
  const i=y*stride+x;
  if(field[i])field[i]=Math.min(field[i],field[i-1]+1,field[i-stride]+1,field[i-stride-1]+SQRT2,field[i-stride+1]+SQRT2);
 }
 for(let y=height;y>=1;y--)for(let x=width;x>=1;x--){
  const i=y*stride+x;
  if(field[i])field[i]=Math.min(field[i],field[i+1]+1,field[i+stride]+1,field[i+stride-1]+SQRT2,field[i+stride+1]+SQRT2);
  maximum=Math.max(maximum,field[i]);
 }
 return (x,y)=>{
  const fx=clamp(x+.5,0,width+1),fy=clamp(y+.5,0,height+1);
  const left=Math.min(width,Math.floor(fx)),top=Math.min(height,Math.floor(fy)),dx=fx-left,dy=fy-top,i=top*stride+left;
  const topValue=field[i]*(1-dx)+field[i+1]*dx,bottomValue=field[i+stride]*(1-dx)+field[i+stride+1]*dx;
  return Math.sqrt(clamp((topValue*(1-dy)+bottomValue*dy-.5)/Math.max(.5,maximum-.5),0,1));
 };
}

function occupancy(mask,width,height){
 const stride=width+1,prefix=new Uint32Array(stride*(height+1));
 for(let y=0;y<height;y++){
  let row=0;
  for(let x=0;x<width;x++){row+=mask[y*width+x];prefix[(y+1)*stride+x+1]=prefix[y*stride+x+1]+row;}
 }
 return (left,top,right,bottom)=>{
  const x0=clamp(Math.floor(left),0,width),y0=clamp(Math.floor(top),0,height);
  const x1=clamp(Math.ceil(right),0,width),y1=clamp(Math.ceil(bottom),0,height);
  return {x0,y0,x1,y1,count:prefix[y1*stride+x1]-prefix[y0*stride+x1]-prefix[y1*stride+x0]+prefix[y0*stride+x0],total:(x1-x0)*(y1-y0)};
 };
}

function surfaceNormals(vertices,indices,aspect){
 const normals=vertices.map(()=>({x:0,y:0,z:0}));
 for(let i=0;i<indices.length;i+=3){
  const ids=indices.slice(i,i+3),[a,b,c]=ids.map(index=>vertices[index]);
  const ux=(b.x-a.x)*aspect,uy=b.y-a.y,uz=b.z-a.z,vx=(c.x-a.x)*aspect,vy=c.y-a.y,vz=c.z-a.z;
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  for(const index of ids){normals[index].x+=nx;normals[index].y+=ny;normals[index].z+=nz;}
 }
 for(const normal of normals){const length=Math.hypot(normal.x,normal.y,normal.z);if(length>EPS){normal.x/=length;normal.y/=length;normal.z/=length;}else normal.z=1;}
 return normals;
}

function surfaceContours(indices){
 const edges=new Map();
 for(let i=0;i<indices.length;i+=3)for(let side=0;side<3;side++){
  const a=indices[i+side],b=indices[i+(side+1)%3],key=a<b?a+':'+b:b+':'+a,edge=edges.get(key);
  if(edge)edge.count++;else edges.set(key,{a,b,count:1});
 }
 const contourEdges=[...edges.values()].filter(edge=>edge.count===1).map(({a,b})=>[a,b]);
 const starts=new Map();
 for(let i=0;i<contourEdges.length;i++){const start=contourEdges[i][0];if(!starts.has(start))starts.set(start,[]);starts.get(start).push(i);}
 const visited=new Set(),contours=[];
 for(let i=0;i<contourEdges.length;i++){
  if(visited.has(i))continue;
  const contour=[contourEdges[i][0]];let edgeIndex=i;
  while(edgeIndex!==undefined&&!visited.has(edgeIndex)){
   visited.add(edgeIndex);const end=contourEdges[edgeIndex][1];contour.push(end);
   if(end===contour[0])break;
   edgeIndex=starts.get(end)?.find(index=>!visited.has(index));
  }
  contours.push(contour);
 }
 return {contourEdges,contours};
}

/** @returns {object|null} A serializable mesh, or null for invalid/empty data.
 * grid is clamped to 10..28. The default alpha threshold is 16/255.
 * The front has positive-z winding and normals. Contour index sequences
 * repeat their first index when closed; contourEdges always expose all rims.
 */
export function buildCreatureGeometry(image,options={}){
 const {data,width,height}=image||{};
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>MAX_PIXELS||!data||!Number.isSafeInteger(data.length)||data.length<width*height*4)return null;
 const alphaThreshold=clamp(Math.round(finite(options?.alphaThreshold,16)),1,255);
 const resolution=clamp(Math.round(finite(options?.grid,24)),10,28),thickness=clamp(finite(options?.thickness,.14),0,.5);
 let minX=width,minY=height,maxX=-1,maxY=-1,opaquePixels=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>=alphaThreshold){
  minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);opaquePixels++;
 }
 if(!opaquePixels)return null;
 const bounds={x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1},cw=bounds.width,ch=bounds.height,aspect=cw/ch;
 const mask=new Uint8Array(cw*ch);
 for(let y=0;y<ch;y++)for(let x=0;x<cw;x++)mask[y*cw+x]=data[((y+minY)*width+x+minX)*4+3]>=alphaThreshold?1:0;
 const depthAt=distanceField(mask,cw,ch),countRect=occupancy(mask,cw,ch);
 const vertices=[],uvs=[],depth=[],indices=[],vertexMap=new Map();
 function vertex(point){
  const x=clamp(Math.round(point.x*1e7)/1e7,0,cw),y=clamp(Math.round(point.y*1e7)/1e7,0,ch),key=x+':'+y;
  if(vertexMap.has(key))return vertexMap.get(key);
  const index=vertices.length,d=depthAt(x,y);
  vertices.push({x:x/cw-.5,y:1-y/ch,z:d*thickness});uvs.push({u:(minX+x)/width,v:(minY+y)/height});depth.push(d);vertexMap.set(key,index);return index;
 }
 function intersectsOpaque(a,b,c){
  const area=cross(a,b,c),sign=area>=0?1:-1;
  if(Math.abs(area)<=EPS)return false;
  const box=countRect(Math.min(a.x,b.x,c.x),Math.min(a.y,b.y,c.y),Math.max(a.x,b.x,c.x),Math.max(a.y,b.y,c.y));
  if(!box.count)return false;
  if(box.count===box.total)return true;
  for(let y=box.y0;y<box.y1;y++)for(let x=box.x0;x<box.x1;x++)if(mask[y*cw+x]){
   let clipped=pixelRect(x,y,x+1,y+1);
   for(const [start,end] of [[a,b],[b,c],[c,a]])clipped=clipPolygon(clipped,p=>sign*cross(start,end,p));
   if(clipped.length>=3&&polygonArea(clipped)>EPS)return true;
  }
  return false;
 }
 function triangle(a,b,c,checkAlpha=false){
  if(Math.abs(cross(a,b,c))<=EPS||(checkAlpha&&!intersectsOpaque(a,b,c)))return;
  // Source coordinates point down, but the upright surface points up.
  const winding=cross(a,b,c)<0?[a,b,c]:[a,c,b];indices.push(...winding.map(vertex));
 }
 for(let row=0;row<resolution;row++)for(let column=0;column<resolution;column++){
  const x0=column*cw/resolution,x1=(column+1)*cw/resolution,y0=row*ch/resolution,y1=(row+1)*ch/resolution;
  const occupied=countRect(x0,y0,x1,y1);
  if(!occupied.count)continue;
  if(occupied.count===occupied.total){
   triangle({x:x0,y:y0},{x:x0,y:y1},{x:x1,y:y0});triangle({x:x1,y:y0},{x:x0,y:y1},{x:x1,y:y1});continue;
  }
  // Clip pixel coverage to each grid triangle before taking its hull. Unlike
  // corner-only marching triangles, this preserves thin limbs and whiskers.
  const halves=[[],[]],diagonal=p=>1-(p.x-x0)/(x1-x0)-(p.y-y0)/(y1-y0);
  for(let y=occupied.y0;y<occupied.y1;y++)for(let x=occupied.x0;x<occupied.x1;x++)if(mask[y*cw+x]){
   const left=Math.max(x,x0),right=Math.min(x+1,x1),top=Math.max(y,y0),bottom=Math.min(y+1,y1);
   if(right-left<=EPS||bottom-top<=EPS)continue;
   const rectangle=pixelRect(left,top,right,bottom);
   for(let half=0;half<2;half++)halves[half].push(...clipPolygon(rectangle,p=>half?-diagonal(p):diagonal(p)));
  }
  for(let half=0;half<2;half++){
   let hull=convexHull(halves[half]);
   if(hull.length<3)continue;
   // Bound adversarial noisy masks below WebGL's Uint16 vertex limit. The
   // texture still clips the fallback triangle to exactly the same alpha.
   if(hull.length>32)hull=half?[{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}]:[{x:x0,y:y0},{x:x1,y:y0},{x:x0,y:y1}];
   const center=hull.reduce((p,q)=>({x:p.x+q.x/hull.length,y:p.y+q.y/hull.length}),{x:0,y:0});
   for(let i=0;i<hull.length;i++)triangle(center,hull[i],hull[(i+1)%hull.length],true);
  }
 }
 if(!indices.length)return null;
 const {contourEdges,contours}=surfaceContours(indices);
 // The rim meets the card-facing plane; the interior rises into a rounded
 // surface. Normalize after sampling so small creatures retain visible depth.
 for(const edge of contourEdges)for(const index of edge)depth[index]=0;
 const peak=depth.reduce((maximum,value)=>Math.max(maximum,value),0);
 for(let i=0;i<vertices.length;i++){depth[i]=peak>0?depth[i]/peak:0;vertices[i].z=depth[i]*thickness;}
 return {bounds,aspect,vertices,uvs,depth,indices,normals:surfaceNormals(vertices,indices,aspect),contourEdges,contours,
  grid:{columns:resolution,rows:resolution},thickness,opaquePixels,alphaThreshold,sourceWidth:width,sourceHeight:height};
}

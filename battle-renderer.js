/* Shared projected triangles: the tabletop, flat cards and raised paintings
   use one camera. DOM controls sit above this pointer-transparent canvas. */
const VERTEX=`attribute vec3 aPosition;
attribute vec2 aUV;
attribute float aShade;
uniform vec2 uResolution;
varying vec2 vUV;
varying float vShade;
void main(){
 float depth=max(.01,aPosition.z);
 vec2 clip=aPosition.xy/uResolution*vec2(2.,-2.)+vec2(-1.,1.);
 gl_Position=vec4(clip*depth,(65./63.)*depth-128./63.,depth);vUV=aUV;vShade=aShade;
}`;
const FRAGMENT=`precision mediump float;
uniform sampler2D uImage;
uniform vec4 uTint;
uniform float uFade;
varying vec2 vUV;
varying float vShade;
void main(){
 vec4 paint=texture2D(uImage,vUV);
 if(paint.a<.02)discard;
 float edge=min(min(vUV.x,1.-vUV.x),min(vUV.y,1.-vUV.y));
 float alpha=mix(1.,smoothstep(0.,.004,edge),uFade);
 gl_FragColor=paint*uTint*vec4(vec3(vShade),alpha);
}`;

const fan=count=>Array.from({length:Math.max(0,count-2)},(_,i)=>[0,i+1,i+2]).flat();
const colour=rgba=>'rgba('+rgba.slice(0,3).map(v=>Math.round(v*255)).join(',')+','+(rgba[3]??1)+')';

export function createWebglBattleRenderer(canvas){
 const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:true,depth:true,preserveDrawingBuffer:false,powerPreference:'low-power'});
 if(!gl)return null;
 const shaders=[];
 function compile(type,code){const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,code);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('battle camera shader');return shader;}
 let program;
 try{program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,VERTEX));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,FRAGMENT));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('battle camera program');}
 catch{for(const shader of shaders)gl.deleteShader(shader);if(program)gl.deleteProgram(program);return null;}
 for(const shader of shaders)gl.deleteShader(shader);
 const buffer=gl.createBuffer(),indexBuffer=gl.createBuffer(),textures=new Set();
 const position=gl.getAttribLocation(program,'aPosition'),uv=gl.getAttribLocation(program,'aUV'),shade=gl.getAttribLocation(program,'aShade');
 const uniforms=Object.fromEntries(['uResolution','uImage','uTint','uFade'].map(name=>[name,gl.getUniformLocation(program,name)]));
 function upload(source){
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  if(source)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
  else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  textures.add(texture);return texture;
 }
 const white=upload(null);
 function mesh(texture,points,uvs,indices,{tint=[1,1,1,1],fade=true,shades=null,depthTest=false}={}){
  if(!points.length||!indices.length)return;
  const vertices=new Float32Array(points.length*6);
  for(let i=0;i<points.length;i++){const p=points[i],q=uvs[i]||{u:.5,v:.5};vertices.set([p.x,p.y,p.depth||1,q.u,q.v,shades?.[i]??1],i*6);}
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.DYNAMIC_DRAW);
  gl.vertexAttribPointer(position,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,24,12);gl.vertexAttribPointer(shade,1,gl.FLOAT,false,24,20);
  if(depthTest){gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);}else gl.disable(gl.DEPTH_TEST);
  gl.depthMask(depthTest);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform4fv(uniforms.uTint,tint);gl.uniform1f(uniforms.uFade,fade?1:0);
  gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
 }
 function polygon(points,{fill=[.05,.15,.20,1],stroke=null,lineWidth=1}={}){
  if(fill)mesh(white,points,[],fan(points.length),{tint:fill,fade:false});
  if(stroke)line([...points,points[0]],{stroke,lineWidth});
 }
 function line(points,{stroke=[.25,.75,.85,.5],lineWidth=1}={}){
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(length<.01)continue;
   const nx=-dy/length*lineWidth/2,ny=dx/length*lineWidth/2;
   mesh(white,[{...a,x:a.x+nx,y:a.y+ny},{...b,x:b.x+nx,y:b.y+ny},{...b,x:b.x-nx,y:b.y-ny},{...a,x:a.x-nx,y:a.y-ny}],[],[0,1,2,0,2,3],{tint:stroke,fade:false});
  }
 }
 return {kind:'webgl',upload,mesh,polygon,line,
  release(texture){gl.deleteTexture(texture);textures.delete(texture);},
  begin(width,height){gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.depthMask(true);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.enableVertexAttribArray(position);gl.enableVertexAttribArray(uv);gl.enableVertexAttribArray(shade);gl.uniform2f(uniforms.uResolution,width,height);gl.uniform1i(uniforms.uImage,0);},
  destroy(){for(const texture of textures)gl.deleteTexture(texture);textures.clear();gl.deleteBuffer(buffer);gl.deleteBuffer(indexBuffer);gl.deleteProgram(program);}
 };
}

/** Software fallback uses the same projected mesh, without changing a creature's
 * painting or falling back to a top-down board on devices without WebGL. */
export function createCanvasBattleRenderer(canvas){
 const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)return null;
 const path=points=>{ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));};
 function triangle(texture,p,q){
  const s=q.map(v=>({x:v.u*texture.width,y:v.v*texture.height}));
  const dx1=s[1].x-s[0].x,dy1=s[1].y-s[0].y,dx2=s[2].x-s[0].x,dy2=s[2].y-s[0].y,det=dx1*dy2-dx2*dy1;
  if(Math.abs(det)<.0001)return;
  const a=((p[1].x-p[0].x)*dy2-(p[2].x-p[0].x)*dy1)/det;
  const c=((p[2].x-p[0].x)*dx1-(p[1].x-p[0].x)*dx2)/det;
  const b=((p[1].y-p[0].y)*dy2-(p[2].y-p[0].y)*dy1)/det;
  const d=((p[2].y-p[0].y)*dx1-(p[1].y-p[0].y)*dx2)/det;
  ctx.save();path(p);ctx.closePath();ctx.clip();ctx.transform(a,b,c,d,p[0].x-a*s[0].x-c*s[0].y,p[0].y-b*s[0].x-d*s[0].y);ctx.drawImage(texture,0,0);ctx.restore();
 }
 return {kind:'canvas',upload:source=>source,release(){},
  begin(width){const ratio=canvas.width/width;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,canvas.height/ratio);},
  mesh(texture,points,uvs,indices,{tint=[1,1,1,1]}={}){ctx.save();ctx.globalAlpha=tint[3]??1;for(let i=0;i<indices.length;i+=3){const ids=indices.slice(i,i+3);triangle(texture,ids.map(j=>points[j]),ids.map(j=>uvs[j]));}ctx.restore();},
  polygon(points,{fill=[.05,.15,.20,1],stroke=null,lineWidth=1}={}){path(points);ctx.closePath();if(fill){ctx.fillStyle=colour(fill);ctx.fill();}if(stroke){ctx.strokeStyle=colour(stroke);ctx.lineWidth=lineWidth;ctx.stroke();}},
  line(points,{stroke=[.25,.75,.85,.5],lineWidth=1}={}){path(points);ctx.strokeStyle=colour(stroke);ctx.lineWidth=lineWidth;ctx.stroke();},
  destroy(){}
 };
}

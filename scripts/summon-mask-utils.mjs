/** Numeric helpers for the public foreground build. These never write RGB. */
import assert from 'node:assert/strict';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

/** Pixel-center bilinear sampling preserves the exact reviewed crop, even
 * when its coordinates are fractional after source-dimension scaling. */
export function sampleSummonCrop(image,crop,width,height){
 assert.equal(image.data.length,image.width*image.height*4);
 assert.ok(crop.x>=0&&crop.y>=0&&crop.width>0&&crop.height>0&&crop.x+crop.width<=image.width&&crop.y+crop.height<=image.height);
 const data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++){
  const sy=clamp(crop.y+(y+.5)*crop.height/height-.5,0,image.height-1),y0=Math.floor(sy),y1=Math.min(image.height-1,y0+1),fy=sy-y0;
  for(let x=0;x<width;x++){
   const sx=clamp(crop.x+(x+.5)*crop.width/width-.5,0,image.width-1),x0=Math.floor(sx),x1=Math.min(image.width-1,x0+1),fx=sx-x0,p=(y*width+x)*4;
   for(let c=0;c<4;c++){
    const top=image.data[(y0*image.width+x0)*4+c]*(1-fx)+image.data[(y0*image.width+x1)*4+c]*fx;
    const bottom=image.data[(y1*image.width+x0)*4+c]*(1-fx)+image.data[(y1*image.width+x1)*4+c]*fx;
    data[p+c]=top*(1-fy)+bottom*fy;
   }
  }
 }
 return {data,width,height};
}

export function normalizeBiRefNetInput(image){
 const count=image.width*image.height,values=new Float32Array(count*3),mean=[.485,.456,.406],std=[.229,.224,.225];
 assert.equal(image.data.length,count*4);
 for(let c=0;c<3;c++)for(let i=0;i<count;i++)values[c*count+i]=(image.data[i*4+c]/255-mean[c])/std[c];
 return values;
}

export function prepareLogitMask(values,inputWidth,inputHeight,width=256,height=256){
 assert.equal(values.length,inputWidth*inputHeight);
 const probabilities=new Float32Array(values.length);let logitMin=Infinity,logitMax=-Infinity,sigmoidMin=1,sigmoidMax=0;
 for(let i=0;i<values.length;i++){
  const value=values[i];assert.ok(Number.isFinite(value),'Foreground model produced a nonfinite logit');
  const exp=Math.exp(-Math.abs(value));probabilities[i]=value>=0?1/(1+exp):exp/(1+exp);
  logitMin=Math.min(logitMin,value);logitMax=Math.max(logitMax,value);sigmoidMin=Math.min(sigmoidMin,probabilities[i]);sigmoidMax=Math.max(sigmoidMax,probabilities[i]);
 }
 return {...prepareProbabilityMask(probabilities,inputWidth,inputHeight,width,height),logits:{min:logitMin,max:logitMax,sigmoidMin,sigmoidMax}};
}

/** Some exported models already produce alpha. Never apply sigmoid twice. */
export function prepareProbabilityMask(probabilities,inputWidth,inputHeight,width=256,height=256){
 assert.equal(probabilities.length,inputWidth*inputHeight);
 let min=1,max=0;
 for(const value of probabilities){assert.ok(Number.isFinite(value)&&value>=-.000001&&value<=1.000001,'Foreground model produced invalid alpha');min=Math.min(min,value);max=Math.max(max,value);}
 const mask=new Uint8ClampedArray(width*height),sampledProbabilities=new Float32Array(width*height);
 for(let y=0;y<height;y++){
  const sy=clamp((y+.5)*inputHeight/height-.5,0,inputHeight-1),y0=Math.floor(sy),y1=Math.min(inputHeight-1,y0+1),fy=sy-y0;
  for(let x=0;x<width;x++){
   const sx=clamp((x+.5)*inputWidth/width-.5,0,inputWidth-1),x0=Math.floor(sx),x1=Math.min(inputWidth-1,x0+1),fx=sx-x0;
   const top=probabilities[y0*inputWidth+x0]*(1-fx)+probabilities[y0*inputWidth+x1]*fx;
   const bottom=probabilities[y1*inputWidth+x0]*(1-fx)+probabilities[y1*inputWidth+x1]*fx;
   sampledProbabilities[y*width+x]=clamp(top*(1-fy)+bottom*fy,0,1);
   mask[y*width+x]=Math.round(sampledProbabilities[y*width+x]*255);
  }
 }
 return {mask,probabilities:sampledProbabilities,probabilityRange:{min,max}};
}

export function logitsToMask(...args){return prepareLogitMask(...args).mask;}

export function grayscaleRgba(mask,width,height){
 assert.equal(mask.length,width*height);const data=new Uint8ClampedArray(mask.length*4);
 for(let i=0;i<mask.length;i++){data[i*4]=data[i*4+1]=data[i*4+2]=mask[i];data[i*4+3]=255;}
 return {data,width,height};
}

export function nativeForegroundAlpha(image){
 let clear=false,visible=false;
 for(let i=3;i<image.data.length;i+=4){clear||=image.data[i]<=8;visible||=image.data[i]>=32;if(clear&&visible)return true;}
 return false;
}

/** Numeric diagnostics flag gross failures; they do not replace outline QA. */
export function measureMask(mask,width,height){
 assert.equal(mask.length,width*height);
 const count=mask.length,visited=new Uint8Array(count),queue=new Int32Array(count),components=[];
 let clear=0,solid=0,sum=0,edgeSolid=0,edgeCount=0,minX=width,minY=height,maxX=-1,maxY=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x,value=mask[i];sum+=value;if(value<=8)clear++;if(value>=128)solid++;
  if(value>=16){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  if(x===0||y===0||x===width-1||y===height-1){edgeCount++;if(value>=128)edgeSolid++;}
  if(value<128||visited[i])continue;
  let read=0,write=1;queue[0]=i;visited[i]=1;
  while(read<write){
   const p=queue[read++],px=p%width,py=Math.floor(p/width);
   for(const q of [px>0?p-1:-1,px+1<width?p+1:-1,py>0?p-width:-1,py+1<height?p+width:-1]){
    if(q>=0&&!visited[q]&&mask[q]>=128){visited[q]=1;queue[write++]=q;}
   }
  }
  components.push(write);
 }
 components.sort((a,b)=>b-a);
 const alphaCoverage=sum/(count*255),flags=[];
 if(alphaCoverage<.03)flags.push('very-small-foreground');
 if(alphaCoverage>.97)flags.push('nearly-full-background');
 if(!clear)flags.push('no-clear-pixels');
 if(!solid)flags.push('no-solid-pixels');
 return {alphaCoverage,clearFraction:clear/count,opaqueFraction:solid/count,softFraction:(count-clear-solid)/count,
  borderOpaqueFraction:edgeSolid/edgeCount,componentCount:components.length,largestComponentPixels:components[0]||0,
  largestComponentFraction:solid?(components[0]||0)/solid:0,
  bounds:maxX<0?null:{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1},flags};
}

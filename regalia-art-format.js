/** Private static raster transport. Artwork bytes are never public assets. */
export const REGALIA_ART_MAX_BYTES=540000;
export function isRegaliaRasterArtwork(value){
 const prefix='data:image/webp;base64,';
 if(typeof value!=='string'||!value.startsWith(prefix)||value.length>720040)return false;
 const encoded=value.slice(prefix.length);
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)||encoded.length%4!==0)return false;
 try{
  const bytes=atob(encoded);
  if(bytes.length<30||bytes.length>REGALIA_ART_MAX_BYTES||bytes.slice(0,4)!=='RIFF'||bytes.slice(8,12)!=='WEBP')return false;
  const read32=i=>((bytes.charCodeAt(i)|bytes.charCodeAt(i+1)<<8|bytes.charCodeAt(i+2)<<16|bytes.charCodeAt(i+3)<<24)>>>0);
  if(read32(4)+8!==bytes.length)return false;
  let image=false;
  for(let i=12;i<bytes.length;){
   if(i+8>bytes.length)return false;
   const type=bytes.slice(i,i+4),length=read32(i+4),end=i+8+length+(length%2);
   if(end>bytes.length||type==='ANIM'||type==='ANMF')return false;
   if(type==='VP8 '||type==='VP8L')image=true;
   if(type==='VP8X'){
    if(length!==10)return false;
    const size=j=>1+bytes.charCodeAt(j)+(bytes.charCodeAt(j+1)<<8)+(bytes.charCodeAt(j+2)<<16);
    if((bytes.charCodeAt(i+8)&2)||size(i+12)>2048||size(i+15)>2048)return false;
   }
   i=end;
  }
  return image;
 }catch{return false;}
}

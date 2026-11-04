import {padAtlasPixels} from './uv-padding.mjs';
let parts=[];
self.onmessage=async({data:m})=>{
 if(m.parts){parts=m.parts;return}
 try{
  const source=new Uint8Array(m.buffer),pixels=new Uint8ClampedArray(source.length),stride=m.size*4;
  for(let y=0;y<m.size;y++)pixels.set(source.subarray(y*stride,(y+1)*stride),(m.size-1-y)*stride);
  padAtlasPixels(pixels,m.size,parts,m.atlas);
  if(typeof OffscreenCanvas==='undefined'){self.postMessage({id:m.id,buffer:pixels.buffer,size:m.size},[pixels.buffer]);return}
  const canvas=new OffscreenCanvas(m.size,m.size);canvas.getContext('2d').putImageData(new ImageData(pixels,m.size,m.size),0,0);
  const blob=await canvas.convertToBlob({type:'image/png'});self.postMessage({id:m.id,blob});
 }catch(error){self.postMessage({id:m.id,error:error.message})}
};

// Cooperative fallback for browsers where Worker/OffscreenCanvas is unavailable.
// Preserve the same scan conversion and gutter propagation as uv-padding.mjs.
import {seamPaddingPixels} from './uv-padding.mjs';
export const yieldPixels=()=>globalThis.scheduler?.yield?globalThis.scheduler.yield():new Promise(resolve=>setTimeout(resolve,0));
let currentParts=null;const masks=new Map();let maskBytes=0;
export function resetPixelFallback(){currentParts=null;masks.clear();maskBytes=0}

export async function rasterizeAsync(parts,atlas,width,height=width,yieldWork=yieldPixels){
 const mask=new Uint8Array(width*height);
 for(const part of parts){
  if(part.atlas!==atlas)continue;const v=part.restVertices||part.vertices,ids=part.indices;
  for(let i=0;i<ids.length;i+=3){
   if(i%384===0)await yieldWork();
   if(part.tattooExcludedRanges?.some(r=>i>=r.first&&i<r.first+r.count))continue;
   const p=[ids[i],ids[i+1],ids[i+2]].map(id=>[v[id*8+6]*width,(1-v[id*8+7])*height]);
   if(p.some(q=>!q.every(Number.isFinite)))continue;
   const area=(p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]);if(Math.abs(area)<1e-10)continue;
   const first=Math.max(0,Math.ceil(Math.min(...p.map(q=>q[1]))-.5)),last=Math.min(height-1,Math.floor(Math.max(...p.map(q=>q[1]))-.5));
   for(let y=first;y<=last;y++){
    if(y>first&&(y-first)%128===0)await yieldWork();const scan=y+.5,x=[];
    for(let edge=0;edge<3;edge++){const a=p[edge],b=p[(edge+1)%3];if(scan<Math.min(a[1],b[1])||scan>=Math.max(a[1],b[1])||a[1]===b[1])continue;x.push(a[0]+(scan-a[1])*(b[0]-a[0])/(b[1]-a[1]))}
    if(x.length<2)continue;const lo=Math.max(0,Math.ceil(Math.min(...x)-.5-1e-7)),hi=Math.min(width-1,Math.floor(Math.max(...x)-.5+1e-7));if(lo<=hi)mask.fill(1,y*width+lo,y*width+hi+1);
   }
  }
 }
 return mask;
}

export async function extendAsync(pixels,mask,width,height,radius,yieldWork=yieldPixels){
 if(pixels.length!==width*height*4||mask.length!==width*height)throw new Error('UV padding dimensions do not match');
 radius=Math.max(0,Math.floor(radius));if(!radius)return 0;
 let queue=new Uint32Array(Math.min(mask.length,16384)),length=0;
 const push=id=>{if(length===queue.length){const next=new Uint32Array(Math.min(mask.length,Math.max(16,queue.length*2)));next.set(queue);queue=next}queue[length++]=id};
 for(let y=0;y<height;y++){
  if(y%8===0)await yieldWork();
  for(let x=0;x<width;x++){const id=y*width+x;if(mask[id]!==1)continue;if(x>0&&!mask[id-1]||x+1<width&&!mask[id+1]||y>0&&!mask[id-width]||y+1<height&&!mask[id+width])push(id)}
 }
 const seeds=length;let start=0;
 function grow(source,id){if(mask[id])return;mask[id]=2;const from=source*4,to=id*4;for(let c=0;c<4;c++)pixels[to+c]=pixels[from+c];push(id)}
 try{
  for(let step=0;step<radius&&start<length;step++){
   const end=length;for(let i=start;i<end;i++){if(i%8192===0)await yieldWork();const id=queue[i],x=id%width;if(x>0)grow(id,id-1);if(x+1<width)grow(id,id+1);if(id>=width)grow(id,id-width);if(id+width<mask.length)grow(id,id+width)}start=end;
  }
 }finally{for(let i=seeds;i<length;i++){if(i%8192===0)await yieldWork();mask[queue[i]]=0}}
 return length-seeds;
}

export async function preparePixels(source,size,parts,atlas,yieldWork=yieldPixels){
 const pixels=new Uint8ClampedArray(source.length),stride=size*4;let ink=false;
 for(let y=0;y<size;y++){
  if(y%16===0)await yieldWork();const row=source.subarray(y*stride,(y+1)*stride);pixels.set(row,(size-1-y)*stride);
  if(!ink)for(let i=3;i<row.length;i+=4)if(row[i]){ink=true;break}
 }
 if(!ink)return pixels;
 if(currentParts!==parts){currentParts=parts;masks.clear();maskBytes=0}
 const key=atlas+':'+size;let mask=masks.get(key);
 if(!mask){mask=await rasterizeAsync(parts,atlas,size,size,yieldWork);while(maskBytes+mask.byteLength>48*1024*1024&&masks.size){const oldest=masks.keys().next().value;maskBytes-=masks.get(oldest).byteLength;masks.delete(oldest)}masks.set(key,mask);maskBytes+=mask.byteLength}else{masks.delete(key);masks.set(key,mask)}
 await extendAsync(pixels,mask,size,size,seamPaddingPixels(size),yieldWork);return pixels;
}

let pending=Promise.resolve();
export function encodePixelsFallback(source,size,parts,atlas){
 const run=async()=>{
  const pixels=await preparePixels(source,size,parts,atlas),canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  try{canvas.getContext('2d').putImageData(new ImageData(pixels,size,size),0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('纹理编码失败');return blob}finally{canvas.width=canvas.height=1}
 };
 const result=pending.then(run);pending=result.catch(()=>{});return result;
}

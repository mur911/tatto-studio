import {resetPixelFallback} from './pixel-fallback.mjs';
let worker=null,model=null,serial=0;const jobs=new Map();
export function resetPixelEncoder(){worker?.terminate();worker=null;model=null;resetPixelFallback();for(const j of jobs.values())j.reject(new Error('The model changed during encoding.'));jobs.clear()}
export async function encodePixels(pixels,size,parts,atlas){
 if(!globalThis.Worker)return null;
 if(model!==parts){resetPixelEncoder();model=parts}
 if(!worker){worker=new Worker(new URL('./pixel-worker.mjs',import.meta.url),{type:'module'});worker.onmessage=async({data})=>{const job=jobs.get(data.id);if(!job)return;jobs.delete(data.id);if(data.error){job.reject(new Error(data.error));return}if(data.buffer){try{const c=document.createElement('canvas');c.width=c.height=data.size;c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.buffer),data.size,data.size),0,0);const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));c.width=c.height=1;if(!blob)throw new Error('PNG encoding failed.');job.resolve(blob)}catch(error){job.reject(error)}}else job.resolve(data.blob)};worker.onerror=()=>resetPixelEncoder();worker.postMessage({parts:parts.map(p=>({atlas:p.atlas,restVertices:p.restVertices||p.vertices,indices:p.indices,tattooExcludedRanges:p.tattooExcludedRanges}))})}
 const id=++serial;return await new Promise((resolve,reject)=>{jobs.set(id,{resolve,reject});worker.postMessage({id,size,atlas,buffer:pixels.buffer},[pixels.buffer])});
}

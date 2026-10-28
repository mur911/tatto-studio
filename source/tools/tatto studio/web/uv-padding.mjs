// Extend baked RGBA only outside actual UV islands. Filtering/mipmaps can then
// sample across a resource seam without picking up a transparent atlas border.
// Transparent artwork inside an island is deliberately left unchanged.
let cachedCoverage=null;
export const seamPaddingPixels=size=>Math.max(2,Math.ceil(size/512));
export function rasterizeUVMask(parts,atlas,width,height=width){
 const mask=new Uint8Array(width*height);
 for(const part of parts){
  if(part.atlas!==atlas)continue;
  const v=part.restVertices||part.vertices,ids=part.indices;
  for(let i=0;i<ids.length;i+=3){
   if(part.tattooExcludedRanges?.some(r=>i>=r.first&&i<r.first+r.count))continue;
   const p=[ids[i],ids[i+1],ids[i+2]].map(id=>[v[id*8+6]*width,(1-v[id*8+7])*height]);
   if(p.some(q=>!q.every(Number.isFinite)))continue;
   const area=(p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]);if(Math.abs(area)<1e-10)continue;
   const first=Math.max(0,Math.ceil(Math.min(...p.map(q=>q[1]))-.5)),last=Math.min(height-1,Math.floor(Math.max(...p.map(q=>q[1]))-.5));
   for(let y=first;y<=last;y++){
    const scan=y+.5,x=[];
    for(let edge=0;edge<3;edge++){const a=p[edge],b=p[(edge+1)%3];if(scan<Math.min(a[1],b[1])||scan>=Math.max(a[1],b[1])||a[1]===b[1])continue;x.push(a[0]+(scan-a[1])*(b[0]-a[0])/(b[1]-a[1]))}
    if(x.length<2)continue;const lo=Math.max(0,Math.ceil(Math.min(...x)-.5-1e-7)),hi=Math.min(width-1,Math.floor(Math.max(...x)-.5+1e-7));if(lo<=hi)mask.fill(1,y*width+lo,y*width+hi+1);
   }
  }
 }
 return mask;
}
export function extendUVGutter(pixels,mask,width,height,radius){
 if(pixels.length!==width*height*4||mask.length!==width*height)throw new Error('UV padding dimensions do not match');
 radius=Math.max(0,Math.floor(radius));if(!radius)return 0;
 let queue=new Uint32Array(Math.min(mask.length,16384)),length=0;
 const push=id=>{if(length===queue.length){const next=new Uint32Array(Math.min(mask.length,Math.max(16,queue.length*2)));next.set(queue);queue=next}queue[length++]=id};
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const id=y*width+x;if(mask[id]!==1)continue;
  if(x>0&&!mask[id-1]||x+1<width&&!mask[id+1]||y>0&&!mask[id-width]||y+1<height&&!mask[id+width])push(id);
 }
 const seeds=length;let start=0;
 function grow(source,id){if(mask[id])return;mask[id]=2;const from=source*4,to=id*4;for(let c=0;c<4;c++)pixels[to+c]=pixels[from+c];push(id)}
 for(let step=0;step<radius&&start<length;step++){
  const end=length;for(let i=start;i<end;i++){const id=queue[i],x=id%width;if(x>0)grow(id,id-1);if(x+1<width)grow(id,id+1);if(id>=width)grow(id,id-width);if(id+width<mask.length)grow(id,id+width)}start=end;
 }
 // Restore the cached binary mask without an additional full-size allocation.
 for(let i=seeds;i<length;i++)mask[queue[i]]=0;
 return length-seeds;
}
export function padAtlasPixels(pixels,size,parts,atlas){
 let ink=false;for(let i=3;i<pixels.length;i+=4)if(pixels[i]){ink=true;break}if(!ink)return 0;
 if(!cachedCoverage||cachedCoverage.parts!==parts||cachedCoverage.atlas!==atlas||cachedCoverage.size!==size)cachedCoverage={parts,atlas,size,mask:rasterizeUVMask(parts,atlas,size)};
 return extendUVGutter(pixels,cachedCoverage.mask,size,size,seamPaddingPixels(size));
}

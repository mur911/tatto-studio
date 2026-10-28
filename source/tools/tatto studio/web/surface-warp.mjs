// Intrinsic surface charts. No camera projection, extra texture sampler, or
// modification of the character mesh is involved in these editable coordinates.
import {dot,cross,unit,rotateVector} from './transform-math.mjs';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(v,s)=>v.map(x=>x*s);
const graphs=new WeakMap(),charts=new WeakMap();
export const defaultWarpPoints=()=>Array.from({length:9},(_,i)=>[(i%3)/2,Math.floor(i/3)/2]);
export function validateWarp(warp){
 if(warp===undefined)return;
 if(!warp||warp.version!==1||!Array.isArray(warp.points)||warp.points.length!==9||warp.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||Math.abs(v)>8)))throw new Error('曲面贴合控制点无效');
 if(!validWarpGrid(warp.points))throw new Error('曲面贴合控制点不能互相穿越');
}
export function validWarpGrid(points){
 for(let y=0;y<2;y++)for(let x=0;x<2;x++)for(const ids of [[y*3+x,y*3+x+1,(y+1)*3+x+1],[y*3+x,(y+1)*3+x+1,(y+1)*3+x]]){
  const [a,b,c]=ids.map(i=>points[i]);if((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])<.004)return false;
 }return true;
}
class Heap{
 constructor(){this.items=[]}
 push(id,d){const a=this.items;let i=a.length;a.push([id,d]);while(i){const p=(i-1)>>1;if(a[p][1]<=d)break;a[i]=a[p];i=p}a[i]=[id,d]}
 pop(){const a=this.items,top=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&a[j+1][1]<a[j][1])j++;if(a[j][1]>=last[1])break;a[i]=a[j];i=j}a[i]=last}return top}
 get length(){return this.items.length}
}
function makeGraph(parts,pose){
 const nodes=[],partMaps=new Map(),cells=new Map(),epsilon=.00065,key=(x,y,z)=>x+','+y+','+z;
 for(const part of parts){
  const v=pose==='tpose'?(part.tposeVertices||part.restVertices||part.vertices):(part.restVertices||part.vertices),map=new Uint32Array(v.length/8);partMaps.set(part,map);
  for(let i=0;i<map.length;i++){
   const p=Array.from(v.subarray(i*8,i*8+3)),n=unit(Array.from(v.subarray(i*8+3,i*8+6))),cell=p.map(x=>Math.floor(x/epsilon));let id=-1;
   for(let x=-1;x<=1&&id<0;x++)for(let y=-1;y<=1&&id<0;y++)for(let z=-1;z<=1&&id<0;z++)for(const candidate of cells.get(key(cell[0]+x,cell[1]+y,cell[2]+z))||[]){
    const node=nodes[candidate];if(dot(node.n,n)>.35&&Math.hypot(...sub(node.p,p))<epsilon){id=candidate;break}
   }
   if(id<0){id=nodes.length;nodes.push({p,n,edges:new Map(),parts:new Set()});const k=key(...cell);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(id)}
   nodes[id].parts.add(part);map[i]=id;
  }
 }
 const edgeCounts=new Map();
 function connect(a,b){if(a===b)return;const length=Math.hypot(...sub(nodes[a].p,nodes[b].p));if(length<1e-8)return;nodes[a].edges.set(b,length);nodes[b].edges.set(a,length)}
 for(const part of parts){const map=partMaps.get(part),ids=part.indices;for(let i=0;i<ids.length;i+=3)for(let j=0;j<3;j++){const a=map[ids[i+j]],b=map[ids[i+(j+1)%3]];connect(a,b);const k=Math.min(a,b)+':'+Math.max(a,b);edgeCounts.set(k,(edgeCounts.get(k)||0)+1)}}
 // Link only open edges across resource seams. Opposite-facing, nearby skin
 // (e.g. the arm beside the chest) must not create a shortcut through the body.
 const boundary=new Set();for(const [k,count]of edgeCounts)if(count===1)for(const id of k.split(':').map(Number))boundary.add(id);
 const seamCells=new Map(),tolerance=.003;
 for(const id of boundary){const node=nodes[id],cell=node.p.map(x=>Math.floor(x/tolerance));
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const other of seamCells.get(key(cell[0]+x,cell[1]+y,cell[2]+z))||[]){const b=nodes[other];if([...node.parts].some(p=>b.parts.has(p))||dot(node.n,b.n)<.35)continue;if(Math.hypot(...sub(node.p,b.p))<tolerance)connect(id,other)}
  const k=key(...cell);if(!seamCells.has(k))seamCells.set(k,[]);seamCells.get(k).push(id);
 }
 return {nodes,partMaps,parts,pose};
}
function graphFor(parts,pose){
 let entries=graphs.get(parts);if(!entries){entries=new Map();graphs.set(parts,entries)}
 const first=parts[0],version=pose==='tpose'?first?.tposeVertices:first?.restVertices;
 let entry=entries.get(pose);if(!entry||entry.version!==version){entry={version,graph:makeGraph(parts,pose)};entries.set(pose,entry)}return entry.graph;
}
function transport(right,from,to){
 const axis=cross(from,to),s=Math.hypot(...axis),c=Math.max(-1,Math.min(1,dot(from,to)));
 const r=s>1e-8?rotateVector(right,axis,Math.atan2(s,c)):right;return unit(sub(r,mul(to,dot(r,to))));
}
function develop(layer,graph,requestedRadius=0){
 const {nodes,partMaps}=graph,count=nodes.length,dist=new Float64Array(count).fill(Infinity),u=new Float64Array(count),v=new Float64Array(count),frames=new Array(count),visited=[];
 let seed=-1,best=Infinity;for(let i=0;i<count;i++){
  const node=nodes[i];if(layer.targetAtlas&&![...node.parts].some(p=>p.atlas===layer.targetAtlas))continue;
  if(layer.part&&![...node.parts].some(p=>p.name===layer.part))continue;
  const d=Math.hypot(...sub(node.p,layer.center));if(d<best){seed=i;best=d}
 }
 if(seed<0)for(let i=0;i<count;i++){const node=nodes[i];if(layer.targetAtlas&&![...node.parts].some(p=>p.atlas===layer.targetAtlas))continue;const d=Math.hypot(...sub(node.p,layer.center));if(d<best){seed=i;best=d}}
 if(seed<0)throw new Error('当前模型没有可贴合的表面');
 const radius=Math.max(warpRadius(layer),requestedRadius),heap=new Heap(),origin=sub(nodes[seed].p,layer.center);dist[seed]=best;u[seed]=dot(origin,layer.right);v[seed]=dot(origin,layer.up);frames[seed]=transport(layer.right,layer.normal,nodes[seed].n);heap.push(seed,best);
 while(heap.length){const [id,d]=heap.pop();if(d!==dist[id]||d>radius)continue;visited.push(id);const node=nodes[id],r=frames[id];
  for(const [other,length]of node.edges){if(layer.targetAtlas&&![...nodes[other].parts].some(p=>p.atlas===layer.targetAtlas))continue;const next=d+length;if(next>=dist[other]||next>radius)continue;
   const b=nodes[other],br=transport(r,node.n,b.n),right=unit(add(r,br)),up=unit(add(cross(node.n,r),cross(b.n,br))),delta=sub(b.p,node.p);let dx=dot(delta,right),dy=dot(delta,up);const scale=length/Math.max(1e-8,Math.hypot(dx,dy));dx*=scale;dy*=scale;
   dist[other]=next;u[other]=u[id]+dx;v[other]=v[id]+dy;frames[other]=br;heap.push(other,next);
  }
 }
 // Relax loop inconsistencies in the transported chart without snapping a
 // non-planar patch back to a flat camera projection.
 const equations=new Map();for(const id of visited){const node=nodes[id],list=[];for(const [other,length]of node.edges){if(!frames[other]||dist[other]>radius)continue;const b=nodes[other],right=unit(add(frames[id],frames[other])),up=unit(add(cross(node.n,frames[id]),cross(b.n,frames[other]))),delta=sub(b.p,node.p);let dx=dot(delta,right),dy=dot(delta,up);const scale=length/Math.max(1e-8,Math.hypot(dx,dy));list.push([other,dx*scale,dy*scale,1/Math.max(.002,length)])}equations.set(id,list)}
 for(let pass=0;pass<32;pass++)for(const id of visited){if(id===seed)continue;let x=0,y=0,total=0;for(const [other,dx,dy,w]of equations.get(id)){x+=(u[other]-dx)*w;y+=(v[other]-dy)*w;total+=w}if(total){u[id]=u[id]*.3+x/total*.7;v[id]=v[id]*.3+y/total*.7}}
 const cs=Math.cos((layer.angle||0)*Math.PI/180),sn=Math.sin((layer.angle||0)*Math.PI/180),mapped=new Map();
 for(const [part,ids]of partMaps){const uv=new Float32Array(ids.length*3);for(let i=0;i<ids.length;i++){const id=ids[i];if(!frames[id]||dist[id]>radius)continue;uv[i*3]=(u[id]*cs+v[id]*sn)/(layer.width/100)+.5;uv[i*3+1]=(-u[id]*sn+v[id]*cs)/(layer.height/100)+.5;uv[i*3+2]=1}mapped.set(part,uv)}
 const distances=new Map();for(const [part,ids]of partMaps)distances.set(part,Float32Array.from(ids,id=>dist[id]));
 return {graph,base:mapped,distances,radius,visited:visited.length};
}
function warpRadius(layer){const points=layer.warp?.points||defaultWarpPoints(),extent=Math.max(...points.map(q=>Math.hypot((q[0]-.5)*layer.width,(q[1]-.5)*layer.height)))/100;return Math.max(Math.hypot(layer.width,layer.height)/100*.8+.02,extent*1.35+.03,Number.isFinite(layer.warp?.domainRadius)?layer.warp.domainRadius:0)}
const controlTriangles=Array.from({length:4},(_,i)=>{const a=Math.floor(i/2)*3+i%2;return [[a,a+1,a+4],[a,a+4,a+3]]}).flat();
function barycentric(q,a,b,c){const x=b[0]-a[0],y=b[1]-a[1],z=c[0]-a[0],w=c[1]-a[1],det=x*w-y*z;if(Math.abs(det)<1e-12)return null;const dx=q[0]-a[0],dy=q[1]-a[1],u=(dx*w-dy*z)/det,v=(x*dy-y*dx)/det;return [1-u-v,u,v]}
export function warpTransform(points){
 const original=defaultWarpPoints();if(points.every((p,i)=>p.every((v,j)=>Math.abs(v-original[i][j])<1e-10)))return q=>q;
 // A positive, piecewise-affine control grid has no TPS overshoot or remote
 // lobes. Every cell stays on its own side of each shared control edge.
 const triangles=controlTriangles.map(ids=>({ids,p:ids.map(i=>points[i])})),boundary=[0,1,2,5,8,7,6,3];
 return q=>{
  for(const {ids,p}of triangles){const weights=barycentric(q,...p);if(weights&&weights.every(v=>v>=-1e-7))return [0,1].map(axis=>weights.reduce((s,v,i)=>s+v*original[ids[i]][axis],0))}
  // Continue outside the outline toward transparent UVs, rather than folding
  // the exterior back into the image. Repeated wrapping remains intentional.
  let best=null,distance=Infinity;
  for(let i=0;i<boundary.length;i++){const a=boundary[i],b=boundary[(i+1)%boundary.length],edge=sub(points[b],points[a]),length=dot2(edge,edge);if(length<1e-12)continue;const t=Math.max(0,Math.min(1,dot2(sub(q,points[a]),edge)/length)),p=add(points[a],mul(edge,t)),d=Math.hypot(...sub(q,p));if(d<distance){distance=d;const e=sub(original[b],original[a]),scale=Math.hypot(...e)/Math.sqrt(length);best=add(add(original[a],mul(e,t)),mul([e[1],-e[0]],d*scale/Math.hypot(...e)))}}
  return best||[2,2];
 };
}
const dot2=(a,b)=>a[0]*b[0]+a[1]*b[1];
export function prepareWarp(layer,parts){
 if(layer?.projection!=='warp'||!layer.placed)return null;
 const graph=graphFor(parts,layer.placementPose||'rest'),signature=JSON.stringify([layer.center,layer.right,layer.up,layer.normal,layer.width,layer.height,layer.angle,layer.part,layer.targetAtlas]);let entry=charts.get(layer);
 if(!entry||entry.graph!==graph||entry.signature!==signature){entry={...develop(layer,graph),signature};charts.set(layer,entry)}
 else if(Math.abs(warpRadius(layer)-entry.radius)>1e-6){entry={...develop(layer,graph,warpRadius(layer)),signature};charts.set(layer,entry)}
 const points=layer.warp?.points||defaultWarpPoints(),stamp=JSON.stringify(points);
 if(entry.stamp!==stamp){const inverse=warpTransform(points);entry.mapped=new Map();for(const [part,uv]of entry.base){const result=new Float32Array(uv);for(let i=0;i<uv.length;i+=3)if(uv[i+2]){const q=inverse([uv[i],uv[i+1]]);result[i]=q[0];result[i+1]=q[1]}entry.mapped.set(part,result)}entry.stamp=stamp}
 return entry;
}
export function expandWarpToHit(layer,parts,hit){
 let entry=prepareWarp(layer,parts);if(!entry||!hit?.partObject||!hit.triangle)return false;
 const map=()=>entry.base.get(hit.partObject),covered=()=>{const uv=map();return uv&&hit.triangle.every(id=>uv[id*3+2]>.999)};if(covered())return true;
 // Grow only when the pointer reaches uncharted connected skin. No normal
 // cone, projector depth, width or height acts as a drag boundary.
 const radius=Math.max(entry.radius*1.7,Math.hypot(...sub(hit[layer.placementPose==='tpose'?'tposePosition':'restPosition']||hit.position,layer.center))*1.7+.04);
 const grown={...develop(layer,entry.graph,radius),signature:entry.signature};
 if(!hit.triangle.every(id=>grown.base.get(hit.partObject)?.[id*3+2]>.999))return false;
 layer.warp={version:1,points:defaultWarpPoints(),...layer.warp,domainRadius:radius};entry=grown;charts.set(layer,entry);prepareWarp(layer,parts);return covered();
}
export function moveWarpPoint(points,index,target){
 const original=points.map(p=>[...p]);if(target.some(v=>!Number.isFinite(v)||Math.abs(v)>8))return null;
 const delta=sub(target,points[index]);let result=original.map(p=>[...p]);result[index]=[...target];if(validWarpGrid(result))return result;
 // Keep the grabbed pin fixed and let neighbors yield, instead of silently
 // stopping at the old control-cell boundary. Stepwise motion avoids flips.
 const steps=Math.max(1,Math.ceil(Math.hypot(...delta)/.04));result=original.map(p=>[...p]);
 for(let step=1;step<=steps;step++){
  const goal=add(original[index],mul(delta,step/steps));result[index]=goal;
  for(let pass=0;pass<32&&!validWarpGrid(result);pass++)for(const ids of controlTriangles){
   const [a,b,c]=ids.map(i=>result[i]),area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(area>=.006)continue;
   const gradient=[[b[1]-c[1],c[0]-b[0]],[c[1]-a[1],a[0]-c[0]],[a[1]-b[1],b[0]-a[0]]];let denominator=0;for(let i=0;i<3;i++)if(ids[i]!==index)denominator+=dot2(gradient[i],gradient[i]);if(denominator<1e-12)continue;const factor=(.007-area)/denominator;
   for(let i=0;i<3;i++)if(ids[i]!==index)result[ids[i]]=add(result[ids[i]],mul(gradient[i],factor));
  }
  if(!validWarpGrid(result)){
   // A rigid translation always preserves the valid grid and guarantees that
   // the requested point can continue moving even through an extreme edit.
   result=original.map(p=>add(p,mul(delta,step/steps)));
  }
 }
 return result.every(p=>p.every(v=>Math.abs(v)<=8))?result:null;
}
export function warpHit(layer,hit,base=false){
 const entry=charts.get(layer),part=hit.partObject,uv=(base?entry?.base:entry?.mapped)?.get(part);if(!uv||!hit.triangle||!hit.weights)return null;
 // Pin placement follows the picked skin, including a chart cut. Rendering
 // still rejects inverted triangles; it must not impose a dragging boundary.
 if(!base&&!chartTriangleFacing(part,uv,hit.triangle,layer.placementPose||'rest'))return null;
 const result=[0,0,0];for(let i=0;i<3;i++)for(let j=0;j<3;j++)result[j]+=uv[hit.triangle[i]*3+j]*hit.weights[i];return result[2]>.999?result.slice(0,2):null;
}
// UV gradient per metre on the actual triangle, including control-grid edits.
// This keeps a centimetre brush independent of skin UV seams and chart scale.
export function warpBrushRadius(layer,hit,radius){
 const part=hit.partObject,uv=charts.get(layer)?.mapped.get(part),ids=hit.triangle;
 if(!uv||!ids)return null;
 const vertices=layer.placementPose==='tpose'?(part.tposeVertices||part.restVertices||part.vertices):(part.restVertices||part.vertices);
 const p=Array.from(ids,id=>Array.from(vertices.subarray(id*8,id*8+3))),e=sub(p[1],p[0]),f=sub(p[2],p[0]),ee=dot(e,e),ef=dot(e,f),ff=dot(f,f),det=ee*ff-ef*ef;if(det<1e-20)return null;
 return [0,1].map(axis=>{const a=uv[ids[1]*3+axis]-uv[ids[0]*3+axis],b=uv[ids[2]*3+axis]-uv[ids[0]*3+axis],gradient=add(mul(e,(a*ff-b*ef)/det),mul(f,(b*ee-a*ef)/det));return Math.max(1e-6,radius*Math.hypot(...gradient))});
}
export function chartTriangleFacing(part,uv,ids,pose='rest'){
 const v=pose==='tpose'?(part.tposeVertices||part.restVertices||part.vertices):(part.restVertices||part.vertices),[a,b,c]=Array.from(ids,i=>[uv[i*3],uv[i*3+1]]),det=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),p=Array.from(ids,i=>Array.from(v.subarray(i*8,i*8+3))),normal=[0,1,2].map(axis=>ids.reduce((sum,id)=>sum+v[id*8+3+axis],0));
 return det*dot(cross(sub(p[1],p[0]),sub(p[2],p[0])),normal)>1e-18;
}
const pinFrame=layer=>JSON.stringify([layer.center,layer.right,layer.up,layer.normal,layer.width,layer.height,layer.angle,layer.part,layer.targetAtlas,layer.placementPose]);
export function rememberWarpPin(layer,index,hit){
 const ids=Array.from(hit.triangle),v=hit.partObject.restVertices||hit.partObject.vertices;
 const pins=layer.warp.pins?.frame===pinFrame(layer)?layer.warp.pins:{frame:pinFrame(layer),items:[]};
 pins.items[index]={part:hit.partObject.name,triangle:ids,weights:Array.from(hit.weights),q:[...layer.warp.points[index]],rest:ids.flatMap(id=>Array.from(v.subarray(id*8,id*8+3)))};layer.warp.pins=pins;
}
export function warpControlPoint(layer,parts,index,displayPose='rest'){
 const q=(layer.warp?.points||defaultWarpPoints())[index],pins=layer.warp?.pins,a=pins?.frame===pinFrame(layer)?pins.items?.[index]:null;
 if(a&&Array.isArray(a.q)&&a.q.length===2&&a.q.every((v,i)=>Math.abs(v-q[i])<1e-7)&&Array.isArray(a.triangle)&&a.triangle.length===3&&Array.isArray(a.weights)&&a.weights.length===3&&a.weights.every(v=>Number.isFinite(v)&&v>=-.0001&&v<=1.0001)&&Math.abs(a.weights.reduce((s,v)=>s+v,0)-1)<.0001&&Array.isArray(a.rest)&&a.rest.length===9){
  const part=parts.find(p=>p.name===a.part),rest=part&&(part.restVertices||part.vertices);
  if(rest&&a.triangle.every((id,i)=>Number.isInteger(id)&&id>=0&&id<rest.length/8&&[0,1,2].every(k=>Math.abs(rest[id*8+k]-a.rest[i*3+k])<1e-6))){
   const vertices=displayPose==='tpose'?(part.tposeVertices||rest):rest,position=[0,0,0],normal=[0,0,0];
   for(let i=0;i<3;i++)for(let k=0;k<3;k++){position[k]+=vertices[a.triangle[i]*8+k]*a.weights[i];normal[k]+=vertices[a.triangle[i]*8+3+k]*a.weights[i]}
   return {position,normal:unit(normal),partObject:part,triangle:a.triangle,weights:a.weights};
  }
 }
 return warpSurfacePoint(layer,parts,q,displayPose);
}
export function warpSurfacePoint(layer,parts,q,displayPose='rest'){
 const entry=prepareWarp(layer,parts);if(!entry)return null;
 if(!entry.hitGrid){
  entry.hitGrid=new Map();entry.wideTriangles=[];
  for(const [part,uv]of entry.base){const ids=part.indices;for(let j=0;j<ids.length;j+=3){const a=ids[j]*3,b=ids[j+1]*3,c=ids[j+2]*3;if(!uv[a+2]||!uv[b+2]||!uv[c+2]||!chartTriangleFacing(part,uv,ids.subarray(j,j+3),layer.placementPose||'rest'))continue;const item={part,uv,ids:ids.subarray(j,j+3)},lo=[Math.floor(Math.min(uv[a],uv[b],uv[c])*8),Math.floor(Math.min(uv[a+1],uv[b+1],uv[c+1])*8)],hi=[Math.floor(Math.max(uv[a],uv[b],uv[c])*8),Math.floor(Math.max(uv[a+1],uv[b+1],uv[c+1])*8)];
    if((hi[0]-lo[0]+1)*(hi[1]-lo[1]+1)>256){entry.wideTriangles.push(item);continue}
    for(let x=lo[0];x<=hi[0];x++)for(let y=lo[1];y<=hi[1];y++){const key=x+','+y;if(!entry.hitGrid.has(key))entry.hitGrid.set(key,[]);entry.hitGrid.get(key).push(item)}
  }}
 }
 const candidates=[...(entry.hitGrid.get(Math.floor(q[0]*8)+','+Math.floor(q[1]*8))||[]),...entry.wideTriangles];
 let best=null,bestDistance=Infinity;
 for(const {part,uv,ids}of candidates){const vertices=displayPose==='tpose'?(part.tposeVertices||part.restVertices||part.vertices):(part.restVertices||part.vertices),a=ids[0]*3,b=ids[1]*3,c=ids[2]*3,x=uv[b]-uv[a],y=uv[b+1]-uv[a+1],z=uv[c]-uv[a],w=uv[c+1]-uv[a+1],det=x*w-y*z;if(Math.abs(det)<1e-10)continue;const dx=q[0]-uv[a],dy=q[1]-uv[a+1],u=(dx*w-dy*z)/det,v=(x*dy-y*dx)/det;if(u<-.0001||v<-.0001||u+v>1.0001)continue;const weights=[1-u-v,u,v],distance=weights.reduce((s,value,i)=>s+value*entry.distances.get(part)[ids[i]],0);if(distance>=bestDistance)continue;const position=[0,0,0],normal=[0,0,0];for(let k=0;k<3;k++)for(let axis=0;axis<3;axis++){position[axis]+=vertices[ids[k]*8+axis]*weights[k];normal[axis]+=vertices[ids[k]*8+3+axis]*weights[k]}bestDistance=distance;best={position,normal:unit(normal),partObject:part,triangle:ids,weights};}
 return best;
}

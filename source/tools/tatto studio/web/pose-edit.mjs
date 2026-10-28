import {dot,cross,unit,projectionRadius} from './transform-math.mjs';

const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s);
const point=(v,i)=>Array.from(v.subarray(i*8,i*8+3));
const cached=new WeakMap();
function triangleFrame(vertices,ids){
 const [a,b,c]=ids.map(i=>point(vertices,i)),edge=sub(b,a),normal=cross(edge,sub(c,a));
 if(Math.hypot(...edge)<1e-9||Math.hypot(...normal)<1e-11)return null;
 const x=unit(edge),z=unit(normal);return [x,unit(cross(z,x)),z];
}
// Barycentric coordinates of the closest point on a triangle (including edges).
function closestWeights(p,a,b,c){
 const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);
 if(d1<=0&&d2<=0)return [1,0,0];
 const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return [0,1,0];
 const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0){const v=d1/(d1-d3);return [1-v,v,0]}
 const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return [0,0,1];
 const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0){const w=d2/(d2-d6);return [1-w,0,w]}
 const va=d3*d6-d5*d4;if(va<=0&&d4-d3>=0&&d5-d6>=0){const w=(d4-d3)/(d4-d3+d5-d6);return [0,1-w,w]}
 const sum=va+vb+vc;return [va/sum,vb/sum,vc/sum];
}
const weighted=(vertices,ids,w)=>ids.reduce((sum,id,i)=>add(sum,mul(point(vertices,id),w[i])),[0,0,0]);

// Only the editing frame is transported. Stored projection coordinates and the
// dual-pose bake remain untouched, so selecting/switching poses never reprojects ink.
export function poseBridge(layer,parts,displayPose){
 const sourcePose=layer.placementPose||'rest';
 if(sourcePose===displayPose||layer.projection==='uv'||!layer.placed)return null;
 let candidates=parts.filter(p=>p.restVertices&&p.tposeVertices);
 const matching=candidates.filter(p=>layer.targetAtlas?p.atlas===layer.targetAtlas:p.name===layer.part);
 if(matching.length)candidates=matching;
 const round=['cylindrical','spherical'].includes(layer.projection),anchor=round?add(layer.center,mul(layer.normal,projectionRadius(layer))):layer.center;
 const vertices=p=>sourcePose==='tpose'?p.tposeVertices:p.restVertices;
 let best=null,distance=Infinity;
 for(const part of candidates){const v=vertices(part);for(let i=0;i<v.length;i+=8){const d=(v[i]-anchor[0])**2+(v[i+1]-anchor[1])**2+(v[i+2]-anchor[2])**2;if(d<distance){distance=d;best={part,index:i/8}}}}
 if(!best)return null;
 const {part,index}=best,src=vertices(part),dst=displayPose==='tpose'?part.tposeVertices:part.restVertices;
 let triangle=null,score=Infinity;
 for(let j=0;j<part.indices.length;j+=3){
  if(part.indices[j]!==index&&part.indices[j+1]!==index&&part.indices[j+2]!==index)continue;
  const ids=Array.from(part.indices.subarray(j,j+3));
  const from=triangleFrame(src,ids),to=triangleFrame(dst,ids);if(!from||!to)continue;
  const w=closestWeights(anchor,...ids.map(i=>point(src,i))),origin=weighted(src,ids,w),d=sub(anchor,origin),error=dot(d,d);
  if(error<score){score=error;triangle={from,to,origin,target:weighted(dst,ids,w)}}
 }
 if(!triangle)return null;
 const {from,to,origin,target}=triangle;
 const vector=(v,a,b)=>b.reduce((sum,axis,i)=>add(sum,mul(axis,dot(v,a[i]))),[0,0,0]);
 return {
  point:v=>add(target,vector(sub(v,origin),from,to)),
  inversePoint:v=>add(origin,vector(sub(v,target),to,from)),
  vector:v=>vector(v,from,to),inverseVector:v=>vector(v,to,from),
 };
}

export function editPoseLayer(layer,parts,displayPose='rest',freeze=false){
 if(!layer||!layer.placed||(layer.placementPose||'rest')===displayPose||layer.projection==='uv')return layer;
 const signature=JSON.stringify([displayPose,layer.placementPose,layer.center,layer.normal,layer.radius,layer.projectionScale,layer.projection,layer.part,layer.targetAtlas]);
 let entry=cached.get(layer);
 if(!entry||entry.parts!==parts||entry.vertices!==parts[0]?.restVertices||entry.displayPose!==displayPose||(!freeze&&entry.signature!==signature)){
  const bridge=poseBridge(layer,parts,displayPose);if(!bridge)return layer;
  const proxy=new Proxy(layer,{
   get(target,key){if(key==='center')return bridge.point(target.center);if(['right','up','normal'].includes(key))return unit(bridge.vector(target[key]));return target[key]},
   set(target,key,value){if(key==='center')target.center=bridge.inversePoint(value);else if(['right','up','normal'].includes(key))target[key]=unit(bridge.inverseVector(value));else target[key]=value;return true},
  });
  entry={parts,vertices:parts[0]?.restVertices,displayPose,signature,proxy};cached.set(layer,entry);
 }
 return entry.proxy;
}

import {deformProjectionPoint,deformWarpPoint} from './liquify-math.mjs';
import {dot,unit,radians} from './transform-math.mjs';
import {warpHit} from './surface-warp.mjs';
const spin=(q,a)=>[q[0]*Math.cos(a)+q[1]*Math.sin(a),-q[0]*Math.sin(a)+q[1]*Math.cos(a)];
const sign=Math.sign;
// Mirrors the shader's projection domains. Picking tests the actual PNG alpha, not its rectangle.
export function stampSamples(l,hit){
 if(l.visible===false||!l.placed||l.opacity<=0||l.projection!=='uv'&&l.targetAtlas&&l.targetAtlas!==hit.atlas)return [];
 const sourcePosition=l.placementPose==='tpose'?hit.tposePosition:hit.restPosition,sourceNormal=l.placementPose==='tpose'?hit.tposeNormal:hit.restNormal;hit={...hit,position:sourcePosition||hit.position,normal:sourceNormal||hit.normal};
 const d=hit.position.map((v,i)=>v-l.center[i]),raw=[dot(d,l.right),dot(d,l.up),dot(d,l.normal)],a=radians(l.angle||0),w=l.width/100,h=l.height/100,depth=l.depth/100,r=(l.radius??5)/100,arc=radians(l.wrapAngle??360),vertical=radians(l.sphereAngle??180),mode=l.projection||'surface';
 const curved=['cylindrical','spherical'].includes(mode),scale=l.projectionScale||[1,1,1],p=deformProjectionPoint(l,raw.map((v,i)=>curved?v/scale[i]:v),[dot(hit.normal,l.right),dot(hit.normal,l.up),dot(hit.normal,l.normal)]),projectionNormal=[dot(hit.normal,l.right),dot(hit.normal,l.up),dot(hit.normal,l.normal)].map((v,i)=>v*scale[i]);
 const samples=[];const push=(q,weight=1)=>{q=q.map((v,i)=>(v-.5)*(l.repeat?.[i]??1)+.5);if(l.wrapMode==='repeat')q=q.map(v=>v-Math.floor(v));else if(l.wrapMode==='mirror')q=q.map(v=>1-Math.abs(((v%2+2)%2)-1));else if(q.some(v=>v<0||v>1))return;samples.push({q,weight})};
 const rotated=q=>spin(q.map(v=>v-.5),a).map(v=>v+.5);
 const cull=l.backfaceCulling??(mode==='surface');
 if(mode==='warp'){
  const q=warpHit(l,hit);if(q)push(deformWarpPoint(l,q,[dot(hit.normal,l.right),dot(hit.normal,l.up),dot(hit.normal,l.normal)]));
 }else if(mode==='uv'){
  if(l.uvAtlas!==hit.atlas||!hit.uv)return [];const delta=hit.uv.map((v,i)=>v-l.uvCenter[i]);push(spin(delta,a).map((v,i)=>v/l.uvSize[i]+.5));
 }else if(mode==='surface'){
  const facing=dot(unit(hit.normal),l.normal);if(Math.abs(p[2])>=depth||cull&&facing<=.22)return [];const blend=Math.max(0,Math.min(1,(facing-.22)/.2));push(spin(p.slice(0,2),a).map((v,i)=>v/[w,h][i]+.5),cull?blend*blend*(3-2*blend):1);
 }else if(mode==='cylindrical'){
  const radial=Math.hypot(p[0],p[2]),angle=Math.atan2(p[0],p[2]);if(Math.abs(radial-r)>=depth||Math.abs(angle)>=arc/2||Math.abs(p[1])>=h/2)return [];
  if(cull&&dot(projectionNormal,unit([p[0],0,p[2]]))<=0)return [];
  const q=l.metricProjection?spin([angle*r,p[1]],a).map((v,i)=>v/[r*arc,h][i]+.5):rotated([angle/arc+.5,p[1]/h+.5]);
  push(q.map((v,i)=>(v-.5)/(l.cylinderScale?.[i]??1)+.5));
 }else if(mode==='spherical'){
  const radial=Math.hypot(...p),angle=Math.atan2(p[0],p[2]),lat=Math.asin(Math.max(-1,Math.min(1,p[1]/Math.max(radial,.000001))));if(Math.abs(radial-r)>=depth||Math.abs(angle)>=arc/2||Math.abs(lat)>=vertical/2||cull&&dot(projectionNormal,unit(p))<=0)return [];push(rotated([angle/arc+.5,lat/vertical+.5]).map((v,i)=>(v-.5)/(l.sphereScale?.[i]??1)+.5));
 }else if(mode==='triplanar'){
  if(Math.abs(p[0])>=w/2||Math.abs(p[1])>=h/2||Math.abs(p[2])>=depth)return [];
  const n=unit(hit.normal),local=[dot(n,l.right),dot(n,l.up),dot(n,l.normal)],weights=local.map(v=>Math.abs(v)**(l.blendSharpness??4)),sum=weights.reduce((a,b)=>a+b,0)||1;
  for(const [i,q]of [[0,[p[2]*sign(local[0])/w+.5,p[1]/h+.5]],[1,[p[0]/w+.5,p[2]*sign(local[1])/h+.5]],[2,[p[0]*sign(local[2])/w+.5,p[1]/h+.5]]])push(rotated(q),weights[i]/sum);
 }
 return samples;
}

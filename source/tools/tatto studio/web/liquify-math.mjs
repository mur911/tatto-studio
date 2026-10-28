import {dot,unit} from './transform-math.mjs';
import {warpHit,warpBrushRadius} from './surface-warp.mjs';
export const MAX_PUSHES=256;
export const PUSH_TEXTURE_WIDTH=MAX_PUSHES*4;
const sub=(a,b)=>a.map((v,i)=>v-b[i]),mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
// Legacy strokes remain projector-local. Never reinterpret them as chart UVs
// when a layer changes projection, or reinterpret chart strokes as 3D pushes.
export const activeLiquifyStrokes=l=>l.projection==='uv'?[]:(l.liquify?.strokes||[]).filter(s=>(l.projection==='warp')===(s.space==='warp'));
export function deformWarpPoint(l,q,normal){return inversePush([...q,0],normal,activeLiquifyStrokes(l)).slice(0,2)}
export function validateLiquify(value){
 if(value===undefined)return;
 if(!value||value.version!==1||!Array.isArray(value.strokes)||value.strokes.length>MAX_PUSHES)throw new Error('液化数据无效');
 for(const stroke of value.strokes)for(const key of ['center','delta','radius','normal']){
  const a=stroke?.[key];if(!Array.isArray(a)||a.length!==3||key==='normal'&&Math.hypot(...a)<1e-6||a.some(v=>!Number.isFinite(v)||Math.abs(v)>1e6||key==='radius'&&v<1e-6))throw new Error('液化数据无效');
 }
}
export function projectionMetric(l){
 const mode=l.projection||'surface',r=(l.radius??5)/100,scale=['cylindrical','spherical'].includes(mode)?l.projectionScale||[1,1,1]:[1,1,1];
 const size=mode==='spherical'?[r,r,r]:mode==='cylindrical'?[r,l.height/100,r]:[l.width/100,l.height/100,l.depth/100];
 return {size,scale,world:size.map((v,i)=>v*scale[i])};
}
export function localBrushPoint(l,hit){
 const position=(l.placementPose==='tpose'?hit.tposePosition:hit.restPosition)||hit.position,normal=(l.placementPose==='tpose'?hit.tposeNormal:hit.restNormal)||hit.normal;
 const {world}=projectionMetric(l),d=sub(position,l.center),axes=[l.right,l.up,l.normal];
 if(l.projection==='warp'){const q=warpHit(l,hit);return q?{point:[...q,0],normal:unit(axes.map(axis=>dot(normal,axis))),position,worldNormal:unit(normal)}:null}
 return {point:axes.map((axis,i)=>dot(d,axis)/world[i]),normal:unit(axes.map(axis=>dot(normal,axis))),position,worldNormal:unit(normal)};
}
export function pushWeight(point,normal,stroke){
 const distance=Math.hypot(...point.map((v,i)=>(v-stroke.center[i])/stroke.radius[i]));
 if(distance>=1)return 0;
 const facing=Math.max(0,Math.min(1,dot(unit(normal),unit(stroke.normal))/.35));
 return (1-distance*distance)**2*facing*facing*(3-2*facing);
}
export function inversePush(point,normal,strokes=[]){
 let p=[...point];for(let i=strokes.length-1;i>=0;i--){const stroke=strokes[i],weight=pushWeight(p,normal,stroke);p=p.map((v,j)=>v-stroke.delta[j]*weight)}return p;
}
export function deformProjectionPoint(l,point,normal){
 if(!l.liquify?.strokes?.length||['uv','warp'].includes(l.projection))return point;
 const {size}=projectionMetric(l);return inversePush(point.map((v,i)=>v/size[i]),normal,activeLiquifyStrokes(l)).map((v,i)=>v*size[i]);
}
// A gesture is split into short inverse-map steps to avoid folding the image.
export function createPushes(l,fromHit,toHit,radius,strength,remaining=MAX_PUSHES){
 const from=localBrushPoint(l,fromHit),to=localBrushPoint(l,toHit);if(!from||!to)return [];
 const raw=sub(to.position,from.position),n=unit(from.worldNormal),along=dot(raw,n),tangent=raw.map((v,i)=>v-n[i]*along);
 const length=Math.hypot(...tangent)*strength;if(length<1e-7||Math.hypot(...raw)>radius*3||dot(from.normal,to.normal)<.1)return [];
 if(l.projection==='warp'){
  const brush=warpBrushRadius(l,fromHit,radius);if(!brush)return [];
  const delta=sub(to.point,from.point).map(v=>v*strength),count=Math.min(24,Math.max(1,Math.ceil(length/(radius*.2))));if(count>remaining)return null;
  // A jump between chart branches is not a brush gesture across the skin.
  if(Math.hypot(delta[0]/brush[0],delta[1]/brush[1])>3)return [];
  return Array.from({length:count},(_,i)=>({space:'warp',center:mix(from.point,from.point.map((v,j)=>v+delta[j]),(i+1)/count),delta:delta.map(v=>v/count),radius:[...brush,1],normal:from.normal}));
 }
 const {world}=projectionMetric(l),axes=[l.right,l.up,l.normal],delta=axes.map((axis,i)=>dot(tangent,axis)*strength/world[i]),count=Math.min(24,Math.max(1,Math.ceil(length/(radius*.2))));
 if(count>remaining)return null;
 return Array.from({length:count},(_,i)=>({center:mix(from.point,from.point.map((v,j)=>v+delta[j]),(i+1)/count),delta:delta.map(v=>v/count),radius:world.map(v=>Math.max(1e-6,radius/v)),normal:from.normal}));
}
export const liquifyGLSL=`
uniform vec4 liquifyCounts;
vec3 liquifyPoint(vec3 p,vec3 n,float row,float count){
 if(count<.5)return p;
 for(int j=0;j<${MAX_PUSHES};j++){
  float k=count-1.0-float(j);if(k<0.0)break;
  float y=(row+.5)/4.0,x=k*4.0;
  vec3 center=texture2D(atlas,vec2((x+.5)/${PUSH_TEXTURE_WIDTH}.0,y)).xyz;
  vec3 delta=texture2D(atlas,vec2((x+1.5)/${PUSH_TEXTURE_WIDTH}.0,y)).xyz;
  vec3 radius=texture2D(atlas,vec2((x+2.5)/${PUSH_TEXTURE_WIDTH}.0,y)).xyz;
  vec3 normal=texture2D(atlas,vec2((x+3.5)/${PUSH_TEXTURE_WIDTH}.0,y)).xyz;
  float distance=length((p-center)/radius);
  if(distance<1.0){float facing=smoothstep(0.0,.35,dot(normalize(n),normalize(normal)));float weight=1.0-distance*distance;p-=delta*weight*weight*facing;}
 }
 return p;
}
`;

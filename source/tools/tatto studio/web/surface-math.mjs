import {dot,cross,unit,rotateVector,projectionRadius} from './transform-math.mjs';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s);
export function tangentFrame(normal,previous=null){
 const n=unit(normal);let right;
 if(previous?.normal&&previous?.right){
  const before=unit(previous.normal),axis=cross(before,n),sin=Math.hypot(...axis),cos=Math.max(-1,Math.min(1,dot(before,n)));
  right=sin>1e-7?rotateVector(previous.right,axis,Math.atan2(sin,cos)):cos<0?rotateVector(previous.right,previous.up,Math.PI):previous.right;
  right=sub(right,mul(n,dot(right,n)));
 }
 if(!right||Math.hypot(...right)<1e-7){const up=Math.abs(n[2])<.98?[0,0,1]:[0,1,0];right=cross(up,n);}
 right=unit(right);return {right,up:unit(cross(n,right)),normal:n};
}
export function surfacePlacement(layer,hit,center,{snap=true,force=false}={}){
 if(!hit||!force&&layer.surfaceFollow!==true||layer.targetAtlas&&layer.targetAtlas!==hit.atlas)return {center:[...center]};
 const frame=tangentFrame(hit.normal,layer),round=['cylindrical','spherical'].includes(layer.projection);
 return {...frame,center:snap?(round?sub(hit.position,mul(frame.normal,projectionRadius(layer))):[...hit.position]):[...center],part:hit.part};
}
export function planeTranslation(delta,axes,step=0){
 return axes.reduce((result,axis)=>{let distance=dot(delta,axis);if(step)distance=Math.round(distance/step)*step;return add(result,mul(axis,distance))},[0,0,0]);
}

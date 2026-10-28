export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const unit=a=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n)};
export const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export const degrees=r=>r*180/Math.PI;
export const radians=d=>d*Math.PI/180;
export function shortcutMode(e){const t=e.target,editing=t?.isContentEditable||/^(TEXTAREA|SELECT)$/.test(t?.tagName||'')||t?.tagName==='INPUT'&&!['checkbox','radio','range','button','submit'].includes(t.type);if(e.ctrlKey||e.metaKey||e.altKey||editing)return null;return {w:'move',e:'rotate',r:'scale'}[e.key?.toLowerCase()]||null;}
export function rotateVector(v,axis,angle){const c=Math.cos(angle),s=Math.sin(angle),a=unit(axis),k=dot(a,v)*(1-c),b=cross(a,v);return v.map((x,i)=>x*c+b[i]*s+a[i]*k)}
export function rotateFrame(frame,axis,angle){return Object.fromEntries(['right','up','normal'].map(k=>[k,unit(rotateVector(frame[k],axis,angle))]));}
export function frameToEuler(l){const y=Math.asin(clamp(-l.right[2],-1,1));if(Math.abs(Math.cos(y))<1e-6)return [degrees(Math.atan2(-l.normal[1],l.up[1])),degrees(y),0];return [degrees(Math.atan2(l.up[2],l.normal[2])),degrees(y),degrees(Math.atan2(l.right[1],l.right[0]))];}
export function eulerToFrame(angles){const [x,y,z]=angles.map(radians),cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);return {right:[cz*cy,sz*cy,-sy],up:[cz*sy*sx-sz*cx,sz*sy*sx+cz*cx,cy*sx],normal:[cz*sy*cx+sz*sx,sz*sy*cx-cz*sx,cy*cx]};}
export function scaleProjection(layer,axis,factor){
 if(['cylindrical','spherical'].includes(layer.projection)&&axis!=='depth'){
  // R transforms the 3D projection volume; image-only UV scaling is separate.
  if(axis==='all'){
   if(layer.projection==='spherical'){
    // Radius alone leaves longitude/latitude UVs unchanged on a fixed body.
    // Scale the angular image footprint together with the reference sphere.
    const radius=layer.radius??5,scale=layer.sphereScale||[1,1],shape=layer.projectionScale||[1,1,1];
    const minimum=Math.max(...scale.map(v=>.001/v),...shape.map(v=>.0001/(radius*v))),maximum=Math.min(...scale.map(v=>1000/v),...shape.map(v=>100000/(radius*v)));
    const f=clamp(factor,minimum,maximum),wanted=radius*f;
    // Preserve real size beyond the radius slider's limits using XYZ scale.
    const lo=Math.max(.1,...shape.map(v=>wanted*v/1000)),hi=Math.min(100,...shape.map(v=>wanted*v/.001)),nextRadius=clamp(wanted,lo,hi);
    return {radius:nextRadius,depth:Math.max(.1,Math.min(Number.MAX_VALUE,layer.depth*(nextRadius/radius))),projectionScale:shape.map(v=>v*wanted/nextRadius),sphereScale:scale.map(v=>v*f)};
   }
   const fields={radius:layer.radius??5,depth:layer.depth};if(layer.projection==='cylindrical')fields.height=layer.height;
   const minimum=Math.max(...Object.values(fields).map(v=>.1/v)),maximum=Math.min(...Object.entries(fields).map(([k,v])=>(k==='depth'?Number.MAX_VALUE:100)/v));
   const f=clamp(factor,minimum,maximum);return Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v*f]));
  }
  const index=Number(axis);
  if(index===1&&layer.projection==='cylindrical')return {height:clamp(layer.height*factor,.1,100)};
  if(![0,1,2].includes(index))return {};
  const projectionScale=[...(layer.projectionScale||[1,1,1])];projectionScale[index]=clamp(projectionScale[index]*factor,.001,1000);
  return {projectionScale};
 }
 const l={...layer},wrap=l.projection==='cylindrical'||l.projection==='spherical';
 const positive=v=>Number.isFinite(v)?Math.max(.1,v):Number.MAX_VALUE;
 const apply=i=>{if(i==='depth'){l.depth=positive(l.depth*factor);return}if(i===0){if(wrap)l.wrapAngle=clamp((l.wrapAngle??360)*factor,1,360);else l.width=clamp(l.width*factor,.1,100)}else if(i===1){if(l.projection==='spherical')l.sphereAngle=clamp((l.sphereAngle??180)*factor,1,180);else l.height=clamp(l.height*factor,.1,100)}else if(wrap)l.radius=clamp((l.radius??5)*factor,.1,100);else l.depth=positive(l.depth*factor)};
 if(axis==='all'){for(let i=0;i<3;i++)apply(i)}else apply(axis==='depth'?'depth':Number(axis));
 return Object.fromEntries(['width','height','depth','wrapAngle','sphereAngle','radius'].filter(k=>l[k]!==undefined).map(k=>[k,l[k]]));
}
// The game uses Z up. Cylinders need a stable vertical axis, not the sloping skin normal.
export function uprightFrame(normal){
 const up=[0,0,1],horizontal=[normal[0],normal[1],0];
 const n=Math.hypot(...horizontal)>1e-6?unit(horizontal):[0,1,0];
 return {normal:n,right:unit(cross(up,n)),up};
}

// Distance from the axis/center to the front surface, including nonuniform R scaling.
export const projectionRadius=l=>(l.radius??5)*(l.projectionScale?.[2]??1)/100;

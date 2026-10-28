// Local projection coordinates are shared by preview and UV baking.
export const projectionModes={surface:0,uv:1,cylindrical:2,spherical:3,triplanar:4,warp:5};
export function projectionGLSL(antialias=false){return `
vec2 spinUV(vec2 q,vec2 cs){q-=0.5;return vec2(q.x*cs.x+q.y*cs.y,-q.x*cs.y+q.y*cs.x)+0.5;}
vec4 readStamp(sampler2D tex,vec2 q,vec2 repeatCount,float wrapMode){
 q=(q-0.5)*repeatCount+0.5;
 if(wrapMode<0.5){if(q.x<0.0||q.y<0.0||q.x>1.0||q.y>1.0)return vec4(0.0);}
 else if(wrapMode<1.5)q=fract(q);
 else q=1.0-abs(mod(q,2.0)-1.0);
 return texture2D(tex,q);
}
vec4 sampleStamp(sampler2D tex,vec2 q,vec2 repeatCount,float wrapMode){
 ${antialias?`if(bakeMode>.5){
  vec2 dx=dFdx(q)*.25,dy=dFdy(q)*.25;
  vec4 a=readStamp(tex,q-dx-dy,repeatCount,wrapMode),b=readStamp(tex,q+dx-dy,repeatCount,wrapMode);
  vec4 c=readStamp(tex,q-dx+dy,repeatCount,wrapMode),d=readStamp(tex,q+dx+dy,repeatCount,wrapMode);
  float alpha=(a.a+b.a+c.a+d.a)*.25;
  return vec4((a.rgb*a.a+b.rgb*b.a+c.rgb*c.a+d.rgb*d.a)*.25/max(alpha,.000001),alpha);
 }`:''}
 return readStamp(tex,q,repeatCount,wrapMode);
}
`;}
export const projectionHelpers=projectionGLSL();
export function projectionUniforms(i){return `uniform float projectionMode${i},scopeAtlas${i},wrapMode${i},metricProjection${i},blendMode${i},removeWhite${i},backfaceCulling${i},placementPose${i};uniform vec3 projectorScale${i};uniform vec2 repeatCount${i},cylinderScale${i},sphereScale${i};uniform vec4 projectionShape${i};`;}
export function projectionCode(i,derivatives=true){return `
if(settings${i}.w>0.5&&(scopeAtlas${i}<-.5||abs(currentAtlas-scopeAtlas${i})<.1)){
 vec3 d=(placementPose${i}>.5?vTPosePosition:vRestPosition)-center${i};
 vec3 n=normalize(placementPose${i}>.5?vTPoseNormal:vRestNormal);
 vec3 p=vec3(dot(d,right${i}),dot(d,up${i}),dot(d,normal${i}));
 vec4 t=vec4(0.0);float mode=projectionMode${i};
 vec3 projectionNormal=vec3(dot(n,right${i}),dot(n,up${i}),dot(n,normal${i}))*projectorScale${i};
 if(mode>1.5&&mode<3.5)p/=projectorScale${i};
 if(mode<.5||mode>1.5&&mode<3.5){vec3 size=mode<.5?vec3(settings${i}.xy,depth${i}):mode<2.5?vec3(projectionShape${i}.x,settings${i}.y,projectionShape${i}.x):vec3(projectionShape${i}.x);p=liquifyPoint(p/size,vec3(dot(n,right${i}),dot(n,up${i}),dot(n,normal${i})),${i}.0,liquifyCounts[${i}])*size;}
 if(mode>4.5){
  ${derivatives?`vec3 chartPosition=placementPose${i}>.5?vTPosePosition:vRestPosition;
  vec3 chartCross=cross(dFdx(chartPosition),dFdy(chartPosition));
  vec2 chartX=dFdx(vWarpUV.xy),chartY=dFdy(vWarpUV.xy);
  float chartFacing=(chartX.x*chartY.y-chartX.y*chartY.x)*dot(chartCross,n);`:''}
  if(vWarpUV.z>.999${derivatives?'&&chartFacing>0.0':''}){
   vec2 q=liquifyPoint(vec3(vWarpUV.xy,0.0),vec3(dot(n,right${i}),dot(n,up${i}),dot(n,normal${i})),${i}.0,liquifyCounts[${i}]).xy;
   t=sampleStamp(image${i},q,repeatCount${i},wrapMode${i});}
 }else if(mode>.5&&mode<1.5){
  if(abs(currentAtlas-uvAtlas${i})<.1){vec2 delta=vUV-uvSettings${i}.zw;vec2 q=vec2(delta.x*uvRotation${i}.x+delta.y*uvRotation${i}.y,-delta.x*uvRotation${i}.y+delta.y*uvRotation${i}.x)/uvSettings${i}.xy+0.5;
   t=sampleStamp(image${i},q,repeatCount${i},wrapMode${i});}
 }else if(mode<.5){
  vec2 dp=vec2(p.x*uvRotation${i}.x+p.y*uvRotation${i}.y,-p.x*uvRotation${i}.y+p.y*uvRotation${i}.x);
  float facing=dot(n,normal${i});
  if(abs(p.z)<depth${i}&&(backfaceCulling${i}<.5||facing>.22)){t=sampleStamp(image${i},dp/settings${i}.xy+.5,repeatCount${i},wrapMode${i});if(backfaceCulling${i}>.5)t.a*=smoothstep(.22,.42,facing);}
 }else if(mode<2.5){
  float radial=length(p.xz);float a=atan(p.x,p.z);
  float facing=dot(projectionNormal,normalize(vec3(p.x,0.0,p.z)));
  if(abs(radial-projectionShape${i}.x)<depth${i}&&abs(a)<projectionShape${i}.y*.5&&abs(p.y)<settings${i}.y*.5&&(backfaceCulling${i}<.5||facing>0.0)){
   vec2 q=vec2(a/projectionShape${i}.y,p.y/settings${i}.y)+.5;
   if(metricProjection${i}>.5){vec2 physical=vec2(a*projectionShape${i}.x,p.y);vec2 rotated=vec2(physical.x*uvRotation${i}.x+physical.y*uvRotation${i}.y,-physical.x*uvRotation${i}.y+physical.y*uvRotation${i}.x);q=rotated/vec2(projectionShape${i}.x*projectionShape${i}.y,settings${i}.y)+.5;}else q=spinUV(q,uvRotation${i});
   q=(q-.5)/cylinderScale${i}+.5;
   t=sampleStamp(image${i},q,repeatCount${i},wrapMode${i});}
 }else if(mode<3.5){
  float radial=length(p);float a=atan(p.x,p.z);float latitude=asin(clamp(p.y/max(radial,.000001),-1.0,1.0));
  float facing=dot(projectionNormal,normalize(p));
  if(abs(radial-projectionShape${i}.x)<depth${i}&&abs(a)<projectionShape${i}.y*.5&&abs(latitude)<projectionShape${i}.z*.5&&(backfaceCulling${i}<.5||facing>0.0)){
   vec2 q=vec2(a/projectionShape${i}.y,latitude/projectionShape${i}.z)+.5;
   q=(spinUV(q,uvRotation${i})-.5)/sphereScale${i}+.5;
   t=sampleStamp(image${i},q,repeatCount${i},wrapMode${i});}
 }else{
  if(abs(p.x)<settings${i}.x*.5&&abs(p.y)<settings${i}.y*.5&&abs(p.z)<depth${i}){
   vec3 localNormal=vec3(dot(n,right${i}),dot(n,up${i}),dot(n,normal${i}));
   vec3 weights=pow(abs(localNormal),vec3(projectionShape${i}.w));weights/=max(dot(weights,vec3(1.0)),.000001);
   vec2 qx=vec2(p.z*sign(localNormal.x),p.y)/settings${i}.xy+.5;
   vec2 qy=vec2(p.x,p.z*sign(localNormal.y))/settings${i}.xy+.5;
   vec2 qz=vec2(p.x*sign(localNormal.z),p.y)/settings${i}.xy+.5;
   vec4 tx=sampleStamp(image${i},spinUV(qx,uvRotation${i}),repeatCount${i},wrapMode${i});
   vec4 ty=sampleStamp(image${i},spinUV(qy,uvRotation${i}),repeatCount${i},wrapMode${i});
   vec4 tz=sampleStamp(image${i},spinUV(qz,uvRotation${i}),repeatCount${i},wrapMode${i});
   float a=tx.a*weights.x+ty.a*weights.y+tz.a*weights.z;
   t=vec4((tx.rgb*tx.a*weights.x+ty.rgb*ty.a*weights.y+tz.rgb*tz.a*weights.z)/max(a,.000001),a);
  }
 }
 if(removeWhite${i}>.5)t=tattooRemoveWhite(t);
 t.a*=settings${i}.z;ink=blendTarget${i}>.5?tattooSkinOver(ink,t,blendMode${i},skinBlendBase()):tattooOver(ink,t,blendMode${i});
}`;}

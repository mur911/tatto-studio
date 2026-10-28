// Lighting stays outside the bake. Skin blending uses unlit captured albedo only.
import {readPreference} from './ui-preferences.mjs';
import {calibrationKey,normalizeCalibration,calibrationGLSL} from './skin-calibration.mjs';
export function skinGLSL(derivatives){return `
${calibrationGLSL}
uniform sampler2D skinAlbedo,skinNormal,skinMicro;uniform vec3 cameraPosition,lightDirection;
uniform vec3 skinTint;uniform float skinEnabled,skinHasNormal,skinHasMicro,skinDetails,skinRoughness,skinMicroScale,skinMicroStrength;
vec3 skinReferenceNormal(vec3 normal){
 ${derivatives?`if(skinEnabled>.5&&skinDetails>.5){
  vec2 xy=vec2(0.0);
  if(skinHasNormal>.5)xy=(texture2D(skinNormal,vUV).rg*2.0-1.0)*vec2(1.0,-1.0);
  if(skinHasMicro>.5)xy+=(texture2D(skinMicro,vUV*skinMicroScale).rg*2.0-1.0)*vec2(1.0,-1.0)*skinMicroStrength;
  vec3 local=normalize(vec3(xy,sqrt(max(.0001,1.0-dot(xy,xy)))));
  vec3 p1=dFdx(vPosition),p2=dFdy(vPosition);vec2 u1=dFdx(vUV),u2=dFdy(vUV);float determinant=u1.x*u2.y-u1.y*u2.x;
  if(abs(determinant)>.00000001){
   vec3 tangent=(p1*u2.y-p2*u1.y)/determinant,bitangent=(-p1*u2.x+p2*u1.x)/determinant;
   tangent=normalize(tangent-normal*dot(normal,tangent));bitangent=normalize(bitangent-normal*dot(normal,bitangent));
   return normalize(tangent*local.x+bitangent*local.y+normal*local.z);
  }
 }`:''}
 return normal;
}
vec3 skinBlendBase(){return texture2D(skinAlbedo,vUV).rgb*skinTint;}
vec3 previewSRGBToLinear(vec3 c){
 return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));
}
vec3 previewLinearToSRGB(vec3 c){
 c=max(c,vec3(0.0));
 return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-.055,step(vec3(.0031308),c));
}
vec3 shadeSkinReference(vec4 ink,vec3 geometricNormal,vec3 eye){
 vec3 base=skinEnabled>.5?skinBlendBase():vec3(.68);
 vec3 normal=skinReferenceNormal(geometricNormal),light=normalize(lightDirection);
 vec3 view=normalize(eye-vPosition),halfVector=normalize(light+view);
 // Shade in linear light. Neutral room fill softens the directional light,
 // without replacing any snapshot's captured skin color with a pale preset.
 float key=max(0.0,(dot(normal,light)+.2)/1.2);
 float fill=max(0.0,dot(normal,view));
 float illumination=.34+.48*key+.18*fill;
 vec3 skinColor=previewSRGBToLinear(base),inkColor=previewSRGBToLinear(ink.rgb);
 float gloss=mix(100.0,8.0,skinRoughness);
 float specular=skinEnabled>.5?pow(max(0.0,dot(normal,halfVector)),gloss)*(.05*(1.0-skinRoughness)):0.0;
 vec3 skinDisplay=calibrateSkinPreview(clamp(previewLinearToSRGB(skinColor*illumination+vec3(specular)),0.0,1.0));
 vec3 color=mix(previewSRGBToLinear(skinDisplay),inkColor*illumination+vec3(specular),ink.a);
 return clamp(previewLinearToSRGB(color),0.0,1.0);
}`;}

export const skinUniformNames=['skinPreviewCalibration','lightDirection','skinAlbedo','skinNormal','skinMicro','skinTint','skinEnabled','skinHasNormal','skinHasMicro','skinDetails','skinRoughness','skinMicroScale','skinMicroStrength'];
export class SkinPreview{
 constructor(gl,texture,loadImage){this.gl=gl;this.texture=texture;this.loadImage=loadImage;this.textures=new Map();this.data=null;this.calibration=normalizeCalibration();
  this.white=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.white);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 }
 async load(meta,config,progress,force=false){
  this.calibration=normalizeCalibration(readPreference(calibrationKey()));
  for(const t of this.textures.values())this.gl.deleteTexture(t);this.textures.clear();this.data=null;
  if(!/^character-[0-9a-f]{12}$/.test(meta.id||''))return null;
  let data;
  if(meta.skin?.url&&!force){if(!meta.skin.url.startsWith('/models/'+meta.id+'/skin/'))throw new Error('皮肤参考位置无效');const r=await fetch(meta.skin.url);if(r.ok)data=await r.json();}
  if(!data){
   const response=await fetch('/api/models/skin',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':config.token},body:JSON.stringify({id:meta.id,force})});
   const started=await response.json();if(!response.ok)throw new Error(started.error||'皮肤读取失败');
   for(;;){await new Promise(r=>setTimeout(r,1000));const job=await(await fetch('/api/jobs/'+started.id)).json();progress(job.message);if(job.state==='error')throw new Error(job.message);if(job.state==='done'){data=job.result;break;}}
  }
  const urls=new Set();for(const segments of Object.values(data.parts))for(const s of segments)for(const key of ['albedo','normal','micro'])if(s[key])urls.add(s[key]);
  for(const url of urls){
   if(!url.startsWith('/models/'+meta.id+'/skin/'))throw new Error('皮肤预览资源位置无效');const pic=new Image();pic.src=url;await pic.decode();const gl=this.gl;
   if(Math.max(pic.width,pic.height)>gl.getParameter(gl.MAX_TEXTURE_SIZE))throw new Error('皮肤贴图超过显卡支持尺寸');
   const tex=this.texture(pic);gl.bindTexture(gl.TEXTURE_2D,tex);
   if((pic.width&(pic.width-1))===0&&(pic.height&(pic.height-1))===0){gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);if(url.includes('-micro.png')){gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);}}
   this.textures.set(url,tex);
  }
  this.data=data;return data;
 }
 bind(atlas,segment,locations,show=true,details=true){
  this.gl.uniform3fv(locations.skinPreviewCalibration,show?this.calibration:[0,0,0]);
  const gl=this.gl,s=segment||{};for(const [unit,name,key]of [[5,'skinAlbedo','albedo'],[6,'skinNormal','normal'],[7,'skinMicro','micro']]){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,this.textures.get(s[key])||this.white);gl.uniform1i(locations[name],unit);}
  gl.uniform3fv(locations.skinTint,s.tint||this.data?.fallback_color||[.68,.71,.63]);
  for(const [name,value]of Object.entries({skinEnabled:show&&!!this.data?1:0,skinHasNormal:s.normal?1:0,skinHasMicro:s.micro?1:0,skinDetails:details?1:0,skinRoughness:s.roughness??.65,skinMicroScale:s.micro_scale??20,skinMicroStrength:s.micro_strength??.25}))gl.uniform1f(locations[name],value);
 }
 segments(part){return this.data?.parts?.[part.atlas]||null;}
 setCalibration(value){this.calibration=normalizeCalibration(value)}
}

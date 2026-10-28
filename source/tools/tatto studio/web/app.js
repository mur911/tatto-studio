import {prepareWarp,validateWarp} from './surface-warp.mjs';
import {tattooDrawRanges} from './tattoo-regions.mjs';
import {padAtlasPixels} from './uv-padding.mjs';
import {LAYER_BATCH_SIZE,layerBatches,PreviewInk} from './layer-stack.mjs';
import {LiquifyGPU} from './liquify-gpu.mjs';
import {liquifyGLSL,validateLiquify} from './liquify-math.mjs';
import {installImageInput} from './image-input.mjs';
import {skinSourceMessages} from './resource-info.mjs';
import {resizeTarget} from './gl-target.mjs';
import {blurredSource,blurValue,lightDirection} from './layer-effects.mjs';
import {projectionModes,projectionGLSL,projectionUniforms,projectionCode} from './mapping.mjs';
import {bindInlineName} from './inline-name.mjs';
import {uprightFrame} from './transform-math.mjs';
import {blendModes,blendGLSL} from './blend.mjs';
import {SkinPreview,skinGLSL,skinUniformNames} from './skin-preview.mjs';
const $=id=>document.getElementById(id),canvas=$('view');
export const BAKE_VERSION=13;
const gl=canvas.getContext('webgl',{alpha:false,antialias:true,preserveDrawingBuffer:true});
const state={previewPose:'rest',assetId:crypto.randomUUID(),layers:[],selected:-1,handlesVisible:false,parts:[],camera:{az:0,el:.04,distance:2.35,target:[0,0,.78]},config:null,bakeResolution:4096,baked:false,dirty:false,exporting:false,model:{id:'rb',name:'RB Female',exportProfile:'rb-female-v1'},atlasIds:{},onUI:null,onRender:null,onModel:null};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>mul(a,1/(Math.hypot(...a)||1));
const imageSources=new WeakMap(),alphaCanvas=document.createElement('canvas');alphaCanvas.width=alphaCanvas.height=1;const alphaContext=alphaCanvas.getContext('2d',{willReadFrequently:true});
const originalSources=new WeakMap();
let program,locations={},fbos={},bakeTimer,resizeObserver,blankTexture,skinPreview,liquifyGPU,previewInk;
const bakeScratch={};
let activeWarp=null;
const skinDerivatives=!!gl?.getExtension('OES_standard_derivatives');
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);if(error)document.dispatchEvent(new CustomEvent('tattoo:notice',{detail:{text,error:true}}))}
function fatal(error){console.error(error);$('fatal').hidden=false;$('fatal').textContent=error.message||String(error);status(error.message||String(error),true);status('编辑器未能启动，请检查提示。',true)}
function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s}
function initGL(){
 if(!gl)throw new Error('浏览器未启用 WebGL，无法显示身体。请在浏览器设置中启用图形加速。');
 if(!gl.getExtension('OES_element_index_uint'))throw new Error('当前浏览器不支持此模型，请使用新版 Chrome。');
 const vs=`precision highp float;attribute vec3 aWarpUV;varying vec3 vWarpUV;attribute vec3 aPosition;attribute vec3 aNormal;attribute vec2 aUV;attribute vec3 aRestPosition,aRestNormal,aTPosePosition,aTPoseNormal;varying vec3 vRestPosition,vRestNormal,vTPosePosition,vTPoseNormal;varying vec3 vPosition;varying vec3 vNormal;varying vec2 vUV;uniform vec3 cameraPosition,cameraRight,cameraUp,cameraForward;uniform float aspect,zoom,bakeMode;void main(){vWarpUV=aWarpUV;vRestPosition=aRestPosition;vRestNormal=aRestNormal;vTPosePosition=aTPosePosition;vTPoseNormal=aTPoseNormal;vPosition=aPosition;vNormal=aNormal;vUV=aUV;if(bakeMode>0.5){gl_Position=vec4(aUV*2.0-1.0,0.0,1.0);}else{vec3 p=aPosition-cameraPosition;float z=dot(p,cameraForward);gl_Position=vec4(dot(p,cameraRight)*zoom/aspect,dot(p,cameraUp)*zoom,1.0002*z-0.020002,z);}}`;
 let fs=`${skinDerivatives?'#extension GL_OES_standard_derivatives : enable\n':''}precision highp float;varying vec3 vWarpUV;varying vec3 vRestPosition,vRestNormal,vTPosePosition,vTPoseNormal;varying vec3 vPosition;varying vec3 vNormal;varying vec2 vUV;uniform float bakeMode,useAtlas,hasPrevious,inkOnly;uniform vec2 inkSize;uniform sampler2D atlas,previousInk;uniform float currentAtlas;`;
 for(let i=0;i<LAYER_BATCH_SIZE;i++)fs+=`uniform sampler2D image${i};uniform vec3 center${i},right${i},up${i},normal${i};uniform vec4 settings${i};uniform float depth${i},uvAtlas${i},blendTarget${i};uniform vec4 uvSettings${i};uniform vec2 uvRotation${i};`+projectionUniforms(i);
 fs+=liquifyGLSL+projectionGLSL(skinDerivatives)+blendGLSL+skinGLSL(skinDerivatives);
 fs+=`uniform float allowInk;vec4 over(vec4 b,vec4 t){float a=t.a+b.a*(1.0-t.a);if(a<0.00001)return vec4(0.0);return vec4((t.rgb*t.a+b.rgb*b.a*(1.0-t.a))/a,a);}void main(){vec3 n=normalize(vNormal);vec4 ink=hasPrevious>.5?texture2D(previousInk,bakeMode>.5?vUV:gl_FragCoord.xy/inkSize):vec4(0.0);if(allowInk>.5){`;
 for(let i=0;i<LAYER_BATCH_SIZE;i++)fs+=projectionCode(i,skinDerivatives);
 fs+=`}else{ink=vec4(0.0);}if(bakeMode>0.5||inkOnly>.5){gl_FragColor=ink;}else{if(useAtlas>0.5&&allowInk>.5)ink=texture2D(atlas,vUV);gl_FragColor=vec4(shadeSkinReference(ink,n,cameraPosition),1.0);}}`;
 program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 for(const name of [...skinUniformNames,'liquifyCounts','cameraPosition','cameraRight','cameraUp','cameraForward','aspect','zoom','bakeMode','useAtlas','atlas','hasPrevious','inkOnly','inkSize','previousInk','currentAtlas',...Array.from({length:LAYER_BATCH_SIZE},(_,i)=>['image','center','right','up','normal','settings','depth','uvAtlas','uvSettings','uvRotation','blendMode','blendTarget','removeWhite','projectionMode','scopeAtlas','wrapMode','repeatCount','projectionShape','metricProjection','cylinderScale','sphereScale','projectorScale','backfaceCulling','placementPose'].map(n=>n+i)).flat()])locations[name]=gl.getUniformLocation(program,name);
 locations.allowInk=gl.getUniformLocation(program,'allowInk');
 for(const name of ['aWarpUV','aPosition','aNormal','aUV','aRestPosition','aRestNormal','aTPosePosition','aTPoseNormal'])locations[name]=gl.getAttribLocation(program,name);
 gl.uniform1i(locations.atlas,4);gl.uniform1i(locations.previousInk,3);
 for(const part of ['body','left_arm','right_arm']){
  const tex=texture(null,2048,2048),fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('无法建立纹理预览，请检查图形驱动。');fbos[part]={tex,fbo,size:2048};
 }
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);blankTexture=texture(null);skinPreview=new SkinPreview(gl,texture,loadImage);liquifyGPU=new LiquifyGPU(gl);previewInk=new PreviewInk(gl);state.liquifySupported=liquifyGPU.supported;
}
function texture(image,w=1,h=1){const tex=gl.createTexture();if(image)imageSources.set(tex,image);gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);if(image)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return tex}
function textureAlpha(tex,q,removeWhite=false){const image=imageSources.get(tex);if(!image||q.some(v=>!Number.isFinite(v)))return 0;const x=Math.max(0,Math.min(image.width-1,Math.floor(q[0]*image.width))),y=Math.max(0,Math.min(image.height-1,Math.floor((1-q[1])*image.height)));alphaContext.clearRect(0,0,1,1);alphaContext.drawImage(image,x,y,1,1,0,0,1,1);const rgba=alphaContext.getImageData(0,0,1,1).data;return rgba[3]/255*(removeWhite?1-Math.min(rgba[0],rgba[1],rgba[2])/255:1)}
function layerTexture(image,blur=0){const tex=texture(blurredSource(image,blur));originalSources.set(tex,image);return tex}
function setLayerBlur(layer,value){
 value=blurValue(value);if((layer.blur||0)===value)return;
 const source=originalSources.get(layer.texture)||imageSources.get(layer.texture);if(!source)throw new Error('图层原图尚未加载');
 const next=layerTexture(source,value),old=layer.texture;layer.texture=next;layer.blur=value;gl.deleteTexture(old);
}
function cameraBasis(){const c=state.camera,ca=Math.cos(c.az),sa=Math.sin(c.az),ce=Math.cos(c.el);const position=add(c.target,[sa*ce*c.distance,ca*ce*c.distance,Math.sin(c.el)*c.distance]);const forward=unit(sub(c.target,position)),right=[-ca,sa,0],up=unit(cross(right,forward));return {position,forward,right,up}}
function uniforms(bake,layers=[],{previous=null,inkOnly=false,useAtlas=false}={}){
 gl.useProgram(program);activeWarp=prepareWarp(layers.find(l=>l.projection==='warp'),state.parts);liquifyGPU.bind(layers,locations,useAtlas);
 gl.uniform1f(locations.hasPrevious,previous?1:0);gl.uniform1f(locations.inkOnly,inkOnly?1:0);gl.uniform2f(locations.inkSize,canvas.width,canvas.height);
 gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,previous||blankTexture);
 gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,liquifyGPU.texture);
 gl.uniform1f(locations.bakeMode,bake?1:0);gl.uniform3fv(locations.lightDirection,lightDirection(Number($('lightAzimuth')?.value??-23),Number($('lightElevation')?.value??38)));gl.uniform1f(locations.useAtlas,useAtlas?1:0);const b=cameraBasis();for(const [key,v]of Object.entries({cameraPosition:b.position,cameraForward:b.forward,cameraRight:b.right,cameraUp:b.up}))gl.uniform3fv(locations[key],v);gl.uniform1f(locations.aspect,canvas.width/canvas.height);gl.uniform1f(locations.zoom,1/Math.tan(Math.PI*21/180));
 for(let i=0;i<LAYER_BATCH_SIZE;i++){
  const layer=layers[i];gl.uniform1f(locations['blendTarget'+i],layer?.blendTarget==='skin'?1:0);gl.uniform1f(locations['blendMode'+i],blendModes[layer?.blendMode]??0);gl.uniform1f(locations['removeWhite'+i],layer?.removeWhite?1:0);gl.uniform1f(locations['projectionMode'+i],projectionModes[layer?.projection]??0);gl.uniform1f(locations['scopeAtlas'+i],(layer?.projection==='uv'?-1:state.atlasIds[layer?.targetAtlas]??-1));gl.uniform1f(locations['wrapMode'+i],{clip:0,repeat:1,mirror:2}[layer?.wrapMode]??0);gl.uniform2fv(locations['repeatCount'+i],layer?.repeat||[1,1]);gl.uniform4fv(locations['projectionShape'+i],[(layer?.radius??5)/100,(layer?.wrapAngle??360)*Math.PI/180,(layer?.sphereAngle??180)*Math.PI/180,layer?.blendSharpness??4]);gl.uniform1f(locations['metricProjection'+i],layer?.metricProjection?1:0);gl.uniform2fv(locations['cylinderScale'+i],layer?.cylinderScale||[1,1]);gl.uniform2fv(locations['sphereScale'+i],layer?.sphereScale||[1,1]);gl.uniform3fv(locations['projectorScale'+i],layer?.projectionScale||[1,1,1]);gl.uniform1f(locations['placementPose'+i],layer?.placementPose==='tpose'?1:0);gl.uniform1f(locations['backfaceCulling'+i],(layer?.backfaceCulling??((layer?.projection||'surface')==='surface'))?1:0);gl.uniform1f(locations['uvAtlas'+i],state.atlasIds[layer?.uvAtlas]??-1);gl.uniform4fv(locations['uvSettings'+i],[...(layer?.uvSize||[.12,.12]),...(layer?.uvCenter||[.5,.5])]);gl.uniform2fv(locations['uvRotation'+i],[Math.cos((layer?.angle||0)*Math.PI/180),Math.sin((layer?.angle||0)*Math.PI/180)]);gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,layer?.texture||blankTexture);gl.uniform1i(locations['image'+i],i);
  if(!layer?.placed||layer.visible===false){gl.uniform4f(locations['settings'+i],1,1,0,0);continue}
  for(const [key,value]of Object.entries({center:layer.center,right:layer.right,up:layer.up,normal:layer.normal}))gl.uniform3fv(locations[key+i],value);
  gl.uniform4f(locations['settings'+i],layer.width/100,layer.height/100,layer.opacity/100,1);gl.uniform1f(locations['depth'+i],layer.depth/100);
 }
}
function drawPart(part,segment=null){
 gl.uniform1f(locations.currentAtlas,state.atlasIds[part.atlas]??0);
 const bind=(buffer,fields)=>{gl.bindBuffer(gl.ARRAY_BUFFER,buffer);for(const [name,size,offset]of fields){if(locations[name]<0)continue;gl.enableVertexAttribArray(locations[name]);gl.vertexAttribPointer(locations[name],size,gl.FLOAT,false,32,offset)}};
 bind(part.vbo,[['aPosition',3,0],['aNormal',3,12],['aUV',2,24]]);
 bind(part.restVbo||part.vbo,[['aRestPosition',3,0],['aRestNormal',3,12]]);
 bind(part.tposeVbo||part.restVbo||part.vbo,[['aTPosePosition',3,0],['aTPoseNormal',3,12]]);
 const warpData=activeWarp?.mapped.get(part);if(warpData){part.warpVbo??=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,part.warpVbo);if(part.warpUpload!==warpData){gl.bufferData(gl.ARRAY_BUFFER,warpData,gl.DYNAMIC_DRAW);part.warpUpload=warpData}gl.enableVertexAttribArray(locations.aWarpUV);gl.vertexAttribPointer(locations.aWarpUV,3,gl.FLOAT,false,12,0)}else{gl.disableVertexAttribArray(locations.aWarpUV);gl.vertexAttrib3f(locations.aWarpUV,0,0,0)}
 gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,part.ibo);gl.drawElements(gl.TRIANGLES,segment?.count??part.indices.length,gl.UNSIGNED_INT,(segment?.first??0)*4);
}
function drawScene(baking=false,atlas=null,useAtlas=false){
 for(const part of state.parts){
  if(baking?part.atlas!==atlas:part.visible===false)continue;
  if(useAtlas){gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,fbos[part.atlas].tex)}
  for(const segment of skinPreview?.segments(part)||[null]){
   skinPreview?.bind(part.atlas,segment,locations,baking?true:$('showSkin')?.checked??true,baking?false:$('showSkinDetails')?.checked??true);
   for(const range of tattooDrawRanges(part,segment)){if(baking&&!range.allowInk)continue;gl.uniform1f(locations.allowInk,range.allowInk?1:0);drawPart(part,range)}
  }
 }
}
function render(){
 if(!program||!state.parts.length||!canvas.width||!canvas.height)return;
 const useAtlas=!!(state.baked&&$('bakedPreview')?.checked),batches=useAtlas?[[]]:layerBatches(state.layers);let previous=null;
 gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);
 if(batches.length>1)previewInk.resize(canvas.width,canvas.height);
 for(let i=0;i<batches.length;i++){
  const last=i===batches.length-1,target=last?null:previewInk.targets[i%2];
  gl.bindFramebuffer(gl.FRAMEBUFFER,target?.fbo||null);gl.viewport(0,0,canvas.width,canvas.height);
  gl.clearColor(...(last?[.063,.075,.094,1]:[0,0,0,0]));gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  // Each pass draws all visible geometry with depth testing, so hidden surfaces
  // never replace the accumulated ink at a foreground pixel.
  uniforms(false,batches[i],{previous,inkOnly:!last,useAtlas});drawScene(false,null,useAtlas);
  previous=target?.tex||null;
 }
 if(state.onRender)state.onRender();
}
function resizeAtlas(target,size){resizeTarget(gl,target,size)}
function bake(resolution=($('bakedPreview')?.checked?state.bakeResolution:2048),onlyAtlas=null,notify=true){
 clearTimeout(bakeTimer);if(!state.parts.length)return;
 gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);const batches=layerBatches(state.layers);
 try{
  for(const [atlas,target]of Object.entries(fbos)){
   if(onlyAtlas!==null&&atlas!==onlyAtlas)continue;
   resizeAtlas(target,resolution);if(batches.length>1)resizeAtlas(bakeScratch,resolution);let previous=null,lastTarget;
   for(let i=0;i<batches.length;i++){
    lastTarget=i%2?bakeScratch:target;
    // Read the previous unlit composite before blending the next batch. This
    // preserves non-normal blend modes and skin blending across batch boundaries.
    uniforms(true,batches[i],{previous});
    gl.bindFramebuffer(gl.FRAMEBUFFER,lastTarget.fbo);gl.viewport(0,0,resolution,resolution);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
    drawScene(true,atlas);previous=lastTarget.tex;
   }
   if(lastTarget!==target){for(const key of ['tex','fbo','size'])[target[key],bakeScratch[key]]=[bakeScratch[key],target[key]]}
  }
 }finally{
  // Exporting still keeps only one high-resolution atlas in memory at a time.
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);if(bakeScratch.fbo)gl.deleteFramebuffer(bakeScratch.fbo);if(bakeScratch.tex)gl.deleteTexture(bakeScratch.tex);for(const key of Object.keys(bakeScratch))delete bakeScratch[key];
 }
 state.baked=true;state.dirty=false;if(notify){render();if(state.onBake)state.onBake()}
}
async function bakePNGs(resolution=state.bakeResolution,progress=()=>{}){
 clearTimeout(bakeTimer);const result={};let done=0;
 // Release the full-resolution inspection cache before exporting one atlas
 // at a time. This changes the view only, never the saved output resolution.
 if($('bakedPreview')?.checked||Object.values(fbos).some(t=>t.size>2048)){
  if($('bakedPreview'))$('bakedPreview').checked=false;bake(2048);
 }
 try{for(const [key,target]of Object.entries(fbos)){
  const restoreSize=target.size||2048;let c;
  try{bake(resolution,key,false);c=atlasCanvas(target);progress(++done,Object.keys(fbos).length);result[key]=await encodeCanvasPNG(c);}
  finally{if(c)c.width=c.height=1;if(target.size!==restoreSize)bake(restoreSize,key,false);}
 }}finally{render();if(state.onBake)state.onBake();}
 return result;
}

function changed(){state.dirty=true;state.baked=false;if(state.onChange)state.onChange();render();clearTimeout(bakeTimer);bakeTimer=setTimeout(()=>{try{bake()}catch(e){status(e.message,true)}},180);$('downloads').replaceChildren();}
function resize(){const ratio=Math.min(devicePixelRatio||1,1.7),r=canvas.getBoundingClientRect();canvas.width=Math.round(r.width*ratio);canvas.height=Math.round(r.height*ratio);render()}
let posePreparation=null;
async function ensureTPose(){
 const ident=state.model.id;if(!/^character-[0-9a-f]{12}$/.test(ident))throw new Error('请先选择角色快照，再使用 T Pose');
 if(state.parts.length&&state.parts.every(part=>part.tposeVertices))return;
 if(posePreparation?.ident===ident)return posePreparation.promise;
 const promise=(async()=>{
  let pose=state.model.poses?.tpose;
  if(!pose){
   const response=await fetch('/api/models/pose',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':state.config.token},body:JSON.stringify({id:ident})});
   const started=await response.json();if(!response.ok)throw new Error(started.error||'T Pose 准备失败');
   for(;;){
    await new Promise(resolve=>setTimeout(resolve,500));const response=await fetch('/api/jobs/'+started.id),job=await response.json();
    if(!response.ok||job.state==='error')throw new Error(job.error||job.message||'T Pose 准备失败');
    status(job.message);document.dispatchEvent(new CustomEvent('tattoo:operation',{detail:{kind:'read-character',phase:'progress',text:job.message}}));
    if(job.state==='done'){pose=job.result;break}
   }
  }
  const decoded=await Promise.all(state.parts.map(async part=>{
   const url=pose.parts[part.atlas];if(!url?.startsWith('/models/'+ident+'/'))throw new Error('T Pose 缺少当前部位');
   const response=await fetch(url);if(!response.ok)throw new Error('无法读取 T Pose 网格');
   const data=await response.arrayBuffer(),header=new Uint32Array(data,0,2);
   if(header[0]*8!==part.restVertices.length||header[1]!==part.indices.length||data.byteLength!==8+header[0]*32+header[1]*4)throw new Error('T Pose 与原网格不匹配');
   const vertices=new Float32Array(data,8,header[0]*8);if(!vertices.every(Number.isFinite))throw new Error('T Pose 网格数据无效');
   return {part,vertices};
  }));
  if(state.model.id!==ident)throw new Error('角色快照已切换，请重新选择姿势');
  for(const {part,vertices}of decoded){if(part.tposeVbo)gl.deleteBuffer(part.tposeVbo);part.tposeVertices=vertices;part.tposeVbo=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,part.tposeVbo);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW)}
  state.model.poses??={};state.model.poses.tpose=pose;
 })();posePreparation={ident,promise};try{await promise}finally{if(posePreparation?.promise===promise)posePreparation=null}
}
function applyPreviewPose(pose,frame=false){
 if(!['rest','tpose'].includes(pose)||pose==='tpose'&&(!state.parts.length||!state.parts.every(part=>part.tposeVertices)))return false;
 for(const part of state.parts){part.vertices=pose==='tpose'?part.tposeVertices:part.restVertices;part.vbo=pose==='tpose'?part.tposeVbo:part.restVbo}
 state.previewPose=pose;state.handlesVisible=false;if($('previewPose'))$('previewPose').value=pose;
 if(frame)frameModel();render();return true;
}

async function loadModel(url='/assets/model.json'){
 const meta=await(await fetch(url)).json();
 for(const p of state.parts){for(const buffer of new Set([p.vbo,p.restVbo,p.tposeVbo,p.warpVbo].filter(Boolean)))gl.deleteBuffer(buffer);gl.deleteBuffer(p.ibo)}state.parts=[];
 for(const f of Object.values(fbos)){gl.deleteFramebuffer(f.fbo);gl.deleteTexture(f.tex)}fbos={};state.atlasIds={};
 for(const [i,key]of [...new Set(meta.parts.map(p=>p.atlas))].entries()){state.atlasIds[key]=i;const tex=texture(null,2048,2048),fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('纹理缓冲创建失败');fbos[key]={tex,fbo,size:2048}}
 for(const item of meta.parts){const response=await fetch(item.url);if(!response.ok)throw new Error('无法读取模型资源');const data=await response.arrayBuffer(),header=new Uint32Array(data,0,2),vertices=new Float32Array(data,8,header[0]*8),indices=new Uint32Array(data,8+header[0]*32,header[1]);const part={...item,vertices,indices,vbo:gl.createBuffer(),ibo:gl.createBuffer()};gl.bindBuffer(gl.ARRAY_BUFFER,part.vbo);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,part.ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);part.restVertices=vertices;part.restVbo=part.vbo;state.parts.push(part)}
 state.model={id:meta.id||'rb',name:meta.body||'导入角色',exportProfile:meta.exportProfile||(meta.id?'preview-only':'rb-female-v1'),url,poses:meta.poses||{},limitations:meta.limitations||[]};state.previewPose='rest';if($('previewPose'))$('previewPose').value='rest';if(state.layers.some(l=>l.placementPose==='tpose'))await ensureTPose();$('modelStatus').textContent=state.model.name+(state.model.exportProfile==='preview-only'?' / 仅参考预览':state.model.exportProfile==='captured-decal-v1'?' / 实际网格输出 · 待游戏测试':' / 可发布');frameModel();bake();resize();if(state.onModel)state.onModel(meta);await refreshSkin(false,meta)
}
async function refreshSkin(force=false,meta=state.model){
 const info=$('skinInfo'),issues=$('skinIssues');if(info)info.textContent='正在读取皮肤参考…';
 try{const data=await skinPreview.load(meta,state.config,status,force);state.skinReference=data;
  if(info)info.textContent=data?'已读取皮肤：'+Object.values(data.parts).filter(v=>v.some(s=>s.albedo)).length+' / '+state.parts.length+' 个部位。肤色、颜色贴图与细节为近似预览。':'此参考模型尚未采集皮肤。';
  if(issues){issues.replaceChildren();for(const text of skinSourceMessages(data)){const p=document.createElement('p');p.textContent=text;issues.append(p)}}
 }catch(error){state.skinReference=null;if(info)info.textContent='皮肤参考未能读取：'+error.message;if(issues)issues.textContent='可继续编辑纹身；重新读取皮肤不会修改设计。';}state.baked=false;if(state.layers.some(l=>l.placed))bake();else render();
}
function frameModel(){const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const p of state.parts)for(let i=0;i<p.vertices.length;i+=8)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p.vertices[i+k]);hi[k]=Math.max(hi[k],p.vertices[i+k])}if(!Number.isFinite(lo[0]))return;const rect=canvas.getBoundingClientRect(),aspect=Math.max(.2,rect.width/Math.max(1,rect.height)),distance=Math.max((hi[2]-lo[2])/2,(hi[0]-lo[0])/2/aspect)/Math.tan(Math.PI*21/180)*1.12;state.camera={az:0,el:.04,distance:Math.max(.2,distance),target:lo.map((v,i)=>(v+hi[i])/2)}}
function point(v,i){return [v[i*8],v[i*8+1],v[i*8+2]]}
function pick(x,y){const rect=canvas.getBoundingClientRect(),sx=((x-rect.left)/rect.width*2-1)*(rect.width/rect.height)*Math.tan(Math.PI*21/180),sy=(1-(y-rect.top)/rect.height*2)*Math.tan(Math.PI*21/180),b=cameraBasis(),dir=unit(add(b.forward,add(mul(b.right,sx),mul(b.up,sy))));let nearest=Infinity,hit=null;
 for(const part of state.parts){if(part.visible===false)continue;const v=part.vertices,t=part.indices;for(let j=0;j<t.length;j+=3){const a=point(v,t[j]),bb=point(v,t[j+1]),c=point(v,t[j+2]),e1=sub(bb,a),e2=sub(c,a),p=cross(dir,e2),det=dot(e1,p);if(Math.abs(det)<1e-9)continue;const inv=1/det,s=sub(b.position,a),u=dot(s,p)*inv;if(u<0||u>1)continue;const q=cross(s,e1),w=dot(dir,q)*inv;if(w<0||u+w>1)continue;const distance=dot(e2,q)*inv;if(distance<=0||distance>=nearest)continue;const ns=[t[j],t[j+1],t[j+2]].map(i=>[v[i*8+3],v[i*8+4],v[i*8+5]]);const normal=unit(add(mul(ns[0],1-u-w),add(mul(ns[1],u),mul(ns[2],w))));if(dot(normal,dir)>-.02)continue;const interpolate=(vertices,offset)=>[0,1,2].map(k=>vertices[t[j]*8+offset+k]*(1-u-w)+vertices[t[j+1]*8+offset+k]*u+vertices[t[j+2]*8+offset+k]*w);nearest=distance;hit={partObject:part,triangle:[t[j],t[j+1],t[j+2]],weights:[1-u-w,u,w],restPosition:interpolate(part.restVertices||v,0),restNormal:unit(interpolate(part.restVertices||v,3)),tposePosition:interpolate(part.tposeVertices||part.restVertices||v,0),tposeNormal:unit(interpolate(part.tposeVertices||part.restVertices||v,3)),position:add(b.position,mul(dir,distance)),normal,part:part.name,atlas:part.atlas,uv:[6,7].map(k=>v[t[j]*8+k]*(1-u-w)+v[t[j+1]*8+k]*u+v[t[j+2]*8+k]*w)}}}
 return hit;
}
let drag=null;
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{if(state.externalDragging)return;drag={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,button:e.button,moved:false};canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.lastX,dy=e.clientY-drag.lastY;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>4)drag.moved=true;if(drag.moved){if(drag.button===2){const b=cameraBasis();state.camera.target=add(state.camera.target,add(mul(b.right,-dx*.0015*state.camera.distance),mul(b.up,dy*.0015*state.camera.distance)))}else{state.camera.az-=dx*.007;state.camera.el=Math.max(-1.35,Math.min(1.35,state.camera.el+dy*.006))}render()}drag.lastX=e.clientX;drag.lastY=e.clientY});
canvas.addEventListener('pointerup',e=>{if(drag&&!drag.moved&&drag.button===0&&!state.exporting&&!state.externalDragging&&!state.liquifyActive)state.onModelClick?.(pick(e.clientX,e.clientY));drag=null});
canvas.addEventListener('pointercancel',()=>{drag=null});
canvas.addEventListener('wheel',e=>{e.preventDefault();state.camera.distance=Math.max(.18,Math.min(5,state.camera.distance*Math.exp(e.deltaY*.001)));render()},{passive:false});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{state.camera.az={front:0,back:Math.PI,left:-Math.PI/2,right:Math.PI/2}[b.dataset.view];state.camera.el=.02;render()});
$('resetCamera').onclick=()=>{frameModel();render()};
function updateUI(){
 $('layers').replaceChildren();$('empty').hidden=state.layers.length>0;
 state.layers.map((l,i)=>({l,i})).reverse().forEach(({l,i})=>{
  const row=document.createElement('div');row.className='layer'+(i===state.selected?' active':'')+(l.visible===false?' layer-hidden':'');row.dataset.layer=i;row.tabIndex=0;row.setAttribute('role','group');row.setAttribute('aria-label','图层 '+l.name);row.title='上下拖动或拖动手柄排序；拖到模型表面放置';
  const grip=document.createElement('button');grip.type='button';grip.className='layer-sort-handle';grip.textContent='⠿';grip.title='按住拖动，调整上下顺序';grip.setAttribute('aria-label','拖动排序图层 '+l.name);
  const img=document.createElement('img');img.src=l.image;img.alt='';img.draggable=false;
  const body=document.createElement('div');body.className='layer-body';const line=document.createElement('div');line.className='name-row';
  const name=document.createElement('span');name.className='name';name.textContent=l.name;
  const select=()=>{if(state.selectLayer)state.selectLayer(i);else{state.selected=i;updateUI()}};
  const begin=bindInlineName(name,{value:()=>l.name,maxLength:80,label:'图层 '+l.name,select,commit:async next=>{l.name=next;changed();updateUI()}});
  const rename=document.createElement('button');rename.className='name-action';rename.textContent='✎';rename.setAttribute('aria-label','重命名图层 '+l.name);rename.onclick=e=>{e.stopPropagation();begin()};
  const remove=document.createElement('button');remove.className='name-action danger';remove.textContent='×';remove.setAttribute('aria-label','删除图层 '+l.name);remove.onclick=e=>{e.stopPropagation();removeLayer(i)};
  const flag=document.createElement('small');flag.className='state';flag.textContent=l.placed?'已放置 · 上下排序 / 拖到模型定位':'待放置 · 上下排序 / 拖到模型';line.append(name,rename,remove);body.append(line,flag);const eye=document.createElement('button');eye.type='button';eye.className='layer-visibility';eye.setAttribute('aria-label',(l.visible===false?'显示图层 ':'隐藏图层 ')+l.name);eye.title=l.visible===false?'显示图层':'隐藏图层';eye.setAttribute('aria-pressed',String(l.visible!==false));eye.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'+(l.visible===false?'<path d="m3 3 18 18"/>':'')+'</svg>';eye.onclick=e=>{e.stopPropagation();l.visible=l.visible===false;state.selected=i;if(!l.visible)state.handlesVisible=false;changed();updateUI()};row.append(grip,eye,img,body);
  row.onclick=e=>{if(!e.target.closest('button,input,.inline-name'))select()};row.onkeydown=e=>{if(e.key==='Enter'&&e.target===row)select()};state.decorateLayer?.(row,l,i);$('layers').append(row);
 });
 const l=state.layers[state.selected];$('controls').classList.toggle('disabled',!l);$('deleteLayer').disabled=!l;$('selectedName').textContent=l?l.name:'选择一个图层';$('modeText').textContent=l?(l.placed?'点击纹身编辑 · 点击空白隐藏手柄':'从左侧拖动图层到模型表面放置'):'先带入图片，再拖到模型';
 if(l)for(const key of ['width','height','angle','opacity','depth']){$(key).value=l[key];$(key+'Out').textContent=Number(l[key].toFixed(2))+(key==='angle'?'°':key==='opacity'?'%':' cm')}
 if(state.onUI)state.onUI();
}
for(const key of ['width','height','angle','opacity','depth'])$(key).addEventListener('input',()=>{const l=state.layers[state.selected];if(!l)return;l[key]=Number($(key).value);if(key==='angle')l.surfaceFollow=false;$(key+'Out').textContent=Number(l[key].toFixed(2))+(key==='angle'?'°':key==='opacity'?'%':' cm');changed();state.onUI?.()});
async function loadImage(data){if(!data.startsWith('data:image/png;base64,')||data.length>34*1024*1024)throw new Error('需要 24 MB 以内的 PNG 图片');const image=new Image();image.src=data;await image.decode();if(image.width*image.height>32000000||Math.max(image.width,image.height)>gl.getParameter(gl.MAX_TEXTURE_SIZE))throw new Error('图片尺寸过大，请缩小后再试');return image}
async function addImage(data,name,values={}){if(values.placementPose==='tpose')await ensureTPose();const image=await loadImage(data);const layer={name,image:data,blendMode:'normal',blendTarget:'skin',removeWhite:false,blur:0,projection:'surface',placementPose:values.placementPose??(values.image?'rest':state.previewPose||'rest'),visible:true,surfaceFollow:values.surfaceFollow??!(values.image&&values.placed),backfaceCulling:values.backfaceCulling??(values.image?(values.projection||'surface')==='surface':true),cylinderScale:[1,1],sphereScale:[1,1],projectionScale:[1,1,1],metricProjection:values.metricProjection??!values.image,uvCenter:[.5,.5],uvSize:[.12,.12],uvAtlas:'body',width:12,height:Math.max(.1,Math.min(100,12*image.height/image.width)),angle:0,opacity:100,depth:3,placed:false,center:[0,0,1],normal:[0,1,0],right:[-1,0,0],up:[0,0,1],...values};if(values.image&&!Object.hasOwn(values,'blendTarget'))layer.blendTarget='layers';layer.texture=layerTexture(image,layer.blur||0);layer.image=data;layer.name=String(name).slice(0,80);state.layers.push(layer);state.selected=state.layers.length-1;state.handlesVisible=false;updateUI();changed();return layer}
installImageInput({input:$('imageFile'),area:document.querySelector('.layers-panel'),addImage,status,isBusy:()=>state.exporting||document.querySelector('main').inert,maxTextureSize:gl?.getParameter(gl.MAX_TEXTURE_SIZE)||16384,convert:async image=>{const r=await fetch('/api/images/convert',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':state.config.token},body:JSON.stringify({image})});const result=await r.json();if(!r.ok)throw new Error(result.error||'图片转换失败');return result}});
$('demo').onclick=async()=>{try{const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');ctx.strokeStyle='#111811';ctx.fillStyle='#111811';ctx.lineWidth=15;ctx.beginPath();ctx.arc(256,256,190,0,Math.PI*2);ctx.stroke();for(let i=0;i<8;i++){ctx.save();ctx.translate(256,256);ctx.rotate(i*Math.PI/4);ctx.fillRect(-13,-135,26,90);ctx.restore()}ctx.beginPath();ctx.arc(256,256,25,0,Math.PI*2);ctx.fill();await addImage(c.toDataURL('image/png'),'圆环示例');status('示例已添加。请把左侧图层拖到模型表面放置。')}catch(e){status(e.message,true)}};
function removeLayer(index){const l=state.layers.splice(index,1)[0];if(!l)return;gl.deleteTexture(l.texture);state.selected=state.selected>index?state.selected-1:Math.min(state.selected,state.layers.length-1);state.handlesVisible=false;updateUI();changed()}
$('deleteLayer').onclick=()=>removeLayer(state.selected);
for(const [id,delta]of [['layerDown',-1],['layerUp',1]])$(id).onclick=()=>{const i=state.selected,j=i+delta;if(i<0||j<0||j>=state.layers.length)return;[state.layers[i],state.layers[j]]=[state.layers[j],state.layers[i]];state.selected=j;updateUI();changed()};
function project(){return {version:4,assetId:state.assetId,bakeVersion:BAKE_VERSION,bakeResolution:state.bakeResolution,skinStamp:state.model.id+':'+(state.skinReference?.created_at??'fallback'),body:state.model.name,model:state.model,includePubic:$('includePubic')?.checked??true,title:$('projectTitle').value,layers:state.layers.map(({texture,...rest})=>rest)}}
$('importProject').onclick=()=>$('projectFile').click();
function validateProject(value){if(value.bakeResolution!==undefined&&![2048,4096].includes(value.bakeResolution))throw new Error('输出清晰度无效');if(![1,2,3,4].includes(value.version)||!Array.isArray(value.layers))throw new Error('不是受支持的 RB 纹身设计文件');for(const l of value.layers){validateLiquify(l.liquify);validateWarp(l.warp);if(l.placementPose!==undefined&&!['rest','tpose'].includes(l.placementPose))throw new Error('图层姿势参数无效');for(const flag of ['visible','backfaceCulling','surfaceFollow'])if(l[flag]!==undefined&&typeof l[flag]!=='boolean')throw new Error('图层开关参数无效');for(const key of ['cylinderScale','sphereScale','projectionScale'])if(l[key]!==undefined&&(!Array.isArray(l[key])||l[key].length!==(key==='projectionScale'?3:2)||!l[key].every(v=>Number.isFinite(v)&&v>=.001&&v<=1000)))throw new Error('图案缩放参数无效');if(l.blur!==undefined)blurValue(l.blur);if(l.blendTarget!==undefined&&!['skin','layers'].includes(l.blendTarget))throw new Error('混合对象无效');if(l.blendMode!==undefined&&!Object.hasOwn(blendModes,l.blendMode))throw new Error('图层混合模式无效');if(l.removeWhite!==undefined&&typeof l.removeWhite!=='boolean')throw new Error('去白底设置无效');for(const key of ['width','height','angle','opacity','depth'])if(!Number.isFinite(l[key]))throw new Error('设计参数无效');if(l.width<.1||l.width>100||l.height<.1||l.height>100||l.depth<.1||l.opacity<0||l.opacity>100||Math.abs(l.angle)>180)throw new Error('设计参数超出范围');for(const key of ['center','normal','right','up'])if(!Array.isArray(l[key])||l[key].length!==3||!l[key].every(v=>Number.isFinite(v)&&Math.abs(v)<=20))throw new Error('设计位置无效');if(typeof l.name!=='string'||typeof l.image!=='string')throw new Error('设计图片无效')}return value}
$('projectFile').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>80*1024*1024)throw new Error('设计文件过大');const p=validateProject(JSON.parse(await file.text()));state.bakeResolution=p.bakeResolution??2048;await Promise.all(p.layers.map(l=>loadImage(l.image)));state.layers.forEach(l=>gl.deleteTexture(l.texture));state.layers=[];for(const l of p.layers)await addImage(l.image,l.name,l);$('projectTitle').value=String(p.title||'我的 DIY 纹身');state.selected=state.layers.length-1;updateUI();changed();status('设计已恢复，可继续调整。')}catch(e){status(e.message,true)}finally{$('projectFile').value=''}};
function atlasCanvas(target){const size=target.size;gl.bindFramebuffer(gl.FRAMEBUFFER,target.fbo);const pixels=new Uint8Array(size*size*4);gl.readPixels(0,0,size,size,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d'),data=ctx.createImageData(size,size);for(let y=0;y<size;y++)data.data.set(pixels.subarray(y*size*4,(y+1)*size*4),(size-1-y)*size*4);const atlas=Object.keys(fbos).find(key=>fbos[key]===target);if(atlas)padAtlasPixels(data.data,size,state.parts,atlas);ctx.putImageData(data,0,0);return c}
function atlasPNG(target){return atlasCanvas(target).toDataURL('image/png')}
async function encodeCanvasPNG(c){const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!blob)throw new Error('纹理编码失败');return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)})}
async function atlasPNGAsync(target){return encodeCanvasPNG(atlasCanvas(target))}
async function boot(){try{initGL();state.config=await(await fetch('/api/config')).json();await loadModel();resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas);updateUI();status(state.config.ready?'带入图片，再从图层列表拖到模型表面放置。':'模板正在准备中，请稍后刷新。')}catch(e){fatal(e)}}
export {state,gl,fbos,$,canvas,add,sub,mul,dot,cross,unit,cameraBasis,render,bake,bakePNGs,changed,resize,loadModel,refreshSkin,loadImage,addImage,project,validateProject,updateUI,status,texture,layerTexture,setLayerBlur,pick,atlasPNG,atlasPNGAsync,atlasCanvas,encodeCanvasPNG,textureAlpha,ensureTPose,applyPreviewPose};
export function setPreviewSkinCalibration(value){skinPreview?.setCalibration(value);render()}
export const ready=boot();

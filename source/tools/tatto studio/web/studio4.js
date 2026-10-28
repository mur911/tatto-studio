import {defaultWarpPoints} from './surface-warp.mjs';
import {installSurfaceWarp} from './surface-warp-ui.mjs';
import {tangentFrame} from './surface-math.mjs';
import {followMovingSurface} from './surface-tools.mjs';
import {installLiquify} from './liquify-ui.mjs';
import {installDesignExport} from './design-export.mjs';
import {modelResourceMessages} from './resource-info.mjs';
import {installSkinCalibration} from './skin-calibration-ui.mjs';
import {readPreference,writePreference} from './ui-preferences.mjs';
import {state,gl,fbos,$,canvas,add,sub,mul,dot,unit,cameraBasis,render,bake,changed,resize,loadModel,refreshSkin,addImage,project,validateProject,updateUI,status,ensureTPose,applyPreviewPose,pick,atlasPNG,atlasCanvas as readAtlasCanvas,setLayerBlur,ready} from './app.js';
await ready;
import {editPoseLayer} from './pose-edit.mjs';
import {installGizmo} from './gizmo.mjs';
import {installLibrary} from './library-ui.mjs';
import {installPlacement} from './placement.mjs';
import {installUndo} from './undo-ui.mjs';
import {frameToEuler,eulerToFrame,clamp,uprightFrame,projectionRadius} from './transform-math.mjs';
let folders=[],groupId=null,designId=null,uvZoom=1,uvPan=[0,0],uvCache={},uvPaths={},pointerUV=null;
let lastSelectedLayer=null;
const uv=$('uvCanvas'),ctx=uv.getContext('2d');
const selected=()=>state.layers[state.selected];
const editable=()=>editPoseLayer(selected(),state.parts,state.previewPose,state.externalDragging);
async function api(path,value){const r=await fetch(path,value===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':state.config.token},body:JSON.stringify(value)});const result=await r.json();if(!r.ok)throw new Error(result.error||'操作失败');return result}
function guarded(fn){return async(...args)=>{try{await fn(...args)}catch(e){status(e.message,true)}}}
installPlacement();
const skinCalibrationUI=installSkinCalibration();
const transform=installGizmo(),drawGizmo=transform.draw,screen=transform.screen;
const liquify=installLiquify({screen});
const surfaceWarp=installSurfaceWarp({screen});
const mappingHints={warp:'沿相连皮肤自动展开，适合跨肩膀、胸口和手臂。拖动贴合点微调；W/E/R 调整整体。',surface:'单向平面贴花，适合文字和标志。W/E/R 调整整个投射器。',uv:'直接在原模型 UV 中放置；跨 UV 接缝需分别对齐。',cylindrical:'绕局部 Y 轴环绕，适合手臂、小腿。调半径和轴心；接缝在背向投射器的一侧。',spherical:'围绕中心球形包裹，适合肩、膝等弯曲区域；两极会有拉伸。'};
function extraUI(){
 $('previewPose').value=state.previewPose||'rest';$('previewPose').disabled=!/^character-[0-9a-f]{12}$/.test(state.model.id||'');
 $('bakeResolution').value=String(state.bakeResolution);const l=selected();if(l!==lastSelectedLayer){if(l?.projection==='uv'&&fbos[l.uvAtlas])$('uvAtlas').value=l.uvAtlas;lastSelectedLayer=l;}const isUV=l?.projection==='uv',isWarp=l?.projection==='warp',round=['cylindrical','spherical'].includes(l?.projection);$('surfaceControls').hidden=isUV||!state.handlesVisible;$('surfaceSizes').hidden=isUV;$('uvControls').hidden=!isUV||!state.handlesVisible;$('roundControls').hidden=!round;$('sphereControl').hidden=l?.projection!=='spherical';$('cylinderTextureControls').hidden=!round;$('fitCylinder').hidden=l?.projection!=='cylindrical';$('metricProjection').closest('label').hidden=l?.projection!=='cylindrical';$('backfaceControl').hidden=isUV||isWarp;$('depthNumber').closest('label').hidden=isWarp;$('depthNumber').closest('label').nextElementSibling.hidden=isWarp;$('widthControl').hidden=round;$('fitPlane').hidden=round;$('heightControl').hidden=l?.projection==='spherical';$('targetAtlas').disabled=isUV;
 if(l){$('surfaceFollow').checked=l.surfaceFollow===true;for(const [i,id]of ['projectionScaleX','projectionScaleY','projectionScaleZ'].entries())if(document.activeElement!==$(id))$(id).value=Number(((l.projectionScale?.[i]??1)*100).toFixed(3));$('backfaceCulling').checked=l.backfaceCulling??((l.projection||'surface')==='surface');$('radiusOut').textContent=Number((l.radius??5).toFixed(2))+' cm';$('wrapAngleOut').textContent=Number((l.wrapAngle??360).toFixed(1))+'°';$('sphereAngleOut').textContent=Number((l.sphereAngle??180).toFixed(1))+'°';for(const [index,id]of ['cylinderScaleX','cylinderScaleY'].entries())if(document.activeElement!==$(id))$(id).value=Number(((l[l.projection==='spherical'?'sphereScale':'cylinderScale']?.[index]??1)*100).toFixed(3));$('layerBlur').value=l.blur||0;$('blurOut').textContent=(l.blur||0)+' px';$('blendTarget').value=l.blendTarget||'layers';$('layerBlend').value=l.blendMode||'normal';$('removeWhite').checked=!!l.removeWhite;$('projection').value=l.projection||'surface';for(const [i,key]of ['posX','posY','posZ'].entries())$(key).value=(editable().center[i]*100).toFixed(2);$('uvU').value=(l.uvCenter?.[0]??.5).toFixed(4);$('uvV').value=(l.uvCenter?.[1]??.5).toFixed(4);$('uvWidth').value=((l.uvSize?.[0]??.12)*100).toFixed(2);$('uvHeight').value=((l.uvSize?.[1]??.12)*100).toFixed(2);$('uvAngle').value=l.angle??0;if(document.activeElement!==$('depthNumber'))$('depthNumber').value=Number(l.depth.toFixed(3));$('metricProjection').checked=!!l.metricProjection}
 if(l){const rotation=frameToEuler(editable());for(const [i,key]of ['rotX','rotY','rotZ'].entries())if(document.activeElement!==$(key))$(key).value=rotation[i].toFixed(1);$('mappingHelp').textContent=mappingHints[l.projection||'surface'];$('targetAtlas').value=l.targetAtlas||'';for(const [key,def]of [['radius',5],['wrapAngle',360],['sphereAngle',180]])if(document.activeElement!==$(key))$(key).value=l[key]??def;$('wrapMode').value=l.wrapMode||'clip';$('repeatX').value=l.repeat?.[0]??1;$('repeatY').value=l.repeat?.[1]??1;}
 liquify.refresh();drawGizmo();surfaceWarp.draw();drawUV();
}
state.onUI=extraUI;state.onRender=()=>{drawGizmo();surfaceWarp.draw()};state.onBake=()=>{uvCache={};drawUV()};
let blurTimer;
function applyBlur(){clearTimeout(blurTimer);const l=selected();if(!l)return;try{setLayerBlur(l,Number($('layerBlur').value));changed();updateUI()}catch(e){status(e.message,true)}}
$('layerBlur').oninput=()=>{const layer=selected(),value=Number($('layerBlur').value);$('blurOut').textContent=value+' px';clearTimeout(blurTimer);blurTimer=setTimeout(()=>{if(selected()===layer)applyBlur()},100)};
$('layerBlur').onchange=applyBlur;
function updateLighting(){for(const id of ['lightAzimuth','lightElevation'])$(id+'Out').textContent=$(id).value+'°';render()}
$('lightAzimuth').oninput=updateLighting;$('lightElevation').oninput=updateLighting;
$('resetLight').onclick=()=>{$('lightAzimuth').value=-23;$('lightElevation').value=38;updateLighting()};
$('layerBlend').onchange=()=>{const l=selected();if(l){l.blendMode=$('layerBlend').value;changed();updateUI()}};
$('blendTarget').onchange=()=>{const l=selected();if(l){l.blendTarget=$('blendTarget').value;changed();updateUI()}};
$('bakeResolution').onchange=()=>{state.bakeResolution=Number($('bakeResolution').value);changed();updateUI()};
$('bakedPreview').onchange=guarded(()=>{bake();render()});
$('removeWhite').onchange=()=>{const l=selected();if(l){l.removeWhite=$('removeWhite').checked;changed();updateUI()}};
$('showSkin').onchange=render;$('showSkinDetails').onchange=render;
$('axisSpace').onchange=drawGizmo;
$('surfaceFollow').onchange=()=>{const l=selected();if(l){l.surfaceFollow=$('surfaceFollow').checked;changed();updateUI()}};
for(const [index,key]of ['posX','posY','posZ'].entries())$(key).onchange=()=>{const l=editable(),v=Number($(key).value);if(!l||!Number.isFinite(v)||Math.abs(v)>2000)return;const center=[...l.center];center[index]=v/100;Object.assign(l,followMovingSurface(l,center,screen));l.placed=true;changed();extraUI()};
$('snapSurface').onclick=()=>{const l=editable();if(!l)return;const p=screen(l.center);if(!p)return;const r=canvas.getBoundingClientRect(),hit=pick(r.left+p.x,r.top+p.y);if(!hit){status('此方向没有可见表面，请旋转视角或把图层重新拖到目标位置。',true);return}Object.assign(l,tangentFrame(hit.normal,l));l.surfaceFollow=true;l.part=hit.part;l.center=['cylindrical','spherical'].includes(l.projection)?sub(hit.position,mul(l.normal,projectionRadius(l))):hit.position;changed();extraUI()};
$('projection').onchange=()=>{const l=editable();if(!l)return;const previous=l.projection;const radialSurface=['cylindrical','spherical'].includes(previous)?add(l.center,mul(l.normal,projectionRadius(l))):[...l.center];l.projection=$('projection').value;if(l.projection==='warp'){l.warp??={version:1,points:defaultWarpPoints()};l.targetAtlas='';state.warpEditing=true;state.handlesVisible=!!l.placed;}else state.warpEditing=false;if(['cylindrical','spherical'].includes(previous)&&!['cylindrical','spherical'].includes(l.projection)&&l.placed)l.center=add(l.center,mul(l.normal,projectionRadius(l)));if(l.projection==='uv'){l.uvAtlas=$('uvAtlas').value;l.uvCenter??=[.5,.5];l.uvSize??=[.12,.12];}else if(['cylindrical','spherical'].includes(l.projection)&&!['cylindrical','spherical'].includes(previous)){l.radius??=5;l.wrapAngle??=360;l.sphereAngle??=180;if(l.placed)l.center=sub(l.center,mul(l.normal,projectionRadius(l)));}if(l.projection==='cylindrical'&&previous!=='cylindrical'){if(l.surfaceFollow===true)Object.assign(l,tangentFrame(l.normal,l));l.center=l.placed?sub(radialSurface,mul(l.normal,projectionRadius(l))):radialSurface;l.metricProjection=true;if(l.surfaceFollow===true)l.angle=0;}changed();updateUI()};
$('targetAtlas').onchange=()=>{const l=selected();if(l){l.targetAtlas=$('targetAtlas').value;changed()}};
for(const key of ['radius','wrapAngle','sphereAngle']){const apply=()=>{const l=selected(),v=Number($(key).value),ranges={radius:[.1,100],wrapAngle:[1,360],sphereAngle:[1,180],blendSharpness:[1,16]};if(!l||!Number.isFinite(v))return;l[key]=clamp(v,...ranges[key]);changed();extraUI()};$(key).oninput=apply;$(key).onchange=apply;}
$('centerWrap').onclick=()=>{const l=editable();if(!l)return;const surface=add(l.center,mul(l.normal,projectionRadius(l))),point=screen(surface),r=canvas.getBoundingClientRect();if(!point)return;const hit=pick(r.left+point.x,r.top+point.y);if(!hit)return;l.center=sub(hit.position,mul(l.normal,projectionRadius(l)));changed();extraUI()};
for(const key of ['repeatX','repeatY'])$(key).onchange=()=>{const l=selected();if(!l)return;l.repeat=[clamp(Number($('repeatX').value)||1,.1,20),clamp(Number($('repeatY').value)||1,.1,20)];changed();extraUI()};
$('wrapMode').onchange=()=>{const l=selected();if(l){l.wrapMode=$('wrapMode').value;changed()}};
for(const key of ['rotX','rotY','rotZ'])$(key).onchange=()=>{const l=editable(),values=['rotX','rotY','rotZ'].map(id=>Number($(id).value));if(l&&values.every(Number.isFinite)){Object.assign(l,eulerToFrame(values));l.surfaceFollow=false;changed();extraUI()}};
for(const [key,i,kind]of [['uvU',0,'uvCenter'],['uvV',1,'uvCenter'],['uvWidth',0,'uvSize'],['uvHeight',1,'uvSize']])$(key).onchange=()=>{const l=selected(),v=Number($(key).value);if(!l||!Number.isFinite(v))return;const value=kind==='uvSize'?v/100:v;if(kind==='uvSize'&&(value<=0||value>2))return;if(Math.abs(value)>4)return;l[kind]??=kind==='uvSize'?[.12,.12]:[.5,.5];l[kind][i]=value;changed();drawUV()};

$('depthNumber').oninput=()=>{const l=selected(),v=Number($('depthNumber').value);if(!l||!Number.isFinite(v)||v<.1)return;l.depth=v;changed();updateUI()};
$('uvAngle').oninput=()=>{const l=selected(),v=Number($('uvAngle').value);if(!l||!Number.isFinite(v))return;l.angle=((v+180)%360+360)%360-180;l.surfaceFollow=false;changed();updateUI()};
$('resetAngle').onclick=()=>{const l=selected();if(l){l.angle=0;changed();updateUI()}};
$('alignUpright').onclick=()=>{const l=editable();if(!l)return;const round=['cylindrical','spherical'].includes(l.projection),surface=round?add(l.center,mul(l.normal,projectionRadius(l))):null;Object.assign(l,uprightFrame(l.normal));l.surfaceFollow=false;if(round)l.center=sub(surface,mul(l.normal,projectionRadius(l)));changed();updateUI()};
for(const [index,id] of ['cylinderScaleX','cylinderScaleY'].entries())$(id).onchange=()=>{const l=selected(),value=Number($(id).value);if(!l||!Number.isFinite(value))return;const key=l.projection==='spherical'?'sphereScale':'cylinderScale';l[key]=[...(l[key]||[1,1])];l[key][index]=clamp(value/100,.001,1000);changed();updateUI()};
for(const [index,id]of ['projectionScaleX','projectionScaleY','projectionScaleZ'].entries())$(id).onchange=()=>{const l=selected(),value=Number($(id).value);if(!l||!Number.isFinite(value))return;l.projectionScale=[...(l.projectionScale||[1,1,1])];l.projectionScale[index]=clamp(value/100,.001,1000);changed();updateUI()};
$('backfaceCulling').onchange=()=>{const l=selected();if(l){l.backfaceCulling=$('backfaceCulling').checked;changed();updateUI()}};
$('metricProjection').onchange=()=>{const l=selected();if(l){l.metricProjection=$('metricProjection').checked;changed()}};
$('fitPlane').onclick=()=>{const l=selected();if(!l)return;const img=document.querySelector('#layers .layer.active img'),aspect=img?.naturalWidth&&img?.naturalHeight?img.naturalWidth/img.naturalHeight:l.width/l.height;l.height=clamp(l.width/aspect,.1,100);changed();updateUI()};
$('fitCylinder').onclick=()=>{const l=selected();if(!l)return;const img=document.querySelector('#layers .layer.active img'),aspect=img?.naturalWidth&&img?.naturalHeight?img.naturalWidth/img.naturalHeight:l.width/l.height;l.height=clamp((l.radius??5)*(l.wrapAngle??360)*Math.PI/180/aspect,.1,100);l.metricProjection=true;changed();updateUI();status('已按圆柱实际弧长匹配图片比例；旋转归零可恢复水平图案。')};
const atlasLabels={body:'身体',body_2:'肩颈接缝',left_arm:'左臂',right_arm:'右臂',head:'头部与颈部',neck:'颈部',genitals:'生殖器'};
function refreshModelUI(meta){
 skinCalibrationUI.refresh();
 $('uvAtlas').replaceChildren();for(const key of Object.keys(fbos)){const opt=document.createElement('option');opt.value=key;opt.textContent=atlasLabels[key]||key;$('uvAtlas').append(opt)}
 $('targetAtlas').replaceChildren();for(const key of ['',...Object.keys(fbos)]){const opt=document.createElement('option');opt.value=key;opt.textContent=key?(atlasLabels[key]||key):'所有部位';$('targetAtlas').append(opt)}
 const notices=modelResourceMessages(meta?.limitations||state.model.limitations||[]);
 $('modelInfo').textContent=notices.length?'有 '+notices.length+' 项资源未用于预览，可展开资源详情查看。':'';
 $('modelInfo').hidden=!notices.length;$('modelResourceDetails').hidden=!notices.length;
 $('modelIssues').replaceChildren();for(const text of notices){const p=document.createElement('p');p.textContent=text;$('modelIssues').append(p)}
 $('partList').replaceChildren();for(const part of state.parts){const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=true;check.onchange=()=>{part.visible=check.checked;render()};label.title=part.name;label.append(check,document.createTextNode(' '+(atlasLabels[part.atlas]||part.label||part.name)));$('partList').append(label)}
 uvCache={};uvPaths={};uvZoom=1;uvPan=[0,0];drawUV();drawGizmo();
}
state.onModel=refreshModelUI;
function atlasCanvas(key){if(uvCache[key])return uvCache[key];const f=fbos[key];if(!f)return null;const c=readAtlasCanvas(f);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return uvCache[key]=c}
function uvPath(key){if(uvPaths[key])return uvPaths[key];const p=new Path2D(),edges=new Set();let count=0;for(const part of state.parts){if(part.atlas!==key)continue;const v=part.vertices,t=part.indices;const step=Math.max(1,Math.ceil(t.length/3/10000))*3;for(let j=0;j<t.length;j+=step){for(let k=0;k<3;k++){const a=t[j+k]*8,b=t[j+(k+1)%3]*8,x=v[a+6],y=1-v[a+7],u=v[b+6],w=1-v[b+7];const id=[x,y,u,w].map(n=>n.toFixed(4)).join(',');if(edges.has(id))continue;edges.add(id);p.moveTo(x,y);p.lineTo(u,w);count++}}}return uvPaths[key]=p}
function uvTransform(){const base=Math.min(uv.width,uv.height)*.9;return {scale:base*uvZoom,x:(uv.width-base)/2+uvPan[0],y:(uv.height-base)/2+uvPan[1]}}
function drawUV(){
 if(!ctx||!$('uvAtlas').value)return;const key=$('uvAtlas').value,t=uvTransform();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#080f17';ctx.fillRect(0,0,uv.width,uv.height);ctx.translate(t.x,t.y);ctx.scale(t.scale,t.scale);ctx.fillStyle='#1b2a37';ctx.fillRect(0,0,1,1);const image=atlasCanvas(key);if(image)ctx.drawImage(image,0,0,1,1);
 if($('uvWire').checked){ctx.strokeStyle='#72b2c16b';ctx.lineWidth=.55/t.scale;ctx.stroke(uvPath(key))}
 const l=selected();if(l?.placed&&l.projection==='uv'&&l.uvAtlas===key&&state.handlesVisible){ctx.save();ctx.translate(l.uvCenter[0],1-l.uvCenter[1]);ctx.rotate(-l.angle*Math.PI/180);ctx.strokeStyle='#6dc2d2';ctx.lineWidth=1.7/t.scale;ctx.setLineDash([7/t.scale,4/t.scale]);ctx.strokeRect(-l.uvSize[0]/2,-l.uvSize[1]/2,...l.uvSize);ctx.restore()}
 ctx.setTransform(1,0,0,1,0,0);drawUVGizmo();$('uvZoomValue').value=Number((uvZoom*100).toFixed(1));
}
function uvScreen(p){const t=uvTransform();return [t.x+p[0]*t.scale,t.y+(1-p[1])*t.scale]}
function drawUVGizmo(){
 const root=$('uvGizmo');root.replaceChildren();root.setAttribute('viewBox',`0 0 ${uv.width} ${uv.height}`);const l=selected();if(!state.handlesVisible||!l?.placed||l.projection!=='uv'||l.uvAtlas!==$('uvAtlas').value)return;
 const ns='http://www.w3.org/2000/svg',node=(tag,attrs)=>{const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);root.append(e);return e},[x,y]=uvScreen(l.uvCenter),px=uv.width/Math.max(1,uv.getBoundingClientRect().width),len=50*px,mode=state.transformMode;
 if(mode==='rotate'){node('circle',{cx:x,cy:y,r:len,fill:'none',stroke:'#f4dc8e','stroke-width':3*px,'data-uv-axis':'rotate',class:'uv-handle'});return}
 const angle=mode==='scale'?(l.angle||0)*Math.PI/180:0;
 for(const [axis,color,dx,dy]of [['u','#ff7168',len*Math.cos(angle),-len*Math.sin(angle)],['v','#85dd86',-len*Math.sin(angle),-len*Math.cos(angle)]]){
  node('line',{x1:x,y1:y,x2:x+dx,y2:y+dy,stroke:color,'stroke-width':2*px,'pointer-events':'none'});
  node(mode==='scale'?'rect':'circle',mode==='scale'?{x:x+dx-5*px,y:y+dy-5*px,width:10*px,height:10*px,fill:color,'data-uv-axis':axis,class:'uv-handle'}:{cx:x+dx,cy:y+dy,r:6*px,fill:color,'data-uv-axis':axis,class:'uv-handle'});
  const text=node('text',{x:x+dx+8*px,y:y+dy-8*px,fill:color,'font-size':12*px,'pointer-events':'none'});text.textContent=axis.toUpperCase();
 }
 node('rect',{x:x-5*px,y:y-5*px,width:10*px,height:10*px,fill:'#f1f5d9','data-uv-axis':'all',class:'uv-handle'});
}
function mouseUV(e){const r=uv.getBoundingClientRect(),t=uvTransform(),x=(e.clientX-r.left)*uv.width/r.width,y=(e.clientY-r.top)*uv.height/r.height;return [(x-t.x)/t.scale,1-(y-t.y)/t.scale]}
const viewport=$('uvCanvas').parentElement;
viewport.oncontextmenu=e=>e.preventDefault();
viewport.onpointerdown=e=>{
 if(e.button!==0&&e.button!==2)return;e.preventDefault();viewport.setPointerCapture(e.pointerId);const l=selected(),point=mouseUV(e),axis=e.target.getAttribute('data-uv-axis');
 pointerUV={x:e.clientX,y:e.clientY,button:e.button,pan:[...uvPan],point,mode:state.transformMode,axis:axis||'all',center:l?.uvCenter?[...l.uvCenter]:point,angle:l?.angle||0,size:l?.uvSize?[...l.uvSize]:[.12,.12]};
 if(e.button===0&&l&&!state.exporting){
  const wasUV=l.placed&&l.projection==='uv'&&l.uvAtlas===$('uvAtlas').value;if(!wasUV){pointerUV=null;status('请先从图层列表拖到模型放置，再切换UV映射。');return}state.handlesVisible=true;
  l.projection='uv';l.uvAtlas=$('uvAtlas').value;l.uvSize??=[.12,.12];
  if(!axis){
   const a=l.angle*Math.PI/180,dx=point[0]-l.uvCenter[0],dy=point[1]-l.uvCenter[1],inside=Math.abs(dx*Math.cos(a)+dy*Math.sin(a))<=l.uvSize[0]/2&&Math.abs(-dx*Math.sin(a)+dy*Math.cos(a))<=l.uvSize[1]/2;
   if(!inside){state.handlesVisible=false;pointerUV=null;updateUI();return}
  }
  updateUI();
 }
};
viewport.onpointermove=e=>{
 if(!pointerUV)return;const l=selected(),a=pointerUV;
 if(a.button===2){const r=uv.getBoundingClientRect();uvPan=[a.pan[0]+(e.clientX-a.x)*uv.width/r.width,a.pan[1]+(e.clientY-a.y)*uv.height/r.height];drawUV();return}
 if(!l||state.exporting)return;const point=mouseUV(e),dx=point[0]-a.point[0],dy=point[1]-a.point[1];
 if(a.mode==='move')l.uvCenter=[a.center[0]+(a.axis==='v'?0:dx),a.center[1]+(a.axis==='u'?0:dy)];
 else if(a.mode==='rotate'){const start=Math.atan2(a.point[1]-a.center[1],a.point[0]-a.center[0]),end=Math.atan2(point[1]-a.center[1],point[0]-a.center[0]);let angle=a.angle+(end-start)*180/Math.PI;if(e.shiftKey)angle=Math.round(angle/15)*15;l.angle=((angle+180)%360+360)%360-180;l.surfaceFollow=false;}
 else{const angle=a.angle*Math.PI/180,sx=e.clientX-a.x,sy=e.clientY-a.y,distance=a.axis==='v'?-sx*Math.sin(angle)-sy*Math.cos(angle):a.axis==='u'?sx*Math.cos(angle)-sy*Math.sin(angle):-sy,ratio=Math.exp(Math.max(-7,Math.min(7,distance*.012)));l.uvSize=a.size.map((v,i)=>clamp(v*(e.shiftKey||a.axis==='all'||a.axis===(i===0?'u':'v')?ratio:1),.001,2));}
 changed();updateUI();
};
viewport.onpointerup=()=>{pointerUV=null};viewport.onpointercancel=()=>{pointerUV=null};
function zoomUV(value,anchor){const r=uv.getBoundingClientRect(),e=anchor||{clientX:r.left+r.width/2,clientY:r.top+r.height/2},before=mouseUV(e);uvZoom=Math.max(.01,Math.min(1e5,value));const after=mouseUV(e),t=uvTransform();uvPan[0]+=(after[0]-before[0])*t.scale;uvPan[1]-=(after[1]-before[1])*t.scale;drawUV()}
viewport.addEventListener('wheel',e=>{e.preventDefault();zoomUV(uvZoom*Math.exp(-e.deltaY*.001),e)},{passive:false});
$('uvZoomIn').onclick=()=>zoomUV(uvZoom*1.25);$('uvZoomOut').onclick=()=>zoomUV(uvZoom/1.25);$('uvZoomValue').oninput=()=>zoomUV(Number($('uvZoomValue').value)/100||1);
$('uvAtlas').onchange=drawUV;$('uvWire').onchange=drawUV;$('uvHome').onclick=()=>{uvZoom=1;uvPan=[0,0];drawUV()};$('uvToggle').onclick=()=>{$('uvBody').hidden=!$('uvBody').hidden;$('uvToggle').textContent=$('uvBody').hidden?'+':'−'};
$('uvExpand').onclick=()=>{const expanded=$('uvWindow').classList.toggle('expanded');$('uvExpand').textContent=expanded?'还原':'放大';drawUV()};
new ResizeObserver(()=>{const r=uv.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(r.width*ratio)),h=Math.max(1,Math.round(r.height*ratio));if(w!==uv.width||h!==uv.height){const scale=Math.min(w,h)/Math.max(1,Math.min(uv.width,uv.height));uvPan=uvPan.map(v=>v*scale);uv.width=w;uv.height=h;}drawUV();}).observe(uv);
function previewBusy(value){state.previewLoading=value;document.body.classList.toggle('reading-character',value);document.querySelector('main').inert=document.querySelector('header').inert=value;for(const id of ['readCharacter','modelSelect','publish'])$(id).disabled=value;}
$('previewPose').onchange=guarded(async()=>{
 if(state.exporting||state.previewLoading)return;const pose=$('previewPose').value,previous=state.previewPose;
 const operation=(phase,text)=>document.dispatchEvent(new CustomEvent('tattoo:operation',{detail:{kind:'read-character',phase,text}}));
 previewBusy(true);operation('start','正在准备 T Pose…');
 try{if(pose==='tpose')await ensureTPose();if(!applyPreviewPose(pose,true))throw new Error('T Pose 准备失败');updateUI();operation('done',pose==='tpose'?'T Pose 已准备好':'已恢复原始姿势');status(pose==='tpose'?'T Pose 已准备好':'已恢复原始姿势')}
 catch(error){$('previewPose').value=previous;operation('error',error.message);throw error}
 finally{previewBusy(false)}
});
$('reloadSkin').onclick=guarded(async()=>{if(state.exporting||state.previewLoading)return;previewBusy(true);try{await refreshSkin(true);status(state.skinReference?'皮肤参考已更新，设计未修改。':'皮肤未能读取，请查看角色模型区域的提示。',!state.skinReference)}finally{previewBusy(false)}});
$('readCharacter').onclick=guarded(async()=>{
 if(state.exporting||state.previewLoading)return;
 const operation=(phase,text)=>document.dispatchEvent(new CustomEvent('tattoo:operation',{detail:{kind:'read-character',phase,text}}));
 previewBusy(true);operation('start');
 try{
  const job=await api('/api/models/import',{});
  while(true){
   await new Promise(r=>setTimeout(r,1000));const value=await api('/api/jobs/'+job.id);
   if(value.state==='error')throw new Error(value.message);
   status(value.message);operation('progress',value.message);
   if(value.state==='done'){
    operation('progress','正在载入角色预览…');await refreshModels();$('modelSelect').value=value.result.id;
    await loadModel(value.result.url);writePreference('previewModel',state.model.id);updateUI();
    status('新快照已用于预览，纹身库未修改。点击「更新游戏纹身库」后，全部已勾选纹身会匹配此模型。');
    operation('done');break;
   }
  }
 }catch(error){operation('error',error.message);throw error}
 finally{previewBusy(false)}
});
async function refreshModels(){const models=await api('/api/models');$('modelSelect').replaceChildren();for(const m of [{id:'setup',name:'Read a character snapshot',url:'/assets/model.json'},...models]){const o=document.createElement('option');o.value=m.id;o.textContent=m.name;o.dataset.url=m.url;$('modelSelect').append(o)}$('modelSelect').value=state.model.id}
$('modelSelect').onchange=guarded(async()=>{if(state.exporting||state.previewLoading)return;const option=$('modelSelect').selectedOptions[0];previewBusy(true);try{await loadModel(option.dataset.url);writePreference('previewModel',state.model.id);updateUI();status('已切换预览快照，纹身库未修改。点击「更新游戏纹身库」后，全部已勾选纹身会匹配此模型。');}finally{previewBusy(false)}});
await refreshModels();
const previousModel=readPreference('previewModel'),availableModels=Array.from($('modelSelect').options);
const initialModel=availableModels.find(option=>option.value===previousModel)||(!state.layers.length&&availableModels.length>1?availableModels[availableModels.length-1]:null);
if(initialModel&&initialModel.value!==state.model.id){$('modelSelect').value=initialModel.value;await loadModel(initialModel.dataset.url)}
const libraryUI=await installLibrary();
installDesignExport(libraryUI);
installUndo();
refreshModelUI();extraUI();


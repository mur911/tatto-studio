import {state,$,canvas,add,sub,mul,dot,cross,unit,cameraBasis,changed,updateUI,status,pick} from './app.js';
import {rotateFrame,scaleProjection,radians,shortcutMode,projectionRadius} from './transform-math.mjs';
import {editPoseLayer} from './pose-edit.mjs';
import {planeTranslation} from './surface-math.mjs';
import {followMovingSurface} from './surface-tools.mjs';
import {appendGuides} from './projection-guides.mjs';
export function installGizmo(){
 const root=$('gizmo'),ns='http://www.w3.org/2000/svg',colors=['#ff7168','#85dd86','#6fb5ff'];
 let drag=null;
 state.transformMode='move';
 const selection=()=>editPoseLayer(state.layers[state.selected],state.parts,state.previewPose,state.externalDragging);
 function screen(position){const b=cameraBasis(),p=sub(position,b.position),z=dot(p,b.forward),r=canvas.getBoundingClientRect(),zoom=1/Math.tan(Math.PI*21/180);return z<=.01?null:{x:(dot(p,b.right)*zoom/(r.width/r.height)/z+1)*r.width/2,y:(1-dot(p,b.up)*zoom/z)*r.height/2};}
 function axes(l){return state.transformMode==='scale'||$('axisSpace').value==='local'?[l.right,l.up,l.normal]:[[1,0,0],[0,1,0],[0,0,1]];}
 function svg(tag,attrs){const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;}
 function planePoint(e,center,axis){const b=cameraBasis(),r=canvas.getBoundingClientRect(),zoom=1/Math.tan(Math.PI*21/180);const x=((e.clientX-r.left)/r.width*2-1)*r.width/r.height/zoom,y=(1-(e.clientY-r.top)/r.height*2)/zoom;const direction=unit(add(b.forward,add(mul(b.right,x),mul(b.up,y))));const denom=dot(direction,axis);if(Math.abs(denom)<.0001)return null;const t=dot(sub(center,b.position),axis)/denom;return t>0?add(b.position,mul(direction,t)):null;}
 function setMode(mode){state.transformMode=mode;for(const button of document.querySelectorAll('[data-transform]'))button.setAttribute('aria-pressed',String(button.dataset.transform===mode));$('transformHint').textContent={move:'W 移动 · 箭头单轴，方块沿 XY／YZ／XZ 平面，中心自由贴合',rotate:'E 旋转 · 拖动圆环；Shift 按15°吸附',scale:'R 缩放 · 平面蓝轴调深度；环绕用金色厚度手柄；Alt 拖动调厚度'}[mode];$('axisSpace').disabled=mode==='scale';document.dispatchEvent(new CustomEvent('tattoo:transform-tool'));draw();state.onUI?.();}
 function draw(){
  root.replaceChildren();const l=selection();if(state.liquifyActive||state.warpEditing&&l?.projection==='warp'||!state.handlesVisible||!l?.placed||l.visible===false||l.projection==='uv')return;
  const rect=canvas.getBoundingClientRect();root.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);appendGuides(root,l,screen);const o=screen(l.center);if(!o)return;
  const directions=axes(l),length=Math.max(.025,Math.min(.18,state.camera.distance*.085));
  if(state.transformMode==='move')for(const [a,b]of [[0,1],[1,2],[0,2]]){
   const points=[[.22,.22],[.48,.22],[.48,.48],[.22,.48]].map(([x,y])=>screen(add(l.center,add(mul(directions[a],length*x),mul(directions[b],length*y)))));
   if(points.some(p=>!p))continue;const key='plane-'+a+b,label=['X','Y','Z'][a]+['X','Y','Z'][b],color=colors[3-a-b];
   const group=svg('g',{class:'move-plane-group'});group.append(svg('polygon',{points:points.map(p=>p.x+','+p.y).join(' '),fill:color,stroke:color,'fill-opacity':.18,'stroke-opacity':.8,'stroke-width':1.5,'data-axis':key,class:'move-plane','aria-label':'沿 '+label+' 平面移动'}));
   const text=svg('text',{x:points.reduce((s,p)=>s+p.x,0)/4,y:points.reduce((s,p)=>s+p.y,0)/4+3,fill:color,'font-size':9,'text-anchor':'middle','pointer-events':'none'});text.textContent=label;group.append(text);root.append(group);
  }
  if(state.transformMode==='rotate'){
   directions.forEach((axis,i)=>{const helper=Math.abs(axis[2])<.8?[0,0,1]:[0,1,0],a=unit(cross(axis,helper)),b=unit(cross(axis,a));let path='';
    for(let j=0;j<=96;j++){const angle=j/96*Math.PI*2,p=screen(add(l.center,add(mul(a,Math.cos(angle)*length),mul(b,Math.sin(angle)*length))));if(p)path+=(j?'L':'M')+p.x+','+p.y;}
    root.append(svg('path',{d:path,fill:'none',stroke:colors[i],'stroke-width':2.5,'data-axis':i,class:'rotate-ring','aria-label':'绕'+['X','Y','Z'][i]+'旋转'}));
   });
  }else directions.forEach((axis,i)=>{if(l.projection==='warp'&&state.transformMode==='scale'&&i===2)return;let p=screen(add(l.center,mul(axis,length)));if(!p)return;if(Math.hypot(p.x-o.x,p.y-o.y)<8)p={x:o.x+20,y:o.y+20};
   root.append(svg('line',{x1:o.x,y1:o.y,x2:p.x,y2:p.y,stroke:colors[i],'stroke-width':3}),svg('line',{x1:o.x,y1:o.y,x2:p.x,y2:p.y,class:'hit','data-axis':i}));
   root.append(state.transformMode==='scale'?svg('rect',{x:p.x-5,y:p.y-5,width:10,height:10,fill:colors[i],'data-axis':i,class:'handle'}):svg('circle',{cx:p.x,cy:p.y,r:5,fill:colors[i],'data-axis':i,class:'handle'}));
   const text=svg('text',{x:p.x+9,y:p.y-8,fill:colors[i]});text.textContent=['X','Y','Z'][i];root.append(text);
  });
  if(state.transformMode==='move'){for(const group of root.querySelectorAll('.move-plane-group'))root.append(group);for(const handle of root.querySelectorAll('.handle'))root.append(handle);}
  if(state.transformMode==='scale'&&['cylindrical','spherical'].includes(l.projection)){
   const p=screen(add(l.center,mul(l.normal,projectionRadius(l)+l.depth*(l.projectionScale?.[2]??1)/100)));
   if(p){const x=Math.hypot(p.x-o.x,p.y-o.y)<12?p.x+30:p.x;root.append(svg('rect',{x:x-5,y:p.y-5,width:10,height:10,fill:'#f2ce7d','data-axis':'depth',class:'handle','aria-label':'投射厚度（无上限）'}));const text=svg('text',{x:x+9,y:p.y+4,fill:'#f2ce7d'});text.textContent='厚度';root.append(text);}
  }
  if(state.transformMode!=='rotate')root.append(state.transformMode==='scale'?svg('rect',{x:o.x-5,y:o.y-5,width:10,height:10,fill:'#eef8e6',stroke:'#172019','data-axis':'all',class:'handle'}):svg('circle',{cx:o.x,cy:o.y,r:5,fill:'#eef8e6',stroke:'#172019','data-axis':'all',class:'handle'}));
 }
 root.addEventListener('pointerdown',e=>{
  const key=e.target.getAttribute('data-axis'),l=selection();if(key===null||!l||state.exporting)return;
  e.preventDefault();e.stopPropagation();root.setPointerCapture(e.pointerId);
  const directions=axes(l),plane=key.startsWith('plane-')?key.slice(-2).split('').map(Number):null,planeAxes=plane?.map(i=>directions[i]);
  const axis=planeAxes?unit(cross(...planeAxes)):key==='all'?cameraBasis().forward:key==='depth'?l.normal:directions[Number(key)],origin=screen(l.center),end=screen(add(l.center,mul(axis,.1)));if(!origin||!end)return;
  drag={key,axis,planeAxes,mode:state.transformMode,layer:l,start:{...l,center:[...l.center],right:[...l.right],up:[...l.up],normal:[...l.normal]},x:e.clientX,y:e.clientY,origin,dx:end.x-origin.x,dy:end.y-origin.y,depthAxis:Math.hypot(end.x-origin.x,end.y-origin.y)<8,point:planePoint(e,l.center,axis)};
  state.externalDragging=true;document.body.classList.add('transform-drag');
 });
 window.addEventListener('pointermove',e=>{
  if(!drag)return;const a=drag,l=a.layer,dx=e.clientX-a.x,dy=e.clientY-a.y;
  if(a.mode==='move'){
   let center=[...a.start.center];
   if(a.key==='all'||a.planeAxes){const p=planePoint(e,a.start.center,a.axis);if(p&&a.point){let delta=sub(p,a.point);if(a.planeAxes)delta=planeTranslation(delta,a.planeAxes,e.shiftKey ? .005 : 0);center=add(a.start.center,delta);}}
   else{const denominator=a.dx*a.dx+a.dy*a.dy;let distance=a.depthAxis?-dy*.001*state.camera.distance:(dx*a.dx+dy*a.dy)/Math.max(denominator,1)*.1;if(e.shiftKey)distance=Math.round(distance/.005)*.005;center=add(a.start.center,mul(a.axis,distance));}
   if(Math.hypot(...sub(center,a.start.center))>1e-9){
    if(a.key==='all'&&l.surfaceFollow===true){const hit=pick(e.clientX,e.clientY);Object.assign(l,hit?followMovingSurface(l,center,screen,{hit,snap:true}):{center});}
    else Object.assign(l,followMovingSurface(l,center,screen));
   }
  }else if(a.mode==='rotate'){
   const p=planePoint(e,a.start.center,a.axis);let angle;
   if(p&&a.point){const v=unit(sub(a.point,a.start.center)),w=unit(sub(p,a.start.center));angle=Math.atan2(dot(a.axis,cross(v,w)),dot(v,w));}
   else{const r=canvas.getBoundingClientRect(),o=a.origin;angle=Math.atan2(e.clientY-r.top-o.y,e.clientX-r.left-o.x)-Math.atan2(a.y-r.top-o.y,a.x-r.left-o.x);}
   if(e.shiftKey)angle=Math.round(angle/radians(15))*radians(15);Object.assign(l,rotateFrame(a.start,a.axis,angle));if(Math.abs(angle)>1e-7)l.surfaceFollow=false;
  }else{
   const denominator=Math.hypot(a.dx,a.dy),distance=a.key==='all'||a.depthAxis?-dy:(denominator>1?(dx*a.dx+dy*a.dy)/denominator:dx-dy);
   const factor=Math.exp(Math.max(-12,Math.min(12,distance*.012)));Object.assign(l,scaleProjection(a.start,e.altKey?'depth':e.shiftKey?'all':a.key,factor));
  }
  changed();updateUI();
 });
 const end=()=>{if(!drag)return;drag=null;state.externalDragging=false;document.body.classList.remove('transform-drag');status('变换已更新，保存设计后会保留。');};
 window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);
 for(const button of document.querySelectorAll('[data-transform]'))button.onclick=()=>setMode(button.dataset.transform);
 window.addEventListener('keydown',e=>{const mode=shortcutMode(e);if(mode){e.preventDefault();setMode(mode);}});
 $('axisSpace').onchange=draw;setMode('move');return {draw,setMode,screen};
}

import {state,$,canvas,pick,cameraBasis,sub,changed,updateUI,status} from './app.js';
import {defaultWarpPoints,prepareWarp,expandWarpToHit,moveWarpPoint,warpHit,warpSurfacePoint,warpControlPoint,rememberWarpPin} from './surface-warp.mjs';
import {surfacePointVisible} from './surface-visibility.mjs';
export function installSurfaceWarp({screen}){
 const ns='http://www.w3.org/2000/svg',overlay=document.createElementNS(ns,'svg');overlay.id='warpHandles';overlay.setAttribute('aria-label','曲面贴合控制点');$('gizmo').after(overlay);
 const panel=document.createElement('div');panel.id='warpControls';panel.hidden=true;panel.innerHTML='<div class="warp-buttons"><button type="button" id="editWarpPoints" aria-pressed="false">调整贴合点</button><button type="button" id="resetWarpPoints">重置贴合点</button></div><p class="muted compact">拖动圆点沿皮肤调整图案。W/E/R 调整整体；Ctrl+Z 撤销。跨胸口和手臂时，将投射部位设为“所有部位”。</p><p id="warpCoverage" class="muted compact"></p>';$('mappingHelp').after(panel);
 let drag=null;const selected=()=>state.layers[state.selected];
 const pinList=document.createElement('div');pinList.id='warpPointList';pinList.className='warp-buttons';pinList.style='display:flex;gap:4px;flex-wrap:wrap';
 for(let i=0;i<9;i++){const button=document.createElement('button');button.type='button';button.textContent=String(i+1);button.setAttribute('data-warp-point',i);button.setAttribute('aria-label','拖动贴合点 '+(i+1));button.style='min-width:26px;padding:4px 7px;touch-action:none';pinList.append(button)}panel.insertBefore(pinList,$('warpCoverage'));
 const node=(tag,attrs)=>{const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);overlay.append(e);return e};
 function pointOnScreen(p,showHidden=false){const eye=cameraBasis().position;if(!p)return null;const hidden=!surfacePointVisible(state.parts,eye,p.position);if(hidden&&!showHidden)return null;const s=screen(p.position);return s?{...s,world:p.position,hidden}:null}
 const visiblePoint=(l,q)=>pointOnScreen(warpSurfacePoint(l,state.parts,q,state.previewPose));
 function draw(){
  overlay.replaceChildren();const l=selected();panel.hidden=l?.projection!=='warp';$('editWarpPoints').setAttribute('aria-pressed',String(!!state.warpEditing));
  if(l?.projection!=='warp'||!l.placed||l.visible===false||!state.handlesVisible||!state.warpEditing||state.liquifyActive)return;
  const box=canvas.getBoundingClientRect();overlay.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);const entry=prepareWarp(l,state.parts),points=l.warp?.points||defaultWarpPoints();
  $('warpCoverage').textContent=entry?.visited?'虚线圆点位于遮挡处；也可将下方编号拖到皮肤上重新定位。相邻点会让位以避免翻折。':'';
  for(let axis=0;axis<2;axis++)for(let row=0;row<3;row++){
   let path='',pen=false,previous=null;for(let step=0;step<=24;step++){const t=step/24*2,k=Math.min(1,Math.floor(t)),f=t-k,a=points[axis?k*3+row:row*3+k],b=points[axis?(k+1)*3+row:row*3+k+1],p=visiblePoint(l,a.map((v,i)=>v+(b[i]-v)*f));if(!p){pen=false;previous=null;continue}if(previous&&Math.hypot(...sub(previous,p.world))>Math.max(.015,Math.max(l.width,l.height)/800))pen=false;path+=(pen?'L':'M')+p.x+','+p.y;pen=true;previous=p.world}node('path',{d:path,class:'warp-grid-line'});
  }
  points.forEach((q,i)=>{const p=pointOnScreen(warpControlPoint(l,state.parts,i,state.previewPose),true);pinList.children[i].setAttribute('aria-pressed',String(drag?.index===i));if(!p)return;node('circle',{cx:p.x,cy:p.y,r:drag?.index===i?7:i===4?6:5,class:'warp-control','data-warp-point':i,'aria-label':'贴合点 '+(i+1),opacity:p.hidden?.45:1,'stroke-dasharray':p.hidden?'2 2':'none'});node('circle',{cx:p.x,cy:p.y,r:12,fill:'transparent',class:'warp-control-hit','data-warp-point':i,'aria-label':'拖动贴合点 '+(i+1)});const label=node('text',{x:p.x+9,y:p.y-9,fill:'#dbf7fc','font-size':10,'paint-order':'stroke',stroke:'#07141c','stroke-width':2,'pointer-events':'none',opacity:p.hidden?.6:1});label.textContent=String(i+1);});
 }
 $('editWarpPoints').onclick=()=>{const l=selected();if(!l||l.projection!=='warp')return;state.warpEditing=!state.warpEditing;state.handlesVisible=true;updateUI()};
 $('resetWarpPoints').onclick=()=>{const l=selected();if(!l||l.projection!=='warp')return;l.warp={version:1,points:defaultWarpPoints()};state.warpEditing=true;state.handlesVisible=true;changed();updateUI();status('曲面贴合点已重置。')};
 function startDrag(e,fromList=false){
  const index=e.target.getAttribute('data-warp-point'),layer=selected();if(index===null||!layer||state.exporting||e.button!==0)return;
  if(layer.projection!=='warp'||!layer.placed)return;
  const point=warpControlPoint(layer,state.parts,Number(index),state.previewPose),pin=point&&screen(point.position),rect=canvas.getBoundingClientRect();if(!pin&&!fromList)return;
  e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);drag={index:Number(index),layer,id:e.pointerId,offset:fromList?[0,0]:[e.clientX-rect.left-pin.x,e.clientY-rect.top-pin.y]};state.externalDragging=true;state.warpEditing=true;state.handlesVisible=true;
 }
 overlay.addEventListener('pointerdown',e=>startDrag(e));pinList.addEventListener('pointerdown',e=>startDrag(e,true));
 window.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;e.preventDefault();const x=e.clientX-drag.offset[0],y=e.clientY-drag.offset[1],rect=canvas.getBoundingClientRect();if(x<rect.left||x>rect.right||y<rect.top||y>rect.bottom)return;
  const hit=pick(x,y);if(!hit||!expandWarpToHit(drag.layer,state.parts,hit))return;
  const q=warpHit(drag.layer,hit,true);if(!q)return;const points=moveWarpPoint(drag.layer.warp?.points||defaultWarpPoints(),drag.index,q);if(!points)return;
  drag.layer.warp={...drag.layer.warp,version:1,points};rememberWarpPin(drag.layer,drag.index,hit);changed();updateUI();
 });
 const end=e=>{if(!drag||e.pointerId!==drag.id)return;drag=null;state.externalDragging=false;status('贴合点已更新。保存设计后会保留，并用于游戏纹身输出。')};
 window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);
 document.addEventListener('tattoo:transform-tool',()=>{state.warpEditing=false;draw()});return {draw};
}

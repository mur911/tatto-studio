import {beginPointerSort,HOLD_MS} from './hold-sort.mjs';
import {state,$,canvas,gl,add,sub,mul,unit,cross,textureAlpha,pick,changed,updateUI,status,render} from './app.js';
import {uprightFrame,projectionRadius} from './transform-math.mjs';
import {tangentFrame} from './surface-math.mjs';
import {stampSamples} from './stamp-hit.mjs';
import {editPoseLayer} from './pose-edit.mjs';
export function installPlacement(){
 let gesture=null,ghost=null;
 function startSort(pending,point){
  if(gesture!==pending||!pending.row.isConnected)return false;
  clearTimeout(pending.timer);gesture=null;
  const original=[...state.layers],selection=original[state.selected];state.externalDragging=true;
  return beginPointerSort(pending.event,{row:pending.row,container:$('layers'),selector:'.layer',key:'layer',initialPoint:point,
   onCommit:ids=>{state.layers=ids.map(id=>original[Number(id)]).reverse();state.selected=state.layers.indexOf(selection);changed();updateUI();status('图层顺序已调整；列表上层覆盖下层。保存设计后保留。')},
   onFinish:()=>{state.externalDragging=false}});
 }
 function select(index,active=true){state.selected=index;state.handlesVisible=active;updateUI();render()}
 function choose(hit){
  if(hit)for(let i=state.layers.length-1;i>=0;i--){const l=state.layers[i],samples=stampSamples(l,hit);if(samples.reduce((sum,s)=>sum+textureAlpha(l.texture,s.q,l.removeWhite)*s.weight,0)*l.opacity/100>2/255){select(i);status('已选中「'+l.name+'」；使用 W/E/R 调整，点击空白隐藏手柄。');return}}
  state.handlesVisible=false;updateUI();render();status('已取消选中。拖入图层放置，或点击已有纹身编辑。');
 }
 state.onModelClick=hit=>choose(hit);
 state.decorateLayer=(row,l,index)=>{
  row.onpointerdown=e=>{
   const handle=e.target.closest('.layer-sort-handle');
   if(e.button!==0||state.exporting||document.querySelector('main').inert||(!handle&&e.target.closest('button,input')))return;
   e.preventDefault();
   gesture={row,layer:l,index,x:e.clientX,y:e.clientY,id:e.pointerId,moved:false,event:e,sortHandle:!!handle};try{row.setPointerCapture(e.pointerId)}catch{}
   const pending=gesture;pending.timer=setTimeout(()=>{if(gesture===pending&&!pending.moved)startSort(pending)},HOLD_MS);
  };
 };
 window.addEventListener('pointermove',e=>{
  if(!gesture||e.pointerId!==gesture.id)return;const a=gesture;
  if(!a.moved&&Math.hypot(e.clientX-a.x,e.clientY-a.y)<6)return;
  if(!a.moved){const box=$('layers').getBoundingClientRect(),inside=e.clientX>=box.left&&e.clientX<=box.right&&e.clientY>=box.top&&e.clientY<=box.bottom;
   if(a.sortHandle||(inside&&Math.abs(e.clientY-a.y)>=Math.abs(e.clientX-a.x)*1.5)){startSort(a,e);return}
  }
  if(!a.moved){clearTimeout(a.timer);a.moved=true;state.externalDragging=true;document.body.classList.add('placing-layer');ghost=document.createElement('div');ghost.className='placement-ghost';const image=document.createElement('img');image.src=a.layer.image;image.draggable=false;const label=document.createElement('span');label.textContent='松开以放置';ghost.append(image,label);document.body.append(ghost);status('拖到模型表面，松开鼠标放置；拖到空白则取消。')}
  ghost.style.left=e.clientX+14+'px';ghost.style.top=e.clientY+14+'px';e.preventDefault();
 });
 function end(e,cancelled=false){
  if(!gesture||e.pointerId!==gesture.id)return;const a=gesture;clearTimeout(a.timer);gesture=null;ghost?.remove();ghost=null;state.externalDragging=false;document.body.classList.remove('placing-layer');
  if(!a.moved)return;if(cancelled){status('已取消放置');return}
  const r=canvas.getBoundingClientRect(),element=document.elementFromPoint(e.clientX,e.clientY);
  const overModel=e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom&&(element===canvas||element?.closest('#gizmo,#warpHandles'));
  const hit=overModel?pick(e.clientX,e.clientY):null;
  if(!hit){status('这里没有模型表面，原位置保持不变。');return}
  const l=a.layer,first=!l.placed,display=editPoseLayer(l,state.parts,state.previewPose);if(!first&&display!==l)Object.assign(l,Object.fromEntries(['right','up','normal'].map(key=>[key,[...display[key]]])));if(!l.projection||l.projection==='uv')l.projection='surface';
  // Align to the full smooth surface normal until the user deliberately rotates.
  if(first||l.surfaceFollow===true)Object.assign(l,tangentFrame(hit.normal,first?null:l));
  if(first){l.angle=0;l.metricProjection=true;}
  l.center=['cylindrical','spherical'].includes(l.projection)?sub(hit.position,mul(l.normal,projectionRadius(l))):[...hit.position];l.part=hit.part;l.placementPose=state.previewPose||'rest';l.placed=true;
  state.selected=a.index;state.handlesVisible=true;changed();updateUI();status('已放置「'+l.name+'」。点击纹身选中；点击空白隐藏手柄。');
 }
 window.addEventListener('pointerup',e=>end(e));window.addEventListener('pointercancel',e=>end(e,true));
 // Layer-list clicks select, but never reposition the stamp.
 state.selectLayer=index=>select(index,true);
}

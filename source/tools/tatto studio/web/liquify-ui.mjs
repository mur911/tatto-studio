import {state,$,canvas,pick,render,changed,updateUI,status,sub,add,mul,cross,unit} from './app.js';
import {MAX_PUSHES,createPushes} from './liquify-math.mjs';
import {prepareWarp,warpHit} from './surface-warp.mjs';
export function installLiquify({screen}){
 const ns='http://www.w3.org/2000/svg',cursor=document.createElementNS(ns,'svg'),ring=document.createElementNS(ns,'path');
 cursor.id='liquifyCursor';cursor.setAttribute('hidden','');cursor.setAttribute('aria-hidden','true');cursor.append(ring);document.body.append(cursor);
 let active=false,gesture=null,pending=null,frame=0,lastHit=null,viewPointer=null;
 const selected=()=>state.layers[state.selected],valid=l=>l?.placed&&l.visible!==false&&['surface','cylindrical','spherical','warp'].includes(l.projection||'surface');
 const radius=()=>Number($('liquifySize').value)/200,strength=()=>Number($('liquifyStrength').value)/100;
 function refresh(){
  const l=selected();$('liquifyPush').disabled=!valid(l)||state.exporting||state.previewLoading||!state.liquifySupported;
  if(active&&$('liquifyPush').disabled)setActive(false);
  $('liquifyPush').title='液化推拉支持平面、圆柱、球形和曲面贴合；先选择已放置的可见图层。';$('liquifyPush').setAttribute('aria-pressed',String(active));$('liquifyBar').hidden=!active;
  $('liquifyReset').disabled=!l?.liquify?.strokes?.length;$('liquifyCount').textContent=(l?.liquify?.strokes?.length||0)+' / '+MAX_PUSHES;
  $('liquifySizeOut').textContent=$('liquifySize').value+' cm';$('liquifyStrengthOut').textContent=$('liquifyStrength').value+'%';
 }
 function setActive(value){
  if(value&&!valid(selected()))return;
  active=value;state.liquifyActive=active;canvas.classList.toggle('liquify-painting',active);
  if(!active){finish();state.handlesVisible=!!selected()?.placed&&selected()?.visible!==false;cursor.setAttribute('hidden','');for(const button of document.querySelectorAll('[data-transform]'))button.setAttribute('aria-pressed',String(button.dataset.transform===state.transformMode));}
  else{state.handlesVisible=false;for(const button of document.querySelectorAll('[data-transform]'))button.setAttribute('aria-pressed','false');status('液化推拉：图案上拖动推拉；空白处左拖旋转，右拖平移；Alt＋左拖也可旋转，Ctrl＋Z 撤回整笔。');}
  refresh();render();
 }
 function showCursor(hit){
  lastHit=hit;if(!active||!hit){cursor.setAttribute('hidden','');return}
  const helper=Math.abs(hit.normal[2])<.8?[0,0,1]:[0,1,0],right=unit(cross(hit.normal,helper)),up=unit(cross(hit.normal,right)),r=canvas.getBoundingClientRect();let path='';
  for(let i=0;i<=48;i++){const a=i/48*Math.PI*2,p=screen(add(hit.position,add(mul(right,Math.cos(a)*radius()),mul(up,Math.sin(a)*radius()))));if(p)path+=(i?'L':'M')+(p.x+r.left)+','+(p.y+r.top);}
  cursor.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);ring.setAttribute('d',path);cursor.removeAttribute('hidden');
 }
 const allowed=(l,hit)=>hit&&(!l.targetAtlas||l.targetAtlas===hit.atlas)&&(l.projection!=='warp'||(prepareWarp(l,state.parts),!!warpHit(l,hit)));
 function move(point){
  if(!active)return;const hit=pick(point.x,point.y);showCursor(hit);
  if(!gesture)return;
  const l=gesture.layer;if(l!==selected()||!allowed(l,hit)){gesture.last=null;return}
  if(!gesture.last){gesture.last=hit;return}
  const count=l.liquify?.strokes?.length||0,pushes=createPushes(l,gesture.last,hit,radius(),strength(),MAX_PUSHES-count);gesture.last=hit;
  if(pushes===null){if(!gesture.limited){status('当前图层的液化已达上限，可撤回或清除液化后重试。',true);gesture.limited=true;}return}
  if(!pushes.length)return;
  l.liquify={version:1,strokes:[...(l.liquify?.strokes||[]),...pushes]};gesture.modified=true;changed();refresh();
 }
 function flush(){cancelAnimationFrame(frame);frame=0;if(pending){const point=pending;pending=null;try{move(point)}catch(error){status(error.message,true)}}}
 function finish(){
  if(!gesture)return;flush();const modified=gesture?.modified;gesture=null;state.externalDragging=false;
  if(modified){updateUI();status('液化推拉已更新；保存设计后保留，Ctrl＋Z 撤回整笔。');}
 }
 canvas.addEventListener('pointerdown',e=>{
  if(!active)return;
  if(state.exporting||state.previewLoading||document.querySelector('main').inert)return;
  const l=selected(),hit=e.button===0&&!e.altKey?pick(e.clientX,e.clientY):null;
  // Decide once at pointer-down. A camera drag beginning in empty space must
  // remain a camera drag when the pointer later crosses the character.
  if(e.button!==0||e.altKey||!valid(l)||!allowed(l,hit)){viewPointer=e.pointerId;cursor.setAttribute('hidden','');return}
  viewPointer=null;e.preventDefault();e.stopImmediatePropagation();
  canvas.setPointerCapture(e.pointerId);gesture={id:e.pointerId,layer:l,last:hit,modified:false};state.externalDragging=true;showCursor(hit);
 },true);
 canvas.addEventListener('pointermove',e=>{
  if(!active)return;if(viewPointer===e.pointerId||e.altKey||e.buttons&&e.buttons!==1){cursor.setAttribute('hidden','');return}
  e.stopImmediatePropagation();pending={x:e.clientX,y:e.clientY};if(!frame)frame=requestAnimationFrame(flush);
 },true);
 canvas.addEventListener('pointerleave',()=>{if(!gesture)cursor.setAttribute('hidden','')});
 window.addEventListener('pointerup',e=>{if(e.pointerId===viewPointer)viewPointer=null;if(gesture&&e.pointerId===gesture.id){finish();try{canvas.releasePointerCapture(e.pointerId)}catch{}}});
 window.addEventListener('pointercancel',()=>{viewPointer=null;finish()});window.addEventListener('blur',()=>{viewPointer=null;finish()});
 $('liquifyPush').onclick=()=>setActive(!active);
 $('liquifyReset').onclick=()=>{const l=selected();if(!l?.liquify?.strokes?.length)return;delete l.liquify;changed();updateUI();status('已清除当前图层的液化；Ctrl＋Z 可以恢复。');};
 for(const id of ['liquifySize','liquifyStrength'])$(id).oninput=()=>{refresh();showCursor(lastHit)};
 document.addEventListener('tattoo:transform-tool',()=>{if(active)setActive(false)});
 refresh();return {refresh,setActive};
}

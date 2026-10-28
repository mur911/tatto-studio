import {state,$,gl,loadImage,layerTexture,changed,updateUI,status} from './app.js';
import {History} from './history.mjs';
export function installUndo(){
 const history=new History(),clone=l=>{const {texture,image,...data}=l;return {...structuredClone(data),image}},snapshot=()=>({layers:state.layers.map(clone),selected:state.selected,bakeResolution:state.bakeResolution,title:$('projectTitle').value});
 let restoring=false,busy=false,textGroup=null,pointer=null;
 const buttons=()=>{$('undo').disabled=busy||!history.canUndo;$('redo').disabled=busy||!history.canRedo;};
 const previous=state.onChange;
 state.onChange=()=>{previous?.();if(!restoring){history.push(snapshot());buttons()}};
 state.onDocument=()=>{history.reset(snapshot());textGroup=null;pointer=null;buttons()};
 async function restore(direction){if(busy||state.exporting||document.querySelector('main').inert)return;const oldIndex=history.index,value=history[direction]();if(!value)return;busy=true;buttons();state.externalDragging=true;
  const created=[];
  try{const available=new Map(state.layers.map(l=>[String(l.blur||0)+'\0'+l.image,l.texture]));const layers=[];
   for(const l of value.layers){const key=String(l.blur||0)+'\0'+l.image;let tex=available.get(key);if(!tex){tex=layerTexture(await loadImage(l.image),l.blur||0);created.push(tex);available.set(key,tex);}layers.push({...structuredClone(l),texture:tex});}
   restoring=true;const keep=new Set(layers.map(l=>l.texture));for(const l of state.layers)if(!keep.has(l.texture))gl.deleteTexture(l.texture);
   state.layers=layers;state.selected=value.selected;state.bakeResolution=value.bakeResolution??2048;state.handlesVisible=!!layers[state.selected]?.placed;$('projectTitle').value=value.title;changed();updateUI();status(direction==='undo'?'已撤销上一步 · Ctrl+Shift+Z 重做':'已重做 · Ctrl+Z 撤销');
  }catch(e){history.index=oldIndex;for(const tex of created)gl.deleteTexture(tex);status(e.message,true)}finally{restoring=false;busy=false;state.externalDragging=false;buttons()}
 }
 function editable(t){return t?.isContentEditable||/^(TEXTAREA|INPUT)$/.test(t?.tagName)&&!['range','checkbox','radio','button','submit','file'].includes(t.type)}
 const commit=()=>{history.end();textGroup=null;pointer=null};
 document.addEventListener('pointerdown',e=>{if(busy)return;commit();const t=e.target;if(t.closest?.('#warpHandles,#warpPointList,#gizmo,#uvCanvas,#uvGizmo,#view')||t.type==='range'){history.begin();pointer=e.pointerId;}},true);
 window.addEventListener('pointerup',()=>{if(pointer!==null)queueMicrotask(commit)},true);
 window.addEventListener('pointercancel',()=>{if(pointer!==null)queueMicrotask(commit)},true);
 document.addEventListener('beforeinput',e=>{if(!editable(e.target)||busy)return;if(textGroup!==e.target){history.end();history.begin();textGroup=e.target;}},true);
 document.addEventListener('focusout',e=>{if(e.target===textGroup)commit()});
 $('projectTitle').addEventListener('input',()=>{if(!restoring){history.push(snapshot());buttons()}});
 $('undo').onclick=()=>restore('undo');$('redo').onclick=()=>restore('redo');
 window.addEventListener('keydown',e=>{if(!(e.ctrlKey||e.metaKey)||e.altKey)return;const key=e.key.toLowerCase();if(key!=='z'&&key!=='y')return;if(editable(e.target))return;e.preventDefault();restore(key==='y'||e.shiftKey?'redo':'undo');});
 history.reset(snapshot());buttons();return history;
}

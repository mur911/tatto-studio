// Pointer sorting shared by folders, saved designs, and the live layer stack.
export const HOLD_MS=350;
export function beginPointerSort(event,{row,container,selector,key,onCommit,onCancel,onFinish,initialPoint}){
 const initial=Array.from(container.children).filter(e=>e.matches(selector));
 if(initial.length<2){onFinish?.();return false}
 const order=()=>Array.from(container.children).filter(e=>e.matches(selector)).map(e=>e.dataset[key]);
 const before=order(),rect=row.getBoundingClientRect(),ghost=row.cloneNode(true);
 ghost.removeAttribute('id');ghost.querySelectorAll('[id]').forEach(e=>e.removeAttribute('id'));
 ghost.classList.add('sort-ghost');ghost.style.width=rect.width+'px';ghost.style.left=event.clientX+12+'px';ghost.style.top=event.clientY+12+'px';
 ghost.setAttribute('aria-hidden','true');document.body.append(ghost);document.body.classList.add('sorting-list');row.classList.add('sort-source');
 let done=false;
 try{row.setPointerCapture(event.pointerId)}catch{}
 const suppress=e=>{e.preventDefault();e.stopImmediatePropagation()};document.addEventListener('click',suppress,true);
 function restore(){for(const item of initial)container.append(item)}
 function finish(cancelled){
  if(done)return;done=true;window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);window.removeEventListener('keydown',escape);
  try{row.releasePointerCapture(event.pointerId)}catch{}
  ghost.remove();row.classList.remove('sort-source');document.body.classList.remove('sorting-list');setTimeout(()=>document.removeEventListener('click',suppress,true),0);
  const after=order();if(cancelled){restore();onCancel?.()}else if(after.some((id,i)=>id!==before[i])){Promise.resolve(onCommit(after)).catch(()=>{if(row.isConnected)restore()})}
  onFinish?.();
 }
 function move(e){
  if(e.pointerId!==event.pointerId)return;e.preventDefault();ghost.style.left=e.clientX+12+'px';ghost.style.top=e.clientY+12+'px';
  const target=document.elementFromPoint(e.clientX,e.clientY)?.closest(selector);
  if(target&&target!==row&&target.parentElement===container){const box=target.getBoundingClientRect();container.insertBefore(row,e.clientY>box.top+box.height/2?target.nextSibling:target)}
  let scroll=container;while(scroll&&scroll.scrollHeight<=scroll.clientHeight+1)scroll=scroll.parentElement;
  if(scroll){const box=scroll.getBoundingClientRect();if(e.clientY<box.top+28)scroll.scrollTop-=12;else if(e.clientY>box.bottom-28)scroll.scrollTop+=12}
 }
 function up(e){if(e.pointerId===event.pointerId)finish(false)}
 function cancel(e){if(e.pointerId===event.pointerId)finish(true)}
 function escape(e){if(e.key==='Escape'){e.preventDefault();finish(true)}}
 window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);window.addEventListener('keydown',escape);
 if(initialPoint)move(initialPoint);
 return true;
}
export function bindHoldSort(row,options){
 row.classList.add('hold-sortable');row.title='长按后上下拖动排序';
 row.addEventListener('pointerdown',event=>{
  if(options.handle&&!event.target.closest(options.handle))return;
  const grip=event.target.closest('.library-sort-handle');
  if(event.button!==0||(!grip&&event.target.closest('button,input,select,textarea'))||document.querySelector('main')?.inert||document.body.classList.contains('sorting-list'))return;
  if(options.canStart&&!options.canStart())return;
  event.preventDefault();
  let active=true;
  const cleanup=()=>{active=false;clearTimeout(timer);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',cleanup);window.removeEventListener('pointercancel',cleanup)};
  const start=point=>{if(!active||!row.isConnected)return;cleanup();options.onStart?.();beginPointerSort(event,{row,...options,initialPoint:point})};
  const move=e=>{if(e.pointerId===event.pointerId&&Math.hypot(e.clientX-event.clientX,e.clientY-event.clientY)>7)start(e)};
  const timer=setTimeout(()=>start(),HOLD_MS);
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',cleanup);window.addEventListener('pointercancel',cleanup);
 });
}

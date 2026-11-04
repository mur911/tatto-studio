// Input -> controls -> paint in one frame, with one execution per task.
const jobs=new Map();let frame=0,flushing=false;
function ensureFrame(){if(!frame&&!flushing&&jobs.size)frame=requestAnimationFrame(flushFrame)}
function flushFrame(){
 frame=0;flushing=true;const completed=new Set();
 try{for(let i=0;i<64;i++){
  const next=[...jobs.keys()].filter(e=>!completed.has(e)).sort((a,b)=>a.priority-b.priority)[0];if(!next)break;
  const value=jobs.get(next);jobs.delete(next);completed.add(next);next.fn(value);
 }}finally{flushing=false;ensureFrame()}
}
export function frameTask(fn,priority=0){
 const entry={fn,priority};
 const schedule=value=>{jobs.set(entry,value);ensureFrame()};
 schedule.flush=()=>{if(jobs.has(entry)){const value=jobs.get(entry);jobs.delete(entry);fn(value)}};
 schedule.cancel=()=>{jobs.delete(entry);if(!jobs.size&&frame){cancelAnimationFrame(frame);frame=0}};
 return schedule;
}
export function framePointer(target,fn,options){
 const task=frameTask(fn);
 target.addEventListener('pointermove',e=>{task(e)},options);
 window.addEventListener('pointerup',()=>task.flush(),true);
 window.addEventListener('pointercancel',()=>task.cancel(),true);
 window.addEventListener('blur',()=>task.flush());
 return task;
}

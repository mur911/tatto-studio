// Only presentation: keep native slider values, events, and project state intact.
let scheduled=false;
function paintRanges(){
 scheduled=false;
 for(const input of document.querySelectorAll('input[type="range"]')){
  const min=Number(input.min||0),max=Number(input.max||100);
  const percent=max>min?Math.max(0,Math.min(100,(Number(input.value)-min)/(max-min)*100)):0;
  input.style.setProperty('--range-position',`${percent}%`);
 }
}
function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(paintRanges)}}
for(const type of ['input','change','click'])document.addEventListener(type,schedule);
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
schedule();

const logo=document.querySelector('.brand-logo');
const flashElements=[logo,document.querySelector('#saveLibrary'),document.querySelector('#publish')].filter(Boolean);
let flashTimer;
function stopFlash(){clearTimeout(flashTimer);for(const element of flashElements)element.classList.remove('logo-save-flash')}
document.addEventListener('tattoo:design-saved',()=>{
 if(!logo||document.body.classList.contains('exporting'))return;
 stopFlash();
 // Restart when two separate saves complete close together.
 void logo.getBoundingClientRect().width;
 for(const element of flashElements)element.classList.add('logo-save-flash');
 flashTimer=setTimeout(stopFlash,750);
 notify('保存成功！','success');
});
logo?.addEventListener('animationend',event=>{if(event.animationName==='neonSaveFlicker')stopFlash()});
// Publishing can save several designs internally. Keep its breathing effect uninterrupted.
new MutationObserver(()=>{if(document.body.classList.contains('exporting'))stopFlash()})
 .observe(document.body,{attributes:true,attributeFilter:['class']});

let noticeTimer;
const notice=document.createElement('div');notice.className='top-notice';notice.hidden=true;
notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.setAttribute('aria-atomic','true');document.body.append(notice);
function notify(text,kind='info',duration=kind==='error'?8000:3000){
 clearTimeout(noticeTimer);notice.className='top-notice '+kind;notice.textContent=text;notice.hidden=false;
 if(duration)noticeTimer=setTimeout(()=>{notice.hidden=true},duration);
}
document.addEventListener('tattoo:notice',event=>{if(event.detail?.error)notify('操作失败：'+event.detail.text,'error')});
document.addEventListener('tattoo:operation',event=>{
 const {kind,phase,text}=event.detail||{};if(kind==='read-character'){if(phase==='start')notify(text||'正在读取角色快照…','busy',0);else if(phase==='progress')notify('正在读取：'+text,'busy',0);else if(phase==='done')notify(text||'角色读取完成','success');else if(phase==='error')notify(text||'角色读取失败','error');return}if(!['publish','export'].includes(kind))return;
 if(phase==='start')notify(kind==='export'?'正在导出模组':'正在更新','busy',0);
 else if(phase==='done')notify(kind==='export'?'模组导出完成':'更新完成','success');
 else if(phase==='error')notify(event.detail.text||'更新失败','error');
});
const fatal=document.querySelector('#fatal');
if(fatal&&!fatal.hidden&&fatal.textContent)notify('操作失败：'+fatal.textContent,'error');

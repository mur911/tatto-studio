// Resource identities are shown as user data and never translated.
export function snapshotReview({api,model,adapt,onError}){
 const panel=document.createElement('section');panel.id='snapshotReview';panel.style.cssText='padding:8px;border:1px solid #485565;margin:8px 0;font-size:12px;overflow-wrap:anywhere';
 const heading=document.createElement('strong');heading.textContent='快照匹配检查';
 const saved=document.createElement('div'),latest=document.createElement('div'),message=document.createElement('p'),details=document.createElement('div'),button=document.createElement('button');
 button.type='button';button.textContent='用当前快照另存副本';panel.append(heading,saved,latest,message,details,button);
 document.getElementById('modelSelect').parentElement.append(panel);
 let revision=0,busy=false;
 const label=(host,text,value)=>{const title=document.createElement('span'),raw=document.createElement('span');title.textContent=text;raw.dataset.userText='';raw.textContent=' '+value;host.replaceChildren(title,raw)};
 async function refresh(){
  const version=++revision,descriptor=model(),id=descriptor?.id;button.disabled=true;details.replaceChildren();
  if(!id?.startsWith('character-')){panel.hidden=true;return}panel.hidden=false;
  try{
   const info=await api('/api/models/compare',descriptor);if(version!==revision)return;
   label(saved,'设计使用的快照：',id);
   label(latest,'最近读取的快照：',info.latest?.id||'—');
   message.textContent=info.coverage?.complete===false?'部分图层使用的部位不在此快照中，请读取完整快照后再适配或发布。':!info.available?'无法核对当前游戏角色，请先读取快照。':info.compatible?'设计资源与当前游戏快照一致。':'设计资源与当前游戏角色不同。旧设计不会自动更换模型。';
   for(const missing of info.coverage?.missing||[]){const row=document.createElement('p');row.dataset.userText='';row.textContent=missing.name+' · '+missing.part;details.append(row)}
   for(const difference of info.differences){const row=document.createElement('p');row.dataset.userText='';row.textContent=difference.saved+' → '+difference.current.map(c=>c.path||c.name).join(', ');details.append(row)}
   button.disabled=busy||info.compatible;
  }catch(error){if(version===revision){message.textContent='无法核对当前游戏角色，请先读取快照。';onError(error)}}
 }
 button.onclick=async()=>{if(busy)return;busy=true;button.disabled=true;try{await adapt()}catch(error){onError(error)}finally{busy=false;await refresh()}};
 document.addEventListener('tattoo:model-loaded',()=>refresh());
 return {refresh};
}

export function chooseOriginalModels(report){
 if(report.checks?.some(c=>c.coverage?.complete===false))throw new Error('部分图层使用的部位不在此快照中，请读取完整快照后再适配或发布。');
 if(!report.requires_choice)return Promise.resolve(null);
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.style.cssText='max-width:680px;max-height:80vh;overflow:auto;background:#20242b;color:#eee;border:1px solid #65778b;padding:20px';
  const heading=document.createElement('h3'),text=document.createElement('p');heading.textContent='发布前确认模型';text.textContent='部分设计与当前游戏角色不同。取消后可适配副本；保留原模型适用于其他角色，不会自动适配当前角色。';dialog.append(heading,text);
  for(const check of report.checks.filter(c=>!c.compatible)){
   const p=document.createElement('p');p.dataset.userText='';p.textContent=check.title+' · '+check.model+'\n'+check.differences.map(d=>d.saved+' → '+d.current.map(c=>c.path||c.name).join(', ')).join('\n');p.style.whiteSpace='pre-wrap';dialog.append(p);
  }
  const cancel=document.createElement('button'),keep=document.createElement('button');cancel.textContent='取消并检查快照';keep.textContent='明确保留原模型并发布';dialog.append(cancel,keep);
  let done=false;const finish=value=>{if(done)return;done=true;dialog.close();dialog.remove();resolve(value)};
  cancel.onclick=()=>finish(false);keep.onclick=()=>finish(report.signature);dialog.oncancel=event=>{event.preventDefault();finish(false)};
  document.body.append(dialog);dialog.showModal();cancel.focus();
 });
}

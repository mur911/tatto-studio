import {readPortableDesign} from './portable-design.mjs';
import {readPreference,writePreference} from './ui-preferences.mjs';
import {bindHoldSort} from './hold-sort.mjs';
import {BAKE_VERSION,state,gl,$,fbos,addImage,loadImage,loadModel,project,validateProject,bakePNGs,render,changed,updateUI,status} from './app.js';

import {bindInlineName} from './inline-name.mjs';
export async function installLibrary(){
 let groups=[],groupId=null,designId=null,dirty=false,revision=0,loading=false,busy=false,saving=null;
 const root=$('designList'),message=$('libraryMessage');
 const storedCollapsed=readPreference('collapsedGroups',[]),collapsed=new Set(Array.isArray(storedCollapsed)?storedCollapsed.filter(id=>typeof id==='string'):[]);
 async function api(path,payload){const r=await fetch(path,payload===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':state.config.token},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok)throw new Error(data.error||'操作失败');return data;}
 function tell(text,error=false){message.textContent=text;message.classList.toggle('error',error);status(text,error);}
 function selection(){const group=groups.find(g=>g.id===groupId);return {group,design:group?.designs.find(d=>d.id===designId)};}
 function location(){const {group,design}=selection();$('saveHint').textContent=design?(dirty?'未保存的修改 · ':'已保存于 ')+design.path:group?'当前分组：'+group.name+'。新建纹身或直接带入图片后保存。':'新建一个分组，或直接带入图片并保存。';$('openDesignFolder').disabled=!group;}
 function badge(){const {group,design}=selection(),e=$('documentState');e.textContent=dirty?'● 有未保存修改':design?(design.draft?'草稿已保存':'✓ 已保存'):'未选择纹身';e.classList.toggle('unsaved',dirty);$('newDesign').textContent=group?'在「'+group.name+'」中新建纹身':'新建纹身';const details=root.querySelector('.library-design.active small');if(details&&dirty)details.textContent='编辑中 · 有未保存修改';location();}
 state.onChange=()=>{if(loading)return;dirty=true;revision++;badge();};
 function remember(){const url=new URL(locationHref());url.searchParams.delete('group');url.searchParams.delete('design');if(groupId)url.searchParams.set('group',groupId);if(designId)url.searchParams.set('design',designId);history.replaceState(null,'',url);}
 function locationHref(){return window.location.href;}
 function unique(base,existing){let value=base,i=2;while(existing.includes(value))value=base+' '+i++;return value;}
 function redraw(){
  root.replaceChildren();const count=groups.reduce((n,g)=>n+g.designs.length,0);$('libraryCount').textContent=groups.length+'组 · '+count+'个设计';
  $('groupSelect').replaceChildren();for(const g of groups){const option=document.createElement('option');option.value=g.id;option.textContent=g.name;$('groupSelect').append(option);}
  $('groupSelect').value=groupId||'';$('renameGroupName').value=selection().group?.name||'';
  if(!groups.length){const empty=document.createElement('div');empty.className='library-empty';empty.textContent='纹身库还没有分组。输入名称，点击「新建分组」。';root.append(empty);}
  const grip=label=>{const b=document.createElement('button');b.type='button';b.className='library-sort-handle';b.textContent='⠿';b.title='按住直接拖动排序';b.setAttribute('aria-label','拖动排序'+label);return b};
  const tool=(name,text,fn)=>{const button=document.createElement('button');button.className='name-action';button.type='button';button.textContent=text;button.title=name;button.setAttribute('aria-label',name);button.onclick=e=>{e.stopPropagation();fn()};return button};
  for(const g of groups){
   const choose=action(async()=>{if(groupId!==g.id){await preserve();groupId=g.id;designId=null;clear();redraw();remember();tell('已选择分组：'+g.name)}});
   const section=document.createElement('section');section.className='library-group'+(g.id===groupId?' selected':'');section.setAttribute('role','group');section.setAttribute('aria-label',g.name);section.dataset.sortGroup=g.id;bindHoldSort(section,{container:root,selector:'.library-group',key:'sortGroup',handle:'.library-group-heading',canStart:()=>!busy,onCommit:action(async ids=>{try{await api('/api/library/reorder',{kind:'groups',ids});tell('文件夹顺序已保存')}finally{await refresh()}})});
   const heading=document.createElement('div');heading.className='library-group-heading';
   const contents=document.createElement('div');contents.className='library-group-body';contents.id='group-list-'+g.id;contents.setAttribute('role','group');contents.setAttribute('aria-label',g.name+' 中的纹身');
   const disclosure=document.createElement('button');disclosure.type='button';disclosure.className='group-disclosure';disclosure.setAttribute('aria-controls',contents.id);
   const showContents=()=>{const open=!collapsed.has(g.id);contents.hidden=!open;disclosure.textContent=open?'▾':'▸';disclosure.setAttribute('aria-expanded',String(open));disclosure.setAttribute('aria-label',(open?'收起分组 ':'展开分组 ')+g.name);disclosure.title=(open?'收起':'展开')+'纹身列表'};
   const toggleContents=()=>{if(collapsed.has(g.id))collapsed.delete(g.id);else collapsed.add(g.id);writePreference('collapsedGroups',[...collapsed]);showContents()};
   disclosure.onclick=e=>{e.stopPropagation();toggleContents()};heading.onclick=e=>{if(!e.target.closest('button,input,.inline-name'))toggleContents()};showContents();
   const name=document.createElement('span');name.className='library-group-title';name.textContent=g.name;name.setAttribute('role','button');name.setAttribute('aria-label','选择分组 '+g.name);name.setAttribute('aria-pressed',String(g.id===groupId));
   const rename=bindInlineName(name,{value:()=>g.name,label:'分组 '+g.name,select:()=>{if(groupId===g.id)toggleContents();else{collapsed.delete(g.id);writePreference('collapsedGroups',[...collapsed]);choose()}},commit:async value=>{await preserve();await api('/api/library/rename',{group_id:g.id,name:value});await refresh();tell('分组已改名：'+value+'；更新游戏纹身库后生效。')}});
   const count=document.createElement('small');count.textContent=g.designs.length;
   heading.append(grip('分组 '+g.name),disclosure,name,count,tool('重命名分组 '+g.name,'✎',rename),tool('删除分组 '+g.name,'×',action(()=>remove(g))));section.append(heading,contents);
   if(!g.designs.length){const empty=document.createElement('p');empty.className='group-empty';empty.textContent='空分组 · 选中后点击「新建纹身」';contents.append(empty);}
   for(const d of g.designs){
    const row=document.createElement('div');row.className='library-design'+(d.id===designId?' active':'');row.dataset.sortDesign=d.id;bindHoldSort(row,{container:contents,selector:'.library-design',key:'sortDesign',canStart:()=>!busy,onCommit:action(async ids=>{try{await api('/api/library/reorder',{kind:'designs',group_id:g.id,ids});tell('纹身顺序已保存')}finally{await refresh()}})});
    const chooseDesign=action(async()=>{if(d.id===designId)return;await preserve();groupId=g.id;await open(d.id);tell('已从纹身库打开：'+d.title)});
    const image=document.createElement('img');image.className='design-thumbnail';image.src=d.thumbnail+'?v='+d.updated;image.alt='';image.draggable=false;image.onerror=()=>{image.hidden=true;};image.onclick=chooseDesign;
    const text=document.createElement('div');text.className='design-text';const nameRow=document.createElement('div');nameRow.className='name-row';
    const title=document.createElement('strong'),details=document.createElement('small');title.textContent=d.title;title.setAttribute('role','button');title.setAttribute('aria-label','打开设计 '+g.name+' / '+d.title);details.textContent=d.draft?'已保存草稿 · 暂不加入游戏':d.layer_count+'个图层 · '+(d.enabled?'加入游戏':'未加入游戏');
    const rename=bindInlineName(title,{value:()=>d.title,label:'纹身 '+d.title,select:chooseDesign,commit:async value=>{await preserve();await api('/api/library/rename-design',{group_id:g.id,design_id:d.id,name:value});if(designId===d.id){$('projectTitle').value=value;state.onDocument?.();}await refresh();tell('纹身已改名：'+value)}});
    nameRow.append(title,tool('重命名纹身 '+d.title,'✎',rename),tool('删除纹身 '+d.title,'×',action(()=>remove(g,d))));text.append(nameRow,details);details.onclick=chooseDesign;
    const enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=d.enabled&&!d.draft;enabled.disabled=d.draft;enabled.title=d.draft?'草稿无可用贴图，放置后保存即可发布':'加入游戏纹身库';enabled.setAttribute('aria-label','发布 '+g.name+' / '+d.title);enabled.onchange=action(async()=>{await api('/api/library/enable',{group_id:g.id,design_id:d.id,enabled:enabled.checked});await refresh();});
    row.append(grip('纹身 '+d.title),image,text,enabled);contents.append(row);
   }root.append(section);
  }badge();
 }
 async function remove(g,d){
  await preserve();const result=await api('/api/library/delete',{group_id:g.id,design_id:d?.id});
  if(groupId===g.id&&(!d||designId===d.id)){designId=null;if(!d)groupId=null;clear();}
  await refresh();remember();tell('已删除「'+(d?.title||g.name)+'」。');
  const undo=document.createElement('button');undo.textContent='撤回删除';undo.onclick=action(async()=>{await preserve();const record=await api('/api/library/restore',{ticket:result.ticket});await refresh();tell('已恢复：'+record.name)});message.append(' ',undo);
 }
 root.addEventListener('rename-error',e=>tell(e.detail,true));

 async function refresh(){groups=await api('/api/library');if(!groups.some(g=>g.id===groupId))groupId=groups[0]?.id||null;redraw();}
 function clear(){state.assetId=crypto.randomUUID();loading=true;for(const l of state.layers)gl.deleteTexture(l.texture);state.layers=[];state.selected=-1;state.bakeResolution=4096;state.handlesVisible=false;$('projectTitle').value=unique('Untitled Tattoo',selection().group?.designs.map(d=>d.title)||[]);changed();updateUI();loading=false;dirty=false;state.onDocument?.();badge();}
 async function open(id,modelOverride=null){
  const p=await api('/api/library/load',{group_id:groupId,design_id:id});validateProject(p);state.assetId=p.assetId||'library:'+groupId+':'+id;const target=modelOverride||state.model;loading=true;
  try{
   const expected=target.id||'rb';if(expected!==state.model.id){const url=expected==='rb'?'/assets/model.json':target.url;if(expected!=='rb'&&!url?.startsWith('/models/'))throw new Error('请先重新读取角色模型');await loadModel(url);$('modelSelect').value=expected;}
   for(const l of state.layers)gl.deleteTexture(l.texture);state.layers=[];state.selected=-1;
   state.bakeResolution=p.bakeResolution??2048;for(const l of p.layers)await addImage(l.image,l.name,l);
   $('projectTitle').value=p.title;designId=id;state.handlesVisible=false;changed();updateUI();dirty=false;
  }finally{loading=false;}state.onDocument?.();redraw();remember();
 }
 async function ensureGroup(){if(groupId)return;const title=$('newGroupName').value.trim()||unique('My Tattoos',groups.map(g=>g.name));const g=await api('/api/library/group',{name:title});groupId=g.id;await refresh();}
 async function save(requireInk=false){
  if(saving)return saving;
  const main=document.querySelector('main'),focused=document.activeElement,wasInert=main.inert;main.inert=true;main.setAttribute('aria-busy','true');document.body.classList.add('saving');
  saving=(async()=>{
   await ensureGroup();$('documentState').textContent='正在保存…';status('正在烘焙并写入纹身库…');await new Promise(requestAnimationFrame);const version=revision,p=structuredClone(project());if(!p.title.trim())p.title=unique('Untitled Tattoo',selection().group?.designs.map(d=>d.title)||[]);
   if(p.layers.some(l=>l.visible!==false&&l.projection==='uv'&&!fbos[l.uvAtlas]))throw new Error('此设计的UV区域不在当前模型中');
   let atlases;
   if(state.layers.some(l=>l.placed)){atlases=await bakePNGs(state.bakeResolution,(done,total)=>status('正在保存纹理 '+done+' / '+total+'…'));}
   const result=await api('/api/library/save',{group_id:groupId,design_id:designId,title:p.title,project:p,atlases,require_ink:requireInk===true});designId=result.id;dirty=revision!==version;await refresh();remember();badge();
   tell(result.draft?'草稿已保存到左侧纹身库；放好图案后再保存，即可加入游戏。':'设计已保存：'+result.title+'。左侧可重新打开，更新游戏时才会构建模组。');document.dispatchEvent(new CustomEvent('tattoo:design-saved'));return result;
  })();try{return await saving;}finally{saving=null;main.inert=wasInert;if(!wasInert)main.removeAttribute('aria-busy');document.body.classList.remove('saving');badge();if(!wasInert&&focused?.isConnected)focused.focus({preventScroll:true});}
 }
 async function preserve(){if(dirty&&(designId||state.layers.length))await save();}
 function action(fn){return async(...args)=>{if(busy)return;busy=true;root.classList.add('library-busy');for(const id of ['newGroup','newDesign','saveLibrary'])$(id).disabled=true;try{await fn(...args)}catch(e){tell(e.message,true)}finally{busy=false;root.classList.remove('library-busy');for(const id of ['newGroup','newDesign','saveLibrary'])$(id).disabled=false;}};}
 $('projectTitle').addEventListener('input',()=>{if(!loading){dirty=true;revision++;badge();}});
 $('saveLibrary').onclick=action(save);
 async function adaptPublished(target){
  const original={groupId,designId},backups=[];await refresh();
  const candidates=[];
  for(const g of groups)for(const d of g.designs){
   if(d.draft||!d.enabled)continue;const p=await api('/api/library/load',{group_id:g.id,design_id:d.id});
   const usesSkin=p.layers.some(l=>l.blendTarget==='skin'&&l.blendMode&&l.blendMode!=='normal');
   const skinStamp=target.id+':'+(state.skinReference?.created_at??'fallback');
   if((p.model?.id||'rb')===target.id&&p.bakeVersion===BAKE_VERSION&&(!usesSkin||p.skinStamp===skinStamp))continue;
   for(const l of p.layers){if(l.visible===false)continue;const key=l.projection==='uv'?l.uvAtlas:l.targetAtlas;if(key&&!fbos[key])throw new Error('「'+g.name+' / '+d.title+'」的部位 '+key+' 不在当前模型中，游戏包未更新');}
   candidates.push({groupId:g.id,...d});
  }
  if(!candidates.length)return {count:0,backups};
  for(const id of new Set(candidates.map(d=>d.groupId))){const backup=await api('/api/library/backup',{group_id:id});backups.push(backup.path);}
  let done=0;
  try{
   for(const d of candidates){groupId=d.groupId;status('正在匹配 '+(++done)+' / '+candidates.length+'：'+d.title);await open(d.id,target);changed();await save(true);}
   return {count:done,backups};
  }catch(error){throw new Error(error.message+'；适配前备份：'+backups.join('；'));}
  finally{groupId=original.groupId;if(original.designId)await open(original.designId,target);else {designId=null;clear();redraw();remember();}}
 }
 $('newGroup').onclick=action(async()=>{const title=$('newGroupName').value.trim();if(!title)throw new Error('请先输入新分组的名称');const hadGroup=!!groupId;await preserve();if(!hadGroup&&groupId&&selection().group?.name===title){$('newGroupName').value='';tell('分组已建立在本机：'+title+'，当前设计已保存。');return;}const group=await api('/api/library/group',{name:title});groupId=group.id;designId=null;$('newGroupName').value='';await refresh();clear();remember();tell('分组已建立在本机：'+group.name+'。现在可以新建纹身。');});
 $('newGroupName').onkeydown=e=>{if(e.key==='Enter')$('newGroup').click();};
 $('newDesign').onclick=action(async()=>{await preserve();await ensureGroup();designId=null;clear();const result=await api('/api/library/save',{group_id:groupId,title:$('projectTitle').value,project:project()});designId=result.id;await refresh();remember();tell('空白纹身草稿已保存。带入图片后继续编辑，再点「保存设计」。');});
 $('renameGroup').onclick=action(async()=>{if(!groupId)throw new Error('先选一个分组');await preserve();await api('/api/library/rename',{group_id:groupId,name:$('renameGroupName').value});await refresh();tell('分组已重命名；游戏名称将在更新游戏纹身库后改变。');});
 $('openLibrary').onclick=action(()=>api('/api/library/open',{}));
 $('openDesignFolder').onclick=action(()=>api('/api/library/open',{group_id:groupId,design_id:designId}));
 $('projectFile').onchange=action(async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>160*1024*1024)throw new Error('设计文件过大');const p=validateProject(readPortableDesign(JSON.parse(await file.text())));for(const layer of p.layers)await loadImage(layer.image);await preserve();await ensureGroup();designId=null;clear();state.assetId=p.assetId||crypto.randomUUID();loading=true;try{state.bakeResolution=p.bakeResolution??2048;for(const l of p.layers)await addImage(l.image,l.name,l);$('projectTitle').value=unique(p.title||'Imported Tattoo',selection().group?.designs.map(d=>d.title)||[]);changed();updateUI();}finally{loading=false;}dirty=true;revision++;await save();}finally{e.target.value='';}});
 $('publish').onclick=action(async()=>{
  const target=structuredClone(state.model),button=$('publish'),main=document.querySelector('main'),header=document.querySelector('header');button.disabled=true;main.inert=header.inert=true;main.setAttribute('aria-busy','true');state.exporting=true;document.body.classList.add('exporting');document.dispatchEvent(new CustomEvent('tattoo:operation',{detail:{kind:'publish',phase:'start'}}));
  try{if(dirty||(!designId&&state.layers.length))await save();if(!groups.some(g=>g.designs.some(d=>!d.draft)))throw new Error('还没有可加入游戏的设计。请先把图案放到模型上并保存。');
   const matched=await adaptPublished(target);const result=await api('/api/library/publish',{});while(true){await new Promise(r=>setTimeout(r,1000));const job=await api('/api/jobs/'+result.id);status(job.message,job.state==='error');if(job.state==='error')throw new Error(job.message);if(job.state==='done'){const e=$('publishInfo'),b=document.createElement('b'),p=document.createElement('p');b.textContent=job.result.updated_staging.length?'游戏纹身库已更新':'首次安装包已生成';p.textContent='目标模型：'+target.name+'。'+(job.result.updated_staging.length?'关闭游戏后，自行在Vortex部署并重启游戏。':'首次在Vortex安装：'+job.result.package);e.replaceChildren(b,p);tell('纹身库已按 '+target.name+' 生成；重新适配 '+matched.count+' 套，由你自行部署。');document.dispatchEvent(new CustomEvent('tattoo:operation',{detail:{kind:'publish',phase:'done'}}));break;}}}catch(error){const e=$('publishInfo'),b=document.createElement('b'),p=document.createElement('p');b.textContent='生成失败：游戏文件未更新';p.textContent=error.message;e.replaceChildren(b,p);throw error;}finally{button.disabled=false;state.exporting=false;main.inert=header.inert=false;main.removeAttribute('aria-busy');document.body.classList.remove('exporting');}
 });
 window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();$('saveLibrary').click();}});
 $('libraryPath').textContent=state.config.library_path||'';
 await refresh();const params=new URL(locationHref());const wanted=params.searchParams.get('design');let chosen;
 if(wanted)for(const g of groups){const d=g.designs.find(d=>d.id===wanted);if(d)chosen={g,d};}
 if(!chosen)for(const g of groups)for(const d of g.designs)if(!chosen||d.updated>chosen.d.updated)chosen={g,d};
 if(chosen){groupId=chosen.g.id;await open(chosen.d.id);tell('已恢复最近的设计：'+chosen.d.title);}else redraw();
 return {save,preserve,refresh,exportMetadata:()=>({groupName:selection().group?.name||'',assetId:state.assetId})};
}

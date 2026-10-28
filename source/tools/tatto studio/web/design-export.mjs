import {state,$,project,validateProject,bakePNGs,status} from './app.js';
import {portableDesign} from './portable-design.mjs';

export function installDesignExport(libraryUI){
 const button=$('saveProject'),menu=document.createElement('div');menu.id='designExportMenu';menu.className='design-export-menu';menu.hidden=true;
 menu.setAttribute('role','group');menu.setAttribute('aria-label','选择导出格式');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',menu.id);button.disabled=false;$('importProject').disabled=false;document.body.append(menu);
 const caption=document.createElement('p');caption.textContent='导出当前设计';caption.className='export-caption';menu.append(caption);
 function option(label,description,fn){const b=document.createElement('button'),title=document.createElement('strong'),hint=document.createElement('small');title.textContent=label;hint.textContent=description;b.type='button';b.append(title,hint);b.onclick=()=>{close();fn().catch(error=>status(error.message,true))};menu.append(b);return b}
 const jsonButton=option('可编辑设计文件 (.tattoo.json)','图片、位置、透明度、模糊、混合等全部参数；供其他工作台继续编辑。',async()=>{
  const data=portableDesign(project(),libraryUI.exportMetadata());validateProject(data);
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=(data.title||'design').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_')+'.tattoo.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  status('已导出可编辑设计：内嵌图片和全部图层参数；其他电脑可直接导入，并使用自己的角色快照。');
 });
 option('独立游戏模组 (.zip)','仅当前设计；按选中的身体快照构建，解压 archive 到游戏根目录或用 Vortex 安装。',async()=>{
  if(state.exporting||state.previewLoading||document.querySelector('main').inert)throw new Error('请等待当前操作完成');
  if(!state.layers.some(l=>l.placed))throw new Error('请先把图片放到模型上，再导出独立模组');
  const data=portableDesign(project(),libraryUI.exportMetadata()),main=document.querySelector('main'),header=document.querySelector('header');
  validateProject(data);state.exporting=true;main.inert=header.inert=true;document.body.classList.add('exporting');document.dispatchEvent(new CustomEvent('tattoo:operation',{detail:{kind:'export',phase:'start'}}));
  try{
   status('正在生成独立模组贴图…');await new Promise(requestAnimationFrame);
   const atlases=await bakePNGs(state.bakeResolution,(done,total)=>status('正在导出贴图 '+done+' / '+total+'…'));
   const response=await fetch('/api/design/export-mod',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':state.config.token},body:JSON.stringify({project:data,atlases})}),result=await response.json();if(!response.ok)throw new Error(result.error||'导出失败');
   while(true){await new Promise(r=>setTimeout(r,1000));const response=await fetch('/api/jobs/'+result.id),job=await response.json();if(!response.ok)throw new Error(job.error||'导出任务读取失败');status(job.message,job.state==='error');if(job.state==='error')throw new Error(job.message);if(job.state!=='done')continue;
    const downloads=$('downloads');downloads.replaceChildren();for(const [url,label]of [[job.download,'下载独立模组'],[job.project,'可编辑设计']]){const link=document.createElement('a');link.href=url;link.textContent=label;link.target='_blank';link.download='';downloads.append(link)}
    status('独立模组已导出：'+job.result.title+'；适配 '+job.result.model+'。由你安装或分享。');document.dispatchEvent(new CustomEvent('tattoo:operation',{detail:{kind:'export',phase:'done'}}));break;
   }
  }finally{state.exporting=false;main.inert=header.inert=false;document.body.classList.remove('exporting')}
 });
 function close(){menu.hidden=true;button.setAttribute('aria-expanded','false')}
 button.onclick=()=>{if(!menu.hidden){close();return}const box=button.getBoundingClientRect();menu.style.right=Math.max(10,innerWidth-box.right)+'px';menu.style.top=box.bottom+7+'px';menu.hidden=false;button.setAttribute('aria-expanded','true');jsonButton.focus()};
 document.addEventListener('click',event=>{if(!button.contains(event.target)&&!menu.contains(event.target))close()});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){close();button.focus()}});window.addEventListener('resize',close);
}

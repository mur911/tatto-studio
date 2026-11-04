import './i18n.mjs';
const fields=['game_directory','vortex_staging_directory','wolvenkit_cli','data_directory'];
const $=id=>document.getElementById(id),status=$('status');
let token='',session,restarting=false,currentData='';
const say=(message,error=false)=>{status.textContent=message;status.classList.toggle('error',error)};
const busy=value=>document.querySelectorAll('button,input,select').forEach(control=>control.disabled=value);
async function api(route,body={}){const response=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':token},body:JSON.stringify(body)}),value=await response.json();if(!response.ok)throw new Error(value.error||'操作失败，请查看日志了解详细原因。');return value}
function targetOption(path){const select=$('library_publish_target');if(![...select.options].some(o=>o.value===path)){const o=document.createElement('option');o.value=path;o.textContent=path;o.dataset.userText='';select.append(o)}select.value=path}
function mode(){const vortex=$('installation_mode').value==='vortex';$('section_vortex_staging_directory').hidden=!vortex;$('section_target').hidden=!vortex;$('vortex_staging_directory').required=vortex}
async function detect(){say('正在检查路径…');const value=await api('/api/setup/inspect');for(const field of fields)$(field).value=value.paths[field]||'';$('installation_mode').value=value.paths.installation_mode||'vortex';const targets=$('library_publish_target');targets.replaceChildren();const automatic=document.createElement('option');automatic.value='';automatic.textContent='自动选择当前编辑器的发布目录';targets.append(automatic);for(const path of value.library_targets||[])targetOption(path);if(value.paths.library_publish_target)targetOption(value.paths.library_publish_target);else targets.value='';mode();say('请选择或确认路径。')}
async function action(fn){busy(true);try{await fn()}catch(error){say(error.message,true)}finally{busy(false)}}
$('installation_mode').onchange=mode;$('detect').onclick=()=>action(detect);$('back').onclick=()=>location.assign('/');
for(const button of document.querySelectorAll('[data-field]'))button.onclick=()=>action(async()=>{const result=await api('/api/setup/browse',{field:button.dataset.field});if(result.path){if(button.dataset.field==='library_publish_target')targetOption(result.path);else $(button.dataset.field).value=result.path}say('请选择或确认路径。')});
$('form').onsubmit=event=>{event.preventDefault();action(async()=>{
 const paths=Object.fromEntries(fields.map(field=>[field,$(field).value.trim().replace(/^"|"$/g,'')]));Object.assign(paths,{installation_mode:$('installation_mode').value,library_publish_target:$('installation_mode').value==='vortex'?$('library_publish_target').value:'',use_existing:$('use_existing').checked});
 say('正在保存…');const saved=await api('/api/setup/save',paths);say('路径已保存，正在重启后台…');restarting=true;session?.close();
 for(let i=0;i<160;i++){await new Promise(r=>setTimeout(r,500));try{const r=await fetch('/api/config'),config=await r.json();if(config.path_restart?.id===saved.restart_id&&config.path_restart?.state==='rolled-back'){restarting=false;currentData=config.data_directory;$('data').textContent=currentData;$('back').hidden=false;session=new EventSource('/api/session?token='+encodeURIComponent(config.token));await detect();say('迁移未完成，已恢复原数据目录。请检查日志后重试。',true);return}if(config.version==='1.0.1'&&!config.needs_configuration&&config.data_directory===saved.data_directory){location.assign('/');return}}catch{}}
 restarting=false;throw new Error('服务已停止，请重新运行启动文件。');
})};
for(const id of ['game_directory','wolvenkit_cli','data_directory'])$(id).required=true;
await action(async()=>{const response=await fetch('/api/config');if(!response.ok)throw new Error('服务已停止，请重新运行启动文件。');const config=await response.json();token=config.token;currentData=config.data_directory;$('data').textContent=currentData;$('back').hidden=config.needs_configuration;session=new EventSource('/api/session?token='+encodeURIComponent(token));session.onerror=()=>{if(!restarting)say('服务已停止，请重新运行启动文件。',true)};await detect()});

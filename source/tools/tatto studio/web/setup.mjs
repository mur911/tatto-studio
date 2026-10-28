const zh = navigator.language.toLowerCase().startsWith('zh');
const words = zh ? {
  heading:'设置运行路径', intro:'已自动填写识别到的路径，确认后即可打开编辑器。',
  game:'游戏目录', staging:'Vortex 暂存目录', browse:'选择…',
  gameHelp:'选择 bin/x64/Cyberpunk2077.exe，或直接粘贴游戏根目录路径。',
  stagingHelp:'可在 Vortex → 设置 → 模组中查看。手动安装时，请选择用于生成模组文件的目录。',
  save:'保存并打开编辑器', detect:'重新检测', back:'返回编辑器',
  saved:'路径已保存，正在打开编辑器…', loading:'正在检测路径…',
  picker:'请在 Windows 选择窗口中选择路径；窗口可能在浏览器后方。',
  detected:'请确认路径。', data:'个人数据保存位置：', disconnected:'服务已停止，请重新运行 Start tatto studio.cmd。'
} : {
  saved:'Paths saved. Opening the editor…', loading:'Detecting paths…',
  picker:'Choose a path in the Windows dialog. It may appear behind your browser.',
  detected:'Check the paths before continuing.', data:'Personal data folder: ', disconnected:'The service has stopped. Run Start tatto studio.cmd again.'
};
if (zh) document.documentElement.lang='zh-CN';
for (const element of document.querySelectorAll('[data-i]')) if(words[element.dataset.i]) element.textContent=words[element.dataset.i];
const fields=['game_directory','vortex_staging_directory','wolvenkit_cli'];
const status=document.querySelector('#status');
let token='', session;
const say=(message,error=false)=>{status.textContent=message;status.classList.toggle('error',error);};
const busy=value=>document.querySelectorAll('button').forEach(button=>button.disabled=value);
async function api(route,body={}){
  const response=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':token},body:JSON.stringify(body)});
  const value=await response.json();if(!response.ok)throw new Error(value.error||'Request failed');return value;
}
async function detect(){
  say(words.loading);
  const value=await api('/api/setup/inspect');
  for(const field of fields)document.getElementById(field).value=value.paths[field]||'';
  say(words.detected);
}
async function action(fn){busy(true);try{await fn();}catch(error){say(error.message,true);}finally{busy(false);}}
document.querySelector('#detect').onclick=()=>action(detect);
document.querySelector('#back').onclick=()=>location.assign('/');
for(const button of document.querySelectorAll('[data-field]'))button.onclick=()=>action(async()=>{
  say(words.picker);const result=await api('/api/setup/browse',{field:button.dataset.field});
  if(result.path)document.getElementById(button.dataset.field).value=result.path;say(words.detected);
});
document.querySelector('#form').onsubmit=event=>{event.preventDefault();action(async()=>{
  const paths=Object.fromEntries(fields.map(field=>[field,document.getElementById(field).value.trim().replace(/^"|"$/g,'')]));
  await api('/api/setup/save',paths);say(words.saved);location.assign('/');
});};
await action(async()=>{
  const response=await fetch('/api/config');if(!response.ok)throw new Error('Cannot connect to Tatto Studio.');
  const config=await response.json();token=config.token;
  document.querySelector('#data').textContent=words.data+config.data_directory;
  document.querySelector('#back').hidden=config.needs_configuration;
  session=new EventSource('/api/session?token='+encodeURIComponent(token));
  session.onerror=()=>say(words.disconnected,true);
  await detect();
});

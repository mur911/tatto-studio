// Old snapshots contain prose from several tool versions. Only actionable resource
// notices reach the UI; full original diagnostics remain in the snapshot files.
export function modelResourceMessages(limitations=[]){
 const messages=[];
 for(const item of limitations){
  if(typeof item!=='string')continue;
  const conflict=item.match(/^(.+?)：多个模组覆盖同一资源，暂不自动选择：(.+)$/);
  if(conflict){messages.push(`${conflict[1]}：资源冲突，未自动选择。来源：${conflict[2]}`);continue}
  const mesh=item.match(/^(.+?)：没有可见的一级网格$/);
  if(mesh){messages.push(`${mesh[1]}：没有可用的预览网格。`);continue}
  const missing=item.match(/^(.+?)：找不到部署资源$/);
  if(missing){messages.push(`${missing[1]}：未找到已部署资源。`);continue}
  const component=item.match(/^([\w.-]+)：/);
  if(component)messages.push('未用于预览的组件：'+component[1]);
 }
 return [...new Set(messages)];
}
export function skinSourceMessages(data){
 if(!data)return [];
 const archives=[...new Set(Object.values(data.parts||{}).flatMap(v=>v.flatMap(s=>Object.values(s.sources||{}).map(r=>r.archive))).filter(Boolean))];
 const messages=archives.length?['贴图来源：'+archives.join(', ')]:[];
 const resolved=Object.keys(data.load_order_resolutions||{}).length;
 if(resolved)messages.push(resolved+' 处资源已按游戏加载顺序选择。');
 for(const item of data.issues||[]){
  const fallback=item.match(/^(.+?)：未解析到皮肤颜色贴图，使用参考颜色$/);
  if(fallback){messages.push(fallback[1]+'：未读取到皮肤贴图，使用参考颜色。');continue}
  const conflict=item.match(/^多个模组覆盖同一皮肤资源：(.+)$/);
  if(conflict){messages.push('皮肤资源有多个覆盖来源：'+conflict[1]);continue}
  const component=item.match(/^([\w.-]+)：/);
  messages.push(component?'皮肤资源未能读取：'+component[1]:'部分皮肤资源未能读取。');
 }
 return [...new Set(messages)];
}

// Opening a saved design restores its captured model. A new capture alone is
// never permission to overwrite a design made for a different physical body.
export function savedDesignModel(project,current){
 const model=project.model||{id:'rb'},id=model.id||'rb';
 if(id===current?.id)return current;
 if(id==='rb')return {...model,id,url:'/assets/model.json'};
 if(!/^[a-zA-Z0-9_-]+$/.test(id))throw new Error('请先重新读取角色模型');
 return {...model,id,url:'/models/'+id+'/model.json'};
}

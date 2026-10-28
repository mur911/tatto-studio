import {validateWarp} from './surface-warp.mjs';
import {validateLiquify} from './liquify-math.mjs';
export const PORTABLE_FORMAT='tattoo-workbench-design';
const layerKeys=['warp','surfaceFollow','liquify','placementPose','visible','backfaceCulling','name','image','width','height','angle','opacity','blur','depth','center','normal','right','up','placed','projection','metricProjection','cylinderScale','sphereScale','projectionScale','uvCenter','uvSize','uvAtlas','radius','wrapAngle','sphereAngle','blendSharpness','wrapMode','repeat','targetAtlas','blendMode','blendTarget','removeWhite','part'];
export function portableDesign(project,{groupName='',assetId=project.assetId}={}){
 const model=project.model||{},layers=project.layers.map(layer=>Object.fromEntries(layerKeys.filter(key=>layer[key]!==undefined).map(key=>[key,structuredClone(layer[key])])));
 for(const layer of layers)layer.blur??=0;
 return {format:PORTABLE_FORMAT,formatVersion:1,version:4,assetId:assetId||crypto.randomUUID(),title:typeof project.title==='string'&&project.title.trim()?project.title.trim():'Untitled Tattoo',groupName,layerOrder:'bottom-to-top',units:{position:'m',size:'cm',rotation:'degrees'},bakeResolution:project.bakeResolution??4096,includePubic:project.includePubic!==false,model:{id:model.id||'rb',name:model.name||project.body||'RB Female',exportProfile:model.exportProfile||'rb-female-v1'},layers};
}
export function readPortableDesign(value){
 if(!value||typeof value!=='object')throw new Error('设计文件内容无效');
 if(value.format!==undefined&&(value.format!==PORTABLE_FORMAT||value.formatVersion!==1))throw new Error('不支持此设计文件格式');
 if(value.layerOrder!==undefined&&value.layerOrder!=='bottom-to-top')throw new Error('不支持此图层顺序标记');
 if(!Array.isArray(value.layers))throw new Error('设计文件内容无效');
 if(value.assetId!==undefined&&(typeof value.assetId!=='string'||value.assetId.length>180))throw new Error('设计标识无效');
 for(const layer of value.layers){
  validateLiquify(layer.liquify);validateWarp(layer.warp);
  if(typeof layer.image!=='string'||!layer.image.startsWith('data:image/png;base64,')||layer.image.length>34*1024*1024)throw new Error('设计需内嵌 PNG 图片，不能引用另一台电脑上的文件');
  if(layer.blur!==undefined&&(!Number.isFinite(layer.blur)||layer.blur<0||layer.blur>64))throw new Error('图层模糊参数无效');
 }
 return structuredClone(value);
}

import {$,setPreviewSkinCalibration,status} from './app.js';
import {readPreference,writePreference} from './ui-preferences.mjs';
import {calibrationKey,normalizeCalibration} from './skin-calibration.mjs';

export function installSkinCalibration(){
 const names=['skinBrightness','skinTemperature','skinSaturation'];let values=normalizeCalibration();
 function paint(){
  names.forEach((name,i)=>{const n=Math.round(values[i]*100);$(name).value=n;$(name+'Number').value=n;$(name+'Out').textContent=(n>0?'+':'')+n});
 }
 function apply(){setPreviewSkinCalibration(values);paint()}
 function update(index,input){
  if(!Number.isFinite(input.valueAsNumber))return;values[index]=input.valueAsNumber/100;values=normalizeCalibration(values);
  writePreference(calibrationKey(),values);apply();
 }
 names.forEach((name,i)=>{for(const id of [name,name+'Number'])$(id).addEventListener('input',event=>update(i,event.target))});
 $('resetSkinCalibration').onclick=()=>{values=normalizeCalibration();writePreference(calibrationKey(),values);apply();status('已重置全局预览渲染基准。')};
 return {refresh(){values=normalizeCalibration(readPreference(calibrationKey()));$('skinCalibrationTarget').textContent='适用于所有角色快照';apply()}};
}

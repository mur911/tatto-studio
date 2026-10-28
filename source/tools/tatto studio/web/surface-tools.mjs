import {canvas,pick,add,mul} from './app.js';
import {projectionRadius} from './transform-math.mjs';
import {surfacePlacement} from './surface-math.mjs';
export function followMovingSurface(layer,center,screen,{hit=null,snap=false}={}){
 if(layer.surfaceFollow!==true||layer.projection==='uv')return {center:[...center]};
 if(!hit){
  const round=['cylindrical','spherical'].includes(layer.projection),anchor=round?add(center,mul(layer.normal,projectionRadius(layer))):center,point=screen(anchor),r=canvas.getBoundingClientRect();
  if(point)hit=pick(r.left+point.x,r.top+point.y);
 }
 return surfacePlacement(layer,hit,center,{snap});
}

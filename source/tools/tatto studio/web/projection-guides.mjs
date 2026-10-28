import {radians} from './transform-math.mjs';
// All sizes match shader coordinates: depth is a +/- distance, not a total diameter.
export function guideLines(l){
 if(!l.placed||l.projection==='uv'||l.projection==='warp')return [];
 const lines=[],depth=l.depth/100,w=l.width/200,h=l.height/200,r=(l.radius??5)/100,a=radians(l.wrapAngle??360)/2,b=radians(l.sphereAngle??180)/2;
 const scale=['cylindrical','spherical'].includes(l.projection)?l.projectionScale||[1,1,1]:[1,1,1];
 const world=p=>l.center.map((v,i)=>v+p[0]*scale[0]*l.right[i]+p[1]*scale[1]*l.up[i]+p[2]*scale[2]*l.normal[i]);
 const line=(points,kind='range')=>lines.push({points:points.map(world),kind});
 const curve=(fn,kind='range',steps=64)=>line(Array.from({length:steps+1},(_,i)=>fn(i/steps)),kind);
 if(l.projection==='cylindrical'){
  for(const radius of [...new Set([r,Math.max(0,r-depth),r+depth])])for(const y of [-h,h])curve(t=>[Math.sin((t*2-1)*a)*radius,y,Math.cos((t*2-1)*a)*radius],radius===r?'range':'depth');
  for(const angle of [-a,0,a])line([-h,h].map(y=>[Math.sin(angle)*r,y,Math.cos(angle)*r]),angle===0?'center':'range');
  line([[0,-h,0],[0,h,0]],'axis');
 }else if(l.projection==='spherical'){
  for(const radius of [...new Set([r,Math.max(0,r-depth),r+depth])]){
   for(const lat of [-b,0,b])curve(t=>{const lon=(t*2-1)*a;return [Math.sin(lon)*Math.cos(lat)*radius,Math.sin(lat)*radius,Math.cos(lon)*Math.cos(lat)*radius]},radius===r?'range':'depth');
   for(const lon of [-a,0,a])curve(t=>{const lat=(t*2-1)*b;return [Math.sin(lon)*Math.cos(lat)*radius,Math.sin(lat)*radius,Math.cos(lon)*Math.cos(lat)*radius]},radius===r?'range':'depth');
  }
 }else{
  const angle=l.projection==='surface'?radians(l.angle||0):0,c=Math.cos(angle),s=Math.sin(angle),point=(x,y,z)=>[x*c-y*s,x*s+y*c,z];
  for(const z of [-depth,0,depth])line([[-w,-h],[w,-h],[w,h],[-w,h],[-w,-h]].map(([x,y])=>point(x,y,z)),z===0?'range':'depth');
  for(const [x,y]of [[-w,-h],[w,-h],[w,h],[-w,h]])line([-depth,depth].map(z=>point(x,y,z)),'depth');
  line([point(-w,0,0),point(w,0,0)],'center');line([point(0,-h,0),point(0,h,0)],'center');
  if(l.projection==='triplanar'){line([[0,-h,-depth],[0,h,-depth],[0,h,depth],[0,-h,depth],[0,-h,-depth]]);line([[-w,0,-depth],[w,0,-depth],[w,0,depth],[-w,0,depth],[-w,0,-depth]]);}
 }
 return lines;
}
export function appendGuides(root,layer,screen){
 const ns='http://www.w3.org/2000/svg';
 const group=document.createElementNS(ns,'g');group.classList.add('projection-guides');group.setAttribute('pointer-events','none');group.setAttribute('aria-label','实际投影范围辅助线');
 for(const {points,kind}of guideLines(layer)){let d='',open=false;for(const p of points){const s=screen(p);if(!s){open=false;continue}d+=(open?'L':'M')+s.x+','+s.y;open=true;}if(!d)continue;const path=document.createElementNS(ns,'path');for(const [key,value]of Object.entries({d,fill:'none',stroke:{range:'#ecf9ad',depth:'#92d0ed',center:'#ffd98c',axis:'#9befb2'}[kind],'stroke-width':kind==='range'?1.5:1,'stroke-opacity':kind==='depth'?.4:.85,'stroke-dasharray':kind==='center'?'2 5':'7 5'}))path.setAttribute(key,value);path.dataset.guide=kind;group.append(path);}
 root.append(group);
}

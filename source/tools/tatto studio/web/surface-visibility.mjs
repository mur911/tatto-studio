// A small BVH over index-buffer blocks keeps pin visibility independent of
// surface normals, including pins hidden by the chest or the opposite arm.
const indices=new WeakMap();
function union(items){const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const b of items)for(let j=0;j<3;j++){lo[j]=Math.min(lo[j],b.lo[j]);hi[j]=Math.max(hi[j],b.hi[j])}return {lo,hi}}
function branch(items){const box=union(items);if(items.length<=4)return {...box,items};const widths=box.hi.map((v,i)=>v-box.lo[i]),axis=widths.indexOf(Math.max(...widths));items.sort((a,b)=>a.lo[axis]+a.hi[axis]-b.lo[axis]-b.hi[axis]);const half=items.length>>1;return {...box,left:branch(items.slice(0,half)),right:branch(items.slice(half))}}
function index(part){
 let cached=indices.get(part);if(cached?.vertices===part.vertices&&cached.indices===part.indices)return cached.root;
 const v=part.vertices,t=part.indices,blocks=[];
 for(let first=0;first<t.length;first+=192){const end=Math.min(t.length,first+192),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=first;i<end;i++){const k=t[i]*8;for(let j=0;j<3;j++){lo[j]=Math.min(lo[j],v[k+j]);hi[j]=Math.max(hi[j],v[k+j])}}blocks.push({first,end,lo,hi})}
 const root=branch(blocks);indices.set(part,{vertices:v,indices:t,root});return root;
}
function hitsBox(box,origin,direction,maxDistance){let lo=0,hi=maxDistance;for(let i=0;i<3;i++){if(Math.abs(direction[i])<1e-12){if(origin[i]<box.lo[i]||origin[i]>box.hi[i])return false;continue}let a=(box.lo[i]-origin[i])/direction[i],b=(box.hi[i]-origin[i])/direction[i];if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);if(hi<lo)return false}return true}
function blocked(part,node,o,d,max){
 if(!hitsBox(node,o,d,max))return false;
 if(!node.items)return blocked(part,node.left,o,d,max)||blocked(part,node.right,o,d,max);
 const v=part.vertices,t=part.indices;
 for(const b of node.items){if(!hitsBox(b,o,d,max))continue;for(let j=b.first;j<b.end;j+=3){
  const a=t[j]*8,i=t[j+1]*8,k=t[j+2]*8,e=[v[i]-v[a],v[i+1]-v[a+1],v[i+2]-v[a+2]],f=[v[k]-v[a],v[k+1]-v[a+1],v[k+2]-v[a+2]],p=[d[1]*f[2]-d[2]*f[1],d[2]*f[0]-d[0]*f[2],d[0]*f[1]-d[1]*f[0]],det=e[0]*p[0]+e[1]*p[1]+e[2]*p[2];if(Math.abs(det)<1e-12)continue;
  const s=[o[0]-v[a],o[1]-v[a+1],o[2]-v[a+2]],u=(s[0]*p[0]+s[1]*p[1]+s[2]*p[2])/det;if(u<0||u>1)continue;const q=[s[1]*e[2]-s[2]*e[1],s[2]*e[0]-s[0]*e[2],s[0]*e[1]-s[1]*e[0]],w=(d[0]*q[0]+d[1]*q[1]+d[2]*q[2])/det;if(w<0||u+w>1)continue;const distance=(f[0]*q[0]+f[1]*q[1]+f[2]*q[2])/det;if(distance>1e-5&&distance<max)return true;
 }}return false;
}
export function surfacePointVisible(parts,origin,point,tolerance=.0008){const delta=point.map((v,i)=>v-origin[i]),length=Math.hypot(...delta);if(length<=tolerance)return true;const direction=delta.map(v=>v/length);return !parts.some(part=>part.visible!==false&&blocked(part,index(part),origin,direction,length-tolerance))}

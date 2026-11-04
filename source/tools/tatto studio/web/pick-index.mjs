// Broad phase only. The existing exact hit/normal rules remain in app.js.
const cache=new WeakMap();
function branch(items){
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(const b of items)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],b.lo[k]);hi[k]=Math.max(hi[k],b.hi[k])}
 if(items.length<=4)return {lo,hi,items};
 const spans=hi.map((v,k)=>v-lo[k]),axis=spans.indexOf(Math.max(...spans));items.sort((a,b)=>a.lo[axis]+a.hi[axis]-b.lo[axis]-b.hi[axis]);const half=items.length>>1;
 return {lo,hi,left:branch(items.slice(0,half)),right:branch(items.slice(half))};
}
function index(part){
 let entries=cache.get(part);if(!entries){entries=[];cache.set(part,entries)}
 const entry=entries.find(e=>e.vertices===part.vertices&&e.indices===part.indices);if(entry)return entry.root;
 const vertices=part.vertices,indices=part.indices,items=[];
 for(let first=0;first<indices.length;first+=192){const end=Math.min(indices.length,first+192),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=first;i<end;i++){const at=indices[i]*8;for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],vertices[at+k]);hi[k]=Math.max(hi[k],vertices[at+k])}}items.push({first,end,lo,hi})}
 const root=items.length?branch(items):null;entries.push({vertices,indices,root});if(entries.length>2)entries.shift();return root;
}
function hits(b,o,d){let lo=0,hi=Infinity;for(let k=0;k<3;k++){if(Math.abs(d[k])<1e-12){if(o[k]<b.lo[k]||o[k]>b.hi[k])return false;continue}let a=(b.lo[k]-o[k])/d[k],c=(b.hi[k]-o[k])/d[k];if(a>c)[a,c]=[c,a];lo=Math.max(lo,a);hi=Math.min(hi,c);if(hi<lo)return false}return true}
export function pickRanges(part,origin,direction){
 const result=[],visit=node=>{if(!node||!hits(node,origin,direction))return;if(node.items){for(const item of node.items)if(hits(item,origin,direction))result.push(item)}else{visit(node.left);visit(node.right)}};
 visit(index(part));result.sort((a,b)=>a.first-b.first);return result;
}

// Split draw calls, not geometry: saved surface anchors and T-pose indices stay stable.
export function tattooDrawRanges(part, segment=null) {
 const first=segment?.first??0,end=Math.min(part.indices.length,first+(segment?.count??part.indices.length));
 const excluded=part.tattooExcludedRanges||[],cuts=new Set([first,end]);
 for(const r of excluded){const a=Math.max(first,r.first),b=Math.min(end,r.first+r.count);if(a<b){cuts.add(a);cuts.add(b)}}
 const bounds=[...cuts].sort((a,b)=>a-b),result=[];
 for(let i=1;i<bounds.length;i++){const a=bounds[i-1],b=bounds[i];if(b>a)result.push({first:a,count:b-a,allowInk:!excluded.some(r=>a>=r.first&&a<r.first+r.count)})}
 return result;
}

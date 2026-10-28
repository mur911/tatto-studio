// Snapshots share immutable PNG strings. Continuous gestures replace one undo step.
export class History {
 constructor(limit=80){this.limit=limit;this.items=[];this.index=-1;this.group=false;this.groupWritten=false;this.images=new Map();}
 key(value){return JSON.stringify(value,(key,v)=>{if(key==='image'&&typeof v==='string'){if(!this.images.has(v))this.images.set(v,this.images.size);return this.images.get(v)}return v});}
 reset(value){this.images.clear();this.items=[{value,key:this.key(value)}];this.index=0;this.group=false;this.groupWritten=false;}
 begin(){this.group=true;this.groupWritten=false;}
 end(){this.group=false;this.groupWritten=false;}
 push(value){const key=this.key(value);if(key===this.items[this.index]?.key)return false;this.items.splice(this.index+1);
  if(this.group&&this.groupWritten){this.items[this.index]={value,key};if(this.index>0&&this.items[this.index-1].key===key){this.items.pop();this.index--;this.groupWritten=false;}}
  else{this.items.push({value,key});this.index++;if(this.group)this.groupWritten=true;}
  if(this.items.length>this.limit+1){this.items.shift();this.index--;}return true;
 }
 undo(){this.end();return this.index>0?this.items[--this.index].value:null;}
 redo(){this.end();return this.index<this.items.length-1?this.items[++this.index].value:null;}
 get canUndo(){return this.index>0}
 get canRedo(){return this.index<this.items.length-1}
}

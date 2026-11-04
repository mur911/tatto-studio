// Reuse each unchanged chart's GPU upload across layer batches; bound old charts.
export class AttributeCache{
 constructor(gl,limit=64*1024*1024){this.gl=gl;this.limit=limit;this.entries=new Map();this.bytes=0}
 bind(data,target=this.gl.ARRAY_BUFFER){const gl=this.gl;let buffer=this.entries.get(data);if(buffer){this.entries.delete(data);this.entries.set(data,buffer)}else{while(this.entries.size&&this.bytes+data.byteLength>this.limit){const [old,handle]=this.entries.entries().next().value;gl.deleteBuffer(handle);this.entries.delete(old);this.bytes-=old.byteLength}buffer=gl.createBuffer();gl.bindBuffer(target,buffer);gl.bufferData(target,data,gl.STATIC_DRAW);this.entries.set(data,buffer);this.bytes+=data.byteLength}gl.bindBuffer(target,buffer);return buffer}
 clear(){for(const buffer of this.entries.values())this.gl.deleteBuffer(buffer);this.entries.clear();this.bytes=0}
}

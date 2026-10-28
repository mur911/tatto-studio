import {MAX_PUSHES,PUSH_TEXTURE_WIDTH,activeLiquifyStrokes} from './liquify-math.mjs';
export class LiquifyGPU{
 constructor(gl){this.gl=gl;this.supported=!!gl.getExtension('OES_texture_float');this.texture=gl.createTexture();this.key=null;
  gl.bindTexture(gl.TEXTURE_2D,this.texture);for(const [name,value]of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,name,value);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,0]));
 }
 bind(layers,locations,bakedView=false){
  const gl=this.gl,strokes=layers.map(activeLiquifyStrokes),counts=Array.from({length:4},(_,i)=>bakedView?0:strokes[i]?.length||0);
  if(counts.some(Boolean)&&!this.supported)throw new Error('当前显卡不支持液化预览');
  if(!bakedView&&counts.some(Boolean)){
   const key=JSON.stringify(strokes);if(key!==this.key){
    const data=new Float32Array(PUSH_TEXTURE_WIDTH*4*4);
    for(let row=0;row<strokes.length;row++)for(let i=0;i<Math.min(MAX_PUSHES,strokes[row].length);i++)for(const [field,name]of ['center','delta','radius','normal'].entries())data.set(strokes[row][i][name],(row*PUSH_TEXTURE_WIDTH+i*4+field)*4);
    gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,PUSH_TEXTURE_WIDTH,4,0,gl.RGBA,gl.FLOAT,data);this.key=key;
   }
  }
  gl.uniform4fv(locations.liquifyCounts,counts);return this.texture;
 }
}

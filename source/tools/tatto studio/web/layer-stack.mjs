// Three stamps + previous ink + liquify + three skin maps fit WebGL's eight units.
// Batch size is a GPU scheduling choice, never a limit on a saved design.
export const LAYER_BATCH_SIZE=3;
export function layerBatches(layers){
 const visible=layers.filter(layer=>layer.placed&&layer.visible!==false),result=[];
 let batch=[];for(const layer of visible){
  // A single chart attribute per batch keeps both-pose rendering within eight
  // vertex attributes. Another warped stamp starts a pass, without a layer cap.
  if(batch.length===LAYER_BATCH_SIZE||layer.projection==='warp'&&batch.some(l=>l.projection==='warp')){result.push(batch);batch=[]}
  batch.push(layer);
 }if(batch.length)result.push(batch);
 return result.length?result:[[]];
}

// Intermediate preview ink stays at viewport resolution, preserving the source
// image detail while editing. Only two buffers are reused regardless of count.
export class PreviewInk{
 constructor(gl){this.gl=gl;this.targets=[];this.width=0;this.height=0;}
 resize(width,height){
  if(width===this.width&&height===this.height)return;
  const gl=this.gl,targets=[];
  const dispose=items=>{for(const t of items){gl.deleteFramebuffer(t.fbo);gl.deleteRenderbuffer(t.depth);gl.deleteTexture(t.tex)}};
  try{
   for(let i=0;i<2;i++){
    const t={tex:gl.createTexture(),fbo:gl.createFramebuffer(),depth:gl.createRenderbuffer()};targets.push(t);
    gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,t.tex);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    for(const [key,value]of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,key,value);
    gl.bindRenderbuffer(gl.RENDERBUFFER,t.depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_STENCIL,width,height);
    gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t.tex,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_STENCIL_ATTACHMENT,gl.RENDERBUFFER,t.depth);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('多图层预览缓冲创建失败，请缩小窗口或关闭其他工作台页面后重试。');
   }
  }catch(error){dispose(targets);throw error}
  finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindRenderbuffer(gl.RENDERBUFFER,null);gl.bindTexture(gl.TEXTURE_2D,null)}
  dispose(this.targets);this.targets=targets;this.width=width;this.height=height;
 }
}

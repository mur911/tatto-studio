export function drainErrors(gl){
 const errors=[];for(let i=0;i<16;i++){const e=gl.getError();if(e===gl.NO_ERROR)break;errors.push(e);if(e===gl.CONTEXT_LOST_WEBGL)break;}return errors;
}
export function resizeTarget(gl,target,size){
 if(gl.isContextLost())throw new Error('浏览器图形上下文已丢失，请刷新工作台后重试。');
 if(target.size===size)return;
 if(size>Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)))throw new Error('浏览器图形驱动不支持此输出尺寸，请选 2K。');
 // getError is a context-wide queue: previous draw failures are not allocation failures.
 const previous=drainErrors(gl);if(previous.length)console.warn('纹理分配前已有 WebGL 错误：',previous.map(e=>'0x'+e.toString(16)));
 const tex=gl.createTexture(),fbo=gl.createFramebuffer();
 gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,tex);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
 for(const [k,v]of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);
 gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
 const status=gl.checkFramebufferStatus(gl.FRAMEBUFFER),errors=drainErrors(gl);
 if(!tex||!fbo||status!==gl.FRAMEBUFFER_COMPLETE||errors.length||gl.isContextLost()){
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindTexture(gl.TEXTURE_2D,null);if(fbo)gl.deleteFramebuffer(fbo);if(tex)gl.deleteTexture(tex);
  if(gl.isContextLost()||errors.includes(gl.CONTEXT_LOST_WEBGL))throw new Error('浏览器图形上下文已丢失，请刷新工作台后重试。');
  if(errors.includes(gl.OUT_OF_MEMORY))throw new Error('浏览器图形缓冲分配失败（OUT_OF_MEMORY）。可关闭其他工作台页面或游戏后重试，或暂选 2K。');
  throw new Error('输出纹理缓冲创建失败（FBO 0x'+status.toString(16)+'；GL '+(errors.map(e=>'0x'+e.toString(16)).join(',')||'无')+'），请保留此错误码以便排查。');
 }
 const oldTex=target.tex,oldFbo=target.fbo;target.tex=tex;target.fbo=fbo;target.size=size;
 if(oldFbo)gl.deleteFramebuffer(oldFbo);if(oldTex)gl.deleteTexture(oldTex);
}

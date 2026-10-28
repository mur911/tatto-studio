export const MAX_BLUR=64;
export function blurValue(value=0){
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>MAX_BLUR)throw new Error('模糊半径须在 0–64 像素之间');
 return value;
}
export function blurredSource(image,radius=0){
 radius=blurValue(radius);if(radius===0)return image;
 const canvas=document.createElement('canvas');canvas.width=image.naturalWidth||image.width;canvas.height=image.naturalHeight||image.height;
 const ctx=canvas.getContext('2d');if(!ctx||!('filter' in ctx))throw new Error('此浏览器不支持图层模糊，请使用新版 Chrome');
 ctx.clearRect(0,0,canvas.width,canvas.height);ctx.filter=`blur(${radius}px)`;ctx.drawImage(image,0,0);ctx.filter='none';
 return canvas;
}
export function lightDirection(azimuth=-23,elevation=38){
 const a=azimuth*Math.PI/180,e=elevation*Math.PI/180,c=Math.cos(e);
 return [Math.sin(a)*c,Math.cos(a)*c,Math.sin(e)];
}

const MAX_BYTES=24*1024*1024,MAX_PIXELS=32000000;
export const imageAccept='image/*,.jpg,.jpeg,.png,.webp,.bmp,.gif,.avif,.tif,.tiff,.tga,.ico,.svg,.dds,.psd';
function readData(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('图片读取失败'));reader.readAsDataURL(file)})}
export async function normalizeImage(file,{convert,maxTextureSize=16384}={}){
 if(!file||file.size>MAX_BYTES)throw new Error('单张图片请控制在 24 MB 以内');
 if(!file.type?.startsWith('image/')&&!/\.(png|jpe?g|webp|bmp|gif|avif|tiff?|tga|ico|svg|dds|psd|heic|heif)$/i.test(file.name))throw new Error('请选择图片文件');
 const data=await readData(file);
 let image,bitmap;
 const needsConversion=/\.(tiff?|tga|gif|dds|psd)$/i.test(file.name);
 try{
  if(needsConversion)throw new Error('Use raster decoder');
  bitmap=new Image();bitmap.src=data;await bitmap.decode();
  if(bitmap.naturalWidth*bitmap.naturalHeight>MAX_PIXELS||Math.max(bitmap.naturalWidth,bitmap.naturalHeight)>maxTextureSize)throw new RangeError('图片尺寸过大，请缩小后再试');
  if(data.startsWith('data:image/png;base64,'))image=data;
  else{
   const canvas=document.createElement('canvas');canvas.width=bitmap.naturalWidth;canvas.height=bitmap.naturalHeight;
   const context=canvas.getContext('2d');if(!context)throw new Error('图片转换失败');context.drawImage(bitmap,0,0);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   if(!blob||blob.size>MAX_BYTES)throw new RangeError('转换后的图片超过 24 MB，请缩小后重试');
   image=await readData(blob);
  }
 }catch(error){
  if(error instanceof RangeError||!convert)throw error;
  const result=await convert(data);if(result.width*result.height>MAX_PIXELS||Math.max(result.width,result.height)>maxTextureSize)throw new Error('图片尺寸过大，请缩小后再试');image=result.image;
 }
 return {image,name:file.name||'带入图片'};
}
export function installImageInput({input,area,addImage,status,isBusy,convert,maxTextureSize}){
 let importing=false,depth=0;input.accept=imageAccept;input.multiple=true;
 async function importFiles(files){
  if(importing||isBusy()){status('正在处理其他操作，请稍后带入图片',true);return}
  const list=Array.from(files||[]);if(!list.length)return;
  importing=true;area.setAttribute('aria-busy','true');
  try{
   // Decode the full batch before creating layers, so a bad file does not half-import a batch.
   const decoded=[];for(const file of list){status('正在读取图片：'+file.name);decoded.push(await normalizeImage(file,{convert,maxTextureSize}));}
   for(const item of decoded)await addImage(item.image,item.name);
   status('已带入 '+decoded.length+' 张图片；从图层列表拖到模型上放置。');
  }catch(error){status(error.message||'带入图片失败',true)}finally{importing=false;area.removeAttribute('aria-busy');input.value=''}
 }
 input.onchange=e=>importFiles(e.target.files);
 const hasFiles=e=>Array.from(e.dataTransfer?.types||[]).includes('Files');
 area.addEventListener('dragenter',e=>{if(!hasFiles(e))return;e.preventDefault();depth++;area.classList.add('image-drop-active')});
 area.addEventListener('dragover',e=>{if(!hasFiles(e))return;e.preventDefault();e.dataTransfer.dropEffect=isBusy()?'none':'copy'});
 area.addEventListener('dragleave',()=>{if(--depth<=0){depth=0;area.classList.remove('image-drop-active')}});
 area.addEventListener('drop',e=>{if(!hasFiles(e))return;e.preventDefault();e.stopPropagation();depth=0;area.classList.remove('image-drop-active');importFiles(e.dataTransfer.files)});
 // Dropping a file outside the import panel must not navigate away from unsaved work.
 document.addEventListener('dragover',e=>{if(hasFiles(e))e.preventDefault()});
 document.addEventListener('drop',e=>{if(!hasFiles(e))return;e.preventDefault();depth=0;area.classList.remove('image-drop-active')});
 const label=input.closest('.upload');if(label){label.tabIndex=0;label.setAttribute('role','button');label.setAttribute('aria-label','带入图片');label.title='点击选择图片，或从文件管理器拖入；支持常见图片格式';label.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click()}})}
 return {importFiles};
}

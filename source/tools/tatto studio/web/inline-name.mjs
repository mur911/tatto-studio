export function bindInlineName(element,{value,commit,select,maxLength=60,label='名称'}){
 let timer=null,editing=false;
 const begin=()=>{
  if(editing||!element.isConnected)return;clearTimeout(timer);editing=true;
  const input=document.createElement('input');input.type='text';input.value=String(value());input.maxLength=maxLength;input.className='inline-name-input';input.setAttribute('aria-label','重命名'+label);
  let cancelled=false,finished=false;
  const finish=async()=>{if(finished)return;finished=true;const next=input.value.trim(),old=String(value());editing=false;element.replaceChildren(document.createTextNode(cancelled||!next?old:next));if(!cancelled&&next&&next!==old){try{await commit(next)}catch(e){element.textContent=old;element.dispatchEvent(new CustomEvent('rename-error',{bubbles:true,detail:e.message}));}}};
  input.onclick=e=>e.stopPropagation();input.ondblclick=e=>e.stopPropagation();input.onpointerdown=e=>e.stopPropagation();input.onblur=finish;
  input.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();input.blur()}else if(e.key==='Escape'){e.preventDefault();cancelled=true;input.blur()}};
  element.replaceChildren(input);input.focus();input.select();
 };
 element.title='双击改名，点击空白完成';element.classList.add('inline-name');element.tabIndex=0;
 element.onclick=e=>{e.stopPropagation();if(editing)return;clearTimeout(timer);if(select)timer=setTimeout(()=>{if(element.isConnected)select()},500)};
 element.ondblclick=e=>{e.preventDefault();e.stopPropagation();begin()};
 element.onkeydown=e=>{if(editing)return;if(e.key==='F2'){e.preventDefault();begin()}else if(e.key==='Enter')select?.()};
 return begin;
}


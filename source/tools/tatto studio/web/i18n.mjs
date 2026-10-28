import {languages,translate} from './locales.mjs';
import {readPreference,writePreference} from './ui-preferences.mjs';

// Presentation only: never translate input values, user names or serialized designs.
const textRecords=new WeakMap(),attributeRecords=new WeakMap();
const ignored='script,style,textarea,code,.inline-name,.inline-name-input,#languageSelect,#projectTitle,#newGroupName,#renameGroupName,#libraryPath';
const attributes=['title','aria-label','placeholder','alt'];
let language=readPreference('language','zh-CN');
if(!languages.some(([code])=>code===language))language='zh-CN';
export const currentLanguage=()=>language;
const select=document.getElementById('languageSelect');
for(const [code,label]of languages){const option=document.createElement('option');option.value=code;option.textContent=label;option.lang=code;select.append(option)}
select.value=language;

function protectedText(node){
 const parent=node.parentElement;if(!parent||parent.closest(ignored))return true;
 // A selected tattoo's label is a user name, even if it happens to match a UI phrase.
 if(parent.closest('#selectedName')&&document.querySelector('#layers .layer.active'))return true;
 return false;
}
function text(node){
 if(protectedText(node))return;
 const value=node.data,old=textRecords.get(node),source=old&&value===old.rendered?old.source:value;
 const rendered=parentTranslation(source,node.parentElement);textRecords.set(node,{source,rendered});if(value!==rendered)node.data=rendered;
}
function parentTranslation(source,parent){return translate(source,language)}
function element(node){
 if(node.closest('script,style,textarea,code'))return;
 let records=attributeRecords.get(node);if(!records){records={};attributeRecords.set(node,records)}
 for(const name of attributes){if(name==='aria-label'&&node.matches('.library-group'))continue;const value=node.getAttribute(name);if(value===null){delete records[name];continue}const old=records[name],source=old&&value===old.rendered?old.source:value,rendered=translate(source,language);records[name]={source,rendered};if(value!==rendered)node.setAttribute(name,rendered)}
}
function visit(root){
 if(root.nodeType===Node.TEXT_NODE){text(root);return}
 if(root.nodeType!==Node.ELEMENT_NODE||root.closest('script,style,textarea,code'))return;
 element(root);
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{acceptNode:node=>node.nodeType===Node.ELEMENT_NODE&&node.matches('script,style,textarea,code')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
 while(walker.nextNode()){const node=walker.currentNode;if(node.nodeType===Node.TEXT_NODE)text(node);else element(node)}
}
const options={subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attributes};
const observer=new MutationObserver(records=>{
 observer.disconnect();
 try{
  const roots=new Set();for(const record of records){if(record.type==='childList'){for(const node of record.addedNodes)roots.add(node)}else roots.add(record.target)}
  for(const node of roots)if(node.isConnected)visit(node);
 }finally{observer.observe(document.body,options)}
});
function apply(){
 observer.disconnect();
 try{document.documentElement.lang=language;visit(document.body);visit(document.querySelector('title'));select.value=language}
 finally{observer.observe(document.body,options)}
 // Layout changes can resize the stage; renderer's existing ResizeObserver handles it.
 document.dispatchEvent(new CustomEvent('tattoo:language-changed',{detail:{language}}));
}
select.addEventListener('change',()=>{if(!languages.some(([code])=>code===select.value))return;language=select.value;writePreference('language',language);apply()});
apply();

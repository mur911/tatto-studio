import {catalog,translate,languages} from './locales.mjs';
import {readPreference} from './ui-preferences.mjs';
export function preferredLanguage(){const saved=readPreference('language',null);if(languages.some(([c])=>c===saved))return saved;for(const language of navigator.languages||[navigator.language]){const base=language.toLowerCase().split('-')[0],match=languages.find(([c])=>c.toLowerCase().split('-')[0]===base);if(match)return match[0]}return 'en'}
let lastDiagnostic='';const localizedMessages=new Set();
function rendered(value){localizedMessages.add(preferredLanguage()+'\0'+value);if(localizedMessages.size>128)localizedMessages.delete(localizedMessages.values().next().value);return value}
const rawFetch=window.fetch.bind(window);
const messageRows=new Map();
// IDs are provided with a source template so clients also work after a stale tab.
export function formatMessage(info){if(!info)return '';const template=translate(info.source||info.fallback,preferredLanguage());return rendered(template.replace(/\{(\d+)\}/g,(_,k)=>info.params?.[k]??''))}
window.fetch=async(...args)=>{const response=await rawFetch(...args),json=response.json.bind(response);response.json=async()=>{const data=await json();if(data&&typeof data==='object'){for(const field of ['error','message'])if(data[field+'_info']){if(field==='error'||data.state==='error')lastDiagnostic=String(data[field]||'');data[field]=formatMessage(data[field+'_info']);}if(data.publication?.error_info)data.publication.error=formatMessage(data.publication.error_info);if(data.result?.skin_warning_info)data.result.skin_warning=formatMessage(data.result.skin_warning_info);if(data.skin_warning_info)data.skin_warning=formatMessage(data.skin_warning_info)}return data};return response};
export const diagnostic=()=>lastDiagnostic;
export function localizeError(value){
 const text=String(value),language=preferredLanguage();if(localizedMessages.has(language+'\0'+text))return text;
 const translated=translate(text,language);
 if(translated!==text||language==='zh-CN'&&/[\u4e00-\u9fff]/.test(text)||language==='en'&&!/[\u4e00-\u9fff]/.test(text))return rendered(translated);
 lastDiagnostic=text;console.error(text);return rendered(translate('操作失败，请查看日志了解详细原因。',language));
}

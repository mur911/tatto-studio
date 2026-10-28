// Local workspace UI preferences; never part of a tattoo design or game export.
const prefix='tatto.studio.v1.';
export function readPreference(key,fallback=null){try{const raw=localStorage.getItem(prefix+key);return raw===null?fallback:JSON.parse(raw)}catch{return fallback}}
export function writePreference(key,value){try{localStorage.setItem(prefix+key,JSON.stringify(value));return true}catch{return false}}

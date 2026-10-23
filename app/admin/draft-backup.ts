import { editorValueSchema, type WritingDraft } from '../lib/draft-state';
const prefix='journal-writing-backup:v1:';
export function backupKey(username:string,key:string){return `${prefix}${encodeURIComponent(username)}:${key}`;}
export function readBackup(username:string,key:string):WritingDraft|null {
  try {const value=JSON.parse(localStorage.getItem(backupKey(username,key))||'null');if(!value||value.key!==key||typeof value.updatedAt!=='string'||!Number.isFinite(Date.parse(value.updatedAt))||typeof value.baseUpdatedAt!=='string'||!Number.isInteger(value.revision)||value.revision<0)return null;const parsed=editorValueSchema.safeParse(value.editor);return parsed.success&&(parsed.data.id||'new')===key?{...value,editor:parsed.data}:null;}catch{return null;}
}
export function writeBackup(username:string,value:WritingDraft){try{localStorage.setItem(backupKey(username,value.key),JSON.stringify(value));return true;}catch{return false;}}
export function removeBackup(username:string,key:string){try{localStorage.removeItem(backupKey(username,key));}catch{}}
export function listBackups(username:string):WritingDraft[]{try{const own=backupKey(username,'');return Object.keys(localStorage).filter(key=>key.startsWith(own)).map(key=>readBackup(username,key.slice(own.length))).filter((value):value is WritingDraft=>Boolean(value));}catch{return [];}}

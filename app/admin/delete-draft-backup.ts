import type {WritingDraft} from '../lib/draft-state';
import {readBackup,removeBackup} from './draft-backup';

export interface DraftDeletion {
  key:string;
  serverRevision:number|null;
  localFingerprint:string|null;
}
export const backupFingerprint=(value:WritingDraft|null)=>value?JSON.stringify(value):null;
const changed=()=>new Error('草稿已有新的修改，未删除更新内容。列表已刷新，请确认后重试。');

/** Delete exactly the displayed versions; a newer tab's writing is preserved. */
export async function deleteDraftBackup(username:string,expected:DraftDeletion) {
  const local=()=>backupFingerprint(readBackup(username,expected.key));
  if(local()!==expected.localFingerprint) throw changed();
  const endpoint=`/api/writing-drafts/${encodeURIComponent(expected.key)}`;
  const response=await fetch(endpoint,{credentials:'same-origin',cache:'no-store'});
  const data=await response.json() as {draft:WritingDraft|null;error?:string};
  if(!response.ok) throw new Error(data.error||'无法读取草稿，请稍后重试。');
  if((data.draft?.revision??null)!==expected.serverRevision) throw changed();
  if(data.draft) {
    const removed=await fetch(endpoint,{method:'DELETE',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:data.draft.revision})});
    if(!removed.ok) {
      const result=await removed.json() as {error?:string};
      throw new Error(result.error||'删除失败，请稍后重试。');
    }
  }
  if(local()!==expected.localFingerprint) throw changed();
  removeBackup(username,expected.key);
  if(readBackup(username,expected.key)) throw new Error('本机草稿暂时无法移除，请检查浏览器存储权限。');
}

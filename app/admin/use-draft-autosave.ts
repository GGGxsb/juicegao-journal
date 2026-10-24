'use client';
import { useEffect, useRef, useState } from 'react';
import { draftKey, type EditorValue, type WritingDraft } from '../lib/draft-state';
import { readBackup, removeBackup, writeBackup } from './draft-backup';

type Recovery={local:WritingDraft|null;server:WritingDraft|null;reloadRequired?:boolean};
type Context={owner:string;key:string;revision:number;ready:boolean;active:boolean;paused:boolean;blocked:boolean;lastSaved:string;lastLocal:string;flight:Promise<void>|null};
class DraftError extends Error{constructor(message:string,readonly status:number){super(message);}}
async function request<T>(key:string,method='GET',body?:unknown):Promise<T>{
  const response=await fetch(`/api/writing-drafts/${encodeURIComponent(key)}`,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});
  const data=await response.json();if(!response.ok)throw new DraftError(data.error||'自动备份暂时无法同步。',response.status);return data;
}
export function useDraftAutosave({username,enabled,editor,snapshot,baseUpdatedAt,busy,onRestore}:{username:string;enabled:boolean;editor:EditorValue;snapshot:string;baseUpdatedAt:string;busy:boolean;onRestore:(value:EditorValue,reason?:'discard')=>void}) {
  const [label,setLabel]=useState(''),[recovery,setRecovery]=useState<Recovery|null>(null),[ready,setReady]=useState(false),[savedFingerprint,setSavedFingerprint]=useState(''),[canRetry,setCanRetry]=useState(false);
  const context=useRef<Context|null>(null), latest=useRef({editor,snapshot,baseUpdatedAt,busy});latest.current={editor,snapshot,baseUpdatedAt,busy};
  const key=draftKey(editor),fingerprint=JSON.stringify(editor);
  function local(ctx:Context){if(draftKey(latest.current.editor)!==ctx.key)return false;const value:WritingDraft={key:ctx.key,editor:latest.current.editor,revision:ctx.revision,baseUpdatedAt:latest.current.baseUpdatedAt,updatedAt:new Date().toISOString()};const saved=writeBackup(ctx.owner,value);if(saved)ctx.lastLocal=JSON.stringify(value.editor);return saved;}
  async function persist(ctx:Context):Promise<void> {
    if(!ctx.active||!ctx.ready||ctx.paused||ctx.blocked||latest.current.busy)return;
    if(ctx.flight){await ctx.flight;if(ctx.active&&!ctx.paused&&!ctx.blocked)await persist(ctx);return;}
    const current=latest.current,serialized=JSON.stringify(current.editor);
    if(draftKey(current.editor)!==ctx.key||serialized===ctx.lastSaved)return;
    if(serialized===current.snapshot&&!ctx.revision)return;
    const backed=local(ctx);setLabel('正在自动备份…');setCanRetry(false);
    const flight=(async()=>{
      try {
        if(serialized===current.snapshot){
          await request(ctx.key,'DELETE',{revision:ctx.revision});ctx.revision=0;ctx.lastSaved=serialized;
          if(ctx.active){const pending=readBackup(ctx.owner,ctx.key);if(pending&&JSON.stringify(pending.editor)===serialized)removeBackup(ctx.owner,ctx.key);setSavedFingerprint('');setLabel('');}return;
        }
        const {draft}=await request<{draft:WritingDraft}>(ctx.key,'PUT',{editor:current.editor,revision:ctx.revision,baseUpdatedAt:current.baseUpdatedAt});
        ctx.revision=draft.revision;ctx.lastSaved=serialized;
        if(ctx.active){setSavedFingerprint(serialized);setLabel(`已自动备份 · ${new Date(draft.updatedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}`);const pending=readBackup(ctx.owner,ctx.key);if(pending&&JSON.stringify(pending.editor)===serialized)writeBackup(ctx.owner,{...pending,revision:draft.revision});}
      }catch(cause){
        if(!ctx.active)return;
        if(cause instanceof DraftError&&cause.status===409){ctx.blocked=true;setLabel(cause.message);const remote=await request<{draft:WritingDraft|null}>(ctx.key).catch(()=>({draft:null}));if(!ctx.active)return;ctx.revision=remote.draft?.revision??0;setRecovery({local:readBackup(ctx.owner,ctx.key),server:remote.draft,reloadRequired:cause.message.startsWith('原文章')});}
        else {setCanRetry(true);setLabel(backed?'已保存本机备份，服务器暂未同步':'自动备份未完成，请手动保存或重试。');}
      }
    })();ctx.flight=flight;try{await flight;}finally{ctx.flight=null;}
  }
  useEffect(()=>{
    setReady(false);setRecovery(null);setSavedFingerprint('');setLabel('');setCanRetry(false);
    if(!enabled||!username){context.current=null;return;}
    const ctx:Context={owner:username,key,revision:0,ready:false,active:true,paused:false,blocked:false,lastSaved:'',lastLocal:'',flight:null};const initialLocal=readBackup(username,key);context.current=ctx;setLabel('正在检查自动备份…');
    void request<{draft:WritingDraft|null}>(key).then(({draft})=>{
      if(!ctx.active)return;ctx.revision=draft?.revision??0;
      const localCopy=readBackup(username,key),different=(value:WritingDraft|null)=>value&&JSON.stringify(value.editor)!==latest.current.snapshot?value:null;
      const recoverServer=different(draft),recoverLocal=initialLocal||recoverServer?different(localCopy):null;
      if(recoverLocal||recoverServer){ctx.blocked=true;setRecovery({local:recoverLocal,server:recoverServer});setLabel('发现未发布的自动备份。');}
      else{ctx.lastSaved=draft?JSON.stringify(draft.editor):'';setLabel('');}
      ctx.ready=true;setReady(true);
    }).catch(()=>{
      if(!ctx.active)return;const backup=readBackup(username,key);ctx.revision=backup?.revision??0;if(initialLocal&&backup&&JSON.stringify(backup.editor)!==latest.current.snapshot){ctx.blocked=true;setRecovery({local:backup,server:null});}
      ctx.ready=true;setReady(true);setCanRetry(true);setLabel('服务器暂时不可用，将保留本机备份。');
    });
    const flush=()=>{const current=JSON.stringify(latest.current.editor);if(!ctx.blocked&&(ctx.ready||!readBackup(ctx.owner,ctx.key))&&current!==latest.current.snapshot&&current!==ctx.lastSaved)local(ctx);};
    const online=()=>{void persist(ctx);};window.addEventListener('pagehide',flush);window.addEventListener('beforeunload',flush);window.addEventListener('online',online);
    return()=>{flush();ctx.active=false;window.removeEventListener('pagehide',flush);window.removeEventListener('beforeunload',flush);window.removeEventListener('online',online);};
  },[username,key,enabled,baseUpdatedAt]);
  useEffect(()=>{
    const ctx=context.current;if(!enabled||!ctx||ctx.blocked||ctx.paused||busy)return;
    if(!ready||!ctx.ready){if(fingerprint!==snapshot&&!readBackup(ctx.owner,ctx.key))local(ctx);return;}
    if(fingerprint===snapshot&&!ctx.revision){const pending=readBackup(ctx.owner,ctx.key);if(pending&&JSON.stringify(pending.editor)===ctx.lastLocal)removeBackup(ctx.owner,ctx.key);return;}
    local(ctx);if(fingerprint!==ctx.lastSaved&&fingerprint!==snapshot)setLabel('修改已备份到本机，等待同步…');
    const timer=setTimeout(()=>void persist(ctx),1200);return()=>clearTimeout(timer);
  },[fingerprint,snapshot,ready,enabled,busy,recovery]);
  function restore(value:WritingDraft){const ctx=context.current;if(!ctx)return;ctx.blocked=false;ctx.lastSaved='';setRecovery(null);setSavedFingerprint('');onRestore(value.editor);setLabel('已恢复，正在保存未发布备份…');}
  async function discard(){const ctx=context.current;if(!ctx)return;try{if(ctx.revision)await request(ctx.key,'DELETE',{revision:ctx.revision});removeBackup(ctx.owner,ctx.key);ctx.revision=0;ctx.blocked=false;ctx.lastSaved='';setSavedFingerprint('');onRestore(JSON.parse(latest.current.snapshot) as EditorValue,'discard');setRecovery(null);setLabel('');}catch(cause){setLabel(cause instanceof Error?cause.message:'无法移除备份，请重试。');if(cause instanceof DraftError&&cause.status===409){const remote=await request<{draft:WritingDraft|null}>(ctx.key).catch(()=>({draft:null}));if(remote.draft)ctx.revision=remote.draft.revision;setRecovery({local:readBackup(ctx.owner,ctx.key),server:remote.draft});}}}
  async function prepareManual(){const ctx=context.current;if(!ctx)return;if(!ctx.ready)throw new Error('正在检查自动备份，请稍后再保存。');if(ctx.blocked)throw new Error('请先恢复或丢弃已有的自动备份。');ctx.paused=true;if(ctx.flight)await ctx.flight;if(ctx.blocked)throw new Error('备份发生冲突，请先选择要恢复的内容。');}
  async function manualSaved(){const ctx=context.current;if(!ctx)return;ctx.ready=false;try{if(ctx.revision)await request(ctx.key,'DELETE',{revision:ctx.revision});}catch{/* A newer backup from another tab is deliberately kept. */}const pending=readBackup(ctx.owner,ctx.key);if(pending&&JSON.stringify(pending.editor)===JSON.stringify(latest.current.editor))removeBackup(ctx.owner,ctx.key);setRecovery(null);setLabel('');}
  async function prepareDelete(){const ctx=context.current;if(!ctx)return;ctx.paused=true;if(ctx.flight)await ctx.flight;}
  function deleted(){const ctx=context.current;if(!ctx)return;ctx.blocked=true;ctx.paused=true;ctx.ready=false;removeBackup(ctx.owner,ctx.key);setRecovery(null);setSavedFingerprint('');setLabel('');}
  function resume(){const ctx=context.current;if(ctx){ctx.paused=false;ctx.ready=true;void persist(ctx);}}
  return {label,recovery,restore,discard,prepareManual,manualSaved,prepareDelete,deleted,resume,canRetry,retry:()=>{const ctx=context.current;if(ctx)void persist(ctx);},safelySaved:savedFingerprint===fingerprint&&Boolean(savedFingerprint)};
}

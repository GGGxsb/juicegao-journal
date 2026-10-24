'use client';
import { useEffect, useState } from 'react';
import type { WritingDraftSummary } from '../lib/draft-state';
import { listBackups } from './draft-backup';
import {backupFingerprint,deleteDraftBackup,type DraftDeletion} from './delete-draft-backup';
import './drafts.css';
type RecoverableDraft=WritingDraftSummary&DraftDeletion;
export function DraftRecoveryList({username,revision,onOpen,disabled=false,onBusyChange}:{username:string;revision:number;onOpen:(key:string)=>void;disabled?:boolean;onBusyChange?:(busy:boolean)=>void}){
  const [drafts,setDrafts]=useState<RecoverableDraft[]>([]),[refresh,setRefresh]=useState(0);
  const [deleting,setDeleting]=useState<string|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    const local:RecoverableDraft[]=listBackups(username).map(value=>({key:value.key,title:value.editor.title,postId:value.editor.id||null,updatedAt:value.updatedAt,revision:value.revision,serverRevision:null,localFingerprint:backupFingerprint(value)}));
    setDrafts(local);
    void fetch('/api/writing-drafts',{cache:'no-store',credentials:'same-origin'}).then(async response=>{
      if(!response.ok) throw new Error('无法加载服务器草稿，请重试。');
      const data=await response.json() as {drafts:WritingDraftSummary[]};
      if(!active) return;
      const byKey=new Map(local.map(value=>[value.key,value]));
      for(const value of data.drafts) {
        const existing=byKey.get(value.key),display=existing&&existing.updatedAt>value.updatedAt?existing:value;
        byKey.set(value.key,{...display,serverRevision:value.revision,localFingerprint:existing?.localFingerprint??null});
      }
      setDrafts([...byKey.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));
    }).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'草稿加载失败，请重试。');});
    return()=>{active=false;};
  },[username,revision,refresh]);
  useEffect(()=>{
    const reload=()=>setRefresh(value=>value+1);
    window.addEventListener('focus',reload);window.addEventListener('storage',reload);
    return()=>{window.removeEventListener('focus',reload);window.removeEventListener('storage',reload);};
  },[]);
  async function remove(draft:RecoverableDraft) {
    if(disabled||deleting) return;
    const name=draft.title.trim()||'未命名内容';
    if(!window.confirm(draft.postId?`删除「${name}」的自动备份？仅移除未发布修改，原文章会保留。`:`确定删除草稿「${name}」吗？本机和服务器备份都会移除，删除后无法恢复。`))return;
    setDeleting(draft.key);setError('');onBusyChange?.(true);
    try {await deleteDraftBackup(username,draft);}
    catch(cause){setError(cause instanceof Error?cause.message:'删除失败，请重试。');}
    finally {setDeleting(null);onBusyChange?.(false);setRefresh(value=>value+1);}
  }
  if(!drafts.length&&!error)return null;
  return <section className="admin-draft-list" aria-label="待恢复的自动备份"><h2>继续未完成的写作</h2><p>自动备份尚未发布，打开后可恢复。删除备份不会删除原文章。</p><div>{drafts.map(draft=><article className="admin-draft-item" key={draft.key}><button className="admin-draft-open" type="button" onClick={()=>onOpen(draft.key)} disabled={disabled||Boolean(deleting)}><strong>{draft.title.trim()||'未命名内容'}</strong><span>{new Date(draft.updatedAt).toLocaleString('zh-CN')} · 继续编辑 →</span></button><button className="admin-draft-delete" type="button" onClick={()=>void remove(draft)} disabled={disabled||Boolean(deleting)} aria-label={`${draft.postId?'删除备份':'删除草稿'}：${draft.title.trim()||'未命名内容'}`}>{deleting===draft.key?'删除中…':draft.postId?'删除备份':'删除草稿'}</button></article>)}</div>{error&&<p className="admin-draft-error" role="alert">{error}<button type="button" disabled={Boolean(deleting)} onClick={()=>{setError('');setRefresh(value=>value+1);}}>刷新列表</button></p>}</section>;
}

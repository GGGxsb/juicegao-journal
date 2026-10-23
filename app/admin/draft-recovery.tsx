'use client';
import { useEffect, useState } from 'react';
import type { WritingDraftSummary } from '../lib/draft-state';
import { listBackups } from './draft-backup';
import './drafts.css';
export function DraftRecoveryList({username,revision,onOpen}:{username:string;revision:number;onOpen:(key:string)=>void}){
  const [drafts,setDrafts]=useState<WritingDraftSummary[]>([]);
  useEffect(()=>{let active=true;const local=listBackups(username).map(value=>({key:value.key,title:value.editor.title,postId:value.editor.id||null,updatedAt:value.updatedAt}));setDrafts(local);void fetch('/api/writing-drafts',{cache:'no-store'}).then(async response=>{if(!response.ok)return;const data=await response.json() as {drafts:WritingDraftSummary[]};if(active){const byKey=new Map(local.map(value=>[value.key,value]));for(const value of data.drafts)if(!byKey.has(value.key)||byKey.get(value.key)!.updatedAt<value.updatedAt)byKey.set(value.key,value);setDrafts([...byKey.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));}}).catch(()=>{});return()=>{active=false;};},[username,revision]);
  if(!drafts.length)return null;
  return <section className="admin-draft-list" aria-label="待恢复的自动备份"><h2>继续未完成的写作</h2><p>自动备份尚未发布，打开后可恢复。</p><div>{drafts.map(draft=><button type="button" key={draft.key} onClick={()=>onOpen(draft.key)}><strong>{draft.title.trim()||'未命名内容'}</strong><span>{new Date(draft.updatedAt).toLocaleString('zh-CN')} · 继续编辑 →</span></button>)}</div></section>;
}

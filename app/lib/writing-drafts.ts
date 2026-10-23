import { z } from 'zod';
import { randomInt } from 'node:crypto';
import { env } from './platform';
import { ApiError } from './errors';
import { editorValueSchema, type WritingDraft, type WritingDraftSummary } from './draft-state';

type Row={document_key:string;editor:string;base_updated_at:string;revision:number;updated_at:string};
const keySchema=z.union([z.literal('new'),z.string().uuid()]);
const saveSchema=z.object({editor:editorValueSchema,revision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),baseUpdatedAt:z.union([z.literal(''),z.string().datetime()])}).strict();
function key(value:string){const result=keySchema.safeParse(value);if(!result.success)throw new ApiError(400,'自动备份标识无效。');return result.data;}
function record(row:Row):WritingDraft{return {key:row.document_key,editor:JSON.parse(row.editor),baseUpdatedAt:row.base_updated_at,revision:row.revision,updatedAt:row.updated_at};}
export async function getWritingDraft(owner:string,documentKey:string):Promise<WritingDraft|null> {
  const row=await env.DB.prepare('SELECT document_key,editor,base_updated_at,revision,updated_at FROM writing_drafts WHERE owner_id=? AND document_key=?').bind(owner,key(documentKey)).first<Row>();
  return row?record(row):null;
}
export async function listWritingDrafts(owner:string):Promise<WritingDraftSummary[]> {
  const {results}=await env.DB.prepare("SELECT document_key AS key,json_extract(editor,'$.title') AS title,post_id AS postId,updated_at AS updatedAt FROM writing_drafts WHERE owner_id=? ORDER BY updated_at DESC LIMIT 100").bind(owner).all<WritingDraftSummary>();return results;
}
export async function saveWritingDraft(owner:string,documentKey:string,input:unknown):Promise<WritingDraft> {
  const document=key(documentKey),parsed=saveSchema.safeParse(input);
  if(!parsed.success)throw new ApiError(400,'自动备份内容不符合要求，请检查标题、正文及内容设置。');
  const {editor,revision,baseUpdatedAt}=parsed.data,postId=document==='new'?null:document;
  if(editor.id!==(postId??''))throw new ApiError(400,'自动备份与文章不匹配。');
  if(postId){const post=await env.DB.prepare('SELECT updated_at FROM posts WHERE id=?').bind(postId).first<{updated_at:string}>();if(!post)throw new ApiError(404,'原文章已删除。');if(post.updated_at!==baseUpdatedAt)throw new ApiError(409,'原文章已在其他页面更新，请重新打开文章后再恢复修改。');}
  const now=new Date().toISOString(),values=JSON.stringify(editor);
  // A fresh generation avoids accepting a stale revision after a backup is deleted and recreated.
  const firstRevision=revision===0?randomInt(1,2**48-1):0;
  const row=revision===0
    ?await env.DB.prepare('INSERT INTO writing_drafts(owner_id,document_key,post_id,editor,base_updated_at,revision,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner_id,document_key) DO NOTHING RETURNING document_key,editor,base_updated_at,revision,updated_at').bind(owner,document,postId,values,baseUpdatedAt,firstRevision,now).first<Row>()
    :await env.DB.prepare('UPDATE writing_drafts SET editor=?,base_updated_at=?,revision=revision+1,updated_at=? WHERE owner_id=? AND document_key=? AND revision=? RETURNING document_key,editor,base_updated_at,revision,updated_at').bind(values,baseUpdatedAt,now,owner,document,revision).first<Row>();
  if(!row)throw new ApiError(409,'其他页面已保存了更新的备份。请重新载入备份，避免覆盖。');
  return record(row);
}
export async function deleteWritingDraft(owner:string,documentKey:string,revision:unknown) {
  const document=key(documentKey),expected=z.number().int().min(1).safeParse(revision);
  if(!expected.success)throw new ApiError(400,'自动备份版本无效。');
  const result=await env.DB.prepare('DELETE FROM writing_drafts WHERE owner_id=? AND document_key=? AND revision=?').bind(owner,document,expected.data).run();
  if(!result.meta.changes&&await getWritingDraft(owner,document))throw new ApiError(409,'备份已有新的修改，未移除其他页面的备份。');
}

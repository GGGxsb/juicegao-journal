import { z } from 'zod';
import { POST_CATEGORIES } from './post-categories';

const currentEditorValueSchema=z.object({
  id:z.union([z.literal(''),z.string().uuid()]),title:z.string().max(180),excerpt:z.string().max(1000),content:z.string().max(500_000),
  category:z.enum(POST_CATEGORIES),tags:z.array(z.string().max(60)).max(32),kind:z.enum(['article','note']),status:z.enum(['draft','published']),
  coverImage:z.string().max(2048).refine(value=>{if(!value)return true;if(value.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\'))return true;try{return new URL(value).protocol==='https:';}catch{return false;}}),
}).strict();
// Older browser backups still contain the removed collection fields.
// Ignore only those obsolete keys, keeping strict validation for everything else.
export const editorValueSchema=z.preprocess(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return value;
  const {collectionId:_id,collectionOrder:_order,...editor}=value as Record<string,unknown>;
  return editor;
},currentEditorValueSchema);
export type EditorValue=z.infer<typeof editorValueSchema>;
export interface WritingDraft {key:string;editor:EditorValue;baseUpdatedAt:string;revision:number;updatedAt:string}
export interface WritingDraftSummary {key:string;title:string;postId:string|null;updatedAt:string}
export const draftKey=(editor:Pick<EditorValue,'id'>)=>editor.id||'new';

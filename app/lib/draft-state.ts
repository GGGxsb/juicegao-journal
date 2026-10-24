import { z } from 'zod';
import { POST_CATEGORIES } from './post-categories';
import cityIndex from './china-city-index.json';

const validCityIds=new Set(cityIndex.map(city=>city.id));
export const cityIdsSchema=z.array(z.string().refine(id=>validCityIds.has(id),'请选择地图中的有效城市。'))
  .max(32,'每篇文章最多关联 32 个城市。').transform(ids=>[...new Set(ids)]);

const currentEditorValueSchema=z.object({
  id:z.union([z.literal(''),z.string().uuid()]),title:z.string().max(180),excerpt:z.string().max(1000),content:z.string().max(500_000),
  category:z.enum(POST_CATEGORIES),tags:z.array(z.string().max(60)).max(32),status:z.enum(['draft','published']),
  // Keep absence distinct from [] so restoring an older backup cannot erase cities.
  cityIds:cityIdsSchema.optional(),
  coverImage:z.string().max(2048).refine(value=>{if(!value)return true;if(value.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\'))return true;try{return new URL(value).protocol==='https:';}catch{return false;}}),
}).strict();
// Older browser backups may contain removed collection and post-kind fields.
// Ignore only those obsolete keys, keeping strict validation for everything else.
export const editorValueSchema=z.preprocess(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return value;
  const {collectionId:_id,collectionOrder:_order,kind:_kind,...editor}=value as Record<string,unknown>;
  return editor;
},currentEditorValueSchema);
export type EditorValue=z.infer<typeof editorValueSchema>;
export interface WritingDraft {key:string;editor:EditorValue;baseUpdatedAt:string;revision:number;updatedAt:string}
export interface WritingDraftSummary {key:string;title:string;postId:string|null;updatedAt:string}
export const draftKey=(editor:Pick<EditorValue,'id'>)=>editor.id||'new';

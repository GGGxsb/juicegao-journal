import type { PagesSnapshot, } from './lib/pages-snapshot';
import data from './data/snapshot.json';
export const snapshot=data as unknown as PagesSnapshot;
export const basePath=process.env.NEXT_PUBLIC_PAGES_BASE_PATH||'';
export const sourceOrigin=process.env.NEXT_PUBLIC_PAGES_SOURCE_ORIGIN||'';
export function siteHref<T>(value:T):T{
  if(typeof value!=='string'||!value||!value.startsWith('/')||value.startsWith('//'))return value;
  if(value==='/admin'||value.startsWith('/admin/'))return (sourceOrigin+value) as T;
  if(basePath&&(value===basePath||value.startsWith(basePath+'/')||value.startsWith(basePath+'?')))return value;
  return (basePath+value) as T;
}
export function paginate<T>(items:T[],params:URLSearchParams,defaultSize=15){
  const positive=(key:string,fallback:number,max:number)=>{const n=Number(params.get(key));return Number.isSafeInteger(n)&&n>0?Math.min(n,max):fallback;};
  const pageSize=positive('pageSize',defaultSize,50),total=items.length,totalPages=Math.max(1,Math.ceil(total/pageSize)),page=Math.min(positive('page',1,Number.MAX_SAFE_INTEGER),totalPages);
  return {items:items.slice((page-1)*pageSize,page*pageSize),pagination:{page,pageSize,total,totalPages}};
}
export function collection(params:URLSearchParams){
  const category=params.get('category')||'全部',tag=params.get('tag')||'',query=(params.get('q')||'').trim().toLowerCase();
  const posts=snapshot.posts.filter(post=>(category==='全部'||post.category===category)&&(!tag||post.tags.includes(tag))&&(!query||[post.title,post.excerpt,post.content,post.category,...post.tags].some(value=>value.toLowerCase().includes(query))));
  const {items,pagination}=paginate(posts,params);
  return {posts:items,pagination,stats:snapshot.stats,categories:['Daily Life','Technical']};
}
export async function siteFetch(input:RequestInfo|URL,options?:RequestInit):Promise<Response>{
  if(typeof input!=='string')throw new Error('Static requests must use a URL string');
  if(input.startsWith('/api/')){
    if(options?.method&&options.method!=='GET')return Response.json({error:'请到原站进行互动。'},{status:405});
    if(options?.signal?.aborted)throw new DOMException('Aborted','AbortError');
    const url=new URL(input,'https://static.invalid');
    if(url.pathname==='/api/posts')return Response.json(collection(url.searchParams));
    if(url.pathname==='/api/github-contributions')return Response.json(snapshot.github||{status:'disabled'});
    // Optional GitHub cards gracefully retain their repository link without a live API.
    return Response.json({error:'静态站点不提供此接口。'},{status:404});
  }
  return fetch(siteHref(input)!,options);
}

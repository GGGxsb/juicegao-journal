import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { pagesSnapshotSchema, pagesGithubSchema } from '../app/lib/pages-snapshot';
class SyncHttpError extends Error { constructor(public status:number,resource:string){super(`Sync failed: HTTP ${status} at ${resource}`);} }

const root=process.cwd(), directory=path.join(root,'.pages-content');
const raw=process.env.PAGES_SOURCE_URL;
if(!raw)throw new Error('Set PAGES_SOURCE_URL to the Tencent website HTTPS origin.');
const source=new URL(raw);
if(source.username||source.password||source.search||source.hash||source.pathname!=='/'||!(source.protocol==='https:'||(source.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(source.hostname))))throw new Error('PAGES_SOURCE_URL must be an HTTPS origin without credentials, path or query.');

async function downloadOnce(url:URL,limit:number) {
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(90000),headers:{accept:'application/json,image/*'}});
  if(!response.ok){await response.body?.cancel();throw new SyncHttpError(response.status,url.pathname);}
  if(Number(response.headers.get('content-length')||0)>limit)throw new Error(`Response too large at ${url.pathname}`);
  const chunks:Uint8Array[]=[];let size=0;
  if(!response.body)throw new Error('Empty response stream');
  const reader=response.body.getReader();
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Error(`Response too large at ${url.pathname}`);chunks.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  finally{reader.releaseLock();}
  return Buffer.concat(chunks);
}

async function download(url:URL,limit:number):Promise<Buffer> {
  for(let attempt=0;;attempt++){
    try{return await downloadOnce(url,limit);}
    catch(error){
      const code=error instanceof Error&&error.cause&&typeof error.cause==='object'&&'code' in error.cause?String(error.cause.code):'';
      const transient=error instanceof SyncHttpError?[429,502,503,504].includes(error.status):['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EAI_AGAIN','ENOTFOUND','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT'].includes(code)||(error instanceof Error&&error.name==='TimeoutError');
      if(!transient||attempt>=3)throw error;
      console.warn(`Retrying ${url.pathname} after a temporary connection failure (${attempt+2}/4).`);
      await pause([1000,3000,7000][attempt]);
    }
  }
}

const readJson=async(resource:string)=>JSON.parse((await download(new URL(resource,source),64*1024*1024)).toString('utf8'));
async function publicApiSnapshot(){
  const settings=await readJson('/api/settings'),first=await readJson('/api/posts?scope=published&page=1&pageSize=50');
  const posts=[...first.posts];
  if(!Number.isSafeInteger(first.pagination?.totalPages)||first.pagination.totalPages>200)throw new Error('Invalid public pagination');
  for(let page=2;page<=first.pagination.totalPages;page++){
    const result=await readJson(`/api/posts?scope=published&page=${page}&pageSize=50`);
    if(result.pagination.page!==page||result.pagination.total!==first.pagination.total)throw new Error('Content changed during synchronization; retry.');
    posts.push(...result.posts);
  }
  if(posts.length!==first.pagination.total)throw new Error('Incomplete article synchronization');
  const interactions:Record<string,unknown>=Object.create(null);
  for(const post of posts){
    const comments=[];let page=1,pages=1;
    do{const result=await readJson(`/api/posts/${encodeURIComponent(post.id)}/comments?page=${page}&pageSize=100`);if(!Number.isSafeInteger(result.pagination?.totalPages)||result.pagination.totalPages>10000)throw new Error('Invalid comment pagination');comments.push(...result.comments);pages=result.pagination.totalPages;page++;}while(page<=pages);
    const likes=await readJson(`/api/posts/${encodeURIComponent(post.id)}/likes`);
    interactions[post.id]={likes:likes.count,comments};
  }
  const traffic=await readJson('/api/analytics');
  const day=(value:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  const activity=new Map<string,number>();for(const post of posts)activity.set(day(post.publishedAt),(activity.get(day(post.publishedAt))||0)+1);
  return {version:1,generatedAt:new Date().toISOString(),settings:settings.settings,posts,stats:first.stats,home:{today:day(new Date().toISOString()),firstPublishedAt:posts.length?posts.map(p=>p.publishedAt).sort()[0]:null,lastUpdatedAt:posts.length?posts.map(p=>p.updatedAt).sort().at(-1):null,activity:[...activity].map(([date,count])=>({date,count})),traffic},interactions};
}
// Do not use GitHub/SSH credentials or the administrator session to sync public content.
// Older Tencent deployments are supported through their existing public APIs.
let value:unknown;
try{value=await readJson('/api/pages-export');}
catch(error){if(!(error instanceof SyncHttpError)||error.status!==404)throw error;value=await publicApiSnapshot();}
const snapshot=pagesSnapshotSchema.parse(value);
if(new Set(snapshot.posts.map(post=>post.id)).size!==snapshot.posts.length)throw new Error('Duplicate article IDs in snapshot');
const published=new Set(snapshot.posts.map(post=>post.id));
for(const [id,interaction] of Object.entries(snapshot.interactions)){
  if(!published.has(id)||interaction.comments.some(comment=>comment.postId!==id))throw new Error('An interaction does not belong to a published article');
}
let github:unknown={status:'disabled'};
if(snapshot.settings.github){
  try{github=pagesGithubSchema.parse(JSON.parse((await download(new URL('/api/github-contributions',source),1024*1024)).toString('utf8')));}
  catch{github={status:'unavailable',username:snapshot.home.github?.username||new URL(snapshot.settings.github).pathname.split('/')[1]||''};}
}
if(typeof github==='object'&&github&&'status' in github&&github.status!=='disabled'&&'username' in github)snapshot.home.github={configured:true,username:String(github.username)};

const media=new Set<string>();
const pattern=/(?:https?:\/\/[^\s<>"'()\[\]]+)?\/media\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(?:png|jpg|webp|gif)/gi;
function localize(value:unknown):unknown {
  if(typeof value==='string')return value.replace(pattern,match=>{const url=new URL(match,source);if(url.origin!==source.origin)return match;media.add(url.pathname);return url.pathname;});
  if(Array.isArray(value))return value.map(localize);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,localize(item)]));
  return value;
}
const localized=localize({...snapshot,github});
const run=path.join(directory,'runs',randomUUID());
await mkdir(path.join(run,'public','media'),{recursive:true});
let totalBytes=0;const hashes:Record<string,string>={};
for(const resource of media){
  const bytes=await download(new URL(resource,source),8*1024*1024);
  const extension=path.extname(resource);
  const valid=extension==='.png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):extension==='.jpg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:extension==='.gif'?/^GIF8[79]a/.test(bytes.subarray(0,6).toString()):bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(!valid)throw new Error(`Invalid image bytes at ${resource}`);
  totalBytes+=bytes.length;if(totalBytes>800*1024*1024)throw new Error('Synced media exceeds the static hosting budget');
  await writeFile(path.join(run,'public','media',path.basename(resource)),bytes);
  hashes[resource]=createHash('sha256').update(bytes).digest('hex');
}
await writeFile(path.join(run,'snapshot.json'),JSON.stringify(localized));
await writeFile(path.join(run,'manifest.json'),JSON.stringify({version:1,sourceOrigin:source.origin,generatedAt:snapshot.generatedAt,posts:snapshot.posts.length,media:hashes}));
// The active pointer changes only after every article and referenced upload succeeds.
const temporary=path.join(directory,'current-'+randomUUID()+'.json');
await writeFile(temporary,JSON.stringify({run:path.relative(directory,run)}));
await rename(temporary,path.join(directory,'current.json'));
console.log(`Synced ${snapshot.posts.length} public articles and ${media.size} referenced images.`);

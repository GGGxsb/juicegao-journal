import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {env} from './platform';
import {getAdminSession} from './admin-auth';
import {ApiError,requireSameOrigin} from './server';
import {clientAddress,isLoopbackHost,requestOrigin} from './request-security';
import type {RecordedPageView,TrafficTotals} from './analytics-types';

const WINDOW_MS=30*60*1000;
const inputSchema=z.object({path:z.string().min(1).max(1024)}).strict();
const publicPaths=new Set(['/','/articles','/about','/map','/tags']);
const botPattern=/bot\b|crawler|spider|slurp|headless|lighthouse|preview|facebookexternalhit/i;
const totalsSql=`SELECT (SELECT page_views FROM site_traffic WHERE id='site') AS pageViews,
  (SELECT COALESCE(SUM(view_count),0) FROM posts WHERE status='published') AS articleViews`;

export async function getTrafficTotals():Promise<TrafficTotals> {
  return {...(await env.DB.prepare(totalsSql).first<TrafficTotals>())!};
}

function digest(scope:string,value:string) {
  const secret=env.ADMIN_SETUP_TOKEN_HASH||'';
  if(!/^[a-f0-9]{64}$/i.test(secret)) throw new ApiError(503,'访问统计密钥尚未配置。');
  return createHmac('sha256',Buffer.from(secret,'hex')).update(`${scope}\0${value}`).digest('hex');
}

function visitorIdentity(request:Request) {
  const local=isLoopbackHost(new URL(requestOrigin(request)).host);
  const name=local?'journal_visitor_local':'__Host-journal_visitor';
  const raw=request.headers.get('cookie')||'';
  const value=raw.length<=16384?raw.split(';').map(part=>part.trim()).find(part=>part.startsWith(`${name}=`))?.slice(name.length+1):undefined;
  const match=value?.match(/^([a-f0-9-]{36})\.([a-f0-9]{64})$/);
  const valid=match&&timingSafeEqual(Buffer.from(match[2],'hex'),Buffer.from(digest('analytics-cookie',match[1]),'hex'));
  const id=valid?match[1]:randomUUID();
  return {
    hash:digest('analytics-visitor',id),
    cookie:valid?null:`${name}=${id}.${digest('analytics-cookie',id)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${local?'':'; Secure'}`,
  };
}

async function resolvePage(path:string):Promise<{path:string;postId:string|null}> {
  if(publicPaths.has(path)) return {path,postId:null};
  const match=path.match(/^\/(posts|tags)\/([^/?#]+)$/);
  let id:string;
  try {id=decodeURIComponent(match?.[2]||'');} catch {throw new ApiError(400,'页面地址无效。');}
  if(!match||!id||/[\u0000-\u001f\u007f]/.test(id)) throw new ApiError(404,'页面不存在。');
  if(match[1]==='posts') {
    if(/[/\\]/.test(id)) throw new ApiError(404,'文章地址无效。');
    const post=await env.DB.prepare("SELECT id FROM posts WHERE id=? AND status='published'").bind(id).first();
    if(!post) throw new ApiError(404,'文章不存在或尚未发布。');
    return {path:`/posts/${encodeURIComponent(id)}`,postId:id};
  }
  const tag=await env.DB.prepare(`SELECT 1 FROM posts p,json_each(p.tags) t
    WHERE p.status='published' AND t.type='text' AND t.value=? LIMIT 1`).bind(id).first();
  if(!tag) throw new ApiError(404,'标签不存在。');
  return {path:`/tags/${encodeURIComponent(id)}`,postId:null};
}

async function throttle(request:Request,now:number) {
  const key=`analytics:${digest('analytics-rate',clientAddress(request))}`,cutoff=now-60000;
  const result=await env.DB.prepare(`INSERT INTO interaction_rate_limits(key,attempts,window_start) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN window_start<=? THEN 1 ELSE MIN(attempts+1,241) END,
    window_start=CASE WHEN window_start<=? THEN excluded.window_start ELSE window_start END RETURNING attempts`)
    .bind(key,now,cutoff,cutoff).first<{attempts:number}>();
  if(!result||result.attempts>240) throw new ApiError(429,'访问统计请求过于频繁。');
}

export async function recordPageView(request:Request,input:unknown):Promise<{data:RecordedPageView;cookie:string|null}> {
  requireSameOrigin(request);
  const parsed=inputSchema.safeParse(input);
  if(!parsed.success) throw new ApiError(400,'页面地址格式错误。');
  const page=await resolvePage(parsed.data.path),database=env.DB;
  const excluded=(await getAdminSession(request)).isAdmin||botPattern.test(request.headers.get('user-agent')||'');
  if(excluded) {
    const post=page.postId?await database.prepare("SELECT view_count AS count FROM posts WHERE id=? AND status='published'").bind(page.postId).first<{count:number}>():null;
    return {data:{...await getTrafficTotals(),path:page.path,postViews:post?.count??null,counted:false,excluded:true},cookie:null};
  }
  const now=Date.now();
  await throttle(request,now);
  const visitor=visitorIdentity(request);
  const results=await database.batch([
    database.prepare('DELETE FROM page_visit_windows WHERE counted_at<?').bind(now-24*60*60*1000),
    database.prepare("DELETE FROM interaction_rate_limits WHERE key LIKE 'analytics:%' AND window_start<?").bind(now-60000),
    database.prepare(`INSERT INTO page_visit_windows(visitor_hash,path,counted_at)
      SELECT ?,?,? WHERE ? IS NULL OR EXISTS(SELECT 1 FROM posts WHERE id=? AND status='published')
      ON CONFLICT(visitor_hash,path) DO UPDATE SET counted_at=excluded.counted_at WHERE counted_at<=?`)
      .bind(visitor.hash,page.path,now,page.postId,page.postId,now-WINDOW_MS),
    database.prepare(`INSERT INTO post_readers(post_id,visitor_hash,created_at)
      SELECT id,?,? FROM posts WHERE id=? AND status='published' ON CONFLICT(post_id,visitor_hash) DO NOTHING`)
      .bind(visitor.hash,now,page.postId),
    database.prepare(totalsSql),
    database.prepare("SELECT view_count AS count FROM posts WHERE id=? AND status='published'").bind(page.postId),
  ]);
  const post=results[5].results[0] as {count:number}|undefined;
  if(page.postId&&!post) throw new ApiError(404,'文章不存在或尚未发布。');
  return {data:{...results[4].results[0] as unknown as TrafficTotals,path:page.path,postViews:post?.count??null,
    counted:results[2].meta.changes>0,excluded:false},cookie:visitor.cookie};
}

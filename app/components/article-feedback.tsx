'use client';
import {useEffect,useRef,useState} from 'react';
import {Heart,MessageCircle,X} from 'lucide-react';
import type {Pagination} from '../lib/types';
import type { PublicComment as Comment } from '../lib/interaction-types';
import {PageNavigation} from './pagination';
import { CommentAvatar, CommentProviderBadge } from './comment-identity';
import { useCommentIdentity } from './use-comment-identity';

type CommentPage={comments:Comment[];pagination:Pagination};
type Likes={count:number;liked:boolean};
async function request<T>(url:string,options?:RequestInit):Promise<T>{
  const response=await fetch(url,{cache:'no-store',credentials:'same-origin',...options,headers:{...(options?.body?{'Content-Type':'application/json'}:{}),...options?.headers}});
  let data; try{data=await response.json()}catch(cause){if(options?.signal?.aborted)throw cause;throw new Error('无法读取服务器响应，请稍后重试。')}
  if(!response.ok)throw new Error(typeof data.error==='string'?data.error:'操作没有完成，请稍后重试。');
  return data as T;
}
export default function ArticleFeedback({postId}:{postId:string}){
  const endpoint=`/api/posts/${encodeURIComponent(postId)}`;
  const [likes,setLikes]=useState<Likes>({count:0,liked:false}),[liking,setLiking]=useState(false),[likeReady,setLikeReady]=useState(false),[likeError,setLikeError]=useState('');
  const [page,setPage]=useState(1),[comments,setComments]=useState<Comment[]>([]),[pagination,setPagination]=useState<Pagination>({page:1,pageSize:10,total:0,totalPages:1}),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[retry,setRetry]=useState(0);
  const [nickname,setNickname]=useState(''),[content,setContent]=useState(''),[reply,setReply]=useState<Pick<Comment,'id'|'nickname'>|null>(null),[sending,setSending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const identity=useCommentIdentity(postId,{nickname,content,reply},value=>{setNickname(value.nickname);setContent(value.content);setReply(value.reply);});
  const field=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{const controller=new AbortController();setLikeReady(false);setLikeError('');request<Likes>(`${endpoint}/likes`,{signal:controller.signal}).then(value=>{if(controller.signal.aborted)return;setLikes(value);setLikeReady(true)}).catch(cause=>{if(!controller.signal.aborted)setLikeError(cause instanceof Error?cause.message:'点赞状态加载失败。')});return()=>controller.abort()},[endpoint,retry]);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setLoadError('');request<CommentPage>(`${endpoint}/comments?page=${page}&pageSize=10`,{signal:controller.signal}).then(value=>{if(controller.signal.aborted)return;setComments(value.comments);setPagination(value.pagination);if(value.pagination.page!==page)setPage(value.pagination.page)}).catch(cause=>{if(!controller.signal.aborted)setLoadError(cause instanceof Error?cause.message:'评论加载失败。')}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort()},[endpoint,page,retry]);
  async function like(){if(liking||!likeReady)return;setLiking(true);setLikeError('');try{setLikes(await request<Likes>(`${endpoint}/likes`,{method:'PUT',body:JSON.stringify({liked:!likes.liked})}))}catch(cause){setLikeError(cause instanceof Error?cause.message:'点赞失败，请重试。')}finally{setLiking(false)}}
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(sending||identity.busy||identity.loading)return;setError('');setNotice('');if((identity.selected==='guest'&&!nickname.trim())||!content.trim()){setError('请填写昵称和评论。');return}setSending(true);
    try{const result=await request<{message:string}>(`${endpoint}/comments`,{method:'POST',body:JSON.stringify({identity:identity.selected,...(identity.selected==='guest'?{nickname:nickname.trim()}:{}),content:content.trim(),...(reply?{parentId:reply.id}:{})})});setContent('');setReply(null);setNotice(result.message||'评论已提交，审核后显示。')}
    catch(cause){setError(cause instanceof Error?cause.message:'评论提交失败，请重试。')}finally{setSending(false)}
  }
  return <section className="article-feedback" aria-label="文章互动">
    <div className="article-reactions"><button className={`like-button${likes.liked?' is-liked':''}`} type="button" aria-pressed={likes.liked} onClick={()=>void like()} disabled={liking||!likeReady}><Heart size={18} fill={likes.liked?'currentColor':'none'}/><span>{likes.liked?'已点赞':'点赞'}</span><span className="reaction-count">{likes.count}</span></button><a href="#comments" className="comment-shortcut"><MessageCircle size={18}/>评论{pagination.total>0&&<span>{pagination.total}</span>}</a></div>
    {likeError&&<p className="feedback-error" role="alert">{likeError}{!likeReady&&<button type="button" onClick={()=>setRetry(value=>value+1)}>重试</button>}</p>}
    <div id="comments" className="comments-section"><h2>评论{pagination.total>0&&<span>{pagination.total}</span>}</h2>
      <form className="comment-form" onSubmit={submit}><fieldset disabled={sending||identity.busy||identity.loading}>
        <div className="comment-identities" role="group" aria-label="选择评论身份">
          <button type="button" aria-pressed={identity.selected==='guest'} onClick={()=>identity.choose('guest')}>游客</button>
          {identity.user&&<button type="button" aria-pressed={identity.selected==='account'} onClick={()=>identity.choose('account')}><CommentAvatar nickname={identity.user.nickname} avatar={identity.user.avatar}/>{identity.user.nickname}<CommentProviderBadge provider={identity.user.provider}/></button>}
          {identity.providers.filter(provider=>provider.id!==identity.user?.provider).map(provider=><button type="button" key={provider.id} onClick={()=>void identity.login(provider.id)}>使用 {provider.name} 登录</button>)}
          {identity.user&&<button type="button" className="comment-logout" onClick={()=>void identity.logout()}>退出登录</button>}
        </div>
        {identity.loading?<p className="comment-identity-hint" role="status">正在加载评论身份…</p>:<p className="comment-identity-hint">{identity.selected==='account'?'昵称与头像来自已登录账号。':''}评论审核后展示。</p>}
        {identity.selected==='guest'&&<label className="comment-name">昵称<input name="nickname" autoComplete="nickname" maxLength={40} value={nickname} onChange={event=>setNickname(event.target.value)} required/></label>}
        {reply&&<div className="comment-reply-target">回复 {reply.nickname}<button type="button" onClick={()=>setReply(null)} aria-label="取消回复"><X size={14}/></button></div>}
        <label className="comment-content">评论<textarea ref={field} name="comment" rows={4} maxLength={3000} value={content} onChange={event=>setContent(event.target.value)} placeholder="写下你的评论" required/></label>
        <div className="comment-form-footer"><span>{content.length} / 3000</span><button className="comment-submit" type="submit">{sending?'正在提交…':'提交评论'}</button></div>
      </fieldset></form>
      {identity.error&&<p className="feedback-error" role="alert">{identity.error}<button type="button" disabled={identity.busy} onClick={identity.retry}>重试身份加载</button></p>}{identity.notice&&<p className="feedback-notice" role="status">{identity.notice}</p>}
      {error&&<p className="feedback-error" role="alert">{error}</p>}{notice&&<p className="feedback-notice" role="status">{notice}</p>}
      {loading?<p className="feedback-state" role="status">正在加载评论…</p>:loadError?<p className="feedback-error" role="alert">{loadError}<button type="button" onClick={()=>setRetry(value=>value+1)}>重试</button></p>:<>
        <div className="comment-list">{comments.length?comments.map(comment=><article className="comment-item" key={comment.id}><header><CommentAvatar nickname={comment.nickname} avatar={comment.avatar}/><div><strong>{comment.nickname}</strong>{comment.isAdmin?<span className="comment-owner">站主</span>:<CommentProviderBadge provider={comment.provider}/>}<time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'})}</time></div><button type="button" className="comment-reply" onClick={()=>{setReply(comment);setNotice('');field.current?.focus()}}>回复</button></header>{comment.replyTo&&<p className="comment-reply-reference">回复 {comment.replyTo}</p>}<p className="comment-body">{comment.content}</p></article>):<p className="feedback-state">暂无评论</p>}</div>
        <PageNavigation pagination={pagination} onPageChange={setPage} label="评论分页"/>
      </>}
    </div>
  </section>;
}

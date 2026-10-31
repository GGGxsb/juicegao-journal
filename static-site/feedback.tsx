'use client';
import {useState} from 'react';
import {Heart,MessageCircle} from 'lucide-react';
import {snapshot,sourceOrigin} from '../runtime';
import {PageNavigation} from './pagination';
import {CommentAvatar,CommentOwnerBadge,CommentProviderBadge} from './comment-identity';

export default function StaticFeedback({postId}:{postId:string}){
  const [page,setPage]=useState(1),data=snapshot.interactions[postId]||{likes:0,comments:[]};
  const total=data.comments.length,totalPages=Math.max(1,Math.ceil(total/10));
  const href=`${sourceOrigin}/posts/${encodeURIComponent(postId)}#comments`;
  return <section className="article-feedback" aria-label="文章互动"><div className="article-reactions"><a className="like-button" href={href} target="_blank" rel="noreferrer"><Heart size={18}/><span>点赞</span><span className="reaction-count">{data.likes}</span></a><a href="#comments" className="comment-shortcut"><MessageCircle size={18}/>评论 {total||''}</a></div>
    <div id="comments" className="comments-section"><h2>评论{total>0&&<span>{total}</span>}</h2><p className="feedback-notice"><a href={href} target="_blank" rel="noreferrer">到原站评论、回复与点赞 ↗</a></p>
      <div className="comment-list">{data.comments.slice((page-1)*10,page*10).map(comment=><article className={`comment-item${comment.isAdmin?' is-owner':''}`} key={comment.id}><header><CommentAvatar nickname={comment.nickname} avatar={comment.avatar}/><div><strong>{comment.nickname}</strong>{comment.isAdmin?<CommentOwnerBadge/>:<CommentProviderBadge provider={comment.provider}/>}<time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</time></div></header>{comment.replyTo&&<p className="comment-reply-reference">回复 {comment.replyTo}</p>}<p className="comment-body">{comment.content}</p></article>)}</div>
      <PageNavigation pagination={{page,pageSize:10,total,totalPages}} onPageChange={setPage} label="评论分页"/>
    </div></section>;
}

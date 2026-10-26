import type { Post } from '../lib/types';
import { postHref, tagHref } from '../lib/post-links';
import CardCover from './card-cover';
import './post-list.css';
import {Eye} from 'lucide-react';

type PostListProps = {
  posts: Post[];
};

const formatDate = (value: string) => new Date(value).toLocaleDateString('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai',
}).replaceAll('/', '-');

function PostCard({post}:{post:Post}) {
  return <article className={`post-item${post.coverImage?' has-cover':''}`} data-cover-card>
    <a href={postHref(post)}>
      <div className="post-summary">
        <div className="post-title-row"><h2>{post.title}</h2><svg className="axi-redirect" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></div>
        {post.excerpt && <p>{post.excerpt}</p>}
        <div className="post-meta">
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
          <span>{post.category}</span>
          <span>{Math.max(1, Math.ceil(post.content.replace(/\s/g, '').length / 400))} 分钟</span>
          <span className="post-view-count" title="同一浏览器对每篇文章只计一次"><Eye size={13} aria-hidden="true"/>{(post.viewCount??0).toLocaleString()} 次阅读</span>
        </div>
      </div>
      {post.coverImage && <CardCover src={post.coverImage} className="post-cover" expandable="side"/>}
    </a>
    {!!post.tags.length&&<div className="post-item-tags" aria-label="文章标签">{post.tags.map(tag=><a href={tagHref(tag)} key={tag}>#{tag}</a>)}</div>}
  </article>;
}
export default function PostList({ posts }: PostListProps) {
  if (!posts.length) return <p className="empty-state">暂无内容</p>;
  return <div className="post-list">{posts.map(post=><PostCard post={post} key={post.id}/>)}</div>;
}

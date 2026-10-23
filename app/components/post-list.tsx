import type { Post } from '../lib/types';
import { postHref } from '../lib/post-links';
import './post-list.css';

type PostListProps = {
  posts: Post[];
};

const formatDate = (value: string) => new Date(value).toLocaleDateString('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai',
}).replaceAll('/', '-');

export default function PostList({ posts }: PostListProps) {
  if (!posts.length) return <p className="empty-state">暂无内容</p>;

  return <div className="post-list">{posts.map(post => <article className="post-item" key={post.id}>
    <a href={postHref(post)}>
      <div className="post-summary">
        <div className="post-title-row"><h2>{post.title}</h2><svg className="axi-redirect" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></div>
        {post.excerpt && <p>{post.excerpt}</p>}
        <div className="post-meta">
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
          <span>{post.category}</span>
          <span>{Math.max(1, Math.ceil(post.content.replace(/\s/g, '').length / 400))} 分钟</span>
        </div>
      </div>
      {post.coverImage && <img className="post-cover" src={post.coverImage} alt="" width={176} height={112} loading="lazy" decoding="async" />}
    </a>
  </article>)}</div>;
}

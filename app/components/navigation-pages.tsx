'use client';
import type { Pagination, Post, TagSummary } from '../lib/types';
import { tagHref } from '../lib/post-links';
import { PageNavigation } from './pagination';
import PostList from './post-list';
import './navigation.css';

function pagedHref(base: string, page: number, pageSize: number) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return `${base}?${params}`;
}

export function TagsContent({ tags, pagination }: { tags: TagSummary[]; pagination: Pagination }) {
  return <section className="listing-page navigation-page"><h1>标签</h1><p className="navigation-description">按标签寻找感兴趣的记录，共 {pagination.total} 个标签。</p>
    {tags.length ? <div className="tag-directory">{tags.map(({ tag, postCount }) => <a key={tag} href={tagHref(tag)}><span>#{tag}</span><small>{postCount} 篇</small></a>)}</div> : <p className="empty-state">暂无标签</p>}
    <PageNavigation pagination={pagination} hrefForPage={page => pagedHref('/tags', page, pagination.pageSize)}/>
  </section>;
}

export function TopicPostsContent({ tag, posts, pagination }: { tag: string; posts: Post[]; pagination: Pagination }) {
  const base = tagHref(tag);
  return <section className="listing-page navigation-page"><a className="navigation-back" href="/tags">← 全部标签</a>
    <h1>{`#${tag}`}</h1>
    <p className="navigation-description">共 {pagination.total} 篇公开记录</p>
    <PostList posts={posts}/>
    <PageNavigation pagination={pagination} hrefForPage={page => pagedHref(base, page, pagination.pageSize)}/>
  </section>;
}

'use client';
import type { CollectionList, CollectionSummary, Pagination, Post, TagSummary } from '../lib/types';
import { collectionHref, tagHref } from '../lib/post-links';
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

export function CollectionsContent({ collections, pagination }: CollectionList) {
  return <section className="listing-page navigation-page"><h1>系列合集</h1><p className="navigation-description">把相关的记录串成一段完整的阅读旅程。</p>
    {collections.length ? <div className="collection-directory">{collections.map(collection => <a key={collection.id} href={collectionHref(collection)}><h2>{collection.title}</h2>{collection.description && <p>{collection.description}</p>}<small>{collection.postCount} 篇记录 →</small></a>)}</div> : <p className="empty-state">暂无公开合集</p>}
    <PageNavigation pagination={pagination} hrefForPage={page => pagedHref('/collections', page, pagination.pageSize)}/>
  </section>;
}

export function TopicPostsContent({ tag, collection, posts, pagination }: { tag?: string; collection?: CollectionSummary; posts: Post[]; pagination: Pagination }) {
  const base = collection ? collectionHref(collection) : tagHref(tag ?? '');
  return <section className="listing-page navigation-page"><a className="navigation-back" href={collection ? '/collections' : '/tags'}>← {collection ? '全部合集' : '全部标签'}</a>
    <h1>{collection?.title ?? `#${tag}`}</h1>
    <p className="navigation-description">{collection?.description}{collection?.description && <br/>}共 {pagination.total} 篇公开记录{collection && ' · 按合集顺序排列'}</p>
    <PostList posts={posts}/>
    <PageNavigation pagination={pagination} hrefForPage={page => pagedHref(base, page, pagination.pageSize)}/>
  </section>;
}

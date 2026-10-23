import type { MetadataRoute } from 'next';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { posts, collections } from '@/db/schema';
import { siteOrigin } from './lib/seo';
import { tagHref } from './lib/post-links';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await siteOrigin(), db = getDb();
  const [articles, series, tags] = await Promise.all([
    db.select({ id: posts.id, updatedAt: posts.updatedAt }).from(posts).where(eq(posts.status, 'published')),
    db.select({ id: collections.id, updatedAt: collections.updatedAt }).from(collections)
      .where(sql`exists (select 1 from ${posts} where ${posts.collectionId} = ${collections.id} and ${posts.status} = 'published')`),
    db.all<{tag:string}>(sql`select distinct j.value as tag from ${posts}, json_each(${posts.tags}) j where ${posts.status} = 'published' and j.type = 'text' and length(j.value) > 0`),
  ]);
  return [
    ...['/', '/articles', '/notes', '/archive', '/about', '/tags', '/collections'].map(path => ({ url: new URL(path, origin).href })),
    ...articles.map(post => ({ url: `${origin}/posts/${encodeURIComponent(post.id)}`, lastModified: post.updatedAt })),
    ...series.map(item => ({ url: `${origin}/collections/${encodeURIComponent(item.id)}`, lastModified: item.updatedAt })),
    ...tags.map(({tag}) => ({ url: new URL(tagHref(tag), origin).href })),
  ];
}

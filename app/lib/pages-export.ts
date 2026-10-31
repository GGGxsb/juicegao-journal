import { eq, desc, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { posts, postLikes } from '@/db/schema';
import { getSettings, getPostOverview } from './server';
import { getHomeOverview } from './home';
import { listPublicComments } from './interactions';
import { pagesSnapshotSchema } from './pages-snapshot';
import { withCoverDimensions } from './media-dimensions';

/** No database files, identities, sessions, drafts or pending comments leave this endpoint. */
export async function createPagesSnapshot() {
  const db = getDb();
  const [settings, overview, published] = await Promise.all([
    getSettings(),getPostOverview(),
    db.select({id:posts.id,title:posts.title,excerpt:posts.excerpt,content:posts.content,category:posts.category,tags:posts.tags,cityIds:posts.cityIds,status:posts.status,coverImage:posts.coverImage,viewCount:posts.viewCount,publishedAt:posts.publishedAt,createdAt:posts.createdAt,updatedAt:posts.updatedAt})
      .from(posts).where(eq(posts.status,'published')).orderBy(desc(posts.publishedAt),desc(posts.updatedAt),desc(posts.id)),
  ]);
  const interactions:Record<string,unknown> = Object.create(null);
  for (const post of published) {
    const comments = [];
    let page = 1, pages = 1;
    do {
      const result = await listPublicComments(post.id,new URLSearchParams({page:String(page),pageSize:'100'}));
      comments.push(...result.comments);pages=result.pagination.totalPages;page++;
    } while(page<=pages);
    const [likes] = await db.select({count:sql<number>`count(*)`.mapWith(Number)}).from(postLikes).where(eq(postLikes.postId,post.id));
    interactions[post.id]={likes:likes.count,comments};
  }
  return pagesSnapshotSchema.parse({version:1,generatedAt:new Date().toISOString(),settings,posts:await withCoverDimensions(published),stats:overview.stats,home:await getHomeOverview(settings.github),interactions});
}

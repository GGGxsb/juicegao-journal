import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { posts } from '@/db/schema';
import type { HomeOverview } from './types';
import { githubContributionConfig } from './github-contributions';

/** Public homepage data: drafts never contribute to dates, activity or notes. */
export async function getHomeOverview(githubProfile = ''): Promise<HomeOverview> {
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const beginning = new Date(`${today}T00:00:00Z`);
  beginning.setUTCDate(beginning.getUTCDate() - 364 - beginning.getUTCDay());
  const date = sql<string>`date(${posts.publishedAt}, '+8 hours')`;
  const db = getDb();
  const [dates, activity, notes] = await Promise.all([
    db.select({ firstPublishedAt:sql<string | null>`min(${posts.publishedAt})`, lastUpdatedAt:sql<string | null>`max(${posts.updatedAt})` }).from(posts).where(eq(posts.status, 'published')),
    db.select({date, count:sql<number>`count(*)`.mapWith(Number)}).from(posts)
      .where(and(eq(posts.status, 'published'),gte(date, beginning.toISOString().slice(0,10))))
      .groupBy(date).orderBy(date),
    db.select({id:posts.id,title:posts.title,excerpt:posts.excerpt,publishedAt:posts.publishedAt}).from(posts)
      .where(and(eq(posts.status,'published'),eq(posts.kind,'note')))
      .orderBy(desc(posts.publishedAt),desc(posts.id)).limit(3),
  ]);
  return {today,github:githubContributionConfig(githubProfile),...dates[0],activity:activity.filter(day=>day.date<=today),notes};
}

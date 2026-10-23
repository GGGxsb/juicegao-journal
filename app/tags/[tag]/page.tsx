import { notFound } from 'next/navigation';
import Journal from '../../components/site';
import { TopicPostsContent } from '../../components/navigation-pages';
import { ApiError, getSettings, queryPosts } from '../../lib/server';
import { decodeRouteSegment } from '../../lib/navigation';
import { publicNavigationQuery, type NavigationSearchParams } from '../../lib/navigation-search';

export const dynamic = 'force-dynamic';
export default async function TagPage({ params, searchParams }: { params: Promise<{ tag: string }>; searchParams: NavigationSearchParams }) {
  const tag = decodeRouteSegment((await params).tag);
  const query = await publicNavigationQuery(searchParams);
  try {
    const [settings, result] = await Promise.all([getSettings(), queryPosts({ ...query, pageSize: Math.min(query.pageSize ?? 15, 50), tag })]);
    if (!result.pagination.total) notFound();
    return <Journal settings={settings} posts={[]} view="tags" selectedTag={tag} stats={result.stats} categories={result.categories}><TopicPostsContent tag={tag} posts={result.posts} pagination={result.pagination}/></Journal>;
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) notFound();
    throw error;
  }
}

import { notFound } from 'next/navigation';
import Journal from '../../components/site';
import { TopicPostsContent } from '../../components/navigation-pages';
import { getSettings, queryPosts } from '../../lib/server';
import { getPublishedCollection } from '../../lib/navigation';
import { publicNavigationQuery, type NavigationSearchParams } from '../../lib/navigation-search';

export const dynamic = 'force-dynamic';
export default async function CollectionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: NavigationSearchParams }) {
  const { id } = await params;
  const collection = await getPublishedCollection(id);
  if (!collection) notFound();
  const query = await publicNavigationQuery(searchParams);
  const [settings, result] = await Promise.all([getSettings(), queryPosts({ ...query, pageSize: Math.min(query.pageSize ?? 15, 50), collectionId: collection.id })]);
  return <Journal settings={settings} posts={[]} view="collections" stats={result.stats} categories={result.categories}><TopicPostsContent collection={collection} posts={result.posts} pagination={result.pagination}/></Journal>;
}

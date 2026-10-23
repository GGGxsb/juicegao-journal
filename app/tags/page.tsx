import Journal from '../components/site';
import { TagsContent } from '../components/navigation-pages';
import { getPostOverview, getSettings } from '../lib/server';
import { queryTags } from '../lib/navigation';
import { publicNavigationQuery, type NavigationSearchParams } from '../lib/navigation-search';

export const dynamic = 'force-dynamic';
export default async function TagsPage({ searchParams }: { searchParams: NavigationSearchParams }) {
  const query = await publicNavigationQuery(searchParams);
  const [settings, overview, tags] = await Promise.all([getSettings(), getPostOverview(), queryTags(query)]);
  return <Journal settings={settings} posts={[]} view="tags" {...overview}><TagsContent {...tags}/></Journal>;
}

import Journal from '../components/site';
import { listingMetadata } from '../lib/seo';
export const generateMetadata = ({searchParams}:{searchParams:NavigationSearchParams}) => listingMetadata('/collections', '系列合集',searchParams);
import { CollectionsContent } from '../components/navigation-pages';
import { getPostOverview, getSettings } from '../lib/server';
import { queryCollections } from '../lib/navigation';
import { publicNavigationQuery, type NavigationSearchParams } from '../lib/navigation-search';

export const dynamic = 'force-dynamic';
export default async function CollectionsPage({ searchParams }: { searchParams: NavigationSearchParams }) {
  const query = await publicNavigationQuery(searchParams);
  const [settings, overview, collections] = await Promise.all([getSettings(), getPostOverview(), queryCollections(query)]);
  return <Journal settings={settings} posts={[]} view="collections" {...overview}><CollectionsContent {...collections}/></Journal>;
}

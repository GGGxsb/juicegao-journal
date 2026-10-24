import Journal from '../components/site';
import CityMap from '../components/city-map';
import { getMapPosts, getPostOverview, getSettings } from '../lib/server';
import { pageMetadata } from '../lib/seo';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  return pageMetadata('/map', '城市地图', '按城市浏览文章。');
}

export default async function MapPage() {
  const [settings, overview, posts] = await Promise.all([getSettings(), getPostOverview(), getMapPosts()]);
  return <Journal settings={settings} posts={[]} view="map" {...overview}><CityMap posts={posts}/></Journal>;
}

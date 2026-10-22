import { getSettings, listPosts } from '../lib/server';
import Journal from './site';
export default async function PublicPage({view}: {view:'home'|'articles'|'notes'|'archive'|'about'}) {
  const [settings, posts] = await Promise.all([getSettings(), listPosts()]);
  return <Journal settings={settings} posts={posts} view={view} />;
}

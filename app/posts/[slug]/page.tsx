import { getSettings, listPosts, getPostBySlug } from '../../lib/server';
import Journal from '../../components/site';
import { notFound } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default async function ArticlePage({params}: {params:Promise<{slug:string}>}) {
  const {slug} = await params;
  const [settings,posts] = await Promise.all([getSettings(),listPosts()]);
  const article = await getPostBySlug(slug);
  if (!article || article.status !== 'published') notFound();
  return <Journal settings={settings} posts={posts} view="article" article={article}/>;
}

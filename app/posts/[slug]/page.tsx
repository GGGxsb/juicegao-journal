import { getSettings, getPostOverview, getPostBySlug } from '../../lib/server';
import Journal from '../../components/site';
import { notFound } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default async function ArticlePage({params}: {params:Promise<{slug:string}>}) {
  const {slug} = await params;
  const [settings, overview, article] = await Promise.all([getSettings(), getPostOverview(), getPostBySlug(slug)]);
  if (!article || article.status !== 'published') notFound();
  return <Journal settings={settings} posts={[]} view="article" article={article} {...overview}/>;
}

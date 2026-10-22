import { getSettings, getPostOverview, getPublishedPost } from '../../lib/server';
import Journal from '../../components/site';
import { notFound } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default async function ArticlePage({params}: {params:Promise<{id:string}>}) {
  const {id} = await params;
  const [settings, overview, article] = await Promise.all([getSettings(), getPostOverview(), getPublishedPost(id)]);
  if (!article) notFound();
  return <Journal settings={settings} posts={[]} view="article" article={article} {...overview}/>;
}

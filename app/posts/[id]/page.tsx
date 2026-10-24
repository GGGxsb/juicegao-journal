import { getSettings, getPostOverview, getPublishedPost } from '../../lib/server';
import Journal from '../../components/site';
import { notFound } from 'next/navigation';
import { getArticleNavigation } from '../../lib/navigation';
import { pageMetadata, articleStructuredData } from '../../lib/seo';
export const dynamic = 'force-dynamic';
export async function generateMetadata({params}: {params:Promise<{id:string}>}) {
  const post = await getPublishedPost((await params).id);
  if (!post) return { title: '记录不存在', robots: { index: false, follow: false } };
  return pageMetadata(`/posts/${encodeURIComponent(post.id)}`, post.title, post.excerpt || post.content, post);
}
export default async function ArticlePage({params,searchParams}: {params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {id} = await params;
  const returnToMap = (await searchParams).from === 'map';
  const [settings, overview, article] = await Promise.all([getSettings(), getPostOverview(), getPublishedPost(id)]);
  if (!article) notFound();
  const navigation = await getArticleNavigation(article);
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html: await articleStructuredData(article)}}/><Journal settings={settings} posts={[]} view="article" article={article} navigation={navigation} returnToMap={returnToMap} {...overview}/></>;
}

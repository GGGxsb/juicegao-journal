import { notFound } from 'next/navigation';
import { ApiError, getPostOverview, getSettings, parsePostQuery, queryPosts } from '../lib/server';
import Journal from './site';
import { getHomeOverview } from '../lib/home';

export type PublicSearchParams = Promise<Record<string, string | string[] | undefined>>;
type PublicView = 'home' | 'articles' | 'notes' | 'archive' | 'about';

export default async function PublicPage({ view, searchParams }: { view: PublicView; searchParams?: PublicSearchParams }) {
  if (view === 'home' || view === 'about') {
    const [settings, overview, home] = await Promise.all([getSettings(), getPostOverview(), view === 'home' ? getHomeOverview() : undefined]);
    return <Journal settings={settings} posts={[]} view={view} home={home} {...overview} />;
  }

  const values = await searchParams ?? {};
  const params = new URLSearchParams();
  for (const key of ['page', 'pageSize', 'category', 'q']) {
    const value = values[key];
    if (Array.isArray(value)) notFound();
    if (value !== undefined) params.set(key, value);
  }
  // Public listings share API validation while retaining their 15-row layout.
  if (!params.has('pageSize')) params.set('pageSize', '15');
  let options;
  try { options = parsePostQuery(params); }
  catch (error) {
    if (error instanceof ApiError && error.status === 400) notFound();
    throw error;
  }
  const [settings, collection] = await Promise.all([
    getSettings(),
    queryPosts({ ...options, ...(view === 'articles' ? { kind: 'article' } : view === 'notes' ? { kind: 'note' } : {}) }),
  ]);
  return <Journal settings={settings} view={view} {...collection} selectedCategory={options.category ?? '全部'} searchQuery={options.q ?? ''} />;
}

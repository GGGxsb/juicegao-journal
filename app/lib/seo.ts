import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getSettings } from './server';
import type { Post } from './types';

/** Prefer the configured public domain, including when rendering behind Nginx. */
export async function siteOrigin(): Promise<string> {
  if (process.env.APP_ORIGIN) {
    const configured = new URL(process.env.APP_ORIGIN);
    if (['https:', 'http:'].includes(configured.protocol) && !configured.username && !configured.password) return configured.origin;
    throw new Error('APP_ORIGIN must be an HTTP(S) origin.');
  }
  const h = await headers();
  const host = h.get('host') || 'localhost:3000';
  if (!/^[a-z\d.:[\]-]+$/i.test(host)) return 'http://localhost:3000';
  const protocol = process.env.TRUST_PROXY === 'true' && h.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  return new URL(`${protocol}://${host}`).origin;
}

export function plainDescription(value: string, maximum = 160): string {
  return value.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, ' ')
    .replace(/^\s*:{2,}.*$/gm, ' ').replace(/<[^>]*>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*`~>|_\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

export async function pageMetadata(path: string, title?: string, description?: string, post?: Post): Promise<Metadata> {
  const [settings, origin] = await Promise.all([getSettings(), siteOrigin()]);
  const name = settings.name || 'JuiceGao';
  const heading = title || `${name}'s Blog`;
  const summary = plainDescription(description || settings.bio || settings.description || `${name} 的个人记录与思考。`);
  const image = new URL(post?.coverImage || '/share-image', origin).href;
  const canonical = new URL(path, origin).href;
  return {
    metadataBase: new URL(origin),
    title: title ? { absolute: `${heading} · ${name}` } : { default: heading, template: `%s · ${name}` },
    description: summary,
    alternates: { canonical },
    openGraph: { title: heading, description: summary, url: canonical, siteName: `${name}'s Blog`, locale: 'zh_CN',
      type: post ? 'article' : 'website', images: [{ url: image, alt: heading }],
      ...(post ? { publishedTime: post.publishedAt, modifiedTime: post.updatedAt, authors: [name], tags: post.tags } : {}),
    },
    twitter: { card: 'summary_large_image', title: heading, description: summary, images: [image] },
  };
}

export async function listingMetadata(path:string,title:string,searchParams:Promise<Record<string,string|string[]|undefined>>,description?:string):Promise<Metadata> {
  const values=await searchParams, canonical=new URL(path,'https://canonical.invalid');
  for(const key of ['page','pageSize','category','tag']) {
    const value=values[key];
    if(typeof value==='string'&&value&&!(key==='page'&&value==='1'))canonical.searchParams.set(key,value);
  }
  const page=typeof values.page==='string'&&/^[1-9]\d*$/.test(values.page)?Number(values.page):1;
  return {...await pageMetadata(canonical.pathname+canonical.search,page>1?`${title} · 第 ${page} 页`:title,description),...(values.q?{robots:{index:false,follow:true}}:{})};
}

export async function articleStructuredData(post: Post): Promise<string> {
  const [settings, origin] = await Promise.all([getSettings(), siteOrigin()]);
  return JSON.stringify({ '@context': 'https://schema.org', '@type': 'BlogPosting',
    headline: post.title, description: plainDescription(post.excerpt || post.content),
    url: `${origin}/posts/${encodeURIComponent(post.id)}`, mainEntityOfPage: `${origin}/posts/${encodeURIComponent(post.id)}`,
    datePublished: post.publishedAt, dateModified: post.updatedAt,
    author: { '@type': 'Person', name: settings.name || 'JuiceGao' },
    image: new URL(post.coverImage || '/share-image', origin).href, keywords: post.tags.join(', '), inLanguage: 'zh-CN',
  }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

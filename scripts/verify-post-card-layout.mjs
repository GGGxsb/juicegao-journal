/** Render the real mixed article cards, including their SSR layout and independent tag links. */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { register } from 'tsx/esm/api';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const unregister = register();
const styles = registerHooks({ load(url, context, next) { return url.endsWith('.css') ? { format: 'module', source: 'export default {}', shortCircuit: true } : next(url, context); } });
try {
  const { postCoverLayout, postCoverRatio } = await import('../app/lib/post-cover-layout.ts');
  assert.equal(postCoverLayout('/media/wide.jpg', { width: 1800, height: 600 }), 'landscape');
  assert.equal(postCoverLayout('/media/tall.jpg', { width: 600, height: 1200 }), 'portrait');
  assert.equal(postCoverLayout('/media/square.jpg', { width: 600, height: 600 }), 'landscape');
  assert.equal(postCoverLayout('https://example.com/unknown.jpg'), 'landscape');
  assert.equal(postCoverLayout(''), 'text');
  for (const value of [null, { width: 0, height: 100 }, { width: -1, height: 100 }, { width: Infinity, height: 100 }, { width: 1, height: NaN }]) {
    assert.equal(postCoverLayout('/media/image.jpg', value), 'landscape');
    assert.equal(postCoverRatio(value), 16 / 9);
  }
  for (const src of ['javascript:alert(1)', '//example.com/image.jpg']) assert.equal(postCoverLayout(src), 'text');
  console.log('PASS wide, portrait, square, external, missing and invalid covers have deterministic layouts before loading.');

  const { default: PostList } = await import('../app/components/post-list.tsx');
  const base = { content: '正文', excerpt: '文章摘要', category: 'Technical', tags: ['图片 / 布局'], cityIds: [], status: 'published', viewCount: 17, publishedAt: '2026-01-01T00:00:00Z', createdAt: '', updatedAt: '' };
  const posts = [
    { ...base, id: 'wide', title: '横图文章', coverImage: '/media/wide.png', coverSize: { width: 1800, height: 600 } },
    { ...base, id: 'portrait', title: '竖图文章', coverImage: '/media/tall.png', coverSize: { width: 600, height: 1200 } },
    { ...base, id: 'text', title: '<script>保留文字</script>', coverImage: '' },
    { ...base, id: 'unknown', title: '未知尺寸', coverImage: 'https://example.com/unknown.jpg' },
    { ...base, id: 'unsafe', title: '非法地址', coverImage: 'javascript:alert(1)' },
  ];
  const html = renderToStaticMarkup(createElement(PostList, { posts }));
  const cards = [...html.matchAll(/<article\b[\s\S]*?<\/article>/g)].map(match => match[0]);
  assert.equal(cards.length, 5);
  for (const [index, card] of cards.entries()) {
    assert.ok(card.includes(`href="/posts/${posts[index].id}"`), 'DOM order and primary-key routes are preserved.');
    assert.ok(card.includes('17 次阅读') && card.includes('文章标签'));
    for (const anchor of card.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)) assert.ok(!anchor[0].slice(2).includes('<a '), 'Article and tag links must not nest.');
  }
  assert.ok(cards[0].includes('data-cover-layout="landscape"') && cards[0].includes('width="1800" height="600"'));
  assert.ok(cards[0].includes('--post-cover-ratio:2.4'));
  assert.ok(cards[1].includes('data-cover-layout="portrait"') && cards[1].includes('width="600" height="1200"'));
  assert.ok(cards[2].includes('post-card-text') && !cards[2].includes('<img'));
  assert.ok(cards[2].includes('&lt;script&gt;保留文字&lt;/script&gt;'));
  assert.ok(cards[3].includes('post-card-landscape'));
  assert.ok(!cards[4].includes('<img') && !cards[4].includes('javascript:'));
  assert.ok(!html.includes('article-cover-reveal'), 'Article grids do not use the height-changing map cover.');
  assert.ok(html.includes('loading="lazy"') && html.includes('decoding="async"'));
  assert.ok(renderToStaticMarkup(createElement(PostList, { posts: [] })).includes('暂无内容'));
  console.log('PASS SSR renders mixed cards with actual image dimensions, safe content, publication order, reading counts and independent tag links.');
} finally { styles.deregister(); unregister(); }

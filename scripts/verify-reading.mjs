/** Integration checks for the reader, tags and retired collection routes on disposable local data. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const base = new URL(process.argv[2] || 'http://127.0.0.1:3000');
assert.equal(base.protocol, 'http:');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Only isolated loopback previews are allowed.');
assert.equal(base.pathname, '/');
assert.ok(!base.username && !base.password && !base.search && !base.hash);
const token = process.env.JOURNAL_TEST_SETUP_TOKEN;
assert.match(token || '', /^[A-Za-z0-9_-]{32,256}$/);
const username = process.env.JOURNAL_TEST_USERNAME || 'reading-qa';
const password = process.env.JOURNAL_TEST_PASSWORD || randomBytes(24).toString('base64url');
const runId = `reading-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
const specialTag = `C++ / 中文 # % ${runId}`;
const encodedTag = `%2F-${runId}`;
const content = readFileSync(new URL('./fixtures/reading.md', import.meta.url), 'utf8');
const postIds = new Set();
let cookie = '', checks = 0;
function passed(label) { checks++; console.log(`PASS ${label}`); }
async function request(route, { auth = false, method = 'GET', body, origin = base.origin } = {}) {
  return fetch(new URL(route, base), { method, redirect: 'manual', signal: AbortSignal.timeout(90000), headers: {
    ...(auth ? { cookie } : {}), ...(method === 'GET' ? {} : { origin }), ...(body ? { 'content-type': 'application/json' } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function json(response, expected = 200) {
  const text = await response.text();
  assert.equal(response.status, expected, text.slice(0, 800));
  return JSON.parse(text);
}
async function html(route) {
  const response = await request(route); assert.equal(response.status, 200, route); return response.text();
}
async function createPost(fields) {
  const result = await json(await request('/api/posts', { auth: true, method: 'POST', body: {
    title: `${runId} published`, content, excerpt: '用于本机验证阅读功能。', category: 'Daily Life',
    tags: [runId], status: 'published', coverImage: '', ...fields,
  } }), 201);
  postIds.add(result.post.id); return result.post;
}

try {
  const session = await json(await request('/api/session'));
  const response = await request(session.setupRequired ? '/api/auth/setup' : '/api/auth/login', { method: 'POST', body: { ...(session.setupRequired ? { token } : {}), username, password } });
  await json(response, session.setupRequired ? 201 : 200);
  cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.ok(cookie);
  const middle = await createPost({ title: `${runId} middle article`, tags: [runId, specialTag, encodedTag, 'JS'] });
  const first = await createPost({ title: `${runId} first article`, tags: [runId, 'JS'] });
  const last = await createPost({ title: `${runId} last article`, tags: [runId, 'JavaScript'] });
  const draft = await createPost({ title: `${runId} PRIVATE_DRAFT`, tags: [runId, `${runId}-private-tag`], status: 'draft' });
  const tagged = await createPost({ title: `${runId} tagged article`, category: 'Technical', tags: [runId, 'JS', '.', '..'] });
  await createPost({ title: `${runId} different category`, category: 'Technical', tags: [] });
  assert.equal((await request(`/posts/${draft.id}`)).status, 404);

  for (const route of ['/collections', '/collections/legacy-id', '/notes', '/archive']) {
    const response = await request(route);
    assert.equal(response.status, 308);
    assert.equal(new URL(response.headers.get('location'), base).pathname, '/articles');
  }
  for (const route of ['/api/collections', '/api/collections/legacy-id']) {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) assert.equal((await request(route, { auth: true, method, ...(method === 'GET' ? {} : { body: { title: 'retired' } }) })).status, 404);
  }
  assert.equal((await request('/api/posts?collectionId=22222222-2222-4222-8222-222222222222')).status, 400);
  assert.ok(!Object.hasOwn(middle, 'collectionId') && !Object.hasOwn(middle, 'collectionOrder'));
  assert.ok(!(await html('/articles')).includes('文章合集'));
  const sitemap = await html('/sitemap.xml');
  for (const path of ['/collections', '/notes', '/archive']) assert.ok(!sitemap.includes(path));
  const home = await html('/'); assert.ok(!home.includes('生活随谈') && !home.includes('href="/notes"') && !home.includes('href="/archive"'));
  passed('removed collection pages redirect to articles, management endpoints are unavailable and public links are cleaned up');

  const ordered = [first, middle, last].sort((a, b) => a.publishedAt < b.publishedAt ? -1 : a.publishedAt > b.publishedAt ? 1 : a.id < b.id ? -1 : 1);
  for (const [index, post] of ordered.entries()) {
    const markup = await html(`/posts/${post.id}`);
    if (index) assert.ok(markup.includes(`data-prev="${ordered[index-1].id}"`));
    else assert.ok(!markup.includes('rel="prev"'));
    if (index < ordered.length - 1) assert.ok(markup.includes(`data-next="${ordered[index+1].id}"`));
    else assert.ok(!markup.includes('rel="next"'));
    assert.ok(!markup.includes('article-series'));
  }
  const middleHtml = await html(`/posts/${middle.id}`);
  passed('previous and next articles follow publication order within their category, skipping drafts');

  const exact = await json(await request(`/api/posts?tag=JS&q=${runId}&pageSize=50`));
  assert.deepEqual(new Set(exact.posts.map(value => value.id)), new Set([first.id, middle.id, tagged.id]));
  const special = await json(await request(`/api/posts?tag=${encodeURIComponent(specialTag)}`));
  assert.deepEqual(special.posts.map(value => value.id), [middle.id]);
  assert.ok((await html(`/tags/${encodeURIComponent(encodedTag)}`)).includes(middle.title), 'A literal percent escape in a tag must not be decoded twice.');
  const tagsHtml = await html('/tags');
  assert.ok(!tagsHtml.includes(`${runId}-private-tag`));
  for (const tag of ['.', '..']) {
    assert.ok(tagsHtml.includes(`href="/articles?tag=${tag}"`), 'Dot-only tags must use a URL that browsers do not normalize away.');
    assert.ok((await html(`/articles?tag=${tag}`)).includes(tagged.title));
  }
  const tagHtml = await html(`/tags/${encodeURIComponent(specialTag)}`);
  assert.ok(tagHtml.includes(middle.title));
  assert.ok(!tagHtml.includes(first.title));
  assert.ok((await html(`/articles?tag=${encodeURIComponent(specialTag)}`)).includes(middle.title));
  assert.equal((await request('/api/posts?tag=JS&tag=JavaScript')).status, 400);
  const tagCounts = await json(await request('/api/tags?pageSize=100'));
  assert.equal(tagCounts.tags.find(value => value.tag === runId).postCount, 4);
  passed('tag filters match complete JSON tags and support Chinese and reserved URL characters');

  assert.ok(middleHtml.includes('<table') && middleHtml.includes('type="checkbox"') && middleHtml.includes('<del>'));
  assert.ok(middleHtml.includes('katex') && middleHtml.includes('data-footnotes'));
  assert.ok(middleHtml.includes('id="中文标题"') && middleHtml.includes('id="中文标题-2"'));
  assert.ok(middleHtml.includes('<h6'));
  assert.ok(!middleHtml.includes('<script>alert(') && !middleHtml.includes('href="javascript:'));
  passed('public Markdown renders GFM, formulas, footnotes and stable heading anchors safely');

} finally {
  const errors = [];
  for (const id of postIds) try { await json(await request(`/api/posts/${id}`, { auth: true, method: 'DELETE' })); } catch (error) { errors.push(error); }
  if (cookie) await request('/api/auth/logout', { auth: true, method: 'POST' });
  if (errors.length) throw new AggregateError(errors, 'Disposable local test cleanup failed.');
}
console.log(`Reading integration verification passed: ${checks} checks.`);

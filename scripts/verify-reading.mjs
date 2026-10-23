/** Integration checks for the reader, tags and collections on disposable local data. */
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
const postIds = new Set(), collectionIds = new Set();
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
    tags: [runId], kind: 'article', status: 'published', coverImage: '', ...fields,
  } }), 201);
  postIds.add(result.post.id); return result.post;
}
async function createCollection(title) {
  const result = await json(await request('/api/collections', { auth: true, method: 'POST', body: { title, description: '本机验证合集。' } }), 201);
  collectionIds.add(result.collection.id); return result.collection;
}

try {
  const session = await json(await request('/api/session'));
  const response = await request(session.setupRequired ? '/api/auth/setup' : '/api/auth/login', { method: 'POST', body: { ...(session.setupRequired ? { token } : {}), username, password } });
  await json(response, session.setupRequired ? 201 : 200);
  cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.ok(cookie);
  assert.equal((await request('/api/collections?scope=all')).status, 401);
  assert.equal((await request('/api/collections', { method: 'POST', body: { title: 'unauthorized' } })).status, 401);
  assert.equal((await request('/api/collections', { auth: true, method: 'POST', origin: 'https://invalid.example', body: { title: 'bad-origin' } })).status, 403);
  passed('collection management requires a signed-in owner and same-origin requests');

  const collection = await createCollection(`${runId} series`);
  const privateCollection = await createCollection(`${runId} private collection`);
  const emptyCollection = await createCollection(`${runId} empty collection`);
  const middle = await createPost({ title: `${runId} middle chapter`, tags: [runId, specialTag, encodedTag, 'JS'], collectionId: collection.id, collectionOrder: 20 });
  const first = await createPost({ title: `${runId} first chapter`, tags: [runId, 'JS'], collectionId: collection.id, collectionOrder: 10 });
  const last = await createPost({ title: `${runId} last chapter`, tags: [runId, 'JavaScript'], collectionId: collection.id, collectionOrder: 30 });
  const draft = await createPost({ title: `${runId} PRIVATE_DRAFT`, tags: [runId, `${runId}-private-tag`], status: 'draft', collectionId: collection.id, collectionOrder: 15 });
  await createPost({ title: `${runId} PRIVATE_COLLECTION_POST`, status: 'draft', collectionId: privateCollection.id });
  const note = await createPost({ title: `${runId} note`, kind: 'note', tags: [runId, 'JS', '.', '..'] });
  assert.equal((await request(`/posts/${draft.id}`)).status, 404);

  const publicCollections = await json(await request('/api/collections?pageSize=100'));
  const series = publicCollections.collections.find(value => value.id === collection.id);
  assert.equal(series.postCount, 3);
  assert.ok(!publicCollections.collections.some(value => [privateCollection.id, emptyCollection.id].includes(value.id)));
  const allCollections = await json(await request('/api/collections?scope=all&pageSize=100', { auth: true }));
  assert.equal(allCollections.collections.find(value => value.id === collection.id).postCount, 4);
  passed('public collections expose only published chapters and hide empty or private collections');

  const chapters = await json(await request(`/api/posts?collectionId=${collection.id}&pageSize=2`));
  assert.equal(chapters.pagination.total, 3);
  assert.deepEqual(chapters.posts.map(value => value.id), [first.id, middle.id]);
  const chapterPage2 = await json(await request(`/api/posts?collectionId=${collection.id}&pageSize=2&page=2`));
  assert.deepEqual(chapterPage2.posts.map(value => value.id), [last.id]);
  const collectionHtml = await html(`/collections/${collection.id}`);
  assert.ok(collectionHtml.includes(first.title) && collectionHtml.includes(last.title));
  assert.ok(!collectionHtml.includes(draft.title));
  assert.equal((await request(`/collections/${privateCollection.id}`)).status, 404);
  passed('chapters use SQL pagination and owner-defined order without draft leakage');

  const middleHtml = await html(`/posts/${middle.id}`);
  assert.ok(middleHtml.includes(`data-prev="${first.id}"`), 'Previous chapter must skip the intervening draft.');
  assert.ok(middleHtml.includes(`data-next="${last.id}"`));
  const firstHtml = await html(`/posts/${first.id}`), lastHtml = await html(`/posts/${last.id}`);
  assert.ok(!firstHtml.includes('rel="prev"'), 'The first chapter must not wrap to the last.');
  assert.ok(!lastHtml.includes('rel="next"'), 'The last chapter must not wrap to the first.');
  passed('previous and next chapter navigation respects collection order and boundaries');

  const exact = await json(await request(`/api/posts?tag=JS&q=${runId}&pageSize=50`));
  assert.deepEqual(new Set(exact.posts.map(value => value.id)), new Set([first.id, middle.id, note.id]));
  const special = await json(await request(`/api/posts?tag=${encodeURIComponent(specialTag)}`));
  assert.deepEqual(special.posts.map(value => value.id), [middle.id]);
  assert.ok((await html(`/tags/${encodeURIComponent(encodedTag)}`)).includes(middle.title), 'A literal percent escape in a tag must not be decoded twice.');
  const tagsHtml = await html('/tags');
  assert.ok(!tagsHtml.includes(`${runId}-private-tag`));
  for (const tag of ['.', '..']) {
    assert.ok(tagsHtml.includes(`href="/archive?tag=${tag}"`), 'Dot-only tags must use a URL that browsers do not normalize away.');
    assert.ok((await html(`/archive?tag=${tag}`)).includes(note.title));
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

  await json(await request(`/api/collections/${collection.id}`, { auth: true, method: 'PUT', body: { title: `${runId} renamed series`, description: '更新后的合集说明' } }));
  assert.ok((await html(`/collections/${collection.id}`)).includes('更新后的合集说明'));
  await json(await request(`/api/collections/${collection.id}`, { auth: true, method: 'DELETE' }));
  collectionIds.delete(collection.id);
  const postAfterDelete = await json(await request(`/api/posts/${middle.id}`, { auth: true }));
  assert.equal(postAfterDelete.post.collectionId, null);
  assert.equal((await request(`/posts/${middle.id}`)).status, 200);
  passed('editing and deleting a collection preserves its articles and immutable IDs');
} finally {
  const errors = [];
  for (const id of postIds) try { await json(await request(`/api/posts/${id}`, { auth: true, method: 'DELETE' })); } catch (error) { errors.push(error); }
  for (const id of collectionIds) try { await json(await request(`/api/collections/${id}`, { auth: true, method: 'DELETE' })); } catch (error) { errors.push(error); }
  if (cookie) await request('/api/auth/logout', { auth: true, method: 'POST' });
  if (errors.length) throw new AggregateError(errors, 'Disposable local test cleanup failed.');
}
console.log(`Reading integration verification passed: ${checks} checks.`);

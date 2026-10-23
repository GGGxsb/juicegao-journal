/** Verify category boundaries and article-owned tags on disposable loopback data. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
const base = new URL(process.argv[2] || 'http://127.0.0.1:3000');
assert.equal(base.protocol, 'http:');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(base.hostname));
assert.equal(base.pathname, '/');
assert.ok(!base.username && !base.password && !base.search && !base.hash);
const username = process.env.JOURNAL_TEST_USERNAME, password = process.env.JOURNAL_TEST_PASSWORD;
assert.ok(username && password, 'Use a configured disposable preview account.');
const marker = `categories-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
let cookie = '';
const ids = [];
async function request(route, method='GET', body, auth=false) {
  return fetch(new URL(route,base), { method, signal: AbortSignal.timeout(60000), headers: {
    ...(auth?{cookie}:{}), ...(method==='GET'?{}:{origin:base.origin}), ...(body?{'content-type':'application/json'}:{}),
  }, ...(body?{body:JSON.stringify(body)}:{}) });
}
async function json(response, status=200) {
  const text=await response.text(); assert.equal(response.status,status,text.slice(0,500)); return JSON.parse(text);
}
async function create(fields={}) {
  const {post}=await json(await request('/api/posts','POST',{title:marker,content:'分类与标签测试正文',tags:[marker],kind:'article',status:'published',...fields},true),201);
  ids.push(post.id);return post;
}
try {
  const login=await request('/api/auth/login','POST',{username,password});await json(login);
  cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');assert.ok(cookie);
  const life=await create({title:`${marker} life`}), technical=await create({title:`${marker} technical`,category:'Technical'});
  const draft=await create({title:`${marker} private`,category:'Technical',status:'draft',tags:[`${marker}-private`]});
  assert.equal(life.category,'Daily Life');assert.equal(technical.category,'Technical');
  for(const category of ['Daily Life','Technical']) {
    const result=await json(await request(`/api/posts?category=${encodeURIComponent(category)}&q=${marker}`));
    assert.deepEqual(result.categories,['Daily Life','Technical']);
    assert.ok(result.posts.every(post=>post.category===category));
    assert.equal(result.pagination.total,1);assert.ok(!result.posts.some(post=>post.id===draft.id));
  }
  console.log('PASS both fixed categories are returned consistently and public category filtering hides drafts');
  assert.equal((await request('/api/posts','POST',{title:marker,content:'invalid',category:'随意分类'},true)).status,400);
  assert.equal((await request(`/api/posts/${life.id}`,'PUT',{title:life.title,content:life.content,category:'随意分类'},true)).status,400);
  assert.equal((await json(await request(`/api/posts/${life.id}`,'GET',undefined,true))).post.category,'Daily Life');
  assert.equal((await request('/api/posts?category=invalid')).status,400);
  const ownerList=await json(await request(`/api/posts?scope=all&category=Technical&q=${marker}`, 'GET',undefined,true));
  assert.equal(ownerList.pagination.total,2);
  console.log('PASS API mutations reject arbitrary categories and the owner can filter published posts and drafts');
  const payload={title:life.title,excerpt:life.excerpt,content:life.content,category:'Technical',tags:[marker,'只属于这篇文章'],kind:life.kind,status:life.status,coverImage:life.coverImage,collectionId:life.collectionId,collectionOrder:life.collectionOrder};
  const updated=await json(await request(`/api/posts/${life.id}`,'PUT',payload,true));
  assert.equal(updated.post.id,life.id);assert.deepEqual(updated.post.tags,payload.tags);
  assert.equal((await json(await request(`/api/posts?tag=${encodeURIComponent('只属于这篇文章')}`))).posts[0].id,life.id);
  const other=await json(await request(`/api/posts/${technical.id}`,'GET',undefined,true));assert.deepEqual(other.post.tags,[marker]);
  const home=await (await request('/')).text(), dropdown=home.match(/class="blog-dropdown">([\s\S]*?)<\/div>/)?.[1];assert.ok(dropdown);
  assert.equal((dropdown.match(/<a /g)||[]).length,2);assert.ok(dropdown.includes('Daily Life')&&dropdown.includes('Technical'));
  assert.ok(!dropdown.includes('href="/tags"')&&!dropdown.includes('href="/collections"')&&!dropdown.includes('全部文章'));
  const article=await (await request(`/posts/${life.id}`)).text();assert.ok(article.includes('只属于这篇文章'));
  console.log('PASS tags remain attached to individual articles and the home dropdown has exactly two category links');
} finally {
  const errors=[];
  for(const id of ids)try{await json(await request(`/api/posts/${id}`,'DELETE',undefined,true));}catch(error){errors.push(error);}
  if(cookie)await request('/api/auth/logout','POST',undefined,true);
  if(errors.length)throw new AggregateError(errors,'Disposable category checks failed to clean up.');
}

/** Use a fresh disposable loopback server with the matching JOURNAL_TEST_* credentials. */
import assert from 'node:assert/strict';
const base=new URL(process.argv[2]||'http://127.0.0.1:3100');
assert.ok(base.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(base.hostname)&&base.pathname==='/'&&!base.username&&!base.password&&!base.search&&!base.hash);
const token=process.env.JOURNAL_TEST_SETUP_TOKEN,username=process.env.JOURNAL_TEST_USERNAME,password=process.env.JOURNAL_TEST_PASSWORD;
assert.ok(token&&username&&password,'Supply credentials for an isolated fresh preview.');
const owner=new Map(),visitor=new Map(),second=new Map(),ids=[];
async function api(route,{jar=visitor,method='GET',data,raw,status=200,headers={}}={}) {
  const response=await fetch(new URL(route,base),{method,headers:{cookie:[...jar].map(([key,value])=>`${key}=${value}`).join('; '),
    ...(method!=='GET'?{origin:base.origin,'Content-Type':'application/json'}:{}),...headers},
    ...(raw!==undefined?{body:raw}:data!==undefined?{body:JSON.stringify(data)}:{})});
  for(const cookie of response.headers.getSetCookie()) {const pair=cookie.split(';')[0],index=pair.indexOf('=');jar.set(pair.slice(0,index),pair.slice(index+1));}
  const body=await response.text();assert.equal(response.status,status,`${method} ${route}: ${body.slice(0,400)}`);
  return body?JSON.parse(body):null;
}
const view=(path,options={})=>api('/api/analytics',{method:'POST',data:{path},...options});
try {
  assert.deepEqual(await api('/api/analytics'),{pageViews:0,articleViews:0},'Use a fresh disposable preview.');
  const session=await api('/api/session',{jar:owner});
  await api('/api/auth/'+(session.setupRequired?'setup':'login'),{jar:owner,method:'POST',status:session.setupRequired?201:200,data:{username,password,...(session.setupRequired?{token}:{})}});
  const fields={title:'阅读统计检查',content:'实际接口、重复刷新及站主排除。',excerpt:'隔离测试文章',category:'Daily Life',tags:[],coverImage:'',status:'published'};
  const {post}=await api('/api/posts',{jar:owner,method:'POST',status:201,data:fields});ids.push(post.id);
  const draft=(await api('/api/posts',{jar:owner,method:'POST',status:201,data:{...fields,status:'draft'}})).post;ids.push(draft.id);
  assert.equal(post.viewCount,0);
  for(const route of ['/', '/articles', `/posts/${post.id}`]) {
    const response=await fetch(new URL(route,base));assert.equal(response.status,200);const html=await response.text();
    if(route==='/')assert.ok(html.includes('文章阅读')&&html.includes('总访问量'));
    if(route.includes('posts/'))assert.ok(html.includes('article-view-count'));
  }
  assert.deepEqual(await api('/api/analytics'),{pageViews:0,articleViews:0});
  const first=await view(`/posts/${post.id}`);assert.equal(first.postViews,1);assert.equal(first.pageViews,1);
  assert.ok(visitor.has('journal_visitor_local'));
  const repeated=await Promise.all(Array.from({length:12},()=>view(`/posts/${post.id}`)));
  assert.ok(repeated.every(result=>result.postViews===1&&!result.counted));
  assert.equal((await view(`/posts/${post.id}`,{jar:second})).postViews,2);
  assert.equal((await view('/about')).pageViews,3);
  const excluded=await view(`/posts/${post.id}`,{jar:owner});assert.ok(excluded.excluded&&!excluded.counted);
  assert.ok(!owner.has('journal_visitor_local'));
  console.log('PASS real pages render zero counts without increasing them; anonymous browser cookies deduplicate parallel requests and real owner login is excluded');

  await view(`/posts/${draft.id}`,{status:404});
  await view('/admin',{status:404});
  await view('/',{headers:{origin:'https://untrusted.invalid'},status:403});
  await api('/api/analytics',{method:'POST',data:{path:'/',isOwner:true},status:400});
  await api('/api/analytics',{method:'POST',raw:'{',status:400});
  await api('/api/analytics',{method:'POST',raw:'x'.repeat(2049),status:413});
  await api('/api/analytics',{method:'POST',raw:'{}',headers:{'Content-Type':'text/plain'},status:415});
  assert.deepEqual(await api('/api/analytics'),{pageViews:3,articleViews:2});
  assert.equal((await api('/api/posts')).posts.find(value=>value.id===post.id).viewCount,2);
  const updated=await api('/api/posts/'+post.id,{jar:owner,method:'PUT',data:{...fields,title:'更新正文不清除阅读量'}});
  assert.equal(updated.post.viewCount,2);
  const body=await (await fetch(new URL(`/posts/${post.id}`,base))).text();
  assert.match(body,/article-view-count[\s\S]*?2<!-- --> 次阅读/);
  assert.deepEqual(await api('/api/analytics'),{pageViews:3,articleViews:2});
  console.log('PASS malformed, cross-site, oversized and private-page submissions cannot count; article lists and SSR retain reads after editing');
} finally {
  for(const id of ids)await api('/api/posts/'+id,{jar:owner,method:'DELETE'});
}

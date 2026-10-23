/** Use only against an isolated local preview; settings are restored and test posts removed. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
const base=new URL(process.argv[2]||'http://127.0.0.1:3102');
assert.ok(base.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(base.hostname)&&base.pathname==='/'&&!base.username&&!base.password&&!base.search&&!base.hash,'Use an isolated loopback preview, never a production tunnel.');
const origin=base.origin,token=process.env.JOURNAL_TEST_SETUP_TOKEN||'',username=process.env.JOURNAL_TEST_USERNAME||'owner-comment-qa',password=process.env.JOURNAL_TEST_PASSWORD||randomBytes(24).toString('base64url');
assert.match(token,/^[A-Za-z0-9_-]{32,256}$/,'Supply the setup token of a disposable local server.');
const owner=new Map(),visitor=new Map(),second=new Map(),ids=[];let originalSettings,settingsChanged=false;
async function api(path,{method='GET',data,jar=visitor,status=200,headers={}}={}){
  const response=await fetch(origin+path,{method,redirect:'manual',headers:{cookie:[...jar].map(([name,value])=>`${name}=${value}`).join('; '),...(method!=='GET'?{origin,'Content-Type':'application/json'}:{}),...headers},...(data!==undefined?{body:JSON.stringify(data)}:{})});
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],split=pair.indexOf('=');if(/Max-Age=0(?:;|$)/.test(cookie))jar.delete(pair.slice(0,split));else jar.set(pair.slice(0,split),pair.slice(split+1));}
  const raw=await response.text();assert.equal(response.status,status,`${method} ${path}: ${raw}`);return raw?JSON.parse(raw):null;
}
try{
  const initial=await api('/api/session',{jar:owner});
  await api('/api/auth/'+(initial.setupRequired?'setup':'login'),{method:'POST',jar:owner,status:initial.setupRequired?201:200,data:{username,password,...(initial.setupRequired?{token}:{})}});
  originalSettings=(await api('/api/settings')).settings;
  const name='JuiceGao 站主检查',avatar='/favicon.svg';
  await api('/api/settings',{method:'PUT',jar:owner,data:{...originalSettings,name,avatar}});settingsChanged=true;
  const {post}=await api('/api/posts',{method:'POST',jar:owner,status:201,data:{title:'站主评论标识检查',excerpt:'站主与同名游客必须能够区分。',content:'用于站主评论与回复的本地检查。',category:'Daily Life',tags:[],kind:'article',status:'published',coverImage:'',collectionId:null,collectionOrder:0}});ids.push(post.id);const endpoint=`/api/posts/${post.id}/comments`;
  assert.equal((await api('/api/comment-auth/session')).owner,null);
  const ownSession=await api('/api/comment-auth/session',{jar:owner});assert.deepEqual(ownSession.owner,{nickname:name,avatar});assert.equal(ownSession.user,null);assert.deepEqual(Object.keys(ownSession.owner).sort(),['avatar','nickname']);
  await api(endpoint,{method:'POST',status:401,data:{identity:'owner',content:'未经验证的站主'}});
  await api(endpoint,{method:'POST',status:400,data:{nickname:name,isAdmin:true,content:'伪造站主标记'}});
  const forged=new Map([['journal_admin_local',randomBytes(32).toString('base64url')]]);
  await api(endpoint,{method:'POST',jar:forged,status:401,data:{identity:'owner',content:'伪造登录会话'}});
  const guest=await api(endpoint,{method:'POST',status:201,headers:{'x-user-id':'owner','x-is-admin':'true'},data:{nickname:name,content:'同名游客的评论'}});assert.equal(guest.published,false);assert.equal((await api(endpoint)).comments.length,0);
  const pending=(await api('/api/admin/comments?status=pending',{jar:owner})).comments.find(comment=>comment.postId===post.id);assert.ok(pending);assert.equal(pending.isAdmin,false);
  await api('/api/admin/comments/'+pending.id,{method:'PATCH',jar:owner,data:{status:'approved'}});
  console.log('PASS only a valid administrator session reveals owner identity; matching names, forged cookies, role fields and identity headers cannot impersonate the owner');

  const direct=await api(endpoint,{method:'POST',jar:owner,status:201,data:{identity:'owner',content:'文章页站主评论'}});assert.equal(direct.published,true);
  const automatic=await api(endpoint,{method:'POST',jar:owner,status:201,data:{identity:'guest',nickname:'不能替换站主昵称',content:'已登录站主自动识别'}});assert.equal(automatic.published,true);
  await api(endpoint,{method:'POST',jar:owner,status:201,data:{identity:'owner',parentId:pending.id,content:'文章页站主回复'}});
  const adminReply=(await api('/api/admin/comments/'+pending.id+'/reply',{method:'POST',jar:owner,status:201,data:{content:'后台站主回复'}})).comment;assert.equal(adminReply.isAdmin,true);assert.equal(adminReply.avatar,avatar);assert.equal(adminReply.nickname,name);
  const visible=(await api(endpoint)).comments;assert.equal(visible.length,5);
  assert.equal(visible.find(comment=>comment.content==='同名游客的评论').isAdmin,false);
  for(const content of ['文章页站主评论','已登录站主自动识别','文章页站主回复','后台站主回复']){const comment=visible.find(value=>value.content===content);assert.ok(comment);assert.equal(comment.isAdmin,true);assert.equal(comment.nickname,name);assert.equal(comment.avatar,avatar);}
  assert.equal(visible.find(comment=>comment.content==='文章页站主回复').parentId,pending.id);
  assert.ok(visible.every(comment=>!('username'in comment)&&!('passwordHash'in comment)));
  await api(endpoint,{method:'POST',jar:owner,status:403,headers:{origin:'https://untrusted.invalid'},data:{identity:'owner',content:'跨站提交不可用'}});
  console.log('PASS front-page comments, front-page replies and admin replies all publish with the trusted site profile; visitors remain moderated');

  await api('/api/auth/login',{method:'POST',jar:second,data:{username,password}});const revoked=new Map(second);
  await api('/api/auth/logout',{method:'POST',jar:second,data:{}});
  assert.equal((await api('/api/comment-auth/session',{jar:revoked})).owner,null);
  await api(endpoint,{method:'POST',jar:revoked,status:401,data:{identity:'owner',content:'退出后不能复用站主身份'}});
  await api('/api/admin/comments/'+pending.id+'/reply',{method:'POST',jar:revoked,status:401,data:{content:'已撤销会话不能回复'}});
  assert.equal((await api('/api/session',{jar:owner})).isAdmin,true);
  console.log('PASS logout invalidates stale owner claims in both reply paths while another valid owner session continues to work');
}finally{
  if(settingsChanged)await api('/api/settings',{method:'PUT',jar:owner,data:originalSettings});
  for(const id of ids)await api('/api/posts/'+id,{method:'DELETE',jar:owner});
}

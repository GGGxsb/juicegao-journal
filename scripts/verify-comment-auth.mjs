/** SQLite upgrade, QQ callbacks, identity attribution and disabled GitHub login. */
import assert from 'node:assert/strict';
import {copyFileSync,mkdirSync,mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {register} from 'tsx/esm/api';
import {closeDatabase,migrateDatabase} from '../db/sqlite.mjs';
const root=path.resolve(tmpdir()),directory=mkdtempSync(path.join(root,'journal-comment-auth-')),legacy=path.join(directory,'migrations');mkdirSync(legacy);
// Stale GitHub environment values must not re-enable its login.
Object.assign(process.env,{DATA_DIR:path.join(directory,'data'),ADMIN_SETUP_TOKEN_HASH:'a'.repeat(64),APP_ORIGIN:'https://juicegao.site',GITHUB_OAUTH_CLIENT_ID:'disabled-test-client',GITHUB_OAUTH_CLIENT_SECRET:'g'.repeat(40),QQ_OAUTH_APP_ID:'100000001',QQ_OAUTH_APP_KEY:'q'.repeat(32)});
const origin=process.env.APP_ORIGIN,unregister=register();let db;
const sha=value=>createHash('sha256').update(value).digest('hex');
const request=(pathname,{cookie='',body,headers={}}={})=>new Request(origin+pathname,{method:body?'POST':'GET',headers:{host:'juicegao.site',origin,cookie,...headers},...(body?{body:JSON.stringify(body)}:{})});
const cookiePair=value=>value.split(';')[0];
const sessionCookie=response=>response.headers.getSetCookie().find(value=>value.startsWith('__Host-journal_comment_session='));
try{
  for(const name of readdirSync('drizzle').filter(name=>/^000[0-7]_.*\.sql$/.test(name)))copyFileSync(path.join('drizzle',name),path.join(legacy,name));
  assert.equal(migrateDatabase(legacy).applied,8);db=new DatabaseSync(path.join(process.env.DATA_DIR,'journal.sqlite'));db.exec('PRAGMA foreign_keys=ON');
  const postId=randomUUID(),oldComment=randomUUID(),stamp=new Date().toISOString();
  db.prepare('INSERT INTO posts(id,title,slug,content,status,created_at,updated_at)VALUES(?,?,?,?,?,?,?)').run(postId,'评论登录检查',postId,'公开文章','published',stamp,stamp);
  db.prepare('INSERT INTO comments(id,post_id,nickname,content,status,created_at)VALUES(?,?,?,?,?,?)').run(oldComment,postId,'旧游客','原有评论','approved',stamp);
  const original={...db.prepare('SELECT * FROM comments WHERE id=?').get(oldComment)};assert.equal(migrateDatabase().applied,1);
  const upgraded={...db.prepare('SELECT * FROM comments WHERE id=?').get(oldComment)};for(const [key,value]of Object.entries(original))assert.equal(upgraded[key],value);assert.equal(upgraded.provider,'');assert.equal(upgraded.author_id,null);
  const {startCommentLogin,finishCommentLogin,commentSession,commentAccount,logoutCommentAccount}=await import('../app/lib/comment-auth.ts');
  const {submitComment,listPublicComments}=await import('../app/lib/interactions.ts');
  const {exchangeCommentProfile}=await import('../app/lib/comment-oauth-providers.ts');
  assert.deepEqual((await commentSession(request('/'))).providers.map(value=>value.id),['qq']);
  const savedKey=process.env.QQ_OAUTH_APP_KEY;delete process.env.QQ_OAUTH_APP_KEY;assert.deepEqual((await commentSession(request('/'))).providers,[]);
  await assert.rejects(startCommentLogin(request('/api/comment-auth/qq/start',{body:{postId}}),'qq',{postId}),error=>error.status===503);process.env.QQ_OAUTH_APP_KEY=savedKey;
  await assert.rejects(startCommentLogin(request('/api/comment-auth/github/start',{body:{postId}}),'github',{postId}),error=>error.status===404);
  await assert.rejects(finishCommentLogin(request('/api/comment-auth/github/callback?state=old&code=old'),'github'),error=>error.status===404);
  const oldToken=randomBytes(32).toString('base64url'),oldAccount=randomUUID();
  db.prepare('INSERT INTO comment_accounts(id,provider,client_id,subject,nickname,created_at,updated_at)VALUES(?,?,?,?,?,?,?)').run(oldAccount,'github','legacy-app','123','历史作者',stamp,stamp);
  db.prepare('INSERT INTO comment_sessions(token_hash,account_id,expires_at,created_at)VALUES(?,?,?,?)').run(sha(oldToken),oldAccount,Date.now()+60000,Date.now());
  const oldCookie='__Host-journal_comment_session='+oldToken;assert.equal(await commentAccount(request('/',{cookie:oldCookie})),null);
  await assert.rejects(submitComment(request('/',{cookie:oldCookie,body:{}}),postId,{identity:'account',content:'旧 GitHub 会话不可复用'}),error=>error.status===401);
  console.log('PASS only QQ is offered; GitHub credentials, endpoints and old sessions cannot enable login, and historical data remains intact');

  const stateFor=async(cookie='')=>{
    const started=await startCommentLogin(request('/api/comment-auth/qq/start',{cookie,body:{postId}}),'qq',{postId});const url=new URL(started.url);
    assert.ok(!started.url.includes(process.env.QQ_OAUTH_APP_KEY));assert.ok(started.cookie.includes('HttpOnly; SameSite=Lax')&&started.cookie.includes('; Secure'));
    return {state:url.searchParams.get('state'),cookie:cookiePair(started.cookie),url};
  };
  await assert.rejects(startCommentLogin(request('/api/comment-auth/qq/start',{body:{postId},headers:{origin:'https://attacker.invalid'}}),'qq',{postId}),error=>error.status===403);
  await assert.rejects(startCommentLogin(request('/api/comment-auth/qq/start',{body:{postId}}),'qq',{postId,returnTo:'https://attacker.invalid'}),error=>error.status===400);
  const started=await stateFor();assert.equal(started.url.origin,'https://graph.qq.com');assert.equal(started.url.searchParams.get('scope'),'get_user_info');assert.equal(started.url.searchParams.get('redirect_uri'),origin+'/api/comment-auth/qq/callback');
  const attempt=db.prepare('SELECT * FROM comment_oauth_attempts WHERE state_hash=?').get(sha(started.state));assert.notEqual(attempt.browser_hash,started.cookie.split('=')[1]);
  let calls=0,subject='OPENID_READER_123456';
  const qqFetch=async(input,init)=>{calls++;const url=new URL(input);assert.equal(url.origin,'https://graph.qq.com');assert.equal(init.redirect,'error');assert.ok(init.signal);
    if(url.pathname.endsWith('/token')){assert.equal(url.searchParams.get('fmt'),'json');assert.equal(url.searchParams.get('client_secret'),process.env.QQ_OAUTH_APP_KEY);return Response.json({access_token:'qq_test_access_token'});}
    if(url.pathname.endsWith('/me'))return Response.json({client_id:process.env.QQ_OAUTH_APP_ID,openid:subject});
    assert.equal(url.searchParams.get('openid'),subject);return Response.json({ret:0,nickname:'QQ 读者',figureurl_qq_2:'http://thirdqq.qlogo.cn/g?b=oidb&k=test',figureurl_qq_1:'https://attacker.invalid/image'});
  };
  const callback=`/api/comment-auth/qq/callback?state=${started.state}&code=test-code`;
  const unbound=await finishCommentLogin(request(callback),'qq',qqFetch);assert.equal(new URL(unbound.headers.get('location')).pathname,'/comment-login');assert.equal(calls,0);assert.ok(db.prepare('SELECT * FROM comment_oauth_attempts WHERE state_hash=?').get(sha(started.state)));
  const signed=await finishCommentLogin(request(callback,{cookie:started.cookie}),'qq',qqFetch);assert.equal(calls,3);assert.equal(new URL(signed.headers.get('location')).searchParams.get('commentLogin'),'success');
  const visitor=cookiePair(sessionCookie(signed)),user=await commentAccount(request('/',{cookie:visitor}));assert.equal(user.nickname,'QQ 读者');assert.equal(user.avatar,'https://thirdqq.qlogo.cn/g?b=oidb&k=test');
  assert.deepEqual(Object.keys((await commentSession(request('/',{cookie:visitor}))).user).sort(),['avatar','nickname','provider']);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM admin_sessions').get().count,0);assert.ok(db.prepare('SELECT token_hash FROM comment_sessions WHERE token_hash=?').get(sha(visitor.split('=')[1])));
  await finishCommentLogin(request(callback,{cookie:started.cookie}),'qq',qqFetch);assert.equal(calls,3);
  console.log('PASS QQ callback/client binding, safe avatars, one-use browser-bound state and hashed private sessions');

  await assert.rejects(submitComment(request('/',{body:{}}),postId,{identity:'account',nickname:'冒名',content:'没有会话'}),error=>error.status===401);
  await assert.rejects(submitComment(request('/',{cookie:visitor,body:{}}),postId,{identity:'account',content:'伪造来源',provider:'qq'}),error=>error.status===400);
  await submitComment(request('/',{cookie:visitor,body:{}}),postId,{identity:'account',nickname:'试图更换已验证昵称',content:'平台身份评论'});
  let submitted=db.prepare("SELECT * FROM comments WHERE content='平台身份评论'").get();assert.equal(submitted.nickname,'QQ 读者');assert.equal(submitted.provider,'qq');assert.equal(submitted.author_id,user.id);assert.equal(submitted.is_admin,0);assert.equal(submitted.status,'pending');
  assert.equal((await listPublicComments(postId,new URLSearchParams())).comments.length,1);db.prepare("UPDATE comments SET status='approved' WHERE id=?").run(submitted.id);
  const visible=(await listPublicComments(postId,new URLSearchParams())).comments.find(value=>value.id===submitted.id);assert.equal(visible.provider,'qq');assert.ok(visible.avatar);assert.ok(!('authorId'in visible)&&!('subject'in visible)&&!('client_id'in visible));
  await submitComment(request('/',{cookie:visitor,body:{}}),postId,{identity:'guest',nickname:'主动使用游客',content:'游客仍需审核'});const guest=db.prepare("SELECT * FROM comments WHERE content='游客仍需审核'").get();assert.equal(guest.author_id,null);assert.equal(guest.provider,'');assert.equal(guest.avatar,'');
  console.log('PASS verified authors cannot be forged; guest choice and moderation remain available');

  const expired=await stateFor();db.prepare('UPDATE comment_oauth_attempts SET expires_at=0 WHERE state_hash=?').run(sha(expired.state));assert.equal(new URL((await finishCommentLogin(request(`/api/comment-auth/qq/callback?state=${expired.state}&code=expired`,{cookie:expired.cookie}),'qq',qqFetch)).headers.get('location')).pathname,'/comment-login');assert.equal(calls,3);
  const cancelled=await stateFor();assert.equal(new URL((await finishCommentLogin(request(`/api/comment-auth/qq/callback?state=${cancelled.state}&error=access_denied`,{cookie:cancelled.cookie}),'qq',qqFetch)).headers.get('location')).searchParams.get('commentLogin'),'cancelled');assert.equal(calls,3);
  const switched=await stateFor(visitor);subject='OPENID_OTHER_READER';const switchedResponse=await finishCommentLogin(request(`/api/comment-auth/qq/callback?state=${switched.state}&code=other`,{cookie:switched.cookie+'; '+visitor}),'qq',qqFetch);const activeCookie=cookiePair(sessionCookie(switchedResponse));assert.equal(await commentAccount(request('/',{cookie:visitor})),null);assert.notEqual((await commentAccount(request('/',{cookie:activeCookie}))).id,user.id);
  const qqConfig={id:'qq',clientId:process.env.QQ_OAUTH_APP_ID,clientSecret:process.env.QQ_OAUTH_APP_KEY};
  await assert.rejects(exchangeCommentProfile(qqConfig,'code',origin+'/callback',async input=>new URL(input).pathname.endsWith('/token')?Response.json({access_token:'qq_test_access_token'}):Response.json({client_id:'someone-else',openid:subject})),error=>error.status===502);
  await assert.rejects(exchangeCommentProfile(qqConfig,'code',origin+'/callback',async()=>{throw new Error('sensitive-provider-url?access_token=secret');}),error=>error.status===502&&!error.message.includes('secret'));
  await logoutCommentAccount(request('/api/comment-auth/logout',{cookie:activeCookie,body:{}}));assert.equal(await commentAccount(request('/',{cookie:activeCookie})),null);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(migrateDatabase().applied,0);db.prepare('DELETE FROM comment_accounts WHERE id=?').run(user.id);submitted=db.prepare('SELECT * FROM comments WHERE id=?').get(submitted.id);assert.equal(submitted.author_id,null);assert.equal(submitted.provider,'qq');assert.equal(submitted.nickname,'QQ 读者');
  console.log('PASS expiry, cancellation, account switching, sanitized errors and logout');
}finally{db?.close();closeDatabase();unregister();const resolved=path.resolve(directory);assert.equal(path.dirname(resolved),root);assert.ok(path.basename(resolved).startsWith('journal-comment-auth-'));rmSync(resolved,{recursive:true,force:true});}

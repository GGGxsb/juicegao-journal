/** Real migrations, SQLite transactions, signed visitors and real admin sessions. */
import assert from 'node:assert/strict';
import {copyFileSync,mkdirSync,mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {register} from 'tsx/esm/api';
import {closeDatabase,migrateDatabase} from '../db/sqlite.mjs';

const directory=mkdtempSync(path.join(tmpdir(),'journal-analytics-'));
const originalDirectory=process.env.DATA_DIR,originalSecret=process.env.ADMIN_SETUP_TOKEN_HASH;
const originalNow=Date.now;let now=originalNow(),database;
process.env.DATA_DIR=path.join(directory,'upgraded');
process.env.ADMIN_SETUP_TOKEN_HASH=randomBytes(32).toString('hex');
Date.now=()=>now;
const unregister=register(),migrations=path.join(directory,'migrations');mkdirSync(migrations);
const files=readdirSync('drizzle').filter(name=>/^\d.*\.sql$/.test(name)).sort();
const ids=[randomUUID(),randomUUID(),randomUUID()],stamp=new Date(now).toISOString();
function open(){database=new DatabaseSync(path.join(process.env.DATA_DIR,'journal.sqlite'));database.exec('PRAGMA foreign_keys=ON');}
const headers={host:'127.0.0.1:3100',origin:'http://127.0.0.1:3100','content-type':'application/json','user-agent':'Journal analytics verification'};
const request=(cookie='',extra={})=>new Request('http://127.0.0.1:3100/api/analytics',{method:'POST',headers:{...headers,cookie,...extra},body:'{}'});
const cookiePair=result=>result.cookie?.split(';')[0]||'';
try {
  for(const name of files.filter(name=>name<'0013_'))copyFileSync(path.join('drizzle',name),path.join(migrations,name));
  migrateDatabase(migrations);open();
  const insert=database.prepare('INSERT INTO posts(id,slug,title,content,category,tags,status,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
  ids.forEach((id,index)=>insert.run(id,id,`Analytics ${index}`,'Preserved writing','Daily Life',JSON.stringify(['topic','C++ / 中文 # %']),index===2?'draft':'published',stamp,stamp,stamp));
  database.prepare('INSERT INTO comments(id,post_id,nickname,content,status,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),ids[0],'Guest','Preserved comment','approved',stamp);
  const before=database.prepare('SELECT * FROM posts ORDER BY id').all().map(post=>({...post}));
  const comments=database.prepare('SELECT * FROM comments').all();
  copyFileSync('drizzle/0013_page_analytics.sql',path.join(migrations,'0013_page_analytics.sql'));
  assert.equal(migrateDatabase(migrations).applied,1);
  assert.deepEqual(database.prepare('SELECT * FROM posts ORDER BY id').all().map(({view_count,...post})=>post),before);
  assert.deepEqual(database.prepare('SELECT * FROM comments').all(),comments);
  assert.ok(database.prepare('SELECT view_count FROM posts').all().every(row=>row.view_count===0));
  assert.equal(migrateDatabase(migrations).applied,0);
  console.log('PASS upgrade preserves articles, timestamps and comments; counters start at zero and migration is idempotent');

  // The normal runtime must see the same complete migration set.
  migrateDatabase();
  const {recordPageView,getTrafficTotals}=await import('../app/lib/analytics.ts');
  const {queryPosts,getPublishedPost}=await import('../app/lib/server.ts');
  const {getHomeOverview}=await import('../app/lib/home.ts');
  const view=(cookie='',pathname=`/posts/${ids[0]}`,extra={})=>recordPageView(request(cookie,extra),{path:pathname});
  assert.deepEqual(await getTrafficTotals(),{pageViews:0,articleViews:0});
  await queryPosts();await getPublishedPost(ids[0]);
  assert.deepEqual(await getTrafficTotals(),{pageViews:0,articleViews:0});
  const first=await view(),visitor=cookiePair(first);
  assert.equal(first.data.postViews,1);assert.equal(first.data.pageViews,1);assert.ok(first.data.counted);
  assert.match(first.cookie,/HttpOnly; SameSite=Strict; Max-Age=31536000/);
  assert.ok(!first.cookie.includes('; Secure'));
  const concurrent=await Promise.all(Array.from({length:16},()=>view(visitor)));
  assert.ok(concurrent.every(result=>!result.data.counted&&result.data.postViews===1));
  const encoded='/posts/'+[...ids[0]].map(char=>'%'+char.charCodeAt(0).toString(16)).join('');
  assert.equal((await view(visitor,encoded)).data.postViews,1);
  assert.equal((await view()).data.postViews,2);
  assert.equal((await view(visitor,`/posts/${ids[1]}`)).data.postViews,1);
  assert.deepEqual(await getTrafficTotals(),{pageViews:3,articleViews:3});
  assert.equal(database.prepare('SELECT updated_at FROM posts WHERE id=?').get(ids[0]).updated_at,stamp);
  assert.ok(database.prepare('SELECT visitor_hash FROM post_readers').all().every(row=>/^[a-f0-9]{64}$/.test(row.visitor_hash)&&!visitor.includes(row.visitor_hash)));
  console.log('PASS concurrent refreshes and equivalent URLs count each browser/article once; distinct browsers and articles count independently without modifying writing');

  await view(visitor,'/about');await view(visitor,'/about');await view(visitor,'/');
  assert.deepEqual(await getTrafficTotals(),{pageViews:5,articleViews:3});
  now+=30*60*1000+1;
  const later=await view(visitor);assert.equal(later.data.pageViews,6);assert.equal(later.data.postViews,2);
  assert.deepEqual((await getHomeOverview()).traffic,{pageViews:6,articleViews:3});
  assert.equal((await queryPosts()).posts.find(post=>post.id===ids[0]).viewCount,2);
  console.log('PASS separate pages add visits, refreshes within 30 minutes do not, later visits add PV without adding article readers, and homepage/list data exposes persisted totals');

  const session=randomBytes(32).toString('base64url');
  database.prepare('INSERT INTO admin_accounts(id,username,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)').run('owner','site-owner','test-only',now,now);
  database.prepare('INSERT INTO admin_sessions(token_hash,account_id,auth_version,expires_at,created_at) VALUES(?,?,1,?,?)').run(createHash('sha256').update(session).digest('hex'),'owner',now+7*86400000,now);
  const owner=await view(`journal_admin_local=${session}`);
  assert.ok(owner.data.excluded);assert.equal(owner.cookie,null);
  assert.ok((await view(`journal_admin_local=${session}`,'/tags/'+encodeURIComponent('C++ / 中文 # %'))).data.excluded);
  const bot=await view('',`/posts/${ids[0]}`,{'user-agent':'Googlebot/2.1'});
  assert.ok(bot.data.excluded);assert.equal(bot.cookie,null);
  assert.deepEqual(await getTrafficTotals(),{pageViews:6,articleViews:3});
  for(const pathname of ['/admin','/not-a-page',`/posts/${ids[2]}`,`/posts/${randomUUID()}`,'/tags/unknown','/articles?fake=1']) {
    await assert.rejects(view(visitor,pathname),error=>error.status===404);
  }
  await assert.rejects(view(visitor,'/',{origin:'https://untrusted.invalid'}),error=>error.status===403);
  await assert.rejects(recordPageView(request(visitor),{path:'/',isOwner:true}),error=>error.status===400);
  assert.deepEqual(await getTrafficTotals(),{pageViews:6,articleViews:3});
  const tagged=await view(visitor,'/tags/topic');assert.equal(tagged.data.pageViews,7);
  console.log('PASS real admin sessions and crawlers are excluded; drafts, missing pages, forged owner flags and cross-origin writes cannot affect counters');

  database.exec(`CREATE TRIGGER analytics_test_rollback BEFORE INSERT ON post_readers BEGIN SELECT RAISE(ABORT,'test rollback'); END;`);
  await assert.rejects(view('',`/posts/${ids[1]}`));
  assert.deepEqual(await getTrafficTotals(),{pageViews:7,articleViews:3});
  database.exec('DROP TRIGGER analytics_test_rollback');
  const secure=await recordPageView(new Request('https://juicegao.site/api/analytics',{method:'POST',headers:{host:'juicegao.site',origin:'https://juicegao.site'}}),{path:'/about'});
  assert.match(secure.cookie,/^__Host-journal_visitor=/);assert.ok(secure.cookie.endsWith('; Secure'));
  const tampered=visitor.replace(/.$/,visitor.endsWith('0')?'1':'0');
  const repaired=await view(tampered);assert.ok(repaired.cookie);assert.equal(repaired.data.postViews,3);
  assert.deepEqual(await getTrafficTotals(),{pageViews:9,articleViews:4});
  now+=25*60*60*1000;
  const pruned=await view(visitor);assert.equal(pruned.data.postViews,3);assert.equal(pruned.data.pageViews,10);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM page_visit_windows').get().count,1);
  database.close();database=undefined;closeDatabase();
  assert.deepEqual(await getTrafficTotals(),{pageViews:10,articleViews:4});
  assert.equal((await view(visitor)).data.pageViews,10);
  open();database.prepare('DELETE FROM posts WHERE id=?').run(ids[0]);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM post_readers WHERE post_id=?').get(ids[0]).count,0);
  assert.deepEqual(await getTrafficTotals(),{pageViews:10,articleViews:1});
  assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  console.log('PASS transactions roll back together, cookies are signed and HTTPS-safe, old visit windows expire without losing totals, restart preserves deduplication and deletion cleans article readers');

  database.close();database=undefined;closeDatabase();process.env.DATA_DIR=path.join(directory,'fresh');
  assert.equal(migrateDatabase().applied,files.length);
  assert.deepEqual(await getTrafficTotals(),{pageViews:0,articleViews:0});
  assert.equal(migrateDatabase().applied,0);
  console.log('PASS fresh installation applies the full schema with zero counters');
  const limited=await recordPageView(request(),{path:'/about'}),limitedCookie=cookiePair(limited);
  for(let index=1;index<240;index++)await recordPageView(request(limitedCookie),{path:'/about'});
  await assert.rejects(recordPageView(request(limitedCookie),{path:'/about'}),error=>error.status===429);
  assert.deepEqual(await getTrafficTotals(),{pageViews:1,articleViews:0});
  console.log('PASS the request limit rejects flooding without raising visit counts');
} finally {
  Date.now=originalNow;database?.close();closeDatabase();unregister();
  if(originalDirectory===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=originalDirectory;
  if(originalSecret===undefined)delete process.env.ADMIN_SETUP_TOKEN_HASH;else process.env.ADMIN_SETUP_TOKEN_HASH=originalSecret;
  const resolved=path.resolve(directory);
  if(path.dirname(resolved)===path.resolve(tmpdir())&&path.basename(resolved).startsWith('journal-analytics-'))rmSync(resolved,{recursive:true,force:true});
}

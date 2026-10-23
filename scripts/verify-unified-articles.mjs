/** Retire notes without losing writing, identities or article interactions. */
import assert from 'node:assert/strict';
import {copyFileSync,mkdirSync,mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {register} from 'tsx/esm/api';
import {closeDatabase,migrateDatabase} from '../db/sqlite.mjs';

const temporaryRoot=path.resolve(tmpdir()),directory=mkdtempSync(path.join(temporaryRoot,'journal-unified-articles-'));
const migrations=path.join(directory,'migrations');mkdirSync(migrations);const unregister=register();let db;
const migrationFiles=readdirSync('drizzle').filter(name=>/^\d{4}_.*\.sql$/.test(name));
function open(){db=new DatabaseSync(path.join(process.env.DATA_DIR,'journal.sqlite'));db.exec('PRAGMA foreign_keys=ON');}
function rows(table){return db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all().map(row=>({...row}));}
function assertSchema(){
  assert.ok(!db.prepare('PRAGMA table_info(posts)').all().some(column=>column.name==='kind'));
  assert.deepEqual(db.prepare('PRAGMA index_info(posts_category_navigation_idx)').all().map(column=>column.name),['category','status','published_at','id']);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
}
try{
  for(const name of migrationFiles.filter(name=>Number(name.slice(0,4))<=10))copyFileSync(path.join('drizzle',name),path.join(migrations,name));
  process.env.DATA_DIR=path.join(directory,'upgraded');assert.equal(migrateDatabase(migrations).applied,11);open();
  const owner=randomUUID(),article=randomUUID(),note=randomUUID(),draft=randomUUID(),technical=randomUUID(),comment=randomUUID();
  const base=Date.now()-3600000,stamp=new Date(base).toISOString();
  db.prepare('INSERT INTO admin_accounts(id,username,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)').run(owner,'site-owner','test-only',1,1);
  for(const [index,id,kind,status,category] of [[0,article,'article','published','Daily Life'],[1,note,'note','published','Daily Life'],[2,draft,'note','draft','Daily Life'],[3,technical,'article','published','Technical']]){
    const time=new Date(base+index).toISOString();
    db.prepare('INSERT INTO posts(id,title,slug,excerpt,content,category,tags,kind,status,cover_image,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id,kind==='note'?'原随记内容':'原文章',id,'保留摘要','## 保留正文\n\n![图片](/cover.png)',category,'["原标签",".",".."]',kind,status,'/cover.png',status==='published'?time:'',time,time);
  }
  db.prepare('INSERT INTO comments(id,post_id,nickname,content,status,created_at) VALUES(?,?,?,?,?,?)').run(comment,note,'访客','随记下的评论','approved',stamp);
  db.prepare('INSERT INTO comments(id,post_id,nickname,content,parent_id,is_admin,status,created_at) VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),note,'站主','随记下的回复',comment,1,'approved',stamp);
  db.prepare('INSERT INTO post_likes(post_id,visitor_hash,created_at) VALUES(?,?,?)').run(note,'existing-visitor',stamp);
  const editor={id:note,title:'尚未发布的随记修改',excerpt:'备份摘要',content:'未发布的正文和图片 ![](/pending.png)',category:'Daily Life',tags:['备份标签',''],kind:'note',status:'published',coverImage:'/pending.png'};
  for(const [id,status] of [[note,'published'],[draft,'draft'],[null,'draft']]){
    const time=id?db.prepare('SELECT updated_at FROM posts WHERE id=?').get(id).updated_at:'';
    db.prepare('INSERT INTO writing_drafts(owner_id,document_key,post_id,editor,base_updated_at,revision,updated_at) VALUES(?,?,?,?,?,?,?)').run(owner,id??'new',id,JSON.stringify({...editor,id:id??'',status}),time,456,stamp);
  }
  const tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
  const preserved=tables.filter(name=>!['posts','writing_drafts','__journal_migrations'].includes(name));
  const before=Object.fromEntries(tables.map(table=>[table,rows(table)]));
  const rowIds=db.prepare('SELECT id,rowid FROM posts ORDER BY id').all();
  copyFileSync('drizzle/0011_remove_post_kinds.sql',path.join(migrations,'0011_remove_post_kinds.sql'));
  assert.deepEqual(migrateDatabase(migrations),{applied:1,total:12});db.close();open();assertSchema();
  assert.deepEqual(rows('posts'),before.posts.map(({kind,...row})=>row));
  assert.deepEqual(db.prepare('SELECT id,rowid FROM posts ORDER BY id').all(),rowIds);
  for(const table of preserved)assert.deepEqual(rows(table),before[table],`${table} changed unexpectedly`);
  const strip=({kind,...value})=>value;
  assert.deepEqual(rows('writing_drafts'),before.writing_drafts.map(row=>({...row,editor:JSON.stringify(strip(JSON.parse(row.editor)))})));
  assert.deepEqual(rows('__journal_migrations').slice(0,11),before.__journal_migrations);
  assert.equal(migrateDatabase(migrations).applied,0);
  console.log('PASS migration keeps every article and former note, immutable ID, row ID, publication state, image, comment, reply, like and pending backup; only retired kind metadata disappears');

  const {queryPosts,getPublishedPost,validatePost}=await import('../app/lib/server.ts');
  const publicPosts=await queryPosts({pageSize:50});
  assert.deepEqual(new Set(publicPosts.posts.map(post=>post.id)),new Set([article,note,technical]));
  assert.equal(publicPosts.stats.total,3);assert.ok(!Object.hasOwn(publicPosts.stats,'articles')&&!Object.hasOwn(publicPosts.stats,'notes'));
  assert.ok(publicPosts.posts.every(post=>!Object.hasOwn(post,'kind')));
  assert.equal((await getPublishedPost(note)).id,note);assert.equal(await getPublishedPost(draft),null);
  await assert.rejects(queryPosts({kind:'note'}),error=>error.status===400);
  const {id:_postId,...fields}=strip(editor),postInput={...fields,tags:fields.tags.filter(Boolean)};assert.equal(validatePost(postInput).title,editor.title);
  assert.throws(()=>validatePost({...postInput,kind:'note'}),error=>error.status===400);
  const {getArticleNavigation}=await import('../app/lib/navigation.ts');
  const navigation=await getArticleNavigation(await getPublishedPost(note));assert.equal(navigation.previous.id,article);assert.equal(navigation.next,null);
  const {getHomeOverview}=await import('../app/lib/home.ts');
  const home=await getHomeOverview();assert.ok(!Object.hasOwn(home,'notes'));assert.equal(home.activity.reduce((sum,day)=>sum+day.count,0),3);
  console.log('PASS converted notes appear in ordinary article lists, category navigation and writing statistics while unpublished notes stay private');

  const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  const {backupKey,readBackup}=await import('../app/admin/draft-backup.ts');
  const backup={key:note,editor:{...editor,collectionId:null,collectionOrder:0},baseUpdatedAt:new Date(base+1).toISOString(),revision:456,updatedAt:stamp};
  storage.set(backupKey('site-owner',note),JSON.stringify(backup));assert.deepEqual(readBackup('site-owner',note),{...backup,editor:strip(editor)});
  const {getWritingDraft,saveWritingDraft}=await import('../app/lib/writing-drafts.ts');
  assert.deepEqual((await getWritingDraft(owner,note)).editor,strip(editor));
  const saved=await saveWritingDraft(owner,note,{editor:backup.editor,revision:456,baseUpdatedAt:backup.baseUpdatedAt});assert.equal(saved.revision,457);assert.deepEqual(saved.editor,strip(editor));
  db.prepare('DELETE FROM posts WHERE id=?').run(note);assert.equal(rows('comments').length,0);assert.equal(rows('post_likes').length,0);assert.equal(rows('writing_drafts').length,2);assertSchema();
  console.log('PASS old browser and server backups recover as articles without losing content, and dependent data still cleans up correctly on deletion');

  db.close();db=undefined;closeDatabase();process.env.DATA_DIR=path.join(directory,'fresh');
  assert.equal(migrateDatabase().applied,migrationFiles.length);open();assertSchema();assert.equal(migrateDatabase().applied,0);
  console.log('PASS fresh installations contain no post-kind field and have the simplified category navigation index');
}finally{
  delete globalThis.localStorage;db?.close();closeDatabase();unregister();
  const target=path.resolve(directory);assert.equal(path.dirname(target),temporaryRoot);assert.ok(path.basename(target).startsWith('journal-unified-articles-'));rmSync(target,{recursive:true,force:true});
}

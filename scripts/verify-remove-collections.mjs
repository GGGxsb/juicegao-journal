/** Upgrade real legacy data and recover browser backups after retiring collections. */
import assert from 'node:assert/strict';
import {copyFileSync,mkdirSync,mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {register} from 'tsx/esm/api';
import {closeDatabase,migrateDatabase} from '../db/sqlite.mjs';

const temporaryRoot=path.resolve(tmpdir()),directory=mkdtempSync(path.join(temporaryRoot,'journal-remove-collections-'));
const migrations=path.join(directory,'migrations');mkdirSync(migrations);
const unregister=register();let db;
function rows(table){return db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all().map(row=>({...row}));}
function open(){db=new DatabaseSync(path.join(process.env.DATA_DIR,'journal.sqlite'));db.exec('PRAGMA foreign_keys=ON');}
function assertRemoved(){
  assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE name='collections' OR name='posts_collection_order_idx'").get(),undefined);
  assert.ok(!db.prepare('PRAGMA table_info(posts)').all().some(column=>column.name.startsWith('collection_')));
  assert.ok(!db.prepare('PRAGMA foreign_key_list(posts)').all().some(key=>key.table==='collections'));
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
}
try{
  for(const name of readdirSync('drizzle').filter(name=>/^000[0-8]_.*\.sql$/.test(name)))copyFileSync(path.join('drizzle',name),path.join(migrations,name));
  process.env.DATA_DIR=path.join(directory,'upgraded');assert.equal(migrateDatabase(migrations).applied,9);open();
  const now='2026-10-22T10:00:00.000Z',owner=randomUUID(),collection=randomUUID(),post=randomUUID(),draftPost=randomUUID(),comment=randomUUID();
  db.prepare('INSERT INTO admin_accounts(id,username,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)').run(owner,'owner','test-hash',1,1);
  db.prepare('INSERT INTO collections(id,title,description,created_at,updated_at) VALUES(?,?,?,?,?)').run(collection,'原合集','只移除合集设置',now,now);
  for(const [id,status] of [[post,'published'],[draftPost,'draft']])db.prepare('INSERT INTO posts(id,title,slug,excerpt,content,category,tags,status,cover_image,collection_id,collection_order,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,'保留标题',id,'原摘要','## 原正文\n\n保持不变。','Technical','["原标签"]',status,'/cover.png',collection,12,now,now,now);
  db.prepare('INSERT INTO comments(id,post_id,nickname,content,status,created_at) VALUES(?,?,?,?,?,?)').run(comment,post,'原访客','原评论','approved',now);
  db.prepare('INSERT INTO comments(id,post_id,nickname,content,parent_id,is_admin,status,created_at) VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),post,'站主','原回复',comment,1,'approved',now);
  db.prepare('INSERT INTO post_likes(post_id,visitor_hash,created_at) VALUES(?,?,?)').run(post,'original-visitor',now);
  const editor={id:post,title:'未发布的改动',excerpt:'备份摘要',content:'## 备份正文',category:'Technical',tags:['标签',''],kind:'article',status:'published',coverImage:'/draft-cover.png',collectionId:collection,collectionOrder:99};
  for(const id of [post,null])db.prepare('INSERT INTO writing_drafts(owner_id,document_key,post_id,editor,base_updated_at,revision,updated_at) VALUES(?,?,?,?,?,?,?)').run(owner,id??'new',id,JSON.stringify({...editor,id:id??''}),id?now:'',123,now);
  const preserved=['admin_accounts','admin_sessions','admin_rate_limits','comments','post_likes','site_settings','media','comment_accounts','comment_sessions','comment_oauth_attempts'];
  const before=Object.fromEntries([...preserved,'posts','writing_drafts','__journal_migrations'].map(table=>[table,rows(table)]));
  copyFileSync('drizzle/0009_remove_collections.sql',path.join(migrations,'0009_remove_collections.sql'));
  assert.deepEqual(migrateDatabase(migrations),{applied:1,total:10});db.close();open();assertRemoved();
  assert.deepEqual(rows('posts'),before.posts.map(({collection_id,collection_order,...row})=>row));
  for(const table of preserved)assert.deepEqual(rows(table),before[table],`${table} must remain unchanged`);
  const strip=({collectionId,collectionOrder,...value})=>value;
  assert.deepEqual(rows('writing_drafts'),before.writing_drafts.map(row=>({...row,editor:JSON.stringify(strip(JSON.parse(row.editor)))})));
  assert.deepEqual(rows('__journal_migrations').slice(0,9),before.__journal_migrations);
  assert.equal(migrateDatabase(migrations).applied,0);assert.equal(rows('writing_drafts')[0].revision,123);
  console.log('PASS collection removal preserves published articles, drafts, comments, replies, likes, accounts and backup revisions; repeat startup is safe');

  const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  const {backupKey,readBackup}=await import('../app/admin/draft-backup.ts');
  const backup={key:post,editor,baseUpdatedAt:now,revision:123,updatedAt:now};
  storage.set(backupKey('owner',post),JSON.stringify(backup));assert.deepEqual(readBackup('owner',post),{...backup,editor:strip(editor)});
  const {editorValueSchema}=await import('../app/lib/draft-state.ts');
  assert.ok(!editorValueSchema.safeParse({...editor,injected:'unexpected'}).success,'Obsolete-field compatibility must retain strict validation');
  const {getWritingDraft,saveWritingDraft}=await import('../app/lib/writing-drafts.ts');
  assert.deepEqual((await getWritingDraft(owner,post)).editor,strip(editor));
  const updated=await saveWritingDraft(owner,post,{editor,baseUpdatedAt:now,revision:123});assert.equal(updated.revision,124);assert.deepEqual(updated.editor,strip(editor));
  db.prepare('DELETE FROM posts WHERE id=?').run(post);assert.equal(rows('comments').length,0);assert.equal(rows('post_likes').length,0);assert.equal(rows('writing_drafts').length,1);assertRemoved();
  console.log('PASS legacy local backups recover and old autosave payloads remain usable; article deletion still cascades correctly');

  db.close();db=undefined;closeDatabase();process.env.DATA_DIR=path.join(directory,'fresh');
  assert.equal(migrateDatabase().applied,10);open();assertRemoved();assert.equal(migrateDatabase().applied,0);
  console.log('PASS fresh installations have no collection table, fields, index or foreign key');
}finally{
  delete globalThis.localStorage;db?.close();closeDatabase();unregister();
  const target=path.resolve(directory);assert.equal(path.dirname(target),temporaryRoot);assert.ok(path.basename(target).startsWith('journal-remove-collections-'));rmSync(target,{recursive:true,force:true});
}

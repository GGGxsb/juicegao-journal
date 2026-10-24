/** Real SQLite drafts: private ownership, CAS, live-post isolation, FK cleanup and restart. */
import assert from 'node:assert/strict';
import {copyFileSync,mkdirSync,mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {register} from 'tsx/esm/api';
import {migrateDatabase,closeDatabase} from '../db/sqlite.mjs';
const root=path.resolve(tmpdir()),dir=mkdtempSync(path.join(root,'journal-writing-drafts-'));
process.env.DATA_DIR=path.join(dir,'data');const unregister=register();let db;
const originalFetch=globalThis.fetch,originalStorage=globalThis.localStorage;
try{
  const older=path.join(dir,'migrations');mkdirSync(older);
  for(const name of readdirSync('drizzle').filter(name=>/^000[0-6]_.*\.sql$/.test(name)))copyFileSync(path.join('drizzle',name),path.join(older,name));
  assert.equal(migrateDatabase(older).applied,7);db=new DatabaseSync(path.join(process.env.DATA_DIR,'journal.sqlite'));db.exec('PRAGMA foreign_keys=ON');
  const legacyId=randomUUID();db.prepare('INSERT INTO posts(id,title,slug,content,category,tags,created_at,updated_at)VALUES(?,?,?,?,?,?,?,?)').run(legacyId,'升级前文章',legacyId,'保留原正文','Technical','["原标签"]','2026-01-01','2026-01-01');
  const originalPosts=db.prepare('SELECT * FROM posts').all();assert.ok(migrateDatabase().applied>=1);db.close();db=new DatabaseSync(path.join(process.env.DATA_DIR,'journal.sqlite'));db.exec('PRAGMA foreign_keys=ON');assert.deepEqual(db.prepare('SELECT * FROM posts').all().map(row=>({...row})),originalPosts.map(({collection_id,collection_order,kind,...row})=>({...row,city_ids:'[]',view_count:0})));
  console.log('PASS upgrading the existing database creates the backup table without changing original articles');
  for(const owner of ['writer-a','writer-b'])db.prepare('INSERT INTO admin_accounts(id,username,password_hash,created_at,updated_at)VALUES(?,?,?,?,?)').run(owner,owner,'unused-test-hash',Date.now(),Date.now());
  const {saveWritingDraft,getWritingDraft,listWritingDrafts,deleteWritingDraft}=await import('../app/lib/writing-drafts.ts');
  const editor={id:'',title:'',excerpt:'',content:'## 尚未发布\n\n未完成的正文',category:'Daily Life',tags:['标记',''],status:'draft',coverImage:''};
  const draft=await saveWritingDraft('writer-a','new',{editor,revision:0,baseUpdatedAt:''});assert.ok(draft.revision>0);assert.deepEqual(draft.editor,editor);
  assert.equal(await getWritingDraft('writer-b','new'),null);assert.deepEqual(await listWritingDrafts('writer-b'),[]);
  await assert.rejects(saveWritingDraft('writer-a','new',{editor:{...editor,title:'stale tab'},revision:0,baseUpdatedAt:''}),error=>error.status===409);
  const second=await saveWritingDraft('writer-a','new',{editor:{...editor,title:'最新自动备份'},revision:draft.revision,baseUpdatedAt:''});assert.equal(second.revision,draft.revision+1);
  await assert.rejects(deleteWritingDraft('writer-a','new',draft.revision),error=>error.status===409);assert.equal((await getWritingDraft('writer-a','new')).editor.title,'最新自动备份');
  await deleteWritingDraft('writer-b','new',second.revision);assert.equal((await getWritingDraft('writer-a','new')).revision,second.revision);
  await deleteWritingDraft('writer-a','new',second.revision);
  const recreated=await saveWritingDraft('writer-a','new',{editor:{...editor,title:'另一篇新内容'},revision:0,baseUpdatedAt:''});assert.notEqual(recreated.revision,second.revision);
  await assert.rejects(saveWritingDraft('writer-a','new',{editor,revision:second.revision,baseUpdatedAt:''}),error=>error.status===409);
  console.log('PASS incomplete writing is preserved privately and stale tabs cannot overwrite or delete a newer backup');
  const id=randomUUID(),stamp='2026-01-01T00:00:00.000Z';
  db.prepare('INSERT INTO posts(id,title,slug,content,status,published_at,created_at,updated_at)VALUES(?,?,?,?,?,?,?,?)').run(id,'前台标题',id,'前台正文','published',stamp,stamp,stamp);
  const before={...db.prepare('SELECT * FROM posts WHERE id=?').get(id)},published={...editor,id,title:'尚未发布的修改',content:'备份里的新正文',status:'published'};
  const pending=await saveWritingDraft('writer-a',id,{editor:published,revision:0,baseUpdatedAt:stamp});assert.deepEqual({...db.prepare('SELECT * FROM posts WHERE id=?').get(id)},before);
  await assert.rejects(saveWritingDraft('writer-a','new',{editor:published,revision:2,baseUpdatedAt:stamp}),error=>error.status===400);
  await assert.rejects(saveWritingDraft('writer-a',id,{editor:published,revision:pending.revision,baseUpdatedAt:'2025-01-01T00:00:00.000Z'}),error=>error.status===409);
  assert.equal(migrateDatabase().applied,0);assert.equal((await getWritingDraft('writer-a',id)).editor.content,published.content);
  assert.equal((await listWritingDrafts('writer-a')).find(draft=>draft.key===id).revision,pending.revision);

  const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  const {writeBackup,readBackup}=await import('../app/admin/draft-backup.ts');
  const {deleteDraftBackup,backupFingerprint}=await import('../app/admin/delete-draft-backup.ts');
  let beforeDelete=null,unavailable=false;
  globalThis.fetch=async(url,options={})=>{
    if(unavailable)return Response.json({error:'offline'},{status:503});
    const document=decodeURIComponent(String(url).split('/').at(-1));
    try {
      if(options.method==='DELETE') {
        if(beforeDelete){const action=beforeDelete;beforeDelete=null;await action();}
        await deleteWritingDraft('writer-a',document,JSON.parse(options.body).revision);
        return Response.json({success:true});
      }
      return Response.json({draft:await getWritingDraft('writer-a',document)});
    } catch(error){return Response.json({error:error.message},{status:error.status||500});}
  };
  writeBackup('writer-a',pending);
  await deleteDraftBackup('writer-a',{key:id,serverRevision:pending.revision,localFingerprint:backupFingerprint(pending)});
  assert.equal(readBackup('writer-a',id),null);assert.equal(await getWritingDraft('writer-a',id),null);
  assert.deepEqual({...db.prepare('SELECT * FROM posts WHERE id=?').get(id)},before);
  assert.equal((await getWritingDraft('writer-a','new')).revision,recreated.revision);
  await deleteWritingDraft('writer-a','new',recreated.revision);
  const localOnly={...recreated,revision:0};writeBackup('writer-a',localOnly);
  await deleteDraftBackup('writer-a',{key:'new',serverRevision:null,localFingerprint:backupFingerprint(localOnly)});
  assert.equal(readBackup('writer-a','new'),null);
  const remote=await saveWritingDraft('writer-a','new',{editor,revision:0,baseUpdatedAt:''});
  const expected={key:'new',serverRevision:remote.revision,localFingerprint:null};
  writeBackup('writer-a',localOnly);
  await assert.rejects(deleteDraftBackup('writer-a',expected),/新的修改/);
  assert.equal(readBackup('writer-a','new').revision,0);storage.clear();
  const newer=await saveWritingDraft('writer-a','new',{editor:{...editor,title:'其他窗口的新草稿'},revision:remote.revision,baseUpdatedAt:''});
  await assert.rejects(deleteDraftBackup('writer-a',expected),/新的修改/);
  assert.equal((await getWritingDraft('writer-a','new')).revision,newer.revision);
  beforeDelete=()=>saveWritingDraft('writer-a','new',{editor:{...editor,title:'删除请求途中更新'},revision:newer.revision,baseUpdatedAt:''});
  await assert.rejects(deleteDraftBackup('writer-a',{...expected,serverRevision:newer.revision}),/新的修改/);
  const latest=await getWritingDraft('writer-a','new');assert.equal(latest.editor.title,'删除请求途中更新');
  writeBackup('writer-a',latest);unavailable=true;
  const latestExpected={key:'new',serverRevision:latest.revision,localFingerprint:backupFingerprint(latest)};
  await assert.rejects(deleteDraftBackup('writer-a',latestExpected),/offline/);
  assert.equal(readBackup('writer-a','new').revision,latest.revision);unavailable=false;
  await deleteDraftBackup('writer-a',latestExpected);
  assert.equal(readBackup('writer-a','new'),null);assert.equal(await getWritingDraft('writer-a','new'),null);
  globalThis.fetch=originalFetch;
  console.log('PASS draft deletion clears local and server copies, preserves live articles and unrelated drafts, supports local-only drafts and protects newer tab edits and offline backups');

  await saveWritingDraft('writer-a',id,{editor:published,revision:0,baseUpdatedAt:stamp});
  await saveWritingDraft('writer-a','new',{editor,revision:0,baseUpdatedAt:''});
  db.prepare('DELETE FROM posts WHERE id=?').run(id);assert.equal(await getWritingDraft('writer-a',id),null);
  db.prepare('DELETE FROM admin_accounts WHERE id=?').run('writer-a');assert.equal(await getWritingDraft('writer-a','new'),null);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  console.log('PASS autosave never changes live articles; restart preserves pending work and original deletion cascades clean up backups');
}finally{globalThis.fetch=originalFetch;if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;db?.close();closeDatabase();unregister();const resolved=path.resolve(dir);assert.equal(path.dirname(resolved),root);assert.ok(path.basename(resolved).startsWith('journal-writing-drafts-'));rmSync(resolved,{recursive:true,force:true});}

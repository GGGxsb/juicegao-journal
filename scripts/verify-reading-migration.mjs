/** Prove that upgrading an existing database preserves content and relationships. */
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrateDatabase, closeDatabase } from '../db/sqlite.mjs';

const temporaryRoot = path.resolve(os.tmpdir());
const directory = mkdtempSync(path.join(temporaryRoot, 'juicegao-reading-migration-'));
const legacy = path.join(directory, 'legacy');
mkdirSync(legacy);
process.env.DATA_DIR = path.join(directory, 'data');
let database;
try {
  for (const name of readdirSync('drizzle').filter(name => /^000[0-3]_.*\.sql$/.test(name))) copyFileSync(path.join('drizzle', name), path.join(legacy, name));
  migrateDatabase(legacy);
  database = new DatabaseSync(path.join(process.env.DATA_DIR, 'journal.sqlite'));
  database.exec('PRAGMA foreign_keys=ON');
  const id = '11111111-2222-4333-8444-555555555555', now = new Date().toISOString();
  database.prepare('INSERT INTO posts(id,title,slug,content,tags,status,created_at,updated_at,published_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, '升级前的中文文章', '旧标题别名', '正文和 ID 必须保留。', '["旧标签"]', 'published', now, now, now);
  database.prepare('INSERT INTO comments(id,post_id,nickname,content,status,created_at) VALUES (?,?,?,?,?,?)').run('existing-comment', id, '访客', '原有评论', 'approved', now);
  database.prepare('INSERT INTO post_likes(post_id,visitor_hash,created_at) VALUES (?,?,?)').run(id, 'fixture-visitor-hash', now);
  const before = database.prepare('SELECT * FROM posts WHERE id=?').get(id);
  const upgraded = migrateDatabase();
  assert.equal(upgraded.applied, 1);
  const after = database.prepare('SELECT * FROM posts WHERE id=?').get(id);
  for (const [key, value] of Object.entries(before)) assert.equal(after[key], value, `Upgrade changed ${key}.`);
  assert.equal(after.collection_id, null);
  assert.equal(after.collection_order, 0);
  assert.equal(database.prepare('SELECT count(*) n FROM comments WHERE post_id=?').get(id).n, 1);
  assert.equal(database.prepare('SELECT count(*) n FROM post_likes WHERE post_id=?').get(id).n, 1);
  database.prepare('INSERT INTO collections(id,title,created_at,updated_at) VALUES (?,?,?,?)').run('fixture-collection', '测试合集', now, now);
  database.prepare('UPDATE posts SET collection_id=?,collection_order=? WHERE id=?').run('fixture-collection', 2, id);
  database.prepare('DELETE FROM collections WHERE id=?').run('fixture-collection');
  assert.equal(database.prepare('SELECT collection_id FROM posts WHERE id=?').get(id).collection_id, null);
  assert.equal(database.prepare('SELECT count(*) n FROM posts').get().n, 1);
  assert.equal(migrateDatabase().applied, 0, 'A second startup must not apply the migration again.');
  console.log('PASS collection migration preserves existing article IDs, content, comments and likes; collection deletion keeps articles; repeated startup is safe.');
} finally {
  database?.close();
  closeDatabase();
  // Remove only the unique test directory created above under the real temp root.
  const resolved = path.resolve(directory);
  assert.equal(path.dirname(resolved), temporaryRoot);
  assert.ok(path.basename(resolved).startsWith('juicegao-reading-migration-'));
  rmSync(resolved, { recursive: true, force: true });
}

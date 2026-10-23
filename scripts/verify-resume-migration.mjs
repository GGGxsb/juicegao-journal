/** Upgrade existing settings without rewriting legacy Markdown or other site data. */
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { closeDatabase, migrateDatabase } from '../db/sqlite.mjs';

const temporaryRoot = path.resolve(os.tmpdir());
const directory = mkdtempSync(path.join(temporaryRoot, 'juicegao-resume-migration-'));
const migrations = path.join(directory, 'migrations');
mkdirSync(migrations);
let database;
function rows(table) { return database.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all().map(row => ({ ...row })); }
function verifyDefaults() {
  const columns = database.prepare('PRAGMA table_info(site_settings)').all();
  for (const name of ['education_entries', 'experience_entries']) {
    const column = columns.find(value => value.name === name);
    assert.equal(column.dflt_value, "'[]'"); assert.equal(column.notnull, 1);
  }
  const row = database.prepare('INSERT INTO site_settings(id,updated_at) VALUES (?,?) RETURNING education_entries,experience_entries').get('raw-default', '2026-01-01');
  assert.equal(row.education_entries, '[]'); assert.equal(row.experience_entries, '[]');
  for (const column of ['education_entries', 'experience_entries']) {
    for (const invalid of ['{}', 'null', '"text"', '{broken', null]) {
      assert.throws(() => database.prepare(`UPDATE site_settings SET ${column}=? WHERE id=?`).run(invalid, 'raw-default'), /CHECK|NOT NULL|malformed JSON/);
    }
  }
  database.prepare('DELETE FROM site_settings WHERE id=?').run('raw-default');
}
try {
  for (const name of readdirSync('drizzle').filter(name => /^000[0-5]_.*\.sql$/.test(name))) copyFileSync(path.join('drizzle', name), path.join(migrations, name));
  process.env.DATA_DIR = path.join(directory, 'upgraded');
  assert.equal(migrateDatabase(migrations).applied, 6);
  database = new DatabaseSync(path.join(process.env.DATA_DIR, 'journal.sqlite'));
  database.exec('PRAGMA foreign_keys=ON');
  const now = '2026-01-01T00:00:00.000Z';
  const education = '  ## 旧学习经历\n\n- 原学校\n- **原专业**\n\n';
  database.prepare(`INSERT INTO site_settings(id,name,bio,description,avatar,github,email,location,education,started_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run('site', '原站主', '原简介', '原描述', '/avatar.png', 'https://github.com/example', 'owner@example.com', '原所在地', education, '2026-01-01', now);
  database.prepare('INSERT INTO collections(id,title,created_at,updated_at) VALUES (?,?,?,?)').run('old-series', '原合集', now, now);
  database.prepare('INSERT INTO posts(id,title,slug,content,category,tags,collection_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run('old-post', '原文章', 'old-post', '文章保持不变。', 'Technical', '["原标签"]', 'old-series', now, now);
  database.prepare('INSERT INTO comments(id,post_id,nickname,content,created_at) VALUES (?,?,?,?,?)').run('old-comment', 'old-post', '访客', '原评论', now);
  database.prepare('INSERT INTO post_likes(post_id,visitor_hash,created_at) VALUES (?,?,?)').run('old-post', 'visitor-hash', now);
  const before = { settings: rows('site_settings'), posts: rows('posts'), comments: rows('comments'), likes: rows('post_likes'), collections: rows('collections'), journal: rows('__journal_migrations') };
  copyFileSync('drizzle/0006_resume_entries.sql', path.join(migrations, '0006_resume_entries.sql'));
  assert.deepEqual(migrateDatabase(migrations), { applied: 1, total: 7 });
  // This observer uses a different connection from the migrator. Reopen it so
  // node:sqlite refreshes SELECT * column metadata after external ALTER TABLE.
  database.close();
  database = new DatabaseSync(path.join(process.env.DATA_DIR, 'journal.sqlite'));
  database.exec('PRAGMA foreign_keys=ON');
  const upgraded = rows('site_settings')[0];
  for (const [key, value] of Object.entries(before.settings[0])) assert.equal(upgraded[key], value, `Migration changed legacy settings field ${key}.`);
  assert.equal(upgraded.education, education); assert.equal(upgraded.education_entries, '[]'); assert.equal(upgraded.experience_entries, '[]');
  assert.deepEqual(rows('posts'), before.posts); assert.deepEqual(rows('comments'), before.comments);
  assert.deepEqual(rows('post_likes'), before.likes); assert.deepEqual(rows('collections'), before.collections);
  assert.deepEqual(rows('__journal_migrations').slice(0, 6), before.journal);
  assert.equal(rows('__journal_migrations').at(-1).name, '0006_resume_entries.sql');
  const entries = [
    { id: '11111111-1111-4111-8111-111111111111', organization: '后显示的学校', title: '', period: '', description: '', url: '' },
    { id: '22222222-2222-4222-8222-222222222222', organization: '先显示的学校', title: '', period: '', description: '', url: '' },
  ];
  database.prepare('UPDATE site_settings SET education_entries=?,experience_entries=? WHERE id=?').run(JSON.stringify(entries), JSON.stringify([...entries].reverse()), 'site');
  const persisted = rows('site_settings');
  assert.equal(migrateDatabase(migrations).applied, 0);
  assert.deepEqual(rows('site_settings'), persisted, 'Repeated startup must preserve arrays and their order.');
  assert.deepEqual(JSON.parse(persisted[0].education_entries), entries);
  assert.deepEqual(JSON.parse(persisted[0].experience_entries), [...entries].reverse());
  verifyDefaults(); assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  console.log('PASS resume migration preserves legacy education and all existing site data, arrays retain order, and repeated startup is safe.');
  database.close(); database = undefined; closeDatabase();
  process.env.DATA_DIR = path.join(directory, 'fresh');
  assert.equal(migrateDatabase(migrations).applied, 7);
  database = new DatabaseSync(path.join(process.env.DATA_DIR, 'journal.sqlite'));
  verifyDefaults();
  console.log('PASS fresh and upgraded databases provide real empty-array SQL defaults and reject malformed JSON groups.');
} finally {
  database?.close(); closeDatabase();
  const resolved = path.resolve(directory);
  assert.equal(path.dirname(resolved), temporaryRoot);
  assert.ok(path.basename(resolved).startsWith('juicegao-resume-migration-'));
  rmSync(resolved, { recursive: true, force: true });
}

/** Upgrade real legacy fixtures, checking preservation, SQL constraints and restart safety. */
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { closeDatabase, migrateDatabase } from '../db/sqlite.mjs';

const temporaryRoot = path.resolve(os.tmpdir());
const directory = mkdtempSync(path.join(temporaryRoot, 'juicegao-category-migration-'));
const legacy = path.join(directory, 'legacy');
mkdirSync(legacy);
let database;

function connect(name) {
  closeDatabase();
  process.env.DATA_DIR = path.join(directory, name);
}

function rows(table) {
  return database.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all().map(row => ({ ...row }));
}

function verifySqlCategoryContract() {
  const category = database.prepare('PRAGMA table_info(posts)').all().find(column => column.name === 'category');
  assert.equal(category.dflt_value, "'Daily Life'", 'The database must have a real default, including raw SQL inserts.');
  assert.equal(category.notnull, 1);
  assert.ok(!database.prepare('PRAGMA table_info(posts)').all().some(column => column.name === 'legacy_category'));
  assert.ok(database.prepare('PRAGMA index_info(posts_category_navigation_idx)').all().some(column => column.name === 'category'));
  const insert = database.prepare('INSERT INTO posts(id,title,slug,created_at,updated_at) VALUES (?,?,?,?,?) RETURNING category');
  assert.equal(insert.get('sql-default', 'SQL default', 'sql-default', '2026-01-01', '2026-01-01').category, 'Daily Life');
  const invalidInsert = database.prepare('INSERT INTO posts(id,title,slug,category,created_at,updated_at) VALUES (?,?,?,?,?,?)');
  for (const invalid of ['随笔', 'Other', 'technical', 'Daily Life ', '', null]) {
    assert.throws(() => invalidInsert.run('invalid', 'Invalid', 'invalid', invalid, '2026-01-01', '2026-01-01'), /CHECK|NOT NULL/,
      'Every direct SQL insert must obey the two canonical categories.');
    assert.throws(() => database.prepare('UPDATE posts SET category=? WHERE id=?').run(invalid, 'sql-default'), /CHECK|NOT NULL/,
      'Every direct SQL update must obey the two canonical categories.');
  }
  database.prepare('UPDATE posts SET category=? WHERE id=?').run('Technical', 'sql-default');
  assert.equal(database.prepare('SELECT category FROM posts WHERE id=?').get('sql-default').category, 'Technical');
  database.prepare('DELETE FROM posts WHERE id=?').run('sql-default');
  assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
}

try {
  for (const name of readdirSync('drizzle').filter(name => /^000[0-4]_.*\.sql$/.test(name))) {
    copyFileSync(path.join('drizzle', name), path.join(legacy, name));
  }
  connect('upgraded');
  assert.equal(migrateDatabase(legacy).applied, 5);
  database = new DatabaseSync(path.join(process.env.DATA_DIR, 'journal.sqlite'));
  database.exec('PRAGMA foreign_keys=ON');
  const collectionId = '22222222-2222-4222-8222-222222222222', now = '2026-01-01T10:00:00.000Z';
  database.prepare('INSERT INTO collections(id,title,description,created_at,updated_at) VALUES (?,?,?,?,?)')
    .run(collectionId, '原有合集', '合集描述保持不变。', now, now);
  const longCategory = '旧'.repeat(60), twentyTags = Array.from({ length: 20 }, (_, index) => `原标签${index}`);
  const fixtures = [
    ['Daily Life', 'Daily Life', false],
    [' DAILY life ', 'Daily Life', false],
    ['dAiLy\t LiFe', 'Daily Life', false],
    ['Technical', 'Technical', false],
    [' tEcHnIcAl ', 'Technical', false],
    ['technology', 'Technical', true],
    [' TECH ', 'Technical', true],
    ['技术', 'Technical', true],
    ['技术文章', 'Technical', true],
    ['技 术分享', 'Technical', true],
    ['技术笔记', 'Technical', true],
    ['编程', 'Technical', true],
    ['　开发\t', 'Technical', true],
    ['写作与记录', 'Daily Life', true],
    ['探索笔记', 'Daily Life', true],
    ['随笔', 'Daily Life', true],
    ['自定义分类', 'Daily Life', true],
    [longCategory, 'Daily Life', true],
    ['', 'Daily Life', false],
  ];
  const beforePosts = [];
  for (const [index, [category, expectedCategory, append]] of fixtures.entries()) {
    const id = `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`;
    // Keep duplicate existing tags, and include an already-tagged legacy category.
    const tags = index === 17 ? twentyTags : index === 16 ? ['原标签', '原标签', category] : ['原标签', `独立标签${index}`];
    database.prepare(`INSERT INTO posts(id,title,slug,excerpt,content,category,tags,kind,status,cover_image,published_at,created_at,updated_at,collection_id,collection_order)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, `旧文章 ${index}`, `old-alias-${index}`, '原摘要', `原正文\n## ${index}\n不改变内容。`, category, JSON.stringify(tags), index % 2 ? 'note' : 'article', index % 3 ? 'published' : 'draft', '/original-cover.png', now, now, now, collectionId, index);
    database.prepare('INSERT INTO comments(id,post_id,nickname,content,status,created_at) VALUES (?,?,?,?,?,?)')
      .run(`comment-${index}`, id, '访客', `原评论 ${index}`, 'approved', now);
    database.prepare('INSERT INTO post_likes(post_id,visitor_hash,created_at) VALUES (?,?,?)').run(id, `visitor-${index}`, now);
    beforePosts.push({ row: { ...database.prepare('SELECT rowid AS stableRowId,* FROM posts WHERE id=?').get(id) }, expectedCategory, append });
  }
  const before = { comments: rows('comments'), likes: rows('post_likes'), collections: rows('collections'), journal: rows('__journal_migrations') };
  const upgrade = migrateDatabase();
  assert.deepEqual(upgrade, { applied: 1, total: 6 });
  for (const { row, expectedCategory, append } of beforePosts) {
    const after = database.prepare('SELECT rowid AS stableRowId,* FROM posts WHERE id=?').get(row.id);
    for (const [key, value] of Object.entries(row)) {
      if (key !== 'category' && key !== 'tags') assert.equal(after[key], value, `Migration changed ${key} of ${row.id}.`);
    }
    assert.equal(after.category, expectedCategory, `Wrong category mapping for ${JSON.stringify(row.category)}.`);
    const oldTags = JSON.parse(row.tags), expectedTags = append && !oldTags.includes(row.category) ? [...oldTags, row.category] : oldTags;
    assert.deepEqual(JSON.parse(after.tags), expectedTags, 'Only an absent legacy category may be appended; original tags and order must remain intact.');
  }
  assert.deepEqual(rows('comments'), before.comments);
  assert.deepEqual(rows('post_likes'), before.likes);
  assert.deepEqual(rows('collections'), before.collections);
  assert.deepEqual(rows('__journal_migrations').slice(0, 5), before.journal, 'Old migration hashes and timestamps must not change.');
  assert.equal(rows('__journal_migrations').at(-1).name, '0005_post_categories.sql');
  const afterPosts = rows('posts');
  assert.equal(migrateDatabase().applied, 0, 'Repeated startup must skip the journaled migration.');
  assert.deepEqual(rows('posts'), afterPosts, 'Repeated startup must not duplicate legacy-category tags.');
  verifySqlCategoryContract();
  // Relationships remain operational, including their original delete behavior.
  database.prepare('DELETE FROM collections WHERE id=?').run(collectionId);
  assert.equal(database.prepare('SELECT count(*) n FROM posts WHERE collection_id IS NULL').get().n, fixtures.length);
  assert.deepEqual(rows('comments'), before.comments);
  assert.deepEqual(rows('post_likes'), before.likes);
  database.prepare('DELETE FROM posts WHERE id=?').run(beforePosts[0].row.id);
  assert.equal(rows('comments').length, fixtures.length - 1);
  assert.equal(rows('post_likes').length, fixtures.length - 1);
  assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  console.log('PASS legacy category mapping preserves IDs, original tags, bodies, comments, likes, collections and row IDs; startup is idempotent.');
  database.close(); database = undefined;
  connect('fresh');
  assert.equal(migrateDatabase().applied, 6);
  database = new DatabaseSync(path.join(process.env.DATA_DIR, 'journal.sqlite'));
  database.exec('PRAGMA foreign_keys=ON');
  verifySqlCategoryContract();
  const metadata = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'));
  assert.ok(metadata.entries.some(entry => entry.tag === '0004_collections'));
  assert.ok(metadata.entries.some(entry => entry.tag === '0005_post_categories'));
  console.log('PASS upgraded and fresh databases enforce the real Daily Life default and reject every noncanonical SQL category.');
} finally {
  database?.close(); closeDatabase();
  const resolved = path.resolve(directory);
  assert.equal(path.dirname(resolved), temporaryRoot);
  assert.ok(path.basename(resolved).startsWith('juicegao-category-migration-'));
  rmSync(resolved, { recursive: true, force: true });
}

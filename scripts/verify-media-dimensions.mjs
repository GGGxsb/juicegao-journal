/** Migrate old data and exercise actual upload/storage/listing metadata on disposable SQLite. */
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { register } from 'tsx/esm/api';
import sharp from 'sharp'; // Already installed by Next; used only to generate real test images.
import { closeDatabase, getDatabaseAdapter, migrateDatabase } from '../db/sqlite.mjs';

const parent = path.resolve(tmpdir()), directory = mkdtempSync(path.join(parent, 'journal-media-dimensions-'));
const oldDataDir = process.env.DATA_DIR;
process.env.DATA_DIR = path.join(directory, 'data');
const unregister = register();
let bucket, originalGet;
const oldFetch = globalThis.fetch;
try {
  const migrations = path.join(directory, 'migrations'); mkdirSync(migrations);
  for (const name of readdirSync('drizzle').filter(name => name.endsWith('.sql') && name < '0017')) copyFileSync(path.join('drizzle', name), path.join(migrations, name));
  migrateDatabase(migrations);
  const database = getDatabaseAdapter().connection;
  database.prepare('INSERT INTO posts(id,slug,title,content,status,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run('legacy', 'legacy', '原有文章', '原有正文', 'published', '2026-01-01', '2026-01-01', '2026-01-01');
  const oldPost = database.prepare('SELECT * FROM posts WHERE id=?').get('legacy');
  const legacyKey = `${randomUUID()}.png`;
  database.prepare('INSERT INTO media(id,key,original_name,content_type,size,created_by_user_id,created_at) VALUES (?,?,?,?,?,?,?)').run(randomUUID(), legacyKey, '原封面.png', 'image/png', 123, 'owner', '2026-01-01');
  const oldMedia = database.prepare('SELECT * FROM media WHERE key=?').get(legacyKey);
  migrateDatabase(); assert.equal(migrateDatabase().applied, 0);
  assert.deepEqual(database.prepare('SELECT * FROM posts WHERE id=?').get('legacy'), oldPost);
  const migratedMedia = database.prepare('SELECT * FROM media WHERE key=?').get(legacyKey);
  for (const [key, value] of Object.entries(oldMedia)) assert.equal(migratedMedia[key], value);
  assert.equal(migratedMedia.width, null); assert.equal(migratedMedia.height, null);
  console.log('PASS migration preserves article and media records and is repeatable.');

  const { env } = await import('../app/lib/platform.ts'); bucket = env.BUCKET;
  originalGet = bucket.get;
  const { readImageDimensions, withCoverDimensions } = await import('../app/lib/media-dimensions.ts');
  const create = (width, height) => sharp({ create: { width, height, channels: 3, background: '#659eb9' } });
  const wide = await create(1200, 500).png().toBuffer();
  const tall = await create(500, 1000).png().toBuffer();
  assert.deepEqual(readImageDimensions(wide), { width: 1200, height: 500 });
  assert.deepEqual(readImageDimensions(tall), { width: 500, height: 1000 });
  assert.deepEqual(readImageDimensions(await create(70, 90).gif().toBuffer()), { width: 70, height: 90 });
  assert.deepEqual(readImageDimensions(await create(90, 70).webp().toBuffer()), { width: 90, height: 70 });
  const rotated = await create(120, 60).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  assert.deepEqual(readImageDimensions(rotated), { width: 60, height: 120 });
  for (const bad of [new Uint8Array(), Buffer.from('<svg width="500" height="1000"/>'), wide.subarray(0, 8)]) assert.equal(readImageDimensions(bad), null);
  console.log('PASS PNG, GIF, WebP and JPEG EXIF orientation are recognized; invalid/unsupported headers are harmless.');

  const store = async (key, bytes) => bucket.put(key, Uint8Array.from(bytes).buffer);
  await store(legacyKey, wide);
  const records = [{ id: 'first', coverImage: `/media/${legacyKey}` }];
  for (let index = 0; index < 6; index++) {
    const key = `${randomUUID()}.png`;
    database.prepare('INSERT INTO media(id,key,original_name,content_type,size,created_by_user_id,created_at) VALUES (?,?,?,?,?,?,?)').run(randomUUID(), key, '旧封面.png', 'image/png', tall.length, 'owner', '2026-01-01');
    await store(key, tall); records.push({ id: String(index), coverImage: `/media/${key}` });
  }
  const corruptKey = `${randomUUID()}.png`;
  database.prepare('INSERT INTO media(id,key,original_name,content_type,size,created_by_user_id,created_at) VALUES (?,?,?,?,?,?,?)').run(randomUUID(), corruptKey, '坏图片.png', 'image/png', 8, 'owner', '2026-01-01');
  await store(corruptKey, wide.subarray(0, 8));
  records.push({ id: 'corrupt', coverImage: `/media/${corruptKey}` });
  records.push({ id: 'repeat', coverImage: `/media/${legacyKey}?v=1` }, { id: 'external', coverImage: 'https://example.com/portrait.png' }, { id: 'unsafe', coverImage: '/media/../../secret.png' });
  let reads = 0, active = 0, peak = 0;
  bucket.get = async key => { reads++; active++; peak = Math.max(peak, active); try { return await originalGet.call(bucket, key); } finally { active--; } };
  globalThis.fetch = () => { throw new Error('Metadata must not make network requests.'); };
  const annotated = await withCoverDimensions(records);
  assert.equal(annotated.length, records.length);
  assert.deepEqual(annotated.map(item => item.id), records.map(item => item.id));
  assert.deepEqual(annotated[0].coverSize, { width: 1200, height: 500 });
  for (let index = 1; index <= 6; index++) assert.deepEqual(annotated[index].coverSize, { width: 500, height: 1000 });
  assert.equal(annotated[7].coverSize, undefined);
  assert.deepEqual(annotated[8].coverSize, annotated[0].coverSize);
  assert.equal(annotated[9].coverSize, undefined); assert.equal(annotated[10].coverSize, undefined);
  assert.equal(reads, 8); assert.ok(peak <= 3 && peak > 1);
  await withCoverDimensions(records); assert.equal(reads, 8, 'Saved dimensions and invalid-header results must avoid subsequent disk reads.');
  assert.equal(database.prepare('SELECT width FROM media WHERE key=?').get(corruptKey).width, 0);
  assert.deepEqual(database.prepare('SELECT * FROM posts WHERE id=?').get('legacy'), oldPost);
  closeDatabase(); await withCoverDimensions(records); assert.equal(reads, 8);
  console.log('PASS legacy headers are backfilled in bounded batches, duplicate sources share metadata, restarts use SQL, and external URLs are never fetched.');

  const { uploadImage, createPost, updatePost, queryPosts, validatePost } = await import('../app/lib/server.ts');
  const upload = async (bytes, type = 'image/png') => {
    const form = new FormData(); form.set('file', new File([bytes], 'cover.png', { type }));
    return uploadImage(new Request('http://localhost/api/upload', { method: 'POST', body: form }), { userId: 'owner', username: 'owner' });
  };
  const url = await upload(tall);
  const stored = getDatabaseAdapter().connection.prepare('SELECT width,height FROM media WHERE key=?').get(url.split('/').at(-1));
  assert.deepEqual({ ...stored }, { width: 500, height: 1000 });
  assert.deepEqual(Buffer.from((await originalGet.call(bucket, url.split('/').at(-1))).body), tall);
  const fields = { title: '尺寸验证', excerpt: '摘要', content: '正文', category: 'Technical', tags: ['尺寸'], status: 'published', coverImage: url };
  const created = await createPost(validatePost(fields));
  assert.deepEqual((await queryPosts({ tag: '尺寸' })).posts[0].coverSize, { width: 500, height: 1000 });
  await updatePost(created.id, validatePost({ ...fields, coverImage: `/media/${legacyKey}` }));
  assert.deepEqual((await queryPosts({ tag: '尺寸' })).posts[0].coverSize, { width: 1200, height: 500 });
  await updatePost(created.id, validatePost({ ...fields, coverImage: '' }));
  assert.equal((await queryPosts({ tag: '尺寸' })).posts[0].coverSize, undefined);
  assert.throws(() => validatePost({ ...fields, coverSize: { width: 1, height: 9 } }), error => error.status === 400);
  await assert.rejects(upload(wide.subarray(0, 8)), error => error.status === 415);
  console.log('PASS uploads persist actual dimensions without changing image bytes; replacing/removing a cover updates listing layout; forged dimensions are rejected.');
} finally {
  if (bucket && originalGet) bucket.get = originalGet;
  globalThis.fetch = oldFetch; closeDatabase(); unregister();
  if (oldDataDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = oldDataDir;
  const resolved = path.resolve(directory);
  assert.equal(path.dirname(resolved), parent); assert.ok(path.basename(resolved).startsWith('journal-media-dimensions-'));
  rmSync(resolved, { recursive: true, force: true });
}

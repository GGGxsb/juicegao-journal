/**
 * City-map integration checks: node scripts/verify-city-map.mjs
 * Uses the actual self-hosted SQLite adapter, migration runner, ORM and API
 * handlers in a disposable temporary DATA_DIR. Only the administrator identity
 * is replaced; no running server, credentials or existing database is used.
 */
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as sqliteRuntime from '../db/sqlite.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporaryRoot = path.resolve(tmpdir());
const directory = mkdtempSync(path.join(temporaryRoot, 'journal-city-map-'));
const originalDataDirectory = process.env.DATA_DIR;
process.env.DATA_DIR = path.join(directory, 'data');
const nativeRequire = createRequire(import.meta.url);
const index = JSON.parse(readFileSync(path.join(root, 'app/lib/china-city-index.json'), 'utf8'));
const [cityA, cityB] = index.map(city => city.id);
assert.ok(index.length > 33);
let database;
let checks = 0;
function passed(label) { checks++; console.log(`PASS ${label}`); }

// Compile local TypeScript in memory. The real Node SQLite runtime is shared by
// the migration runner, platform adapter and Drizzle; auth is the sole seam.
const modules = new Map();
let allowAdmin = false;
let adminChecks = 0;
function loadLocal(modulePath) {
  const filename = [modulePath, `${modulePath}.ts`, path.join(modulePath, 'index.ts')]
    .find(candidate => existsSync(candidate) && /\.(?:ts|mjs|json)$/.test(candidate));
  assert.ok(filename, `Cannot resolve local module ${modulePath}`);
  if (filename === path.join(root, 'db/sqlite.mjs')) return sqliteRuntime;
  if (filename.endsWith('.json')) return JSON.parse(readFileSync(filename, 'utf8'));
  if (modules.has(filename)) return modules.get(filename).exports;
  if (filename === path.join(root, 'app/lib/admin-auth.ts')) return {
    async requireAdmin() {
      adminChecks++;
      if (!allowAdmin) {
        const { ApiError } = loadLocal(path.join(root, 'app/lib/errors.ts'));
        throw new ApiError(401, '请先登录。');
      }
      return { userId: 'map-test-admin', username: 'map-test-admin' };
    },
    async getAdminSession() {
      return { authenticated: allowAdmin, isAdmin: allowAdmin, username: null, setupRequired: false };
    },
  };
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  modules.set(filename, module);
  const localRequire = specifier => {
    if (specifier.startsWith('@/')) return loadLocal(path.join(root, specifier.slice(2)));
    if (specifier.startsWith('.')) return loadLocal(path.resolve(path.dirname(filename), specifier));
    return nativeRequire(specifier);
  };
  new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports);
  return module.exports;
}

try {
  const migrationDirectory = path.join(root, 'drizzle');
  const migrations = readdirSync(migrationDirectory).filter(name => /^\d[^/\\]*\.sql$/.test(name)).sort();
  const cityMigration = migrations.findIndex(name => /\bcity_ids\b/.test(readFileSync(path.join(migrationDirectory, name), 'utf8')));
  assert.ok(cityMigration > 0, 'City assignments must use an appended migration.');
  const oldMigrations = path.join(directory, 'old-migrations');
  mkdirSync(oldMigrations);
  for (const name of migrations.slice(0, cityMigration)) copyFileSync(path.join(migrationDirectory, name), path.join(oldMigrations, name));
  assert.equal(sqliteRuntime.migrateDatabase(oldMigrations).applied, cityMigration);
  database = new DatabaseSync(path.join(process.env.DATA_DIR, 'journal.sqlite'));
  database.exec('PRAGMA foreign_keys=ON');
  const stamp = '2026-01-01T00:00:00.000Z';
  const legacyId = randomUUID();
  database.prepare('INSERT INTO posts(id,title,slug,content,tags,status,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(legacyId, '升级前文章', 'legacy-custom-slug', '原有正文完整保留', '["旧标签"]', 'published', stamp, stamp, stamp);
  database.prepare('INSERT INTO admin_accounts(id,username,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)')
    .run('map-test-admin', 'map-test-admin', 'unchanged-test-hash', 1, 1);
  database.prepare('INSERT INTO admin_sessions(token_hash,account_id,auth_version,expires_at,created_at) VALUES(?,?,?,?,?)')
    .run('legacy-session', 'map-test-admin', 1, 10, 1);
  database.prepare('INSERT INTO site_settings(id,name,education_entries,experience_entries,updated_at) VALUES(?,?,?,?,?)')
    .run('site', '原有站点名称', '[{"id":"education-1","organization":"原有教育经历"}]', '[{"id":"experience-1","organization":"原有工作经历"}]', stamp);
  database.prepare('INSERT INTO comment_accounts(id,provider,client_id,subject,nickname,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run('legacy-reader', 'github', 'test-client', 'reader-subject', '原有读者', stamp, stamp);
  database.prepare('INSERT INTO comments(id,post_id,nickname,author_id,provider,content,status,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run('legacy-comment', legacyId, '原有读者', 'legacy-reader', 'github', '原有评论', 'approved', stamp);
  database.prepare('INSERT INTO post_likes(post_id,visitor_hash,created_at) VALUES(?,?,?)').run(legacyId, 'legacy-visitor', stamp);
  const oldEditor = { id: legacyId, title: '旧备份标题', excerpt: '', content: '旧备份正文', category: 'Daily Life', tags: [], status: 'published', coverImage: '' };
  database.prepare('INSERT INTO writing_drafts(owner_id,document_key,post_id,editor,base_updated_at,revision,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run('map-test-admin', legacyId, legacyId, JSON.stringify(oldEditor), stamp, 1, stamp);
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '__journal_migrations' ORDER BY name").all().map(row => row.name);
  const before = new Map(tables.map(name => [name, database.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all().map(row => ({ ...row }))]));
  // Check the city migration in isolation: later profile migrations intentionally add settings/defaults.
  copyFileSync(path.join(migrationDirectory, migrations[cityMigration]), path.join(oldMigrations, migrations[cityMigration]));
  assert.equal(sqliteRuntime.migrateDatabase(oldMigrations).applied, 1);
  for (const name of tables) {
    const expected = before.get(name).map(row => name === 'posts' ? { ...row, city_ids: '[]' } : row);
    assert.deepEqual(database.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all().map(row => ({ ...row })), expected, `${name} changed during the map migration`);
  }
  assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(sqliteRuntime.migrateDatabase(migrationDirectory).applied, migrations.length - cityMigration - 1);
  assert.equal(sqliteRuntime.migrateDatabase(migrationDirectory).applied, 0);
  passed('appended migration preserves articles, administrator accounts/sessions, settings, comments, likes and pending writing');

  const postsApi = loadLocal(path.join(root, 'app/api/posts/route.ts'));
  const postApi = loadLocal(path.join(root, 'app/api/posts/[id]/route.ts'));
  const mapApi = loadLocal(path.join(root, 'app/api/map/route.ts'));
  const draftApi = loadLocal(path.join(root, 'app/api/writing-drafts/[key]/route.ts'));
  const server = loadLocal(path.join(root, 'app/lib/server.ts'));
  const { editorValueSchema } = loadLocal(path.join(root, 'app/lib/draft-state.ts'));
  const payload = { title: '城市文章', excerpt: '卡片摘要', content: '正文不应进入地图接口', category: 'Technical', tags: ['标签'], status: 'published', coverImage: '' };
  const origin = 'http://127.0.0.1';
  const context = id => ({ params: Promise.resolve({ id }) });
  const draftContext = key => ({ params: Promise.resolve({ key }) });
  function request(method, body) {
    return new Request(`${origin}/api/posts`, { method, headers: { origin, 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  }
  async function read(response, expectedStatus) {
    const data = await response.json();
    assert.equal(response.status, expectedStatus, JSON.stringify(data));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return data;
  }
  const create = async (body, status = 201) => read(await postsApi.POST(request('POST', body)), status);
  const update = async (id, body, status = 200) => read(await postApi.PUT(request('PUT', body), context(id)), status);
  async function readMap() {
    allowAdmin = false;
    const previousChecks = adminChecks;
    const result = await read(await mapApi.GET(), 200);
    assert.equal(adminChecks, previousChecks, 'The public map must not ask for an administrator.');
    return result.posts;
  }

  allowAdmin = true;
  const omitted = (await create(payload)).post;
  assert.deepEqual(omitted.cityIds, []);
  assert.equal(Object.hasOwn(server.validatePost(payload), 'cityIds'), false);
  const multi = (await create({ ...payload, cityIds: [cityA, cityB, cityA] })).post;
  assert.deepEqual(multi.cityIds, [cityA, cityB]);
  assert.deepEqual((await update(multi.id, { ...payload, title: '旧客户端修改标题' })).post.cityIds, [cityA, cityB]);
  assert.deepEqual((await update(multi.id, { ...payload, cityIds: [] })).post.cityIds, []);
  await update(multi.id, { ...payload, cityIds: [cityA, cityB] });
  passed('create defaults to []; cities deduplicate; older PUT preserves them; explicit [] clears them');

  const draft = (await create({ ...payload, status: 'draft', cityIds: [cityA] })).post;
  let cards = await readMap();
  assert.ok(cards.some(post => post.id === legacyId));
  assert.ok(cards.some(post => post.id === multi.id));
  assert.ok(!cards.some(post => post.id === draft.id));
  assert.equal(cards.filter(post => post.cityIds.includes(cityA)).length, 1);
  assert.equal(cards.filter(post => post.cityIds.includes(cityB)).length, 1);
  for (const card of cards) assert.deepEqual(Object.keys(card).sort(), ['id', 'title', 'excerpt', 'tags', 'cityIds', 'publishedAt', 'coverImage'].sort());
  assert.equal((await server.getPublishedPost(legacyId)).id, legacyId);
  assert.equal(await server.getPublishedPost('legacy-custom-slug'), null);
  assert.equal(await server.getPublishedPost(draft.id), null);
  await read(await postApi.GET(request('GET'), context(multi.id)), 401);
  passed('anonymous map exposes only published card fields and article navigation resolves the saved ID');

  allowAdmin = true;
  const invalid = [null, 'not-an-array', [123], ['unknown-city'], [cityA, ''], index.slice(0, 33).map(city => city.id)];
  const rowsBefore = database.prepare('SELECT count(*) AS total FROM posts').get().total;
  for (const cityIds of invalid) {
    await create({ ...payload, cityIds }, 400);
    await update(multi.id, { ...payload, cityIds }, 400);
    assert.equal(editorValueSchema.safeParse({ ...oldEditor, cityIds }).success, false);
  }
  assert.equal(database.prepare('SELECT count(*) AS total FROM posts').get().total, rowsBefore);
  assert.deepEqual((await server.getPublishedPost(multi.id)).cityIds, [cityA, cityB]);
  const maximumCities = index.slice(0, 32).map(city => city.id);
  assert.deepEqual(server.validatePost({ ...payload, cityIds: maximumCities }).cityIds, maximumCities);
  assert.deepEqual(editorValueSchema.parse({ ...oldEditor, cityIds: [cityA, cityB, cityA] }).cityIds, [cityA, cityB]);
  passed('real POST/PUT reject invalid IDs, non-arrays and more than 32 cities without changing stored records');

  await update(multi.id, { ...payload, status: 'draft', cityIds: [cityA, cityB] });
  assert.ok(!(await readMap()).some(post => post.id === multi.id));
  allowAdmin = true;
  await update(multi.id, { ...payload, cityIds: [cityA, cityB] });
  passed('returning a published article to draft immediately removes it from map results');

  const linked = (await update(legacyId, { ...payload, cityIds: [cityA, cityB] })).post;
  const oldDraft = (await read(await draftApi.GET(request('GET'), draftContext(legacyId)), 200)).draft;
  assert.equal(Object.hasOwn(editorValueSchema.parse(oldDraft.editor), 'cityIds'), false);
  // This is the recovery rule used by the editor: missing old-backup cityIds
  // inherit the current editor; an explicit [] remains an intentional clear.
  const restore = (value, previous) => ({ ...value, cityIds: value.cityIds === undefined ? [...(previous.cityIds ?? [])] : [...value.cityIds] });
  const recovered = restore(editorValueSchema.parse(oldDraft.editor), linked);
  const { id: _oldId, ...recoveredInput } = recovered;
  assert.deepEqual((await update(legacyId, recoveredInput)).post.cityIds, [cityA, cityB]);
  // A backend older-client recovery that omits the field is equally safe.
  const { id: _omittedId, ...omittedRecovery } = oldDraft.editor;
  assert.deepEqual((await update(legacyId, omittedRecovery)).post.cityIds, [cityA, cityB]);

  const current = await server.getPublishedPost(multi.id);
  const editor = { id: current.id, ...payload, cityIds: [cityB] };
  const savedBackup = (await read(await draftApi.PUT(request('PUT', { editor, revision: 0, baseUpdatedAt: current.updatedAt }), draftContext(multi.id)), 200)).draft;
  assert.deepEqual(savedBackup.editor.cityIds, [cityB]);
  assert.deepEqual((await server.getPublishedPost(multi.id)).cityIds, [cityA, cityB], 'Autosave must not change the live map.');
  const { id: _recoveredId, ...newRecovery } = editorValueSchema.parse(savedBackup.editor);
  assert.deepEqual((await update(multi.id, newRecovery)).post.cityIds, [cityB]);
  assert.deepEqual(restore({ ...oldDraft.editor, cityIds: [] }, current).cityIds, []);
  assert.deepEqual((await update(multi.id, { ...payload, cityIds: [] })).post.cityIds, []);
  const legacyNewEditor = { ...oldEditor, id: '' };
  const legacyBackup = (await read(await draftApi.PUT(request('PUT', { editor: legacyNewEditor, revision: 0, baseUpdatedAt: '' }), draftContext('new')), 200)).draft;
  assert.equal(Object.hasOwn(legacyBackup.editor, 'cityIds'), false);
  passed('old backups remain readable and preserve saved cities on recovery; new backups privately retain explicit edits and clears');

  // More than the ordinary list page size and old 1000-record cap must appear.
  database.exec('BEGIN');
  const insert = database.prepare('INSERT INTO posts(id,title,slug,status,published_at,created_at,updated_at,city_ids) VALUES(?,?,?,?,?,?,?,?)');
  for (let number = 0; number < 1005; number++) {
    const id = `map-bulk-${number}`;
    insert.run(id, `Bulk ${number}`, id, 'published', stamp, stamp, stamp, JSON.stringify([cityB]));
  }
  database.exec('COMMIT');
  cards = await readMap();
  assert.equal(cards.length, database.prepare("SELECT count(*) AS total FROM posts WHERE status='published'").get().total);
  assert.equal(cards.filter(post => post.id.startsWith('map-bulk-')).length, 1005);
  passed('map endpoint includes all published cards beyond pagination and former 1000-article limits');

  assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  console.log(`City-map verification completed: ${checks} checks passed.`);
} finally {
  database?.close();
  sqliteRuntime.closeDatabase();
  if (originalDataDirectory === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDirectory;
  const resolved = path.resolve(directory);
  assert.equal(path.dirname(resolved), temporaryRoot);
  assert.ok(path.basename(resolved).startsWith('journal-city-map-'));
  rmSync(resolved, { recursive: true, force: true });
}

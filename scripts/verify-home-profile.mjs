/** Upgrade a real old database, exercise settings persistence, and render public controls. */
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { register } from 'tsx/esm/api';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { closeDatabase, getDatabaseAdapter, migrateDatabase } from '../db/sqlite.mjs';

const parent = path.resolve(tmpdir()), directory = mkdtempSync(path.join(parent, 'journal-home-profile-'));
process.env.DATA_DIR = path.join(directory, 'data');
const migrations = path.join(directory, 'migrations');
mkdirSync(migrations);
const unregister = register();
const styles = registerHooks({ load(url, context, next) { return url.endsWith('.css') ? { format: 'module', source: 'export default {}', shortCircuit: true } : next(url, context); } });
try {
  for (const name of readdirSync('drizzle').filter(name => name.endsWith('.sql') && name < '0015')) copyFileSync(path.join('drizzle', name), path.join(migrations, name));
  migrateDatabase(migrations);
  const legacy = getDatabaseAdapter().connection;
  legacy.prepare('INSERT INTO site_settings(id,name,avatar,education,updated_at) VALUES (?,?,?,?,?)').run('site', '原昵称', '/media/avatar.png', '原教育经历', '2026-01-01');
  legacy.prepare('INSERT INTO posts(id,slug,title,content,created_at,updated_at) VALUES (?,?,?,?,?,?)').run('old', 'old', '原文章', '原正文', '2026-01-01', '2026-01-01');
  const before = legacy.prepare('SELECT * FROM site_settings').get(), post = legacy.prepare('SELECT * FROM posts').get();
  const pending = readdirSync('drizzle').filter(name => name.endsWith('.sql') && name >= '0015').length;
  assert.equal(migrateDatabase().applied, pending);
  const after = legacy.prepare('SELECT * FROM site_settings').get();
  for (const [key, value] of Object.entries(before)) assert.equal(after[key], key === 'github' && !value ? 'https://github.com/GGGxsb' : value);
  assert.deepEqual(legacy.prepare('SELECT * FROM posts').get(), post);
  assert.equal(after.home_background, '');
  assert.equal(after.bilibili, 'https://space.bilibili.com/440795315');
  assert.equal(after.xiaohongshu, 'https://www.xiaohongshu.com/user/profile/64abbca7000000001001edbd');
  assert.equal(after.douyin, '');
  assert.equal(migrateDatabase().applied, 0);
  console.log('PASS old data survives migration, supplied profiles are filled, Douyin is empty, migration is repeatable.');

  const { getSettings, saveSettings, validateSettings, ApiError } = await import('../app/lib/server.ts');
  const base = { name: '站主', bio: '', description: '', avatar: '', github: '', email: '', location: '', education: '', startedAt: '' };
  const configured = await saveSettings(validateSettings({ ...base, homeBackground: ' /media/landscape.png ', douyin: 'https://www.douyin.com/user/example' }));
  assert.equal(configured.homeBackground, '/media/landscape.png');
  const oldClient = await saveSettings(validateSettings({ ...base, bio: '来自旧版编辑器的更新' }));
  for (const field of ['homeBackground', 'xiaohongshu', 'bilibili', 'douyin']) assert.equal(oldClient[field], configured[field]);
  const removed = await saveSettings(validateSettings({ ...base, homeBackground: '', douyin: '' }));
  assert.equal(removed.homeBackground, ''); assert.equal(removed.douyin, '');
  assert.equal(removed.xiaohongshu, configured.xiaohongshu);
  closeDatabase(); assert.equal((await getSettings()).bilibili, configured.bilibili);
  for (const field of ['xiaohongshu', 'bilibili', 'douyin']) for (const value of [null, 'javascript:alert(1)', 'http://example.com', 'https://bilibili.com.evil.example/user/1', 'https://user:pass@www.douyin.com/user/1', 'https://example.com', 'x'.repeat(2049)]) {
    assert.throws(() => validateSettings({ ...base, [field]: value }), error => error instanceof ApiError && error.status === 400);
  }
  for (const value of ['//example.com/image.png', 'javascript:alert(1)', 'https://user:pass@example.com/image.png', '/media/line\nbreak.png']) {
    assert.throws(() => validateSettings({ ...base, homeBackground: value }), error => error instanceof ApiError && error.status === 400);
  }
  console.log('PASS background and profiles persist across restart, omitted fields preserve saved data, explicit empty values remove it, invalid links are rejected.');

  const { default: Profile } = await import('../app/components/profile.tsx');
  const render = settings => renderToStaticMarkup(createElement(Profile, { settings, name: '站主', home: true }));
  const html = render({ ...removed, github: 'https://github.com/juicegao', email: 'hello@example.com', location: '杭州' });
  for (const label of ['GitHub个人主页', '小红书个人主页', 'B站个人主页', '发送邮件']) assert.ok(html.includes(label));
  assert.ok(!html.includes('抖音个人主页'));
  assert.equal((html.match(/class="profile-social profile-social-/g) || []).length, 3);
  assert.ok(html.includes('home-profile') && html.includes('aria-hidden="true"') && html.includes('noopener noreferrer'));
  assert.ok(!render({ ...removed, xiaohongshu: '', bilibili: '' }).includes('profile-socials'));
  assert.ok(!render({ ...removed, bilibili: 'javascript:alert(1)', xiaohongshu: '' }).includes('profile-socials'));
  const { default: Editor } = await import('../app/admin/home-background-editor.tsx');
  const editor = renderToStaticMarkup(createElement(Editor, { value: '/media/landscape.png', onChange() {}, onBusyChange() {} }));
  assert.ok(editor.includes('前台页面顶部背景预览') && editor.includes('更换背景图') && editor.includes('移除背景图') && editor.includes('type="file"'));
  const { default: Backdrop } = await import('../app/components/site-backdrop.tsx');
  const backdrop = value => renderToStaticMarkup(createElement(Backdrop, { src: value }));
  assert.ok(backdrop(configured.homeBackground).includes('src="/media/landscape.png"'));
  assert.ok(backdrop('').includes('aria-hidden="true"') && !backdrop('').includes('<img'));
  assert.ok(!backdrop('javascript:alert(1)').includes('<img'));
  console.log('PASS public profiles use accessible icons, empty/unsafe platforms stay hidden, and admin exposes background upload/replace/remove.');
} finally {
  closeDatabase(); styles.deregister(); unregister();
  const resolved = path.resolve(directory);
  assert.equal(path.dirname(resolved), parent); assert.ok(path.basename(resolved).startsWith('journal-home-profile-'));
  rmSync(resolved, { recursive: true, force: true });
}

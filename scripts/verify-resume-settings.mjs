/** Exercise the actual settings validator and SQL upsert on disposable local data. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { register } from 'tsx/esm/api';
import { closeDatabase } from '../db/sqlite.mjs';

const temporaryRoot = path.resolve(os.tmpdir());
const directory = mkdtempSync(path.join(temporaryRoot, 'juicegao-resume-settings-'));
process.env.DATA_DIR = path.join(directory, 'data');
const unregister = register();
const { ApiError, DEFAULT_SETTINGS, getSettings, saveSettings, validateSettings } = await import('../app/lib/server.ts');
const base = { name: '站主', bio: '', description: '', avatar: '', github: '', email: '', location: '', education: '  ## 原有学习补充\n\n保留 Markdown 与空白。\n\n', startedAt: '' };
const entry = (fields = {}) => ({ id: randomUUID(), organization: '学校或机构', title: '专业或职位', period: '2020—2024', description: '**Markdown**\n\n  原文与段落。\n', url: 'https://example.edu/resume?x=1#about', coverImage:'',...fields });
function invalid(fields) { assert.throws(() => validateSettings({ ...base, ...fields }), error => error instanceof ApiError && error.status === 400); }
let database;
try {
  const defaults = await getSettings(), otherDefaults = await getSettings();
  assert.deepEqual(defaults.educationEntries, []); assert.deepEqual(defaults.experienceEntries, []);
  assert.notEqual(defaults.educationEntries, otherDefaults.educationEntries);
  assert.notEqual(defaults.educationEntries, defaults.experienceEntries);
  defaults.educationEntries.push(entry()); DEFAULT_SETTINGS.experienceEntries.push(entry());
  assert.deepEqual((await getSettings()).educationEntries, []); assert.deepEqual((await getSettings()).experienceEntries, []);
  const legacyInput = validateSettings(base);
  assert.equal(legacyInput.educationEntries, undefined); assert.equal(legacyInput.experienceEntries, undefined);
  const initial = await saveSettings(legacyInput);
  assert.deepEqual(initial.educationEntries, []); assert.deepEqual(initial.experienceEntries, []); assert.equal(initial.education, base.education);

  const first = entry({ organization: '  第一所学校  ', title: '  计算机专业  ', period: '  2020—2024  ' });
  const second = entry({ organization: '第二所学校', url: '' });
  const experience = entry({ organization: '公司', title: '工程师' });
  const parsed = validateSettings({ ...base, educationEntries: [first, second], experienceEntries: [experience] });
  assert.equal(parsed.educationEntries[0].organization, '第一所学校'); assert.equal(parsed.educationEntries[0].title, '计算机专业'); assert.equal(parsed.educationEntries[0].period, '2020—2024');
  assert.equal(parsed.educationEntries[0].description, first.description);
  assert.equal(first.organization, '  第一所学校  ', 'Validation must not mutate the input draft.');
  const saved = await saveSettings(parsed);
  assert.deepEqual(saved.educationEntries, parsed.educationEntries); assert.deepEqual(saved.experienceEntries, parsed.experienceEntries);
  assert.equal(saved.education, base.education);
  saved.educationEntries[0].organization = '外部修改返回值';
  assert.equal((await getSettings()).educationEntries[0].organization, '第一所学校', 'Returned arrays must not share mutable database state.');
  const staleClient = { ...base, bio: '旧客户端更新简介' };
  const preserved = await saveSettings(validateSettings(staleClient));
  assert.equal(preserved.bio, staleClient.bio); assert.deepEqual(preserved.educationEntries, parsed.educationEntries); assert.deepEqual(preserved.experienceEntries, parsed.experienceEntries);
  const reordered = await saveSettings(validateSettings({ ...base, educationEntries: [...parsed.educationEntries].reverse() }));
  assert.deepEqual(reordered.educationEntries, [...parsed.educationEntries].reverse()); assert.deepEqual(reordered.experienceEntries, parsed.experienceEntries);
  const cleared = await saveSettings(validateSettings({ ...base, educationEntries: [] }));
  assert.deepEqual(cleared.educationEntries, []); assert.deepEqual(cleared.experienceEntries, parsed.experienceEntries); assert.equal(cleared.education, base.education);
  const explicitUndefined = await saveSettings(validateSettings({ ...base, experienceEntries: undefined }));
  assert.deepEqual(explicitUndefined.experienceEntries, parsed.experienceEntries);
  assert.deepEqual((await saveSettings(validateSettings({ ...base, experienceEntries: [] }))).experienceEntries, []);
  console.log('PASS settings persist entry order and legacy education; omitted groups survive older clients, and explicit empty arrays clear only the requested group.');

  const twenty = Array.from({ length: 20 }, () => entry());
  assert.equal(validateSettings({ ...base, educationEntries: twenty, experienceEntries: twenty }).educationEntries.length, 20);
  for (const field of ['educationEntries', 'experienceEntries']) {
    invalid({ [field]: [...twenty, entry()] }); invalid({ [field]: null }); invalid({ [field]: {} });
    const duplicate = entry(); invalid({ [field]: [duplicate, { ...duplicate }] });
    invalid({ [field]: [duplicate, { ...duplicate, id: duplicate.id.toUpperCase() }] });
  }
  // IDs need only be unique within a group, and optional display fields may be omitted.
  const sharedId = randomUUID();
  const compatible = validateSettings({ ...base, educationEntries: [{ id: sharedId, organization: '教育' }], experienceEntries: [{ id: sharedId, organization: '履历' }] });
  assert.equal(compatible.educationEntries[0].title, ''); assert.equal(compatible.educationEntries[0].url, '');
  for (const fields of [
    { id: 'invalid' }, { organization: ' \t ' }, { organization: '字'.repeat(161) }, { title: '字'.repeat(161) },
    { period: '字'.repeat(81) }, { description: '字'.repeat(3001) }, { url: `https://example.com/${'a'.repeat(2048)}` }, { unexpected: 'reject' },
  ]) invalid({ educationEntries: [entry(fields)] });
  for (const url of ['http://example.com', 'javascript:alert(1)', 'data:text/html,unsafe', '//example.com', '/relative', 'https://user:password@example.com', 'https://exam\nple.com', 'https:\\example.com']) invalid({ experienceEntries: [entry({ url })] });
  assert.equal(validateSettings({ ...base, educationEntries: [entry({ url: 'HTTPS://example.com/safe' })] }).educationEntries[0].url, 'HTTPS://example.com/safe');
  const maximum = entry({ organization: '字'.repeat(160), title: '字'.repeat(160), period: '字'.repeat(80), description: '字'.repeat(3000) });
  assert.equal(validateSettings({ ...base, educationEntries: [maximum] }).educationEntries[0].description.length, 3000);
  console.log('PASS UUID, per-group uniqueness, group sizes, field bounds, safe HTTPS links and Markdown preservation are validated by the real input schema.');

  const school=entry({coverImage:'/media/school.png'}),job=entry({coverImage:'https://images.example.com/job.jpg'});
  await saveSettings(validateSettings({...base,educationEntries:[school],experienceEntries:[job]}));
  assert.equal((await getSettings()).educationEntries[0].coverImage,school.coverImage);
  assert.equal((await getSettings()).experienceEntries[0].coverImage,job.coverImage);
  const {coverImage:_image,...olderSchool}=school;
  const kept=await saveSettings(validateSettings({...base,educationEntries:[{...olderSchool,title:'旧编辑器更新专业'}]}));
  assert.equal(kept.educationEntries[0].coverImage,school.coverImage);assert.equal(kept.experienceEntries[0].coverImage,job.coverImage);
  const removed=await saveSettings(validateSettings({...base,educationEntries:[{...olderSchool,coverImage:''}]}));
  assert.equal(removed.educationEntries[0].coverImage,'');assert.equal(removed.experienceEntries[0].coverImage,job.coverImage);
  for(const coverImage of ['http://example.com/x.jpg','javascript:alert(1)','data:image/png;base64,x','//example.com/x.jpg','https://user:pass@example.com/x.jpg','/\\example.com/x.jpg','/media/line\nbreak.jpg',null,'x'.repeat(2049)])invalid({educationEntries:[entry({coverImage})]});
  assert.equal(validateSettings({...base,educationEntries:[entry({coverImage:'  /media/trimmed.png  '})]}).educationEntries[0].coverImage,'/media/trimmed.png');
  closeDatabase();
  assert.equal((await getSettings()).experienceEntries[0].coverImage,job.coverImage);
  await saveSettings(validateSettings({...base,educationEntries:[],experienceEntries:[]}));
  console.log('PASS optional covers persist in SQL across restart, older editors preserve saved images, explicit removal clears only the selected group and unsafe image URLs are rejected');

  database = new DatabaseSync(path.join(process.env.DATA_DIR, 'journal.sqlite'));
  const persisted = database.prepare('SELECT education,education_entries,experience_entries FROM site_settings WHERE id=?').get('site');
  assert.equal(persisted.education, base.education); assert.equal(persisted.education_entries, '[]'); assert.equal(persisted.experience_entries, '[]');
} finally {
  database?.close(); closeDatabase(); unregister();
  const resolved = path.resolve(directory);
  assert.equal(path.dirname(resolved), temporaryRoot);
  assert.ok(path.basename(resolved).startsWith('juicegao-resume-settings-'));
  rmSync(resolved, { recursive: true, force: true });
}

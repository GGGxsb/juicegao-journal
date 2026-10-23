/** Official GraphQL data, persistent cache, failure recovery and calendar boundaries. */
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { register } from 'tsx/esm/api';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { closeDatabase, migrateDatabase } from '../db/sqlite.mjs';

const temporaryRoot=path.resolve(tmpdir()),directory=mkdtempSync(path.join(temporaryRoot,'journal-github-calendar-'));
const migrations=path.join(directory,'migrations');mkdirSync(migrations);const unregister=register();let db;
const token=randomBytes(32).toString('base64url'),username='GGGxsb',stamp='2026-10-23T00:00:00.000Z';
process.env.DATA_DIR=path.join(directory,'data');
function open(){db=new DatabaseSync(path.join(process.env.DATA_DIR,'journal.sqlite'));}
try{
  for(const name of readdirSync('drizzle').filter(name=>/^(000\d)_.*\.sql$/.test(name)))copyFileSync(path.join('drizzle',name),path.join(migrations,name));
  assert.equal(migrateDatabase(migrations).applied,10);open();
  db.prepare('INSERT INTO posts(id,title,slug,content,status,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('legacy-post','原文章','legacy-post','保留正文','published',stamp,stamp,stamp);
  const original=db.prepare('SELECT * FROM posts').all();
  copyFileSync('drizzle/0010_github_contribution_cache.sql',path.join(migrations,'0010_github_contribution_cache.sql'));
  assert.deepEqual(migrateDatabase(migrations),{applied:1,total:11});assert.deepEqual(db.prepare('SELECT * FROM posts').all(),original);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(migrateDatabase().applied,0);
  const {getGithubContributions,githubContributionConfig}=await import('../app/lib/github-contributions.ts');
  delete process.env.GITHUB_CONTRIBUTIONS_TOKEN;delete process.env.GITHUB_CONTRIBUTIONS_USERNAME;
  let calls=0;const unused=async()=>{calls++;throw new Error('Must not fetch');};
  assert.deepEqual(await getGithubContributions('https://github.com/GGGxsb',unused),{status:'disabled'});assert.equal(calls,0);
  process.env.GITHUB_CONTRIBUTIONS_TOKEN=token;
  for(const profile of ['https://github.com.evil.example/GGGxsb','http://github.com/GGGxsb','https://evil.example/GGGxsb','https://github.com/GGGxsb/repo','https://x@y.github.com/name','javascript:alert(1)'])assert.equal(githubContributionConfig(profile).configured,false);
  assert.deepEqual(githubContributionConfig('https://github.com/GGGxsb/'),{username:'GGGxsb',configured:true});
  process.env.GITHUB_CONTRIBUTIONS_USERNAME=username;
  const days=Array.from({length:7},(_,index)=>({date:`2026-10-${String(18+index).padStart(2,'0')}`,contributionCount:index,contributionLevel:['NONE','FIRST_QUARTILE','SECOND_QUARTILE','THIRD_QUARTILE','FOURTH_QUARTILE'][Math.min(4,index)]}));
  const upstream={data:{user:{login:username,contributionsCollection:{contributionCalendar:{totalContributions:21,weeks:[{contributionDays:days}]}}}}};
  const success=async(url,options)=>{
    calls++;assert.equal(url,'https://api.github.com/graphql');assert.equal(options.redirect,'error');assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,`Bearer ${token}`);
    const body=JSON.parse(options.body);assert.equal(body.variables.login,username);assert.ok(!body.query.includes('repository('));assert.ok(!options.body.includes(token));
    return Response.json(upstream);
  };
  const concurrent=await Promise.all(Array.from({length:8},()=>getGithubContributions('',success)));
  assert.equal(calls,1);const result=concurrent[0];assert.equal(result.status,'ready');assert.equal(result.stale,false);assert.equal(result.calendar.total,21);assert.equal(result.calendar.days[6].level,4);
  assert.ok(!JSON.stringify(result).includes(token));assert.ok(!JSON.stringify(db.prepare('SELECT * FROM github_contribution_cache').all()).includes(token));
  closeDatabase();assert.deepEqual(await getGithubContributions('',unused),result);assert.equal(calls,1);
  console.log('PASS upgrades preserve articles; only the configured account is queried; credentials stay server-side; concurrent requests and restarts reuse the cache');

  const old=Date.now()-3_600_001;db.prepare('UPDATE github_contribution_cache SET fetched_at=?').run(old);
  const failing=async()=>{calls++;throw new Error(`Private upstream error: ${token}`);};
  const stale=await getGithubContributions('',failing);assert.equal(stale.status,'ready');assert.equal(stale.stale,true);assert.deepEqual(stale.calendar,result.calendar);assert.ok(!JSON.stringify(stale).includes(token));
  const afterFailure=calls;assert.deepEqual(await getGithubContributions('',failing),stale);assert.equal(calls,afterFailure);
  process.env.GITHUB_CONTRIBUTIONS_TOKEN='rotated-credential';
  const denied=await getGithubContributions('',async()=>new Response(token,{status:401}));assert.deepEqual(denied,{status:'unavailable',username});assert.equal(db.prepare('SELECT calendar FROM github_contribution_cache').get().calendar,null);
  process.env.GITHUB_CONTRIBUTIONS_TOKEN=token;
  for(const payload of [{data:upstream.data,errors:[{message:token}]},{data:{user:{...upstream.data.user,login:'another-user'}}},{data:{user:{...upstream.data.user,contributionsCollection:{contributionCalendar:{totalContributions:0,weeks:[{contributionDays:[days[0],days[0]]}]}}}}}]){
    db.exec('DELETE FROM github_contribution_cache');const invalid=await getGithubContributions('',async()=>Response.json(payload));assert.deepEqual(invalid,{status:'unavailable',username});
  }
  db.exec('DELETE FROM github_contribution_cache');assert.equal((await getGithubContributions('',async()=>new Response('x'.repeat(140*1024)))).status,'unavailable');
  db.exec('DELETE FROM github_contribution_cache');assert.equal((await getGithubContributions('',success)).status,'ready');
  console.log('PASS failures retain the last successful calendar, failed requests back off, rotation isolates old data and malformed responses never become fake zero-contribution charts');

  const {contributionLayout}=await import('../app/lib/contribution-layout.ts');
  const layout=contributionLayout(result.calendar.days);assert.equal(layout.weeks,1);assert.equal(layout.cells.length,7);assert.ok(layout.cells.every(cell=>cell.day));
  const leap=contributionLayout([{date:'2024-02-28',count:0,level:0},{date:'2024-02-29',count:1,level:1},{date:'2024-03-01',count:2,level:2}]);
  assert.equal(leap.cells.filter(cell=>cell.day).length,3);assert.equal(leap.cells.find(cell=>cell.day?.date==='2024-02-29').date,'2024-02-29');
  const long=contributionLayout([{date:'2024-06-01',count:0,level:0},{date:'2025-06-01',count:0,level:0}]);assert.equal(long.weeks,54);assert.equal(long.cells.at(-1).day,null);assert.deepEqual(contributionLayout([]).cells,[]);
  const {default:ActivityCalendars}=await import('../app/components/activity-calendars.tsx');
  const home={today:'2026-10-24',activity:[{date:'2026-10-24',count:2}],notes:[],firstPublishedAt:null,lastUpdatedAt:null};
  const writing=renderToStaticMarkup(createElement(ActivityCalendars,{home}));assert.ok(writing.includes('写作日历')&&writing.includes('发布 2 篇记录'));assert.ok(!writing.includes('calendar-tabs'));
  const configured=renderToStaticMarkup(createElement(ActivityCalendars,{home:{...home,github:{configured:true,username}}}));assert.ok(configured.includes('写作记录')&&configured.includes('GitHub 贡献')&&configured.includes('正在加载 GitHub 贡献'));assert.ok(!configured.includes(token));
  console.log('PASS UTC dates, leap days and 54-week ranges retain correct cells; unconfigured sites keep writing history and configured sites show a truthful loading state');
}finally{
  db?.close();closeDatabase();unregister();delete process.env.GITHUB_CONTRIBUTIONS_TOKEN;delete process.env.GITHUB_CONTRIBUTIONS_USERNAME;
  const target=path.resolve(directory);assert.equal(path.dirname(target),temporaryRoot);assert.ok(path.basename(target).startsWith('journal-github-calendar-'));rmSync(target,{recursive:true,force:true});
}

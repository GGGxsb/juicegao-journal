/** Check the real Sponsor migration, settings validation/persistence and public rendering on disposable data. */
import assert from 'node:assert/strict';
import {copyFileSync,mkdirSync,mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {registerHooks} from 'node:module';
import {register} from 'tsx/esm/api';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {closeDatabase,getDatabaseAdapter,migrateDatabase} from '../db/sqlite.mjs';

const parent=path.resolve(tmpdir()),directory=mkdtempSync(path.join(parent,'journal-sponsor-'));
process.env.DATA_DIR=path.join(directory,'data');
const migrations=path.join(directory,'migrations');mkdirSync(migrations);
const unregister=register();
const styles=registerHooks({load(url,context,next){return url.endsWith('.css')?{format:'module',source:'export default {}',shortCircuit:true}:next(url,context);}});
try{
  for(const name of readdirSync('drizzle').filter(name=>name.endsWith('.sql')&&name<'0014'))copyFileSync(path.join('drizzle',name),path.join(migrations,name));
  migrateDatabase(migrations);
  const legacy=getDatabaseAdapter().connection;
  legacy.prepare('INSERT INTO site_settings(id,name,education,updated_at) VALUES (?,?,?,?)').run('site','旧站主','原有学习经历','2026-01-01');
  legacy.prepare('INSERT INTO posts(id,slug,title,content,created_at,updated_at) VALUES (?,?,?,?,?,?)').run('old','old','原文章','原正文','2026-01-01','2026-01-01');
  const before=legacy.prepare('SELECT * FROM site_settings').get();
  const originalPost=legacy.prepare('SELECT * FROM posts').get();
  assert.equal(migrateDatabase().applied,1);
  closeDatabase();
  const connection=getDatabaseAdapter().connection;
  const after=connection.prepare('SELECT * FROM site_settings').get();
  for(const [key,value] of Object.entries(before))assert.equal(after[key],value);
  assert.equal(after.sponsor_wechat,'');assert.equal(after.sponsor_alipay,'');
  assert.deepEqual(connection.prepare('SELECT * FROM posts').get(),originalPost);
  assert.equal(migrateDatabase().applied,0);
  console.log('PASS migration preserves all existing settings/articles and is repeatable.');

  const {getSettings,saveSettings,validateSettings,ApiError}=await import('../app/lib/server.ts');
  const base={name:'站主',bio:'',description:'',avatar:'',github:'',email:'',location:'',education:'原有学习经历',startedAt:''};
  const initial=await getSettings();assert.equal(initial.sponsorWechat,'');assert.equal(initial.sponsorAlipay,'');
  const configured=await saveSettings(validateSettings({...base,sponsorWechat:' /media/wechat.png ',sponsorAlipay:'https://example.com/alipay.png'}));
  assert.equal(configured.sponsorWechat,'/media/wechat.png');
  assert.equal(configured.sponsorAlipay,'https://example.com/alipay.png');
  const oldClient=await saveSettings(validateSettings({...base,bio:'旧客户端更新'}));
  assert.equal(oldClient.sponsorWechat,configured.sponsorWechat);assert.equal(oldClient.sponsorAlipay,configured.sponsorAlipay);
  const removed=await saveSettings(validateSettings({...base,sponsorWechat:''}));
  assert.equal(removed.sponsorWechat,'');assert.equal(removed.sponsorAlipay,configured.sponsorAlipay);
  closeDatabase();assert.equal((await getSettings()).sponsorAlipay,configured.sponsorAlipay);
  for(const field of ['sponsorWechat','sponsorAlipay'])for(const value of [null,'http://example.com/x.png','javascript:alert(1)','data:image/png;base64,x','//example.com/x.png','https://user:pass@example.com/x.png','/\\example.com/x.png','/media/line\nbreak.png','x'.repeat(2049)]){
    assert.throws(()=>validateSettings({...base,[field]:value}),error=>error instanceof ApiError&&error.status===400);
  }
  console.log('PASS both methods persist across restart, omitted fields preserve saved QR codes, explicit empty strings remove only the requested method and unsafe URLs are rejected.');

  const {default:Sponsor}=await import('../app/components/sponsor.tsx');
  const render=props=>renderToStaticMarkup(createElement(Sponsor,props));
  assert.equal(render({}),'');assert.equal(render({wechat:'javascript:alert(1)',alipay:'//bad.example/x.png'}),'');
  const pair=render({wechat:'/media/wechat.png',alipay:'/media/alipay.png'});
  assert.equal((pair.match(/class="sponsor-card"/g)||[]).length,2);
  assert.ok(pair.includes('aria-pressed="false"')&&pair.includes('微信赞助二维码')&&pair.includes('支付宝赞助二维码'));
  assert.ok(pair.includes('loading="lazy"')&&pair.includes('id="sponsor"'));
  assert.equal((render({alipay:'/media/alipay.png'}).match(/class="sponsor-card"/g)||[]).length,1);
  const {default:SponsorEditor}=await import('../app/admin/sponsor-editor.tsx');
  const editor=renderToStaticMarkup(createElement(SponsorEditor,{wechat:'/media/wechat.png',alipay:'',onChange(){},onBusyChange(){}}));
  assert.ok(editor.includes('微信二维码预览')&&editor.includes('更换二维码')&&editor.includes('上传二维码'));
  assert.equal((editor.match(/type="file"/g)||[]).length,2);
  console.log('PASS public cards render only configured safe methods, default to concealed images and expose keyboard/touch controls; the admin provides independent upload/replace/remove controls.');
}finally{
  closeDatabase();styles.deregister();unregister();
  const resolved=path.resolve(directory);assert.equal(path.dirname(resolved),parent);assert.ok(path.basename(resolved).startsWith('journal-sponsor-'));
  rmSync(resolved,{recursive:true,force:true});
}

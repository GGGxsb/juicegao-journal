/** Render the actual resume sections, without browser or stylesheet loaders. */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { register } from 'tsx/esm/api';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const styles = registerHooks({load(url,context,nextLoad){return url.endsWith('.css')?{format:'module',source:'export default {}',shortCircuit:true}:nextLoad(url,context);}});
const unregister=register();
try {
  const {default:ResumeSections}=await import('../app/components/resume-sections.tsx');
  const render=settings=>renderToStaticMarkup(createElement(ResumeSections,{settings}));
  const empty={education:'',educationEntries:[],experienceEntries:[]};
  assert.equal(render(empty),'');
  const legacy=render({...empty,education:'已有的 **学习经历**，应完整保留。'});
  assert.ok(legacy.includes('教育经历')&&legacy.includes('<strong>学习经历</strong>'));
  assert.ok(!legacy.includes('resume-experience-heading'));
  console.log('PASS empty resume sections stay hidden and existing education Markdown remains visible');
  const entry=(id,organization,fields={})=>({id,organization,title:'计算机科学 · 学士',period:'2020.09 — 2024.06',description:'学习 **系统设计**，参与开源项目。',url:'https://example.com/school',...fields});
  const fullPeriod='2026.07.01 - 2026.09.18';
  const html=render({...empty,educationEntries:[entry('school-1','第一所学校',{description:'学习 **系统设计**，查看[项目详情](https://example.com/project)。'}),entry('school-2','第二所学校',{url:'',period:''})],experienceEntries:[entry('job-1','第一段履历',{title:'软件工程师',period:fullPeriod,url:'https://example.com/team',description:'- 项目研发\n- 团队协作'}),entry('job-2','第二段履历',{title:'',period:'至今',description:'',url:''})]});
  assert.ok(html.indexOf('school-1')<html.indexOf('school-2'));
  assert.ok(html.indexOf('job-1')<html.indexOf('job-2'));
  assert.equal((html.match(/class="resume-timeline-item"/g)||[]).length,2);
  assert.ok(html.includes('软件工程师')&&html.includes('至今')&&html.includes('<ul>'));
  assert.ok(html.includes('href="https://example.com/school"')&&html.includes('rel="noopener noreferrer"'));
  assert.ok(html.includes('<strong>系统设计</strong>'));
  console.log('PASS education cards and career timelines preserve field values, ordering, optional links and safe Markdown');
  assert.match(html,/<h3 class="resume-organization"><a class="resume-card-link" href="https:\/\/example\.com\/school"[^>]*>第一所学校<\/a><\/h3>/);
  assert.equal((html.match(/class="resume-card-link"/g)||[]).length,1);
  assert.ok(html.includes('href="https://example.com/project"'));
  for(const anchor of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)) assert.ok(!anchor[0].slice(2).includes('<a '),'card and Markdown links must not be nested');
  assert.ok(html.includes(`title="${fullPeriod}">${fullPeriod}</p>`));
  console.log('PASS linked cards have one named heading link, independent Markdown links and complete date ranges');
  const unsafe=render({...empty,educationEntries:[entry('unsafe','<img src=x onerror=alert(1)>',{url:'javascript:alert(1)',description:'<script>alert(1)</script>\n\n[bad](javascript:alert(1))'})]});
  assert.ok(!unsafe.includes('<img src=x')&&!unsafe.includes('<script>')&&!unsafe.includes('href="javascript:'));
  console.log('PASS text, Markdown and direct database links cannot inject executable HTML');
} finally {unregister();styles.deregister();}

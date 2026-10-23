'use client';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { HomeOverview, PostStatistics, SiteSettings } from '../lib/types';
import { postHref } from '../lib/post-links';
import { Markdown } from './markdown';
import ResumeSections from './resume-sections';
import './home.css';

function dayInShanghai(value: string) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
}

function WritingCalendar({home}: {home:HomeOverview}) {
  const [selected, setSelected] = useState<{date:string;count:number}|null>(null);
  const today = new Date(`${home.today}T00:00:00Z`);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 364 - start.getUTCDay());
  const counts = new Map(home.activity.map(day=>[day.date,day.count]));
  const days = Array.from({length:371},(_,index)=>{
    const date = new Date(start);date.setUTCDate(date.getUTCDate()+index);
    const key = date.toISOString().slice(0,10);
    return {date:key,count:counts.get(key)??0,future:key>home.today};
  });
  const total = days.reduce((sum,day)=>sum+(day.future?0:day.count),0);
  return <section className="writing-calendar" aria-label="写作日历">
    <div className="calendar-heading"><h3>写作日历</h3><span>近一年 · {total} 篇记录</span></div>
    <div className="calendar-scroll" tabIndex={0} role="region" aria-label="按日期查看发布记录，可横向滚动">
      <div className="calendar-months" aria-hidden="true">{Array.from({length:53},(_,week)=>{const date=new Date(start);date.setUTCDate(date.getUTCDate()+week*7);return <span key={week}>{date.getUTCDate()<=7?`${date.getUTCMonth()+1}月`:''}</span>})}</div>
      <div className="calendar-days">{days.map(day=>day.future?<span key={day.date} className="calendar-day is-future"/>:<button type="button" key={day.date} className={`calendar-day level-${Math.min(4,day.count)}`} aria-label={`${day.date}，发布 ${day.count} 篇记录`} aria-pressed={selected?.date===day.date} title={`${day.date} · ${day.count} 篇记录`} onClick={()=>setSelected(day)}/>)}</div>
    </div>
    <div className="calendar-footer"><span role="status">{selected?`${selected.date} · 发布 ${selected.count} 篇记录`:`${start.toISOString().slice(0,10)} — ${home.today}`}</span><div className="calendar-legend" aria-label="颜色越深，发布记录越多"><span>少</span>{[0,1,2,3,4].map(level=><i key={level} className={`calendar-day level-${level}`}/>)}<span>多</span></div></div>
  </section>;
}

export default function HomeContent({settings,bio,description,stats,home}: {settings:SiteSettings;bio:string;description:string;stats?:PostStatistics;home?:HomeOverview}) {
  const firstDay = settings.startedAt || (home?.firstPublishedAt?dayInShanghai(home.firstPublishedAt):'');
  const onlineDays = firstDay&&home?Math.max(1,Math.floor((Date.parse(`${home.today}T00:00:00Z`)-Date.parse(`${firstDay}T00:00:00Z`))/86400000)+1):null;
  return <div className="home-sections">
    <section className="home-section"><h2>关于我</h2><p>{bio||'学习经历，生活随谈。'}</p>{description&&<div className="home-copy"><Markdown content={description}/></div>}<a href="/about" className="more-link">更多关于我 <ArrowRight size={15}/></a></section>
    <ResumeSections settings={settings}/>
    {!!home?.notes.length&&<section className="home-section"><div className="home-section-heading"><h2>生活随谈</h2><a className="more-link" href="/notes">全部随谈 <ArrowRight size={15}/></a></div><div className="home-notes">{home.notes.map(note=><article key={note.id}><a href={postHref(note)}><time dateTime={note.publishedAt}>{dayInShanghai(note.publishedAt)}</time><div><h3>{note.title}</h3>{note.excerpt&&<p>{note.excerpt}</p>}</div><ArrowRight size={16}/></a></article>)}</div></section>}
    <section className="home-section"><h2>站点统计</h2><dl className="home-statistics"><div><dt>运行天数</dt><dd>{onlineDays===null?'—':onlineDays.toLocaleString()}</dd></div><div><dt>最近更新</dt><dd className="home-stat-date">{home?.lastUpdatedAt?<time dateTime={home.lastUpdatedAt}>{dayInShanghai(home.lastUpdatedAt)}</time>:'—'}</dd></div><div><dt>累计字数</dt><dd>{(stats?.words??0).toLocaleString()}</dd></div><div><dt>全部记录</dt><dd><a href="/archive">{(stats?.total??0).toLocaleString()}</a></dd></div></dl>{home&&<WritingCalendar home={home}/>}</section>
  </div>;
}

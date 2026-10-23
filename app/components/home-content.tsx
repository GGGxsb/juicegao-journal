'use client';
import { ArrowRight } from 'lucide-react';
import type { HomeOverview, PostStatistics, SiteSettings } from '../lib/types';
import { postHref } from '../lib/post-links';
import { Markdown } from './markdown';
import ResumeSections from './resume-sections';
import ActivityCalendars from './activity-calendars';
import './home.css';

function dayInShanghai(value: string) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
}

export default function HomeContent({settings,bio,description,stats,home}: {settings:SiteSettings;bio:string;description:string;stats?:PostStatistics;home?:HomeOverview}) {
  const firstDay = settings.startedAt || (home?.firstPublishedAt?dayInShanghai(home.firstPublishedAt):'');
  const onlineDays = firstDay&&home?Math.max(1,Math.floor((Date.parse(`${home.today}T00:00:00Z`)-Date.parse(`${firstDay}T00:00:00Z`))/86400000)+1):null;
  return <div className="home-sections">
    <section className="home-section"><h2>关于我</h2><p>{bio||'学习经历，生活随谈。'}</p>{description&&<div className="home-copy"><Markdown content={description}/></div>}<a href="/about" className="more-link">更多关于我 <ArrowRight size={15}/></a></section>
    <ResumeSections settings={settings}/>
    {!!home?.notes.length&&<section className="home-section"><div className="home-section-heading"><h2>生活随谈</h2><a className="more-link" href="/notes">全部随谈 <ArrowRight size={15}/></a></div><div className="home-notes">{home.notes.map(note=><article key={note.id}><a href={postHref(note)}><time dateTime={note.publishedAt}>{dayInShanghai(note.publishedAt)}</time><div><h3>{note.title}</h3>{note.excerpt&&<p>{note.excerpt}</p>}</div><ArrowRight size={16}/></a></article>)}</div></section>}
    <section className="home-section"><h2>站点统计</h2><dl className="home-statistics"><div><dt>运行天数</dt><dd>{onlineDays===null?'—':onlineDays.toLocaleString()}</dd></div><div><dt>最近更新</dt><dd className="home-stat-date">{home?.lastUpdatedAt?<time dateTime={home.lastUpdatedAt}>{dayInShanghai(home.lastUpdatedAt)}</time>:'—'}</dd></div><div><dt>累计字数</dt><dd>{(stats?.words??0).toLocaleString()}</dd></div><div><dt>全部记录</dt><dd><a href="/archive">{(stats?.total??0).toLocaleString()}</a></dd></div></dl>{home&&<ActivityCalendars home={home}/>}</section>
  </div>;
}

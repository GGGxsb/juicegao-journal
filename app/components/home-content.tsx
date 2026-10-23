'use client';
import { ArrowRight } from 'lucide-react';
import type { HomeOverview, PostStatistics, SiteSettings } from '../lib/types';
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
    <section className="home-section"><h2>关于我</h2><p>{bio||'学习经历与生活记录。'}</p>{description&&<div className="home-copy"><Markdown content={description}/></div>}<a href="/about" className="more-link">更多关于我 <ArrowRight size={15}/></a></section>
    <ResumeSections settings={settings}/>
    <section className="home-section"><h2>站点统计</h2><dl className="home-statistics"><div><dt>运行天数</dt><dd>{onlineDays===null?'—':onlineDays.toLocaleString()}</dd></div><div><dt>最近更新</dt><dd className="home-stat-date">{home?.lastUpdatedAt?<time dateTime={home.lastUpdatedAt}>{dayInShanghai(home.lastUpdatedAt)}</time>:'—'}</dd></div><div><dt>累计字数</dt><dd>{(stats?.words??0).toLocaleString()}</dd></div><div><dt>文章总数</dt><dd><a href="/articles">{(stats?.total??0).toLocaleString()}</a></dd></div></dl>{home&&<ActivityCalendars home={home}/>}</section>
  </div>;
}

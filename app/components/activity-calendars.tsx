'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import type { HomeOverview } from '../lib/types';
import type { ContributionDay, GithubContributions } from '../lib/github-contribution-types';
import { contributionLayout } from '../lib/contribution-layout';

function CalendarGrid({ days, total, source, username, stale, updatedAt }: {
  days: ContributionDay[]; total: number; source: 'writing' | 'github'; username?: string; stale?: boolean; updatedAt?: string;
}) {
  const [selected, setSelected] = useState<ContributionDay | null>(null);
  const grid = contributionLayout(days), github = source === 'github';
  const label = github ? 'GitHub 贡献' : '写作日历', description = (day: ContributionDay) => github ? `${day.count} 次贡献` : `发布 ${day.count} 篇记录`;
  const columns = { '--calendar-weeks': grid.weeks } as CSSProperties;
  return <section className={`writing-calendar${github ? ' github-calendar' : ''}`} aria-label={label}>
    <div className="calendar-heading"><h3>{label}</h3><span>近一年 · {total} {github ? '次贡献' : '篇记录'}</span></div>
    <div className="calendar-scroll" tabIndex={0} role="region" aria-label={`按日期查看${github ? '贡献' : '发布记录'}，可横向滚动`} style={columns}>
      <div className="calendar-months" aria-hidden="true">{grid.months.map(month => <span key={month.week}>{month.label}</span>)}</div>
      <div className="calendar-days">{grid.cells.map(cell => cell.day ? <button type="button" key={cell.date}
        className={`calendar-day level-${cell.day.level}`} style={{ '--calendar-delay': `${cell.week * 8}ms` } as CSSProperties}
        aria-label={`${cell.date}，${description(cell.day)}`} aria-pressed={selected?.date === cell.date}
        title={`${cell.date} · ${description(cell.day)}`} onClick={() => setSelected(cell.day)}/> : <span key={cell.date} className="calendar-day is-future" aria-hidden="true"/>)}</div>
    </div>
    <div className="calendar-footer"><span role="status">{selected ? `${selected.date} · ${description(selected)}` : `${days[0]?.date ?? ''} — ${days[days.length - 1]?.date ?? ''}`}</span><div className="calendar-legend" aria-label={`颜色越深，${github ? '贡献' : '发布记录'}越多`}><span>少</span>{[0, 1, 2, 3, 4].map(level => <i key={level} className={`calendar-day level-${level}`}/>)}<span>多</span></div></div>
    {github && username && <div className="calendar-source"><a href={`https://github.com/${encodeURIComponent(username)}?tab=overview`} target="_blank" rel="noreferrer">@{username} · 查看 GitHub ↗</a><span title={updatedAt ? `更新于 ${updatedAt}` : undefined}>{stale ? '暂未更新，展示上次同步的数据' : '数据来自 GitHub · 每小时更新'}</span></div>}
  </section>;
}

function writingDays(home: HomeOverview): ContributionDay[] {
  const today = new Date(`${home.today}T00:00:00Z`), start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 364 - start.getUTCDay());
  const counts = new Map(home.activity.map(day => [day.date, day.count]));
  return Array.from({ length: Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1 }, (_, index) => {
    const date = new Date(start); date.setUTCDate(date.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10), count = counts.get(key) ?? 0;
    return { date: key, count, level: Math.min(4, count) };
  });
}

export default function ActivityCalendars({ home }: { home: HomeOverview }) {
  const enabled = Boolean(home.github?.configured && home.github.username), username = home.github?.username;
  const [view, setView] = useState<'writing' | 'github'>(enabled ? 'github' : 'writing');
  const [result, setResult] = useState<GithubContributions | null>(null), [loading, setLoading] = useState(enabled), [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController(); setLoading(true);
    void fetch('/api/github-contributions', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json() as GithubContributions;
      if (data.status !== 'ready' && data.status !== 'disabled' && data.status !== 'unavailable') throw new Error();
      if (!controller.signal.aborted) setResult(data);
    }).catch(() => { if (!controller.signal.aborted) setResult({ status: 'unavailable', username: username || '' }); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [enabled, username, revision]);
  const days = writingDays(home);
  return <div className="activity-calendars">
    {enabled && <div className="calendar-tabs" role="group" aria-label="活动日历"><button type="button" aria-pressed={view === 'writing'} onClick={() => setView('writing')}>写作记录</button><button type="button" aria-pressed={view === 'github'} onClick={() => setView('github')}>GitHub 贡献</button></div>}
    {view === 'writing' ? <CalendarGrid key="writing" source="writing" days={days} total={days.reduce((sum, day) => sum + day.count, 0)}/>
      : result?.status === 'ready' ? <CalendarGrid key="github" source="github" days={result.calendar.days} total={result.calendar.total} username={result.username} stale={result.stale} updatedAt={result.updatedAt}/>
      : <section className="calendar-state" aria-label="GitHub 贡献" aria-busy={loading}><p role="status">{loading ? '正在加载 GitHub 贡献…' : 'GitHub 贡献暂时无法加载，稍后再来看看。'}</p>{!loading && <button type="button" onClick={() => setRevision(value => value + 1)}>重新加载</button>}{username && <a href={`https://github.com/${encodeURIComponent(username)}`} target="_blank" rel="noreferrer">前往 GitHub ↗</a>}</section>}
  </div>;
}

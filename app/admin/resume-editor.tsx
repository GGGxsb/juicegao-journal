'use client';

import { useState } from 'react';
import type { ResumeEntry } from '../lib/types';
import './resume-editor.css';

type ResumeEditorProps = {
  kind: 'education' | 'experience';
  entries: ResumeEntry[];
  onChange: (entries: ResumeEntry[]) => void;
};

const MAX_ENTRIES = 20;

export default function ResumeEditor({ kind, entries, onChange }: ResumeEditorProps) {
  const education = kind === 'education';
  const group = education ? '教育经历' : '履历';
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(entries.length === 1 ? [entries[0].id] : []));

  function setOpen(id: string, open: boolean) {
    setExpanded(previous => {
      if (previous.has(id) === open) return previous;
      const next = new Set(previous);
      if (open) next.add(id); else next.delete(id);
      return next;
    });
  }

  function add() {
    if (entries.length >= MAX_ENTRIES) return;
    const entry: ResumeEntry = { id: crypto.randomUUID(), organization: '', title: '', period: '', description: '', url: '' };
    onChange([...entries, entry]);
    setOpen(entry.id, true);
  }

  function update(id: string, key: Exclude<keyof ResumeEntry, 'id'>, value: string) {
    onChange(entries.map(entry => entry.id === id ? { ...entry, [key]: value } : entry));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= entries.length) return;
    const next = [...entries];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function remove(id: string) {
    onChange(entries.filter(entry => entry.id !== id));
    setOpen(id, false);
  }

  return <section className="admin-resume-group" aria-label={`${group}管理`}>
    <div className="admin-resume-heading"><h3>{group}<small>{entries.length} / {MAX_ENTRIES}</small></h3><button type="button" className="admin-button admin-small" disabled={entries.length >= MAX_ENTRIES} onClick={add} aria-label={`新增${group}条目`}>新增条目</button></div>
    <p className="admin-resume-help">按这里的先后顺序展示；填写后随「保存资料」一起保存。</p>
    {entries.length ? <div className="admin-resume-list">{entries.map((entry, index) => <details
      key={entry.id}
      className="admin-resume-entry"
      open={expanded.has(entry.id)}
      onToggle={event => setOpen(entry.id, event.currentTarget.open)}
      onInvalidCapture={() => setOpen(entry.id, true)}
    >
      <summary><span><strong>{index + 1}. {entry.organization.trim() || `新的${group}条目`}</strong>{(entry.title || entry.period) && <small>{[entry.title, entry.period].filter(Boolean).join(' · ')}</small>}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></summary>
      <div className="admin-resume-entry-fields">
        <div className="admin-resume-field-pair">
          <label className="admin-field">{education ? '学校 / 机构' : '公司 / 组织'}<input required maxLength={160} value={entry.organization} onChange={event => update(entry.id, 'organization', event.target.value)} placeholder={education ? '填写学校或机构名称' : '填写公司或组织名称'} /></label>
          <label className="admin-field">{education ? '学位 / 专业' : '职位 / 角色'}<input maxLength={160} value={entry.title} onChange={event => update(entry.id, 'title', event.target.value)} placeholder={education ? '填写学位、专业或学习方向' : '填写职位、角色或负责方向'} /></label>
        </div>
        <label className="admin-field">时间<input maxLength={80} value={entry.period} onChange={event => update(entry.id, 'period', event.target.value)} placeholder="如：2022.09—至今" /></label>
        <label className="admin-field">补充说明<textarea rows={3} maxLength={3000} value={entry.description} onChange={event => update(entry.id, 'description', event.target.value)} placeholder={education ? '可填写学习内容、研究方向或其他说明（支持 Markdown）' : '可填写职责、项目或其他说明（支持 Markdown）'} /><small>可选，支持 Markdown，最多 3000 字。</small></label>
        <label className="admin-field">链接<input type="url" inputMode="url" pattern="[Hh][Tt][Tt][Pp][Ss]://.+" maxLength={2048} value={entry.url} onChange={event => update(entry.id, 'url', event.target.value)} placeholder="https://" title="请填写 HTTPS 链接，或留空" /><small>可选，填写 HTTPS 网页地址。</small></label>
        <div className="admin-resume-actions"><button type="button" className="admin-button admin-small" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`上移${group}第 ${index + 1} 项`}>上移</button><button type="button" className="admin-button admin-small" disabled={index === entries.length - 1} onClick={() => move(index, 1)} aria-label={`下移${group}第 ${index + 1} 项`}>下移</button><button type="button" className="admin-delete-link" onClick={() => remove(entry.id)} aria-label={`移除${group}第 ${index + 1} 项`}>移除条目</button></div>
      </div>
    </details>)}</div> : <p className="admin-resume-empty">暂无条目，填写后会显示在网站上。</p>}
    {entries.length >= MAX_ENTRIES && <p className="admin-resume-limit">本组最多添加 {MAX_ENTRIES} 个条目。</p>}
  </section>;
}

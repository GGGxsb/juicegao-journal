'use client';
import { useEffect, useState } from 'react';
import type { CollectionList, CollectionSummary, Pagination } from '../lib/types';
import './collections.css';

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '合集操作失败，请重试。');
  return data as T;
}

export function CollectionFields({ collectionId, collectionOrder, onSelect, onOrder }: {
  collectionId: string | null; collectionOrder: number; onSelect: (id: string | null) => void; onOrder: (order: number) => void;
}) {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void (async () => {
      const all: CollectionSummary[] = [];
      let page = 1, totalPages = 1;
      do {
        const result = await api<CollectionList>(`/api/collections?scope=all&pageSize=100&page=${page}`, { signal: controller.signal });
        all.push(...result.collections); totalPages = result.pagination.totalPages; page++;
      } while (page <= totalPages && !controller.signal.aborted);
      if (!controller.signal.aborted) setCollections(all);
    })().catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '合集加载失败。'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  return <>
    <label className="admin-field">系列合集<select value={collectionId ?? ''} onChange={event => onSelect(event.target.value || null)} disabled={loading || Boolean(error)}>
      <option value="">不加入合集</option>
      {collectionId && !collections.some(collection => collection.id === collectionId) && <option value={collectionId}>{loading ? '正在加载当前合集…' : '当前合集不可用'}</option>}
      {collections.map(collection => <option value={collection.id} key={collection.id}>{collection.title}</option>)}
    </select><small>{loading ? '正在加载合集…' : '可在「合集管理」创建和整理系列。'}</small></label>
    {error && <div className="admin-collection-error" role="alert">{error}<button type="button" onClick={() => setRevision(value => value + 1)}>重新加载</button></div>}
    {collectionId && <label className="admin-field">合集内顺序<input type="number" min={0} max={1000000} step={1} value={collectionOrder} onChange={event => onOrder(Number(event.target.value))}/><small>数字越小越靠前；相同时按发布时间排列。</small></label>}
  </>;
}

type Editor = { id: string; title: string; description: string };
const empty = (): Editor => ({ id: '', title: '', description: '' });
const emptyPagination: Pagination = { page: 1, pageSize: 20, total: 0, totalPages: 1 };

export function CollectionsPanel({ onBusyChange, onDirtyChange, onSaved }: {
  onBusyChange: (busy: boolean) => void; onDirtyChange: (dirty: boolean) => void; onSaved: () => void;
}) {
  const [collections, setCollections] = useState<CollectionSummary[]>([]), [pagination, setPagination] = useState(emptyPagination);
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0), [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [listError, setListError] = useState(''), [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null), [snapshot, setSnapshot] = useState('');
  const dirty = editor !== null && JSON.stringify(editor) !== snapshot;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => () => { onDirtyChange(false); onBusyChange(false); }, [onDirtyChange, onBusyChange]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setListError('');
    void api<CollectionList>(`/api/collections?scope=all&page=${page}&pageSize=20`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) { setCollections(result.collections); setPagination(result.pagination); setPage(result.pagination.page); } })
      .catch(cause => { if (!controller.signal.aborted) setListError(cause instanceof Error ? cause.message : '合集加载失败。'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, revision]);
  function open(collection?: CollectionSummary) {
    if (busy || (dirty && !window.confirm('还有未保存的合集修改，确定离开吗？'))) return;
    const next = collection ? { id: collection.id, title: collection.title, description: collection.description } : empty();
    setEditor(next); setSnapshot(JSON.stringify(next)); setError(''); setNotice('');
  }
  function close() {
    if (busy || (dirty && !window.confirm('还有未保存的合集修改，确定取消吗？'))) return;
    setEditor(null); setError('');
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!editor || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const { collection } = await api<{ collection: CollectionSummary }>(editor.id ? `/api/collections/${encodeURIComponent(editor.id)}` : '/api/collections', {
        method: editor.id ? 'PUT' : 'POST', body: JSON.stringify({ title: editor.title.trim(), description: editor.description.trim() }),
      });
      const next = { id: collection.id, title: collection.title, description: collection.description };
      setEditor(next); setSnapshot(JSON.stringify(next)); setRevision(value => value + 1); onSaved(); setNotice('合集已保存。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '合集保存失败。'); }
    finally { setBusy(false); }
  }
  async function remove(collection: CollectionSummary) {
    if (busy || (dirty && !window.confirm('还有未保存的合集修改，确定放弃吗？'))) return;
    if (!window.confirm(`确定删除合集「${collection.title}」吗？其中的文章会保留。`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/collections/${encodeURIComponent(collection.id)}`, { method: 'DELETE' });
      if (editor?.id === collection.id) setEditor(null);
      setRevision(value => value + 1); onSaved(); setNotice('合集已删除，文章已保留。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '合集删除失败。'); }
    finally { setBusy(false); }
  }
  return <>
    <div className="admin-page-heading"><div><h1>合集管理</h1><p>在文章编辑页选择合集与顺序，组织连续阅读。</p></div><button className="admin-button admin-primary" onClick={() => open()} disabled={busy}>新建合集</button></div>
    {error && <div className="admin-message admin-error" role="alert">{error}</div>}
    {notice && <div className="admin-message admin-success" role="status">{notice}</div>}
    {editor && <form className="admin-collection-form" onSubmit={save}><fieldset disabled={busy}>
      <h2>{editor.id ? '编辑合集' : '新建合集'}</h2>
      <label className="admin-field">合集名称<input required maxLength={120} value={editor.title} onChange={event => setEditor({ ...editor, title: event.target.value })}/></label>
      <label className="admin-field">合集介绍<textarea maxLength={2000} rows={4} value={editor.description} onChange={event => setEditor({ ...editor, description: event.target.value })}/></label>
      <div className="admin-collection-actions"><button type="submit" className="admin-button admin-primary" disabled={busy || !editor.title.trim()}>保存合集</button><button type="button" className="admin-button" onClick={close} disabled={busy}>关闭</button><span>{dirty ? '有未保存的修改' : '已保存'}</span></div>
    </fieldset></form>}
    <section className="admin-content-panel" aria-label="合集列表" aria-busy={loading}>
      {loading ? <div className="admin-list-loading" role="status">正在加载合集…</div> : listError ? <div className="admin-empty"><h2>合集加载失败</h2><p role="alert">{listError}</p><button className="admin-button" onClick={() => setRevision(value => value + 1)}>重新加载</button></div> : collections.length ? collections.map(collection => <article className="admin-collection-row" key={collection.id}><div><h2>{collection.title}</h2>{collection.description && <p>{collection.description}</p>}<small>{collection.postCount} 篇记录（含草稿）</small></div><div className="admin-collection-actions"><button className="admin-button admin-small" onClick={() => open(collection)} disabled={busy}>编辑</button><button className="admin-delete-link" onClick={() => void remove(collection)} disabled={busy}>删除</button></div></article>) : <div className="admin-empty"><h2>暂无合集</h2><p>创建合集后，可在文章编辑页添加内容。</p></div>}
      {pagination.totalPages > 1 && <nav className="admin-pagination" aria-label="合集分页"><span>共 {pagination.total} 个合集 · 第 {pagination.page} / {pagination.totalPages} 页</span><div><button className="admin-button admin-small" disabled={busy || loading || pagination.page <= 1} onClick={() => setPage(value => value - 1)}>上一页</button><button className="admin-button admin-small" disabled={busy || loading || pagination.page >= pagination.totalPages} onClick={() => setPage(value => value + 1)}>下一页</button></div></nav>}
    </section>
  </>;
}

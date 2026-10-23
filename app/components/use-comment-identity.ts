'use client';
import { useEffect, useRef, useState } from 'react';
import type { CommentProvider, CommentSession } from '../lib/comment-identity-types';

type Compose = { nickname: string; content: string; reply: { id: string; nickname: string } | null };
const storageKey = (postId: string) => `journal-comment-compose:v1:${postId}`;
async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || '登录暂时不可用，请稍后重试。'); return data;
}
export function useCommentIdentity(postId: string, compose: Compose, restore: (value: Compose) => void) {
  const [session, setSession] = useState<CommentSession>({ user: null, providers: [] });
  const [selected, setSelected] = useState<'guest' | 'account'>('guest'), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [revision, setRevision] = useState(0);
  const latest = useRef({ compose, restore }); latest.current = { compose, restore };
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey(postId));
      if (raw) {
        const value = JSON.parse(raw) as Compose;
        if (typeof value.nickname === 'string' && value.nickname.length <= 40 && typeof value.content === 'string' && value.content.length <= 3000 &&
          (value.reply === null || (typeof value.reply?.id === 'string' && value.reply.id.length <= 128 && typeof value.reply.nickname === 'string' && value.reply.nickname.length <= 40))) latest.current.restore(value);
        sessionStorage.removeItem(storageKey(postId));
      }
    } catch { /* An unavailable/invalid local draft does not prevent commenting. */ }
  }, [postId]);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    const url = new URL(window.location.href), result = url.searchParams.get('commentLogin');
    if (result) { url.searchParams.delete('commentLogin'); window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash); }
    void request<CommentSession>('/api/comment-auth/session').then(value => {
      if (!active) return; setSession(value); setSelected(value.user ? 'account' : 'guest');
      if (result) setNotice(result === 'success' && value.user ? '已登录，可使用当前身份评论。' : result === 'cancelled' ? '已取消登录，可继续选择其他评论身份。' : '登录未完成，请重试或使用游客身份评论。');
    }).catch(() => { if (active) { setError('登录身份暂时无法加载，可先使用游客评论。'); setSelected('guest'); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [postId, revision]);
  async function login(provider: CommentProvider) {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try {
      try { sessionStorage.setItem(storageKey(postId), JSON.stringify(latest.current.compose)); }
      catch { if (latest.current.compose.content || latest.current.compose.reply) throw new Error('浏览器无法暂存评论，请先复制正文后再登录。'); }
      const result = await request<{ url: string }>(`/api/comment-auth/${provider}/start`, { postId });
      window.location.assign(result.url);
    } catch (cause) { try { sessionStorage.removeItem(storageKey(postId)); } catch {} setError(cause instanceof Error ? cause.message : '登录未完成，请重试。'); setBusy(false); }
  }
  async function logout() {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try { await request('/api/comment-auth/logout', {}); setSession(value => ({ ...value, user: null })); setSelected('guest'); setNotice('已退出评论账号，可使用游客身份或重新登录。'); }
    catch { setError('退出未完成，请重试。'); } finally { setBusy(false); }
  }
  return { ...session, selected, choose: setSelected, loading, busy, error, notice, login, logout, retry: () => setRevision(value => value + 1) };
}

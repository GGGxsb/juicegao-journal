'use client';
import { useState } from 'react';
import { COMMENT_PROVIDER_NAMES, type CommentProvider } from '../lib/comment-identity-types';
import './comment-identity.css';
export function CommentAvatar({ nickname, avatar }: { nickname: string; avatar: string }) {
  const [failed, setFailed] = useState('');
  return <span className="comment-avatar" aria-hidden="true">{avatar && failed !== avatar ? <img src={avatar} alt="" width={34} height={34} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(avatar)} /> : Array.from(nickname)[0] || '?'}</span>;
}
export function CommentProviderBadge({ provider }: { provider: CommentProvider | '' }) {
  return <span className="comment-provider" data-provider={provider || 'guest'}>{provider ? COMMENT_PROVIDER_NAMES[provider] : '游客'}</span>;
}
export function CommentOwnerBadge() {
  return <span className="comment-owner" title="已验证的网站站主"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/></svg>站主</span>;
}

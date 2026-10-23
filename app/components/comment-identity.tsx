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

'use client';
import { useEffect, useState } from 'react';
import type { CommentLoginProvider } from '../lib/comment-identity-types';
import './comment-login-settings.css';
type Provider = { id: CommentLoginProvider; name: string; configured: boolean; callbackUrl: string };
export default function CommentLoginSettings() {
  const [providers, setProviders] = useState<Provider[]>([]), [error, setError] = useState(''), [notice, setNotice] = useState(''), [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; setError('');
    void fetch('/api/admin/comment-auth', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error(); const data = await response.json() as { providers: Provider[] };
      if (active) setProviders(data.providers);
    }).catch(() => { if (active) setError('暂时无法读取登录配置。'); });
    return () => { active = false; };
  }, [revision]);
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setNotice('回调地址已复制。'); } catch { setNotice('请选中下方地址手动复制。'); } }
  return <section className="admin-settings-panel admin-comment-login" aria-label="第三方评论登录"><h2>第三方评论登录</h2><p>申请平台应用后，将应用 ID 和密钥填入服务器环境配置，重新启动后生效。登录访客仍需通过评论审核。</p>
    {error ? <p role="alert">{error}<button type="button" className="admin-text-link" onClick={() => setRevision(value => value + 1)}>重试</button></p> : !providers.length ? <p role="status">正在读取配置…</p> : providers.map(provider => <div className="admin-comment-provider" key={provider.id}>
      <div><h3>{provider.name}</h3><span className={`admin-status ${provider.configured ? 'published' : 'draft'}`}>{provider.configured ? '已配置' : '未配置'}</span></div>
      <span>平台回调地址</span><div className="admin-oauth-callback"><code>{provider.callbackUrl}</code><button type="button" className="admin-text-link" onClick={() => void copy(provider.callbackUrl)}>复制</button></div>
      <small>QQ_OAUTH_APP_ID · QQ_OAUTH_APP_KEY</small>
    </div>)}{notice && <p role="status">{notice}</p>}
  </section>;
}

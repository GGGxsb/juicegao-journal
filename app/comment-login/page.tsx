import Link from 'next/link';
export const metadata = { title: '评论登录未完成', robots: { index: false, follow: false } };
export default function CommentLoginResult() {
  return <main style={{ maxWidth: 520, margin: '14vh auto', padding: 24 }}><h1 style={{ fontSize: 26, marginBottom: 20 }}>评论登录未完成</h1><p style={{ lineHeight: 1.9, color: 'var(--muted)' }}>登录验证可能已过期，或不是从当前浏览器发起。请回到文章评论区，重新选择登录方式。</p><Link href="/articles" style={{ display: 'inline-block', marginTop: 24, color: 'var(--accent)' }}>返回博客 →</Link></main>;
}

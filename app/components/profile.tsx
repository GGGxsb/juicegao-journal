import { Mail, MapPin, UserRound } from 'lucide-react';
import type { SiteSettings } from '../lib/types';
import { socialProfileUrl, type SocialPlatform } from '../lib/social-links';
import './profile.css';

function PlatformIcon({ platform }: { platform: SocialPlatform }) {
  if (platform === 'github') return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.68.08-.68 1.13.08 1.72 1.16 1.72 1.16 1 1.71 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.16a10.8 10.8 0 0 1 5.64 0c2.15-1.46 3.1-1.16 3.1-1.16.61 1.55.23 2.7.11 2.98.72.79 1.16 1.79 1.16 3.02 0 4.32-2.64 5.28-5.15 5.56.4.35.76 1.03.76 2.08v3.09c0 .3.2.65.78.54A11.25 11.25 0 0 0 12 .75Z"/></svg>;
  if (platform === 'bilibili') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m8 3 3 3m5-3-3 3M7 21v-2m10 2v-2"/><rect x="3" y="6" width="18" height="13" rx="3"/><path d="m7 11 2 1m8-1-2 1m-5 3 2 1 2-1"/></svg>;
  if (platform === 'douyin') return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.6 2h-3.4v13.7a3 3 0 1 1-2.6-3v-3.5a6.5 6.5 0 1 0 6 6.5V8.3a9.1 9.1 0 0 0 5.4 1.8V6.7A5.4 5.4 0 0 1 15.6 2Z"/></svg>;
  return <svg viewBox="0 0 36 24" fill="currentColor" aria-hidden="true"><text x="18" y="16" textAnchor="middle" fontSize="11.5" fontWeight="700" fontFamily="Microsoft YaHei, sans-serif">小红书</text></svg>;
}

const platforms: { platform: SocialPlatform; label: string }[] = [
  { platform: 'github', label: 'GitHub' },
  { platform: 'xiaohongshu', label: '小红书' },
  { platform: 'bilibili', label: 'B站' },
  { platform: 'douyin', label: '抖音' },
];

export default function Profile({ settings, name, home = false }: { settings: SiteSettings; name: string; home?: boolean }) {
  const links = platforms.flatMap(({ platform, label }) => {
    const href = socialProfileUrl(settings[platform], platform);
    return href ? [{ platform, label, href }] : [];
  });
  return <section className={`profile${home ? ' home-profile' : ''}`} aria-label="个人资料">
    <div className="profile-avatar">{settings.avatar ? <img src={settings.avatar} alt={`${name}的头像`} width={144} height={144}/> : <UserRound size={58} strokeWidth={1} aria-hidden="true"/>}</div>
    <div className="profile-details">
      <h1>{name}</h1>
      {settings.location && <div className="profile-location"><MapPin size={14} aria-hidden="true"/><span>{settings.location}</span></div>}
      {(links.length > 0 || settings.email) && <nav className="profile-socials" aria-label="个人主页与联系方式">
        {links.map(({ platform, label, href }) => <a key={platform} href={href} className={`profile-social profile-social-${platform}`} target="_blank" rel="noopener noreferrer" aria-label={`${label}个人主页（新窗口打开）`} data-tooltip={label}><PlatformIcon platform={platform}/></a>)}
        {settings.email && <a href={`mailto:${settings.email}`} className="profile-social" aria-label="发送邮件" data-tooltip="邮箱"><Mail size={20} strokeWidth={1.65} aria-hidden="true"/></a>}
      </nav>}
    </div>
  </section>;
}

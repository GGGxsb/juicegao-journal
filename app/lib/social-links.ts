export const DEFAULT_SOCIAL_LINKS = {
  github: 'https://github.com/GGGxsb',
  xiaohongshu: 'https://www.xiaohongshu.com/user/profile/64abbca7000000001001edbd',
  bilibili: 'https://space.bilibili.com/440795315',
  douyin: '',
};

export type SocialPlatform = 'github' | 'xiaohongshu' | 'bilibili' | 'douyin';

const domains: Record<SocialPlatform, string[]> = {
  github: ['github.com'],
  xiaohongshu: ['xiaohongshu.com', 'xhslink.com'],
  bilibili: ['bilibili.com', 'b23.tv'],
  douyin: ['douyin.com'],
};

/** Share URL validation between settings writes and public icon rendering. */
export function socialProfileUrl(value: string | undefined, platform: SocialPlatform): string {
  if (!value || /[\s\\\u0000-\u001f\u007f]/.test(value)) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return '';
    return domains[platform].some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`)) ? url.href : '';
  } catch { return ''; }
}

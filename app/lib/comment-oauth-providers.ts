import { ApiError } from './errors';
import { COMMENT_PROVIDERS, COMMENT_PROVIDER_NAMES, type CommentProvider } from './comment-identity-types';

export interface CommentOAuthConfig { id: CommentProvider; clientId: string; clientSecret: string }
export interface ProviderProfile { subject: string; nickname: string; avatar: string }
export function providerId(value: string): CommentProvider {
  if (!(COMMENT_PROVIDERS as readonly string[]).includes(value)) throw new ApiError(404, '暂不支持这种登录方式。');
  return value as CommentProvider;
}
export function providerConfig(id: CommentProvider): CommentOAuthConfig | null {
  const clientId = (id === 'qq' ? process.env.QQ_OAUTH_APP_ID : process.env.GITHUB_OAUTH_CLIENT_ID)?.trim() || '';
  const clientSecret = (id === 'qq' ? process.env.QQ_OAUTH_APP_KEY : process.env.GITHUB_OAUTH_CLIENT_SECRET)?.trim() || '';
  const validId = id === 'qq' ? /^\d{5,32}$/.test(clientId) : /^[A-Za-z0-9._-]{6,128}$/.test(clientId);
  return validId && /^[A-Za-z0-9_-]{16,256}$/.test(clientSecret) ? { id, clientId, clientSecret } : null;
}
export function enabledCommentProviders() {
  return COMMENT_PROVIDERS.filter(id => providerConfig(id)).map(id => ({ id, name: COMMENT_PROVIDER_NAMES[id] }));
}
export function callbackPath(id: CommentProvider) { return `/api/comment-auth/${id}/callback`; }
export function authorizationUrl(config: CommentOAuthConfig, redirectUri: string, state: string, challenge: string, mobile = false) {
  const url = new URL(config.id === 'qq' ? 'https://graph.qq.com/oauth2.0/authorize' : 'https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', config.clientId); url.searchParams.set('redirect_uri', redirectUri); url.searchParams.set('state', state);
  if (config.id === 'qq') {
    url.searchParams.set('response_type', 'code'); url.searchParams.set('scope', 'get_user_info');
    if (mobile) url.searchParams.set('display', 'mobile');
  } else {
    // Public profile only; no email, repository or organization permission is requested.
    url.searchParams.set('scope', ''); url.searchParams.set('prompt', 'select_account');
    url.searchParams.set('code_challenge', challenge); url.searchParams.set('code_challenge_method', 'S256');
  }
  return url.toString();
}
function nickname(value: unknown, fallback: string) {
  return (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, 40) : '') || fallback;
}
function qqAvatar(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port ||
      !(url.hostname === 'qlogo.cn' || url.hostname.endsWith('.qlogo.cn'))) return '';
    url.protocol = 'https:'; return url.toString();
  } catch { return ''; }
}
async function remote(url: string | URL, options: RequestInit, fetcher: typeof fetch): Promise<Record<string, unknown>> {
  // Do not let upstream errors (which may contain token-bearing URLs) reach logs or clients.
  try {
    const response = await fetcher(url, { ...options, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error();
    const raw = await response.text(); if (raw.length > 128 * 1024) throw new Error();
    const result = JSON.parse(raw);
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    return result;
  } catch { throw new ApiError(502, '登录平台暂时不可用，请稍后重试。'); }
}
function accessToken(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._~-]{10,2048}$/.test(value)) throw new ApiError(502, '未能完成平台授权，请重新登录。');
  return value;
}
export async function exchangeCommentProfile(config: CommentOAuthConfig, code: string, redirectUri: string, verifier: string, fetcher: typeof fetch = fetch): Promise<ProviderProfile> {
  if (config.id === 'github') {
    const token = await remote('https://github.com/login/oauth/access_token', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code, redirect_uri: redirectUri, code_verifier: verifier }).toString(),
    }, fetcher);
    const profile = await remote('https://api.github.com/user', { headers: {
      Authorization: `Bearer ${accessToken(token.access_token)}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'JuiceGao-Comment-Login',
    } }, fetcher);
    if (!Number.isSafeInteger(profile.id) || Number(profile.id) < 1 || typeof profile.login !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(profile.login)) throw new ApiError(502, '无法确认 GitHub 身份。');
    return { subject: String(profile.id), nickname: nickname(profile.name, profile.login), avatar: `https://avatars.githubusercontent.com/u/${profile.id}?s=80&v=4` };
  }
  const tokenUrl = new URL('https://graph.qq.com/oauth2.0/token');
  tokenUrl.search = new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId, client_secret: config.clientSecret, code, redirect_uri: redirectUri, fmt: 'json' }).toString();
  const token = accessToken((await remote(tokenUrl, {}, fetcher)).access_token);
  const meUrl = new URL('https://graph.qq.com/oauth2.0/me'); meUrl.search = new URLSearchParams({ access_token: token, fmt: 'json' }).toString();
  const me = await remote(meUrl, {}, fetcher);
  if (String(me.client_id) !== config.clientId || typeof me.openid !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(me.openid)) throw new ApiError(502, '无法确认 QQ 身份。');
  const profileUrl = new URL('https://graph.qq.com/user/get_user_info');
  profileUrl.search = new URLSearchParams({ access_token: token, oauth_consumer_key: config.clientId, openid: me.openid }).toString();
  const profile = await remote(profileUrl, {}, fetcher);
  if (profile.ret !== 0 || profile.is_lost === 1 || typeof profile.nickname !== 'string') throw new ApiError(502, '无法读取 QQ 昵称，请重新授权。');
  return { subject: me.openid, nickname: nickname(profile.nickname, 'QQ 用户'), avatar: qqAvatar(profile.figureurl_qq_2) || qqAvatar(profile.figureurl_qq_1) };
}

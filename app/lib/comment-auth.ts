import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from './platform';
import { ApiError } from './errors';
import { requireSameOrigin } from './server';
import { assertSafeLoginTransport, clientAddress, isLoopbackHost, requestOrigin } from './request-security';
import { authorizationUrl, callbackPath, enabledCommentProviders, exchangeCommentProfile, providerConfig, providerId } from './comment-oauth-providers';
import type { CommentIdentity, CommentSession } from './comment-identity-types';

const SESSION_SECONDS = 7 * 24 * 60 * 60;
const FLOW_SECONDS = 10 * 60;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');
type Account = CommentIdentity & { id: string };
type Attempt = { post_id: string };
function cookieName(request: Request, suffix: string) {
  const local = isLoopbackHost(new URL(requestOrigin(request)).host);
  return `${local ? 'journal_' : '__Host-journal_'}${suffix}`;
}
function readCookie(request: Request, suffix: string) {
  const raw = request.headers.get('cookie') || ''; if (raw.length > 16384) return null;
  const name = cookieName(request, suffix);
  const values = raw.split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  if (values.length !== 1) return null;
  const value = values[0].slice(name.length + 1); return tokenPattern.test(value) ? value : null;
}
function cookie(request: Request, suffix: string, value: string, seconds: number) {
  assertSafeLoginTransport(request);
  const local = isLoopbackHost(new URL(requestOrigin(request)).host);
  return `${cookieName(request, suffix)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${local ? '' : '; Secure'}`;
}
export async function commentAccount(request: Request): Promise<Account | null> {
  const supplied = readCookie(request, 'comment_session'); if (!supplied) return null;
  return env.DB.prepare(`SELECT a.id, a.nickname, a.avatar, a.provider FROM comment_sessions s
    JOIN comment_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>? AND a.provider='qq'`)
    .bind(digest(supplied), Date.now()).first<Account>();
}
export async function commentSession(request: Request): Promise<CommentSession> {
  const account = await commentAccount(request);
  return { user: account ? { nickname: account.nickname, avatar: account.avatar, provider: account.provider } : null, providers: enabledCommentProviders() };
}
async function throttle(request: Request) {
  const secret = env.ADMIN_SETUP_TOKEN_HASH || '';
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new ApiError(503, '站点登录尚未就绪。');
  const key = createHmac('sha256', Buffer.from(secret, 'hex')).update(`comment-oauth\0${clientAddress(request)}`).digest('hex');
  const now = Date.now(), cutoff = now - FLOW_SECONDS * 1000;
  const row = await env.DB.prepare(`INSERT INTO interaction_rate_limits(key,attempts,window_start) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN window_start<=? THEN 1 ELSE MIN(attempts+1,21) END,
    window_start=CASE WHEN window_start<=? THEN excluded.window_start ELSE window_start END RETURNING attempts`)
    .bind(key, now, cutoff, cutoff).first<{ attempts: number }>();
  if (!row || row.attempts > 20) throw new ApiError(429, '登录尝试过多，请 10 分钟后重试。');
}
export async function startCommentLogin(request: Request, provider: string, input: unknown) {
  requireSameOrigin(request); assertSafeLoginTransport(request);
  const id = providerId(provider), config = providerConfig(id);
  if (!config) throw new ApiError(503, '这种登录方式暂未开放，请选择其他方式。');
  const parsed = z.object({ postId: z.string().uuid() }).strict().safeParse(input);
  if (!parsed.success) throw new ApiError(400, '请从文章的评论区开始登录。');
  const post = await env.DB.prepare("SELECT id FROM posts WHERE id=? AND status='published'").bind(parsed.data.postId).first();
  if (!post) throw new ApiError(404, '文章不存在或尚未发布。');
  await throttle(request);
  const state = token(), browser = token(), now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM comment_oauth_attempts WHERE expires_at<=?').bind(now),
    env.DB.prepare('DELETE FROM comment_sessions WHERE expires_at<=?').bind(now),
    env.DB.prepare('INSERT INTO comment_oauth_attempts(state_hash,browser_hash,provider,post_id,verifier,expires_at) VALUES(?,?,?,?,?,?)')
      .bind(digest(state), digest(browser), id, parsed.data.postId, '', now + FLOW_SECONDS * 1000),
  ]);
  const redirectUri = new URL(callbackPath(id), requestOrigin(request)).toString();
  return {
    url: authorizationUrl(config, redirectUri, state, /Mobile|Android|iPhone/i.test(request.headers.get('user-agent') || '')),
    cookie: cookie(request, `oauth_${id}`, browser, FLOW_SECONDS),
  };
}
function destination(request: Request, postId: string, status: 'success' | 'cancelled' | 'failed') {
  const url = new URL(`/posts/${postId}`, requestOrigin(request)); url.searchParams.set('commentLogin', status); url.hash = 'comments'; return url.toString();
}
function redirect(location: string, cookies: string[] = []) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 303, headers });
}
export async function finishCommentLogin(request: Request, provider: string, fetcher: typeof fetch = fetch): Promise<Response> {
  // Consume the browser-bound state atomically before contacting the provider.
  // These cookies and tables never authorize any administrator action.
  const origin = requestOrigin(request); assertSafeLoginTransport(request);
  const id = providerId(provider), params = new URL(request.url).searchParams;
  const state = params.get('state') || '', browser = readCookie(request, `oauth_${id}`);
  if (params.getAll('state').length !== 1 || !tokenPattern.test(state) || !browser) return redirect(new URL('/comment-login', origin).toString());
  const attempt = await env.DB.prepare(`DELETE FROM comment_oauth_attempts WHERE state_hash=? AND browser_hash=?
    AND provider=? AND expires_at>? RETURNING post_id`).bind(digest(state), digest(browser), id, Date.now()).first<Attempt>();
  if (!attempt) return redirect(new URL('/comment-login', origin).toString());
  const clearFlow = cookie(request, `oauth_${id}`, '', 0);
  if (params.has('error')) return redirect(destination(request, attempt.post_id, params.get('error') === 'access_denied' ? 'cancelled' : 'failed'), [clearFlow]);
  const code = params.get('code') || '', config = providerConfig(id);
  if (!config || params.getAll('code').length !== 1 || !code || code.length > 2048 || /[\s\u0000-\u001f\u007f]/.test(code)) return redirect(destination(request, attempt.post_id, 'failed'), [clearFlow]);
  try {
    const profile = await exchangeCommentProfile(config, code, new URL(callbackPath(id), origin).toString(), fetcher);
    const stamp = new Date().toISOString(), sessionToken = token(), now = Date.now();
    const account = await env.DB.prepare(`INSERT INTO comment_accounts(id,provider,client_id,subject,nickname,avatar,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(provider,client_id,subject) DO UPDATE SET nickname=excluded.nickname,avatar=excluded.avatar,updated_at=excluded.updated_at RETURNING id`)
      .bind(randomUUID(), id, config.clientId, profile.subject, profile.nickname, profile.avatar, stamp, stamp).first<{ id: string }>();
    if (!account) throw new ApiError(503, '未能保存评论身份。');
    const previous = readCookie(request, 'comment_session');
    await env.DB.batch([
      // Rotate the visitor session on every sign-in/account switch.
      env.DB.prepare('DELETE FROM comment_sessions WHERE token_hash=?').bind(previous ? digest(previous) : ''),
      env.DB.prepare('INSERT INTO comment_sessions(token_hash,account_id,expires_at,created_at) VALUES(?,?,?,?)')
        .bind(digest(sessionToken), account.id, now + SESSION_SECONDS * 1000, now),
    ]);
    return redirect(destination(request, attempt.post_id, 'success'), [clearFlow, cookie(request, 'comment_session', sessionToken, SESSION_SECONDS)]);
  } catch {
    // Token responses and provider error text deliberately never reach the page or server logs.
    return redirect(destination(request, attempt.post_id, 'failed'), [clearFlow]);
  }
}
export async function logoutCommentAccount(request: Request) {
  requireSameOrigin(request); assertSafeLoginTransport(request);
  const supplied = readCookie(request, 'comment_session');
  if (supplied) await env.DB.prepare('DELETE FROM comment_sessions WHERE token_hash=?').bind(digest(supplied)).run();
  return { cookie: cookie(request, 'comment_session', '', 0) };
}

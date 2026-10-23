import { createHash } from 'node:crypto';
import { z } from 'zod';
import { env } from './platform';
import type { ContributionCalendar, GithubContributions } from './github-contribution-types';

const freshFor = 60 * 60 * 1000, retryAfter = 60 * 1000;
const pending = new Map<string, Promise<GithubContributions>>();
const usernamePattern = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const countSchema = z.number().int().min(0).max(2_147_483_647);
const levels = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'] as const;
const responseSchema = z.object({
  data: z.object({ user: z.object({ login: z.string(), contributionsCollection: z.object({ contributionCalendar: z.object({
    totalContributions: countSchema,
    weeks: z.array(z.object({ contributionDays: z.array(z.object({
      date: dateSchema, contributionCount: countSchema, contributionLevel: z.enum(levels),
    })).max(7) })).min(1).max(54),
  }) }) }) }),
  errors: z.array(z.unknown()).optional(),
});
const calendarSchema = z.object({ total: countSchema, days: z.array(z.object({ date: dateSchema, count: countSchema, level: z.number().int().min(0).max(4) })).min(1).max(367) });
type Cached = { credential_hash: string; calendar: string | null; fetched_at: number; retry_after: number };

export function githubContributionConfig(profile = ''): { username: string | null; configured: boolean } {
  let username = process.env.GITHUB_CONTRIBUTIONS_USERNAME?.trim() || '';
  if (!username) {
    try {
      const url = new URL(profile);
      if (url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password && !url.port) {
        username = /^\/([^/]+)\/?$/.exec(url.pathname)?.[1] || '';
      }
    } catch { /* An empty profile simply leaves the integration disabled. */ }
  }
  const valid = usernamePattern.test(username);
  return { username: valid ? username : null, configured: valid && Boolean(process.env.GITHUB_CONTRIBUTIONS_TOKEN?.trim()) };
}

function decodeCalendar(value: string | null): ContributionCalendar | null {
  try { return calendarSchema.parse(JSON.parse(value || 'null')); } catch { return null; }
}

async function fetchCalendar(username: string, token: string, fetcher: typeof fetch): Promise<ContributionCalendar> {
  const response = await fetcher('https://api.github.com/graphql', {
    method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(6000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'JuiceGao-Journal' },
    body: JSON.stringify({ query: `query Contributions($login: String!) {
      user(login: $login) { login contributionsCollection { contributionCalendar {
        totalContributions weeks { contributionDays { date contributionCount contributionLevel } }
      } } }
    }`, variables: { login: username } }),
  });
  if (!response.ok || Number(response.headers.get('content-length') || 0) > 128 * 1024) throw new Error('Upstream unavailable');
  const reader = response.body?.getReader(); if (!reader) throw new Error('Missing response');
  const decoder = new TextDecoder(); let raw = '', bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength; if (bytes > 128 * 1024) throw new Error('Oversized response');
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
  const result = responseSchema.parse(JSON.parse(raw));
  if (result.errors?.length || result.data.user.login.toLowerCase() !== username.toLowerCase()) throw new Error('Invalid calendar');
  const source = result.data.user.contributionsCollection.contributionCalendar;
  const calendar = calendarSchema.parse({ total: source.totalContributions, days: source.weeks.flatMap(week => week.contributionDays.map(day => ({
    date: day.date, count: day.contributionCount, level: levels.indexOf(day.contributionLevel),
  }))) });
  for (let index = 1; index < calendar.days.length; index++) {
    if (Date.parse(calendar.days[index].date) - Date.parse(calendar.days[index - 1].date) !== 86_400_000) throw new Error('Invalid calendar dates');
  }
  return calendar;
}

export async function getGithubContributions(profile = '', fetcher: typeof fetch = fetch): Promise<GithubContributions> {
  const config = githubContributionConfig(profile);
  if (!config.configured || !config.username) return { status: 'disabled' };
  const username = config.username, token = process.env.GITHUB_CONTRIBUTIONS_TOKEN!.trim();
  const credentialHash = createHash('sha256').update(token).digest('hex'), key = `${process.env.DATA_DIR || ''}:${username.toLowerCase()}:${credentialHash}`;
  const existing = pending.get(key); if (existing) return existing;
  const task = (async (): Promise<GithubContributions> => {
    const row = await env.DB.prepare('SELECT credential_hash,calendar,fetched_at,retry_after FROM github_contribution_cache WHERE username=?').bind(username.toLowerCase()).first<Cached>();
    const cached = row?.credential_hash === credentialHash ? row : null;
    const lastCalendar = cached ? decodeCalendar(cached.calendar) : null, now = Date.now();
    const fallback = (): GithubContributions => lastCalendar && cached
      ? { status: 'ready', username, calendar: lastCalendar, updatedAt: new Date(cached.fetched_at).toISOString(), stale: now - cached.fetched_at >= freshFor }
      : { status: 'unavailable', username };
    if (cached && ((lastCalendar && now - cached.fetched_at < freshFor) || now < cached.retry_after)) return fallback();
    let calendar: ContributionCalendar;
    try { calendar = await fetchCalendar(username, token, fetcher); }
    catch {
      // Never persist or return upstream errors, headers or credentials.
      await env.DB.prepare(`INSERT INTO github_contribution_cache(username,credential_hash,calendar,fetched_at,retry_after) VALUES(?,?,?,?,?)
        ON CONFLICT(username) DO UPDATE SET credential_hash=excluded.credential_hash,calendar=excluded.calendar,fetched_at=excluded.fetched_at,retry_after=excluded.retry_after`)
        .bind(username.toLowerCase(), credentialHash, lastCalendar ? JSON.stringify(lastCalendar) : null, cached?.fetched_at || 0, now + retryAfter).run();
      return fallback();
    }
    const fetchedAt = Date.now();
    await env.DB.prepare(`INSERT INTO github_contribution_cache(username,credential_hash,calendar,fetched_at,retry_after) VALUES(?,?,?,?,0)
      ON CONFLICT(username) DO UPDATE SET credential_hash=excluded.credential_hash,calendar=excluded.calendar,fetched_at=excluded.fetched_at,retry_after=0`)
      .bind(username.toLowerCase(), credentialHash, JSON.stringify(calendar), fetchedAt).run();
    return { status: 'ready', username, calendar, updatedAt: new Date(fetchedAt).toISOString(), stale: false };
  })();
  pending.set(key, task);
  try { return await task; } finally { if (pending.get(key) === task) pending.delete(key); }
}

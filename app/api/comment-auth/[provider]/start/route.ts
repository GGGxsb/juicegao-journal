import { startCommentLogin } from '@/app/lib/comment-auth';
import { apiRoute, json, readJson } from '@/app/lib/server';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ provider: string }> };
export async function POST(request: Request, context: Context) {
  return apiRoute(async () => { const result = await startCommentLogin(request, (await context.params).provider, await readJson(request)); const response = json({ url: result.url }); response.headers.set('Set-Cookie', result.cookie); return response; });
}

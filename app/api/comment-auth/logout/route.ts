import { logoutCommentAccount } from '@/app/lib/comment-auth';
import { apiRoute, json } from '@/app/lib/server';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return apiRoute(async () => { const result = await logoutCommentAccount(request); const response = json({ ok: true }); response.headers.set('Set-Cookie', result.cookie); return response; });
}

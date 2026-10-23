import { finishCommentLogin } from '@/app/lib/comment-auth';
import { apiRoute } from '@/app/lib/server';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ provider: string }> };
export async function GET(request: Request, context: Context) { return apiRoute(async () => finishCommentLogin(request, (await context.params).provider)); }

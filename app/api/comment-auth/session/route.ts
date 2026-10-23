import { commentSession } from '@/app/lib/comment-auth';
import { apiRoute, json } from '@/app/lib/server';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return apiRoute(async () => json(await commentSession(request))); }

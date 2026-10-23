import { COMMENT_PROVIDERS, COMMENT_PROVIDER_NAMES } from '@/app/lib/comment-identity-types';
import { callbackPath, providerConfig } from '@/app/lib/comment-oauth-providers';
import { requestOrigin } from '@/app/lib/request-security';
import { apiRoute, json, requireAdmin } from '@/app/lib/server';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return apiRoute(async () => {
    await requireAdmin();
    return json({ providers: COMMENT_PROVIDERS.map(id => ({ id, name: COMMENT_PROVIDER_NAMES[id], configured: Boolean(providerConfig(id)), callbackUrl: new URL(callbackPath(id), process.env.APP_ORIGIN || requestOrigin(request)).toString() })) });
  });
}

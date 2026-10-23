import { apiRoute, getSettings, json } from '@/app/lib/server';
import { getGithubContributions } from '@/app/lib/github-contributions';

export const dynamic = 'force-dynamic';
export async function GET() {
  return apiRoute(async () => {
    const settings = await getSettings(), result = await getGithubContributions(settings.github);
    return json(result, result.status === 'unavailable' ? 503 : 200);
  });
}

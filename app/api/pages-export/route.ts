import { apiRoute, json } from '../../lib/server';
import { createPagesSnapshot } from '../../lib/pages-export';

export const dynamic = 'force-dynamic';
export async function GET() {
  return apiRoute(async()=>{
    const response=json(await createPagesSnapshot());
    response.headers.set('Cache-Control','no-store');
    return response;
  });
}

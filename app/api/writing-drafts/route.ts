import { apiRoute, json, requireAdmin } from '@/app/lib/server';
import { listWritingDrafts } from '@/app/lib/writing-drafts';
export const dynamic='force-dynamic';
export async function GET(){return apiRoute(async()=>{const user=await requireAdmin();return json({drafts:await listWritingDrafts(user.userId)});});}

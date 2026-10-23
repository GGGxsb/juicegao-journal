import { apiRoute, authorizeMutation, json, readJson, requireAdmin } from '@/app/lib/server';
import { deleteWritingDraft, getWritingDraft, saveWritingDraft } from '@/app/lib/writing-drafts';
export const dynamic='force-dynamic';
type Context={params:Promise<{key:string}>};
export async function GET(_request:Request,context:Context){return apiRoute(async()=>{const user=await requireAdmin();return json({draft:await getWritingDraft(user.userId,(await context.params).key)});});}
export async function PUT(request:Request,context:Context){return apiRoute(async()=>{const user=await authorizeMutation(request);return json({draft:await saveWritingDraft(user.userId,(await context.params).key,await readJson(request))});});}
export async function DELETE(request:Request,context:Context){return apiRoute(async()=>{const user=await authorizeMutation(request),input=await readJson(request) as {revision?:unknown};await deleteWritingDraft(user.userId,(await context.params).key,input?.revision);return json({success:true});});}

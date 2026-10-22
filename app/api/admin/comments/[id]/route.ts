import { deleteComment, moderateComment } from "@/app/lib/interactions";
import { apiRoute, authorizeMutation, json, readJson } from "@/app/lib/server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  return apiRoute(async () => {
    await authorizeMutation(request);
    const { id } = await context.params;
    return json({ comment: await moderateComment(request, id, await readJson(request)) });
  });
}

export async function DELETE(request: Request, context: Context) {
  return apiRoute(async () => {
    const { id } = await context.params;
    await deleteComment(request, id);
    return json({ ok: true });
  });
}

import { replyToComment } from "@/app/lib/interactions";
import { apiRoute, authorizeMutation, json, readJson } from "@/app/lib/server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return apiRoute(async () => {
    await authorizeMutation(request);
    const { id } = await context.params;
    return json({ comment: await replyToComment(request, id, await readJson(request)) }, 201);
  });
}

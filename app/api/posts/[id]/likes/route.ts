import { getPostLikes, setPostLike } from "@/app/lib/interactions";
import { apiRoute, json, readJson, requireSameOrigin } from "@/app/lib/server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return apiRoute(async () => {
    const { id } = await context.params;
    return json(await getPostLikes(request, id));
  });
}

export async function PUT(request: Request, context: Context) {
  return apiRoute(async () => {
    requireSameOrigin(request);
    const { id } = await context.params;
    return json(await setPostLike(request, id, await readJson(request)));
  });
}

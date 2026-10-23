import { listPublicComments, submitComment } from "@/app/lib/interactions";
import { apiRoute, json, readJson, requireSameOrigin } from "@/app/lib/server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return apiRoute(async () => {
    const { id } = await context.params;
    return json(await listPublicComments(id, new URL(request.url).searchParams));
  });
}

export async function POST(request: Request, context: Context) {
  return apiRoute(async () => {
    requireSameOrigin(request);
    const { id } = await context.params;
    const result = await submitComment(request, id, await readJson(request));
    return json({ message: result.published ? "评论已发布。" : "评论已提交，审核后显示。", published: result.published }, 201);
  });
}

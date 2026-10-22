import { apiRoute, authorizeMutation, deletePost, getPostById, json, readJson, updatePost, validatePost } from "@/app/lib/server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return apiRoute(async () => {
    const { id } = await context.params;
    const post = await getPostById(id);
    return post ? json({ post }) : json({ error: "文章不存在或已删除。" }, 404);
  });
}

export async function PUT(request: Request, context: Context) {
  return apiRoute(async () => {
    await authorizeMutation(request);
    const { id } = await context.params;
    const post = await updatePost(id, validatePost(await readJson(request)));
    return json({ post });
  });
}

export async function DELETE(request: Request, context: Context) {
  return apiRoute(async () => {
    await authorizeMutation(request);
    const { id } = await context.params;
    await deletePost(id);
    return json({ success: true });
  });
}

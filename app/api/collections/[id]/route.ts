import { apiRoute, authorizeMutation, json, readJson } from "@/app/lib/server";
import { deleteCollection, getPublishedCollection, updateCollection, validateCollection } from "@/app/lib/navigation";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  return apiRoute(async () => {
    const collection = await getPublishedCollection((await params).id);
    return collection ? json({ collection }) : json({ error: "合集不存在或暂无公开内容。" }, 404);
  });
}

export async function PUT(request: Request, { params }: Context) {
  return apiRoute(async () => {
    await authorizeMutation(request);
    return json({ collection: await updateCollection((await params).id, validateCollection(await readJson(request))) });
  });
}

export async function DELETE(request: Request, { params }: Context) {
  return apiRoute(async () => {
    await authorizeMutation(request);
    await deleteCollection((await params).id);
    return json({ ok: true });
  });
}

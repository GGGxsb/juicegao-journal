import { apiRoute, authorizeMutation, createPost, json, listPosts, readJson, validatePost } from "@/app/lib/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiRoute(async () => {
    const params = new URL(request.url).searchParams;
    const kind = params.get("kind");
    const posts = await listPosts({ scope: params.get("scope") === "all" ? "all" : "published", ...(kind === "article" || kind === "note" ? { kind } : {}) });
    return json({ posts });
  });
}

export async function POST(request: Request) {
  return apiRoute(async () => {
    await authorizeMutation(request);
    const post = await createPost(validatePost(await readJson(request)));
    return json({ post }, 201);
  });
}

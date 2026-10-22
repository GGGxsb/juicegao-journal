import { apiRoute, authorizeMutation, createPost, json, parsePostQuery, queryPosts, readJson, validatePost } from "@/app/lib/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiRoute(async () => {
    return json(await queryPosts(parsePostQuery(new URL(request.url).searchParams)));
  });
}

export async function POST(request: Request) {
  return apiRoute(async () => {
    await authorizeMutation(request);
    const post = await createPost(validatePost(await readJson(request)));
    return json({ post }, 201);
  });
}

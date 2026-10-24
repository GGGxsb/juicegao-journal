import { apiRoute, getMapPosts, json } from "@/app/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return apiRoute(async () => json({ posts: await getMapPosts() }));
}

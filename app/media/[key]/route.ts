import { apiRoute, getMediaResponse } from "@/app/lib/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  return apiRoute(async () => getMediaResponse((await context.params).key, request));
}

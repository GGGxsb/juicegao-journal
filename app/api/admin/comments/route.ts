import { listAdminComments } from "@/app/lib/interactions";
import { apiRoute, json } from "@/app/lib/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiRoute(async () => json(await listAdminComments(new URL(request.url).searchParams)));
}

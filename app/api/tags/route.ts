import { apiRoute, ApiError, json } from "@/app/lib/server";
import { parseNavigationQuery, queryTags } from "@/app/lib/navigation";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return apiRoute(async () => {
    const query = parseNavigationQuery(new URL(request.url).searchParams);
    if (query.scope === "all") throw new ApiError(400, "标签仅统计公开内容。");
    return json(await queryTags(query));
  });
}

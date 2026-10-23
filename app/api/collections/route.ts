import { apiRoute, authorizeMutation, json, readJson } from "@/app/lib/server";
import { createCollection, parseNavigationQuery, queryCollections, validateCollection } from "@/app/lib/navigation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiRoute(async () => json(await queryCollections(parseNavigationQuery(new URL(request.url).searchParams))));
}

export async function POST(request: Request) {
  return apiRoute(async () => {
    await authorizeMutation(request);
    return json({ collection: await createCollection(validateCollection(await readJson(request))) }, 201);
  });
}

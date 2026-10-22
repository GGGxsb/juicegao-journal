import { apiRoute, authorizeMutation, json, uploadImage } from "@/app/lib/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return apiRoute(async () => {
    const user = await authorizeMutation(request);
    return json({ url: await uploadImage(request, user) }, 201);
  });
}

import { apiRoute, authorizeMutation, getSettings, json, readJson, saveSettings, validateSettings } from "@/app/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return apiRoute(async () => json({ settings: await getSettings() }));
}

export async function PUT(request: Request) {
  return apiRoute(async () => {
    await authorizeMutation(request);
    const settings = await saveSettings(validateSettings(await readJson(request)));
    return json({ settings });
  });
}

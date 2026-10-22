import { env } from "./platform";
import { requestOrigin } from "./request-security";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { media, posts, siteSettings } from "@/db/schema";
import { getAdminSession, requireAdmin, type AdminPrincipal } from "./admin-auth";
import { ApiError } from "./errors";
export { getAdminSession, requireAdmin, ApiError };
import type { Post, PostInput, SiteSettings } from "./types";

export const DEFAULT_SETTINGS: SiteSettings = {
  name: "JuiceGao",
  bio: "",
  description: "",
  avatar: "",
  github: "",
  email: "",
  location: "",
};

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const expected = requestOrigin(request);
  if (!origin || origin !== expected) throw new ApiError(403, "请求来源不匹配，请在本站内重试。");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new ApiError(403, "不接受跨站修改请求。");
  }
}

export async function authorizeMutation(request: Request): Promise<AdminPrincipal> {
  requireSameOrigin(request);
  return requireAdmin();
}

export async function listPosts(options: { scope?: "published" | "all"; kind?: "article" | "note"; limit?: number } = {}): Promise<Post[]> {
  if (options.scope === "all") await requireAdmin();
  const conditions = [];
  if (options.scope !== "all") conditions.push(eq(posts.status, "published"));
  if (options.kind) conditions.push(eq(posts.kind, options.kind));
  return getDb().select().from(posts).where(and(...conditions))
    .orderBy(desc(posts.publishedAt), desc(posts.updatedAt))
    .limit(Math.max(1, Math.min(options.limit ?? 500, 1000)));
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  const [post] = await getDb().select().from(posts)
    .where(and(eq(posts.slug, slug), eq(posts.status, "published"))).limit(1);
  return post ?? null;
}

export async function getPostById(id: string): Promise<Post | null> {
  await requireAdmin();
  const [post] = await getDb().select().from(posts).where(eq(posts.id, id)).limit(1);
  return post ?? null;
}

export async function getSettings(): Promise<SiteSettings> {
  const [settings] = await getDb().select().from(siteSettings).where(eq(siteSettings.id, "site")).limit(1);
  if (!settings) return { ...DEFAULT_SETTINGS };
  const { id: _id, updatedAt: _updatedAt, ...publicSettings } = settings;
  return publicSettings;
}

function safeImageUrl(value: string): boolean {
  if (!value) return true;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

const imageUrlSchema = z.string().trim().max(2048).refine(safeImageUrl, "图片地址必须是本站路径或 HTTPS 链接。");
const postSchema = z.object({
  title: z.string().trim().min(1, "请输入标题。").max(180, "标题最多 180 字。"),
  slug: z.string().trim().min(1, "请输入文章地址。").max(160)
    .regex(/^[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)*$/u, "文章地址只允许文字、数字、短横线和下划线。"),
  excerpt: z.string().trim().max(1000).default(""),
  content: z.string().max(500_000, "正文过长，请缩短至 50 万字以内。").default(""),
  category: z.string().trim().min(1).max(60).default("随笔"),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  kind: z.enum(["article", "note"]).default("article"),
  status: z.enum(["draft", "published"]).default("draft"),
  coverImage: imageUrlSchema.default(""),
}).strict();

const settingsSchema = z.object({
  name: z.string().trim().min(1, "请输入昵称。").max(80),
  bio: z.string().trim().max(300),
  description: z.string().trim().max(3000),
  avatar: imageUrlSchema,
  github: z.string().trim().max(2048).refine((value) => {
    if (!value) return true;
    try { const url = new URL(value); return url.protocol === "https:" && url.hostname === "github.com"; } catch { return false; }
  }, "GitHub 地址应为 https://github.com/ 开头的链接。"),
  email: z.union([z.literal(""), z.string().email("请输入有效邮箱。")]).transform((value) => value.trim()),
  location: z.string().trim().max(100),
}).strict();

function parseInput<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown): z.output<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError(400, result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("；"));
  return result.data;
}

export function validatePost(input: unknown): PostInput {
  const value = parseInput(postSchema, input);
  return { ...value, tags: [...new Set(value.tags)] };
}

export function validateSettings(input: unknown): SiteSettings {
  return parseInput(settingsSchema, input);
}

export async function createPost(input: PostInput): Promise<Post> {
  const now = new Date().toISOString();
  const [post] = await getDb().insert(posts).values({
    ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now,
    publishedAt: input.status === "published" ? now : "",
  }).returning();
  return post;
}

export async function updatePost(id: string, input: PostInput): Promise<Post> {
  const db = getDb();
  const [existing] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  if (!existing) throw new ApiError(404, "文章不存在或已删除。");
  const now = new Date().toISOString();
  const [post] = await db.update(posts).set({ ...input, updatedAt: now,
    publishedAt: input.status === "published" ? (existing.publishedAt || now) : existing.publishedAt,
  }).where(eq(posts.id, id)).returning();
  return post;
}

export async function deletePost(id: string): Promise<void> {
  const [deleted] = await getDb().delete(posts).where(eq(posts.id, id)).returning({ id: posts.id });
  if (!deleted) throw new ApiError(404, "文章不存在或已删除。");
}

export async function saveSettings(input: SiteSettings): Promise<SiteSettings> {
  const updatedAt = new Date().toISOString();
  await getDb().insert(siteSettings).values({ ...input, id: "site", updatedAt })
    .onConflictDoUpdate({ target: siteSettings.id, set: { ...input, updatedAt } });
  return input;
}

export async function readBodyBytes(request: Request, maxBytes: number): Promise<ArrayBuffer> {
  const declaredSize = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) throw new ApiError(413, "上传内容超过大小限制。");
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new ApiError(413, "上传内容超过大小限制。"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new ArrayBuffer(size);
  const output = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return buffer;
}

export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "请以 JSON 格式提交。");
  }
  const buffer = await readBodyBytes(request, 2 * 1024 * 1024);
  try { return JSON.parse(new TextDecoder().decode(buffer)); }
  catch { throw new ApiError(400, "提交内容不是有效的 JSON。"); }
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function apiRoute(action: () => Promise<Response>): Promise<Response> {
  try { return await action(); }
  catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    const message = error instanceof Error ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}` : "";
    if (/UNIQUE constraint failed: posts\.slug/i.test(message)) return json({ error: "该文章地址已被使用，请换一个。" }, 409);
    console.error("Journal API failed", error);
    if (/no such table|binding.*unavailable/i.test(message)) return json({ error: "站点数据库尚未就绪，请检查数据目录与迁移。" }, 503);
    return json({ error: "操作暂时无法完成，请稍后重试。" }, 500);
  }
}

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const imageTypes: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

function detectedImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const prefix = new TextDecoder("ascii").decode(bytes.slice(0, 12));
  if (prefix.startsWith("GIF87a") || prefix.startsWith("GIF89a")) return "image/gif";
  if (prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function uploadImage(request: Request, user: AdminPrincipal): Promise<string> {
  if (!env.BUCKET) throw new ApiError(503, "图片存储暂时不可用，请检查数据目录。");
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) throw new ApiError(415, "请使用表单上传图片。");
  const bytes = await readBodyBytes(request, MAX_IMAGE_BYTES + 128 * 1024);
  let form: FormData;
  try { form = await new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: bytes }).formData(); }
  catch { throw new ApiError(400, "无法读取上传文件，请重新选择图片。"); }
  const file = form.get("file");
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") throw new ApiError(400, "请选择图片文件。");
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new ApiError(413, "图片大小应介于 1 字节和 8 MB 之间。");
  const declared = file.type.toLowerCase();
  if (!imageTypes[declared]) throw new ApiError(415, "仅支持 PNG、JPG、WebP 和 GIF 图片。");
  const body = await file.arrayBuffer();
  const actualType = detectedImageType(new Uint8Array(body));
  if (!actualType || actualType !== declared) throw new ApiError(415, "图片内容与文件类型不匹配，请重新导出图片。");
  const id = crypto.randomUUID();
  const key = `${id}.${imageTypes[actualType]}`;
  await env.BUCKET.put(key, body, { httpMetadata: { contentType: actualType, cacheControl: "public, max-age=31536000, immutable" } });
  try {
    await getDb().insert(media).values({ id, key, originalName: file.name.slice(0, 255), contentType: actualType,
      size: file.size, createdByUserId: user.userId, createdAt: new Date().toISOString() });
  } catch (error) { await env.BUCKET.delete(key); throw error; }
  return `/media/${key}`;
}

export async function getMediaResponse(key: string, request: Request): Promise<Response> {
  if (!/^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(key)) return new Response("图片不存在。", { status: 404 });
  if (!env.BUCKET) return new Response("图片存储暂时不可用。", { status: 503 });
  const object = await env.BUCKET.get(key);
  if (!object) return new Response("图片不存在。", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
  if (request.headers.get("if-none-match") === object.httpEtag) return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
}

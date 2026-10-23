import { env } from "./platform";
import { requestOrigin } from "./request-security";
import { and, asc, count, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { collections, media, posts, siteSettings } from "@/db/schema";
import { getAdminSession, requireAdmin, type AdminPrincipal } from "./admin-auth";
import { ApiError } from "./errors";
import { DEFAULT_POST_CATEGORY, POST_CATEGORIES, type PostCategory } from "./post-categories";
export { getAdminSession, requireAdmin, ApiError };
import type { Post, PostCollection, PostInput, PostKind, PostStatus, SiteSettings } from "./types";

export const DEFAULT_SETTINGS: SiteSettings = {
  name: "JuiceGao",
  bio: "",
  description: "",
  avatar: "",
  github: "",
  email: "",
  location: "",
  education: "",
  startedAt: "",
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

export interface PostQueryOptions {
  scope?: "published" | "all";
  kind?: PostKind;
  category?: PostCategory;
  tag?: string;
  collectionId?: string;
  q?: string;
  status?: PostStatus;
  page?: number;
  pageSize?: number;
}

const postQuerySchema = z.object({
  scope: z.enum(["published", "all"]).default("published"),
  kind: z.enum(["article", "note"]).optional(),
  category: z.enum(POST_CATEGORIES).optional(),
  tag: z.string().trim().min(1).max(60).optional(),
  collectionId: z.string().uuid().optional(),
  q: z.string().trim().max(200).optional(),
  status: z.enum(["draft", "published"]).optional(),
  page: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1),
  pageSize: z.number().int().min(1).max(50).default(10),
}).strict().superRefine((value, context) => {
  if (value.scope !== "all" && value.status !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "状态筛选仅供已登录的管理页面使用。" });
  }
});

/** Parse URL parameters once and apply the same validation as server queries. */
export function parsePostQuery(params: URLSearchParams): PostQueryOptions {
  const values: Record<string, string | number> = {};
  for (const [key, raw] of params) {
    if (Object.hasOwn(values, key)) throw new ApiError(400, `参数 ${key} 不可重复。`);
    if (key === "page" || key === "pageSize") {
      if (!/^[1-9]\d*$/.test(raw)) throw new ApiError(400, `参数 ${key} 必须是正整数。`);
      values[key] = Number(raw);
    } else {
      Object.defineProperty(values, key, { value: raw, enumerable: true, configurable: true });
    }
  }
  return parseInput(postQuerySchema, values);
}

// Keep the complete corpus in SQLite. This also strips Unicode whitespace when
// counting characters, without transferring every article body to the browser.
const whitespaceCharacters = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
let contentWithoutWhitespace: SQL = sql`${posts.content}`;
for (const character of whitespaceCharacters) {
  contentWithoutWhitespace = sql`replace(${contentWithoutWhitespace}, ${character}, '')`;
}

async function postOverview(scope: "published" | "all"): Promise<Pick<PostCollection, "stats" | "categories">> {
  const db = getDb();
  const [stats] = await db.select({
      articles: sql<number>`coalesce(sum(case when ${posts.kind} = 'article' then 1 else 0 end), 0)`.mapWith(Number),
      notes: sql<number>`coalesce(sum(case when ${posts.kind} = 'note' then 1 else 0 end), 0)`.mapWith(Number),
      words: sql<number>`coalesce(sum(length(${contentWithoutWhitespace})), 0)`.mapWith(Number),
      total: count(),
      published: sql<number>`coalesce(sum(case when ${posts.status} = 'published' then 1 else 0 end), 0)`.mapWith(Number),
      drafts: sql<number>`coalesce(sum(case when ${posts.status} = 'draft' then 1 else 0 end), 0)`.mapWith(Number),
    }).from(posts).where(scope === "all" ? undefined : eq(posts.status, "published"));
  return { stats, categories: [...POST_CATEGORIES] };
}

/** Global statistics and navigation categories, without loading article bodies. */
export async function getPostOverview(scope: "published" | "all" = "published"): Promise<Pick<PostCollection, "stats" | "categories">> {
  if (scope !== "published" && scope !== "all") throw new ApiError(400, "无效的文章范围。");
  if (scope === "all") await requireAdmin();
  return postOverview(scope);
}

export async function queryPosts(options: PostQueryOptions = {}): Promise<PostCollection> {
  const value = parseInput(postQuerySchema, options);
  if (value.scope === "all") await requireAdmin();
  const conditions: SQL[] = [];
  if (value.scope === "published") conditions.push(eq(posts.status, "published"));
  if (value.status) conditions.push(eq(posts.status, value.status));
  if (value.kind) conditions.push(eq(posts.kind, value.kind));
  if (value.category) conditions.push(eq(posts.category, value.category));
  if (value.tag) conditions.push(sql`exists (select 1 from json_each(${posts.tags}) where json_each.type = 'text' and json_each.value = ${value.tag})`);
  if (value.collectionId) conditions.push(eq(posts.collectionId, value.collectionId));
  if (value.q) {
    // LIKE's escape character, % and _ are all literal user input.
    const pattern = `%${value.q.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
    const matches = or(
      ...[posts.title, posts.content, posts.excerpt, posts.category].map((column) => sql`journal_lower(${column}) like ${pattern} escape '\\'`),
      sql`exists (select 1 from json_each(${posts.tags}) where journal_lower(cast(json_each.value as text)) like ${pattern} escape '\\')`,
    );
    if (matches) conditions.push(matches);
  }
  const db = getDb();
  const where = and(...conditions);
  const [[result], overview] = await Promise.all([
    db.select({ total: count() }).from(posts).where(where),
    postOverview(value.scope),
  ]);
  const total = result.total;
  const totalPages = Math.max(1, Math.ceil(total / value.pageSize));
  const page = Math.min(value.page, totalPages);
  const ordering = value.collectionId
    ? [asc(posts.collectionOrder), asc(posts.publishedAt), asc(posts.id)]
    : value.scope === "all"
    ? [desc(posts.updatedAt), desc(posts.id)]
    : [desc(posts.publishedAt), desc(posts.updatedAt), desc(posts.id)];
  const pagePosts = await db.select().from(posts).where(where)
    .orderBy(...ordering)
    .limit(value.pageSize).offset((page - 1) * value.pageSize);
  return { posts: pagePosts, pagination: { page, pageSize: value.pageSize, total, totalPages }, ...overview };
}

/** @deprecated Use queryPosts so callers can navigate the complete collection. */
export async function listPosts(options: { scope?: "published" | "all"; kind?: PostKind; limit?: number } = {}): Promise<Post[]> {
  return (await queryPosts({ scope: options.scope, kind: options.kind, pageSize: options.limit ?? 10 })).posts;
}

/** Public detail URLs resolve exclusively through the persisted SQL primary key. */
export async function getPublishedPost(id: string): Promise<Post | null> {
  const [post] = await getDb().select().from(posts)
    .where(and(eq(posts.id, id), eq(posts.status, "published"))).limit(1);
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
  excerpt: z.string().trim().max(1000).default(""),
  content: z.string().max(500_000, "正文过长，请缩短至 50 万字以内。").default(""),
  category: z.enum(POST_CATEGORIES).default(DEFAULT_POST_CATEGORY),
  // A migrated legacy category can add one 60-character tag to the old 20.
  tags: z.array(z.string().trim().min(1).max(60)).max(32).default([]),
  kind: z.enum(["article", "note"]).default("article"),
  status: z.enum(["draft", "published"]).default("draft"),
  coverImage: imageUrlSchema.default(""),
  collectionId: z.string().uuid().nullable().default(null),
  collectionOrder: z.number().int().min(0).max(1_000_000).default(0),
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
  education: z.string().trim().max(6000).default(""),
  startedAt: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value <= new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  }, "请选择有效且不晚于今天的建站日期。")]).default(""),
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
  await checkPostCollection(input.collectionId);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const [post] = await getDb().insert(posts).values({
    ...input, id,
    // Keep the legacy NOT NULL column populated without deriving a route from
    // the title. Existing databases need no migration or rewritten records.
    slug: id, createdAt: now, updatedAt: now,
    publishedAt: input.status === "published" ? now : "",
  }).returning();
  return post;
}

export async function updatePost(id: string, input: PostInput): Promise<Post> {
  const db = getDb();
  const [existing] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  if (!existing) throw new ApiError(404, "文章不存在或已删除。");
  await checkPostCollection(input.collectionId);
  const now = new Date().toISOString();
  const [post] = await db.update(posts).set({ ...input, updatedAt: now,
    publishedAt: input.status === "published" ? (existing.publishedAt || now) : existing.publishedAt,
  }).where(eq(posts.id, id)).returning();
  return post;
}

async function checkPostCollection(id: string | null): Promise<void> {
  if (!id) return;
  const [collection] = await getDb().select({ id: collections.id }).from(collections).where(eq(collections.id, id)).limit(1);
  if (!collection) throw new ApiError(400, "所选合集不存在，请重新选择。");
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

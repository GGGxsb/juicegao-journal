import { z } from "zod";
import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { collections, posts } from "@/db/schema";
import { env } from "./platform";
import { ApiError, requireAdmin } from "./server";
import type { ArticleNavigation, Collection, CollectionInput, CollectionList, CollectionSummary, Pagination, Post, PostLink, TagSummary } from "./types";

const collectionInputSchema = z.object({
  title: z.string().trim().min(1, "请输入合集名称。").max(120),
  description: z.string().trim().max(2000).default(""),
}).strict();
const listingSchema = z.object({
  scope: z.enum(["published", "all"]).default("published"),
  page: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
}).strict();
export type NavigationQuery = { scope?: "published" | "all"; page?: number; pageSize?: number };

function parse<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown): z.output<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError(400, result.error.issues.map(issue => issue.message).join("；"));
  return result.data;
}

export function parseNavigationQuery(params: URLSearchParams): NavigationQuery {
  const input: Record<string, string | number> = {};
  for (const [key, value] of params) {
    if (Object.hasOwn(input, key)) throw new ApiError(400, `参数 ${key} 不可重复。`);
    if (key === "page" || key === "pageSize") {
      if (!/^[1-9]\d*$/.test(value)) throw new ApiError(400, `${key} 必须为正整数。`);
      input[key] = Number(value);
    } else Object.defineProperty(input, key, { value, enumerable: true });
  }
  return parse(listingSchema, input);
}

function paging(total: number, page: number, pageSize: number): Pagination {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { total, totalPages, page: Math.min(page, totalPages), pageSize };
}

/** Decode encoded route parameters once, preserving already decoded '%' text. */
export function decodeRouteSegment(value: string): string {
  try { return decodeURIComponent(value); }
  catch { return value; }
}

export async function queryTags(options: Omit<NavigationQuery, "scope"> = {}): Promise<{ tags: TagSummary[]; pagination: Pagination }> {
  const value = parse(listingSchema, { ...options, scope: "published" });
  const db = env.DB;
  const source = `FROM posts p, json_each(p.tags) t WHERE p.status = 'published' AND t.type = 'text' AND length(t.value) > 0`;
  const total = await db.prepare(`SELECT count(DISTINCT t.value) AS total ${source}`).first<number>("total") ?? 0;
  const pagination = paging(total, value.page, value.pageSize);
  const { results } = await db.prepare(`SELECT t.value AS tag, count(DISTINCT p.id) AS postCount ${source}
    GROUP BY t.value ORDER BY t.value COLLATE BINARY ASC LIMIT ? OFFSET ?`)
    .bind(pagination.pageSize, (pagination.page - 1) * pagination.pageSize).all<TagSummary>();
  return { tags: results.map(row => ({ ...row })), pagination };
}

export async function queryCollections(options: NavigationQuery = {}): Promise<CollectionList> {
  const value = parse(listingSchema, options);
  if (value.scope === "all") await requireAdmin();
  const db = env.DB;
  const visiblePosts = value.scope === "all" ? "" : " AND p.status = 'published'";
  const visibility = value.scope === "all" ? "" : " WHERE EXISTS (SELECT 1 FROM posts p WHERE p.collection_id = c.id AND p.status = 'published')";
  const total = await db.prepare(`SELECT count(*) AS total FROM collections c${visibility}`).first<number>("total") ?? 0;
  const pagination = paging(total, value.page, value.pageSize);
  const { results } = await db.prepare(`SELECT c.id, c.title, c.description, c.created_at AS createdAt, c.updated_at AS updatedAt,
    (SELECT count(*) FROM posts p WHERE p.collection_id = c.id${visiblePosts}) AS postCount
    FROM collections c${visibility} ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`)
    .bind(pagination.pageSize, (pagination.page - 1) * pagination.pageSize).all<CollectionSummary>();
  return { collections: results.map(row => ({ ...row })), pagination };
}

export async function getPublishedCollection(id: string): Promise<CollectionSummary | null> {
  const db = getDb();
  const [collection] = await db.select().from(collections).where(eq(collections.id, id)).limit(1);
  if (!collection) return null;
  const [{ total }] = await db.select({ total: count() }).from(posts)
    .where(and(eq(posts.collectionId, id), eq(posts.status, "published")));
  return total ? { ...collection, postCount: total } : null;
}

export function validateCollection(input: unknown): CollectionInput {
  return parse(collectionInputSchema, input);
}

export async function createCollection(input: CollectionInput): Promise<Collection> {
  const now = new Date().toISOString();
  const [collection] = await getDb().insert(collections).values({ ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now }).returning();
  return collection;
}

export async function updateCollection(id: string, input: CollectionInput): Promise<Collection> {
  const [collection] = await getDb().update(collections).set({ ...input, updatedAt: new Date().toISOString() }).where(eq(collections.id, id)).returning();
  if (!collection) throw new ApiError(404, "合集不存在或已删除。");
  return collection;
}

export async function deleteCollection(id: string): Promise<void> {
  // The foreign key clears collection_id on members, preserving every article.
  const [collection] = await getDb().delete(collections).where(eq(collections.id, id)).returning({ id: collections.id });
  if (!collection) throw new ApiError(404, "合集不存在或已删除。");
}

export async function getArticleNavigation(post: Post): Promise<ArticleNavigation> {
  if (post.status !== "published") return { previous: null, next: null, collection: null };
  const db = env.DB;
  const collection = post.collectionId ? await getPublishedCollection(post.collectionId) : null;
  const filter = collection ? "collection_id = ?" : "kind = ? AND category = ?";
  const values = collection ? [collection.id] : [post.kind, post.category];
  const tuple = collection ? "(collection_order, published_at, id)" : "(published_at, id)";
  const markers = collection ? "(?, ?, ?)" : "(?, ?)";
  const cursor = collection ? [post.collectionOrder, post.publishedAt, post.id] : [post.publishedAt, post.id];
  const columns = collection ? "collection_order, published_at, id" : "published_at, id";
  const previousOrder = columns.split(", ").map(column => `${column} DESC`).join(", ");
  const [previous, next, position] = await Promise.all([
    db.prepare(`SELECT id, title FROM posts WHERE status = 'published' AND ${filter} AND ${tuple} < ${markers}
      ORDER BY ${previousOrder} LIMIT 1`).bind(...values, ...cursor).first<PostLink>(),
    db.prepare(`SELECT id, title FROM posts WHERE status = 'published' AND ${filter} AND ${tuple} > ${markers}
      ORDER BY ${columns} LIMIT 1`).bind(...values, ...cursor).first<PostLink>(),
    collection ? db.prepare(`SELECT count(*) AS position FROM posts WHERE status = 'published' AND ${filter} AND ${tuple} <= ${markers}`)
      .bind(...values, ...cursor).first<number>("position") : Promise.resolve(null),
  ]);
  // Node SQLite returns null-prototype rows; server-to-client props must be
  // ordinary objects rather than passing those raw driver rows to React.
  return {
    previous: previous ? { id: previous.id, title: previous.title } : null,
    next: next ? { id: next.id, title: next.title } : null,
    collection: collection ? { id: collection.id, title: collection.title, position: position ?? 1, total: collection.postCount } : null,
  };
}

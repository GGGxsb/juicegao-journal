import { z } from "zod";
import { env } from "./platform";
import { ApiError } from "./server";
import type { ArticleNavigation, Pagination, Post, PostLink, TagSummary } from "./types";

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

export async function getArticleNavigation(post: Post): Promise<ArticleNavigation> {
  if (post.status !== "published") return { previous: null, next: null };
  const db = env.DB;
  const values = [post.category, post.publishedAt, post.id];
  const [previous, next] = await Promise.all([
    db.prepare(`SELECT id, title FROM posts WHERE status = 'published' AND category = ?
      AND (published_at, id) < (?, ?) ORDER BY published_at DESC, id DESC LIMIT 1`).bind(...values).first<PostLink>(),
    db.prepare(`SELECT id, title FROM posts WHERE status = 'published' AND category = ?
      AND (published_at, id) > (?, ?) ORDER BY published_at, id LIMIT 1`).bind(...values).first<PostLink>(),
  ]);
  // SQLite rows must become ordinary objects before passing them to React.
  return {
    previous: previous ? { id: previous.id, title: previous.title } : null,
    next: next ? { id: next.id, title: next.title } : null,
  };
}

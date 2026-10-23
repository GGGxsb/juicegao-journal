import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "./platform";
import { clientAddress } from "./request-security";
import { ApiError } from "./errors";
import { authorizeMutation, requireAdmin, requireSameOrigin } from "./server";
import { commentAccount } from './comment-auth';
import { getAdminSession } from './admin-auth';
import { ownerCommentProfile } from './comment-owner';
import type {
  AdminComment, AdminCommentListResult, CommentCounts, CommentListResult,
  CommentStatus, InteractionPagination, LikeState, PublicComment,
} from "./interaction-types";

const WINDOW_MS = 10 * 60 * 1000;
const plainText = (max: number) => z.string().trim().min(1, "请填写内容。")
  .max(max, `最多可填写 ${max} 个字符。`)
  .refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "内容含有无效字符。");
const commentInput = z.object({
  nickname: plainText(40).optional(),
  identity: z.enum(['guest', 'account', 'owner']).default('guest'),
  content: plainText(3000),
  parentId: z.string().trim().min(1).max(128).nullable().optional(),
}).strict();
const likeInput = z.object({ liked: z.boolean() }).strict();
const moderationInput = z.object({ status: z.enum(["approved", "rejected"]) }).strict();
const replyInput = z.object({ content: plainText(3000) }).strict();

type CommentRow = Omit<PublicComment, "isAdmin"> & { isAdmin: number };
type AdminCommentRow = CommentRow & { status: CommentStatus; postTitle: string };
type LikeRow = { count: number; liked: number };

// Only an approved parent's name/id is included, even after it is later rejected.
const publicColumns = `c.id, c.post_id AS postId, c.nickname, c.content, c.provider, c.avatar,
  parent.id AS parentId, parent.nickname AS replyTo, c.is_admin AS isAdmin,
  c.created_at AS createdAt`;
const commentJoins = `FROM comments c JOIN posts p ON p.id = c.post_id
  LEFT JOIN comments parent ON parent.id = c.parent_id
    AND parent.post_id = c.post_id AND parent.status = 'approved'`;
const adminColumns = `${publicColumns}, c.status, p.title AS postTitle`;
const likeQuery = `SELECT
  (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS count,
  EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.visitor_hash = ?) AS liked
  FROM posts p WHERE p.id = ? AND p.status = 'published'`;

function parse<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown): z.output<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError(400, result.error.issues.map(issue => issue.message).join("；"));
  return result.data;
}

function pageNumber(params: URLSearchParams, key: string, fallback: number, max: number) {
  const value = params.get(key);
  if (value === null) return fallback;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) {
    throw new ApiError(400, `${key} 应为 1 到 ${max} 之间的整数。`);
  }
  return Number(value);
}

function pagination(params: URLSearchParams, total: number): InteractionPagination {
  const requested = pageNumber(params, "page", 1, 1_000_000);
  const pageSize = pageNumber(params, "pageSize", 20, 100);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { page: Math.min(requested, totalPages), pageSize, total, totalPages };
}

function publicComment(row: CommentRow): PublicComment {
  return {
    id: row.id, postId: row.postId, nickname: row.nickname, content: row.content, provider: row.provider, avatar: row.avatar,
    parentId: row.parentId, replyTo: row.replyTo, isAdmin: row.isAdmin === 1, createdAt: row.createdAt,
  };
}

function adminComment(row: AdminCommentRow): AdminComment {
  return { ...publicComment(row), status: row.status, postTitle: row.postTitle };
}

// HMAC prevents dictionary recovery of IP addresses from a database copy. Raw
// addresses are never stored. With no trusted proxy, all unknown clients share
// one identity; localhost clients likewise share one identity.
function addressHash(request: Request, scope: string): string {
  const secret = env.ADMIN_SETUP_TOKEN_HASH || "";
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new ApiError(503, "站点互动密钥尚未配置。");
  return createHmac("sha256", Buffer.from(secret, "hex"))
    .update(`${scope}\0${clientAddress(request)}`).digest("hex");
}

async function throttle(request: Request, scope: "comments" | "likes", limit: number) {
  const database = env.DB;
  const key = addressHash(request, `rate:${scope}`);
  const now = Date.now(), cutoff = now - WINDOW_MS;
  // The increment and window rollover happen in one statement, so concurrent
  // requests cannot all observe the same remaining allowance.
  const row = await database.prepare(`INSERT INTO interaction_rate_limits (key, attempts, window_start)
    VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET
    attempts = CASE WHEN window_start <= ? THEN 1 ELSE MIN(attempts + 1, ?) END,
    window_start = CASE WHEN window_start <= ? THEN excluded.window_start ELSE window_start END
    RETURNING attempts`).bind(key, now, cutoff, limit + 1, cutoff).first<{ attempts: number }>();
  if (!row || row.attempts > limit) throw new ApiError(429, "操作过于频繁，请 10 分钟后重试。");
  await database.prepare("DELETE FROM interaction_rate_limits WHERE window_start <= ?").bind(cutoff).run();
}

async function requirePublished(postId: string) {
  const post = await env.DB.prepare("SELECT id FROM posts WHERE id = ? AND status = 'published'")
    .bind(postId).first<{ id: string }>();
  if (!post) throw new ApiError(404, "文章不存在或尚未发布。");
}

export async function listPublicComments(postId: string, params: URLSearchParams): Promise<CommentListResult> {
  // Validate pagination before accessing the database, including empty results.
  pagination(params, 0);
  const database = env.DB;
  const post = await database.prepare(`SELECT p.id,
    (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.status = 'approved') AS total
    FROM posts p WHERE p.id = ? AND p.status = 'published'`).bind(postId).first<{ id: string; total: number }>();
  if (!post) throw new ApiError(404, "文章不存在或尚未发布。");
  const paging = pagination(params, post.total);
  const { results } = await database.prepare(`SELECT ${publicColumns} ${commentJoins}
    WHERE c.post_id = ? AND c.status = 'approved' AND p.status = 'published'
    ORDER BY c.created_at ASC, c.id ASC LIMIT ? OFFSET ?`)
    .bind(postId, paging.pageSize, (paging.page - 1) * paging.pageSize).all<CommentRow>();
  return { comments: results.map(publicComment), pagination: paging };
}

export async function submitComment(request: Request, postId: string, input: unknown): Promise<{ published: boolean }> {
  requireSameOrigin(request);
  const value = parse(commentInput, input), parentId = value.parentId || null;
  const isOwner = (await getAdminSession(request)).isAdmin;
  if (value.identity === 'owner' && !isOwner) throw new ApiError(401, '站主登录已过期，请重新登录后台。');
  const owner = isOwner ? await ownerCommentProfile() : null;
  const account = !owner && value.identity === 'account' ? await commentAccount(request) : null;
  if (!owner && value.identity === 'account' && !account) throw new ApiError(401, '登录已过期，请重新选择登录身份，或改用游客评论。');
  if (!owner && !account && !value.nickname) throw new ApiError(400, '请填写昵称。');
  await requirePublished(postId);
  if (!owner) await throttle(request, "comments", 5);
  // Article visibility and reply eligibility are checked in the insert itself,
  // so a moderation/unpublish operation cannot race the earlier validation.
  const result = await env.DB.prepare(`INSERT INTO comments
    (id, post_id, nickname, content, parent_id, is_admin, status, created_at, author_id, provider, avatar)
    SELECT ?, p.id, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM posts p
    WHERE p.id = ? AND p.status = 'published' AND
    (? IS NULL OR EXISTS(SELECT 1 FROM comments parent
      WHERE parent.id = ? AND parent.post_id = p.id AND parent.status = 'approved'))`)
    .bind(randomUUID(), owner?.nickname || account?.nickname || value.nickname!, value.content, parentId, owner ? 1 : 0, owner ? 'approved' : 'pending', new Date().toISOString(), account?.id || null, account?.provider || '', owner?.avatar || account?.avatar || '', postId, parentId, parentId).run();
  if (result.meta.changes !== 1) {
    await requirePublished(postId);
    throw new ApiError(400, "回复的评论不存在或尚未通过审核。");
  }
  return { published: Boolean(owner) };
}

export async function getPostLikes(request: Request, postId: string): Promise<LikeState> {
  await requirePublished(postId);
  const visitorHash = addressHash(request, "visitor");
  const row = await env.DB.prepare(likeQuery).bind(visitorHash, postId).first<LikeRow>();
  if (!row) throw new ApiError(404, "文章不存在或尚未发布。");
  return { count: row.count, liked: row.liked === 1 };
}

export async function setPostLike(request: Request, postId: string, input: unknown): Promise<LikeState> {
  requireSameOrigin(request);
  const value = parse(likeInput, input);
  await requirePublished(postId);
  const visitorHash = addressHash(request, "visitor");
  await throttle(request, "likes", 30);
  const database = env.DB;
  const mutation = value.liked
    ? database.prepare(`INSERT INTO post_likes (post_id, visitor_hash, created_at)
      SELECT id, ?, ? FROM posts WHERE id = ? AND status = 'published'
      ON CONFLICT(post_id, visitor_hash) DO NOTHING`).bind(visitorHash, new Date().toISOString(), postId)
    : database.prepare(`DELETE FROM post_likes WHERE post_id = ? AND visitor_hash = ?
      AND EXISTS(SELECT 1 FROM posts WHERE id = ? AND status = 'published')`).bind(postId, visitorHash, postId);
  // The unique key prevents duplicate likes, and the result is read in the same
  // transaction as the idempotent insert/delete.
  const results = await database.batch<unknown>([mutation, database.prepare(likeQuery).bind(visitorHash, postId)]);
  const row = results[1].results[0] as LikeRow | undefined;
  if (!row) throw new ApiError(404, "文章不存在或尚未发布。");
  return { count: row.count, liked: row.liked === 1 };
}

export async function listAdminComments(params: URLSearchParams): Promise<AdminCommentListResult> {
  await requireAdmin();
  pagination(params, 0);
  const status = params.get("status") || "pending";
  if (!["pending", "approved", "rejected", "all"].includes(status)) throw new ApiError(400, "评论状态无效。");
  const query = (params.get("q") || "").trim();
  if (query.length > 200) throw new ApiError(400, "搜索内容最多 200 个字符。");
  const search = query.toLowerCase().replace(/[\\%_]/g, "\\$&");
  const searchWhere = query ? "(journal_lower(c.nickname) LIKE ? ESCAPE '\\' OR journal_lower(c.content) LIKE ? ESCAPE '\\' OR journal_lower(p.title) LIKE ? ESCAPE '\\')" : "1 = 1";
  const searchValues = query ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];
  const database = env.DB;
  // Counts cover the search across all statuses, so the moderation tabs stay
  // useful when the administrator switches status while searching.
  const counts = await database.prepare(`SELECT
    COUNT(*) AS total,
    COALESCE(SUM(c.status = 'pending'), 0) AS pending,
    COALESCE(SUM(c.status = 'approved'), 0) AS approved,
    COALESCE(SUM(c.status = 'rejected'), 0) AS rejected
    FROM comments c JOIN posts p ON p.id = c.post_id WHERE ${searchWhere}`)
    .bind(...searchValues).first<CommentCounts>();
  const summary = counts || { pending: 0, approved: 0, rejected: 0, total: 0 };
  const total = status === "all" ? summary.total : summary[status as CommentStatus];
  const paging = pagination(params, total);
  const statusWhere = status === "all" ? "" : "AND c.status = ?";
  const statusValues = status === "all" ? [] : [status];
  const { results } = await database.prepare(`SELECT ${adminColumns} ${commentJoins}
    WHERE ${searchWhere} ${statusWhere} ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`)
    .bind(...searchValues, ...statusValues, paging.pageSize, (paging.page - 1) * paging.pageSize).all<AdminCommentRow>();
  return { comments: results.map(adminComment), pagination: paging, counts: summary };
}

export async function moderateComment(request: Request, id: string, input: unknown): Promise<AdminComment> {
  await authorizeMutation(request);
  const value = parse(moderationInput, input), database = env.DB;
  const results = await database.batch<unknown>([
    database.prepare("UPDATE comments SET status = ? WHERE id = ? RETURNING id").bind(value.status, id),
    database.prepare(`SELECT ${adminColumns} ${commentJoins} WHERE c.id = ?`).bind(id),
  ]);
  const row = results[1].results[0] as AdminCommentRow | undefined;
  if (!row) throw new ApiError(404, "评论不存在或已删除。");
  return adminComment(row);
}

export async function deleteComment(request: Request, id: string): Promise<void> {
  await authorizeMutation(request);
  const result = await env.DB.prepare("DELETE FROM comments WHERE id = ? RETURNING id").bind(id).first<{ id: string }>();
  if (!result) throw new ApiError(404, "评论不存在或已删除。");
}

export async function replyToComment(request: Request, targetId: string, input: unknown): Promise<AdminComment> {
  await authorizeMutation(request);
  const owner = await ownerCommentProfile();
  const value = parse(replyInput, input), database = env.DB;
  const target = await database.prepare(`SELECT c.status, p.status AS postStatus
    FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = ?`)
    .bind(targetId).first<{ status: CommentStatus; postStatus: string }>();
  if (!target || target.postStatus !== "published") throw new ApiError(404, "评论或已发布文章不存在。");
  if (target.status !== "approved") throw new ApiError(409, "请先通过这条评论的审核，再回复。");
  const id = randomUUID();
  const results = await database.batch<unknown>([
    database.prepare(`INSERT INTO comments (id, post_id, nickname, content, parent_id, is_admin, status, created_at, avatar)
      SELECT ?, c.post_id, ?, ?, c.id, 1, 'approved', ?, ?
      FROM comments c JOIN posts p ON p.id = c.post_id
      WHERE c.id = ? AND c.status = 'approved' AND p.status = 'published'`)
      .bind(id, owner.nickname, value.content, new Date().toISOString(), owner.avatar, targetId),
    database.prepare(`SELECT ${adminColumns} ${commentJoins} WHERE c.id = ?`).bind(id),
  ]);
  const row = results[1].results[0] as AdminCommentRow | undefined;
  if (!row) throw new ApiError(409, "评论或文章状态已变化，请刷新后重试。");
  return adminComment(row);
}

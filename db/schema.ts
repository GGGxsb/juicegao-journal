import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { DEFAULT_POST_CATEGORY, POST_CATEGORIES } from "../app/lib/post-categories";

export const collections = sqliteTable("collections", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  // Retained for existing databases; new records mirror id and routes use id only.
  slug: text("slug").notNull(),
  excerpt: text("excerpt").notNull().default(""),
  content: text("content").notNull().default(""),
  category: text("category", { enum: POST_CATEGORIES }).notNull().default(DEFAULT_POST_CATEGORY),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
  kind: text("kind", { enum: ["article", "note"] }).notNull().default("article"),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  coverImage: text("cover_image").notNull().default(""),
  collectionId: text("collection_id").references(() => collections.id, { onDelete: "set null" }),
  collectionOrder: integer("collection_order").notNull().default(0),
  publishedAt: text("published_at").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  check("posts_category_check", sql`${table.category} IN ('Daily Life', 'Technical')`),
  uniqueIndex("posts_slug_unique").on(table.slug),
  index("posts_status_published_idx").on(table.status, table.publishedAt),
  index("posts_collection_order_idx").on(table.collectionId, table.status, table.collectionOrder, table.publishedAt, table.id),
  index("posts_category_navigation_idx").on(table.kind, table.category, table.status, table.publishedAt, table.id),
]);

export const siteSettings = sqliteTable("site_settings", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default("JuiceGao"),
  bio: text("bio").notNull().default("记录、探索，保持好奇。"),
  description: text("description").notNull().default("一个记录技术、生活与灵感的个人空间。"),
  avatar: text("avatar").notNull().default(""),
  github: text("github").notNull().default(""),
  email: text("email").notNull().default(""),
  location: text("location").notNull().default(""),
  education: text("education").notNull().default(""),
  startedAt: text("started_at").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

export const media = sqliteTable("media", {
  id: text("id").primaryKey(),
  key: text("key").notNull(),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdByUserId: text("created_by_user_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("media_key_unique").on(table.key)]);

export const adminAccounts = sqliteTable("admin_accounts", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  authVersion: integer("auth_version").notNull().default(1),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: integer("locked_until").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, table => [uniqueIndex("admin_username_unique").on(table.username)]);
export const adminSessions = sqliteTable("admin_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: text("account_id").notNull(),
  authVersion: integer("auth_version").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, table => [index("admin_session_expiry_idx").on(table.expiresAt)]);
export const adminRateLimits = sqliteTable("admin_rate_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull(),
  windowStart: integer("window_start").notNull(),
});

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  nickname: text("nickname").notNull(),
  content: text("content").notNull(),
  parentId: text("parent_id").references((): AnySQLiteColumn => comments.id, { onDelete: "set null" }),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  createdAt: text("created_at").notNull(),
}, table => [
  index("comments_post_status_created_idx").on(table.postId, table.status, table.createdAt, table.id),
  index("comments_status_created_idx").on(table.status, table.createdAt, table.id),
  index("comments_created_idx").on(table.createdAt, table.id),
  index("comments_parent_idx").on(table.parentId),
]);

export const postLikes = sqliteTable("post_likes", {
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  visitorHash: text("visitor_hash").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [primaryKey({ columns: [table.postId, table.visitorHash] })]);

export const interactionRateLimits = sqliteTable("interaction_rate_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull(),
  windowStart: integer("window_start").notNull(),
}, table => [index("interaction_rate_window_idx").on(table.windowStart)]);

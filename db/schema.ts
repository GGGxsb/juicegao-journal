import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  excerpt: text("excerpt").notNull().default(""),
  content: text("content").notNull().default(""),
  category: text("category").notNull().default("随笔"),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
  kind: text("kind", { enum: ["article", "note"] }).notNull().default("article"),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  coverImage: text("cover_image").notNull().default(""),
  publishedAt: text("published_at").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("posts_slug_unique").on(table.slug),
  index("posts_status_published_idx").on(table.status, table.publishedAt),
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

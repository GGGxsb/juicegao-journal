import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { DEFAULT_POST_CATEGORY, POST_CATEGORIES } from "../app/lib/post-categories";
import type { ResumeEntry } from "../app/lib/types";
import type { EditorValue } from "../app/lib/draft-state";
import type { ContributionCalendar } from "../app/lib/github-contribution-types";

export const githubContributionCache = sqliteTable("github_contribution_cache", {
  username: text("username").primaryKey(),
  credentialHash: text("credential_hash").notNull(),
  calendar: text("calendar", {mode:"json"}).$type<ContributionCalendar>(),
  fetchedAt: integer("fetched_at").notNull().default(0),
  retryAfter: integer("retry_after").notNull().default(0),
}, table => [check("github_contribution_cache_calendar_object", sql`${table.calendar} IS NULL OR (json_valid(${table.calendar}) AND json_type(${table.calendar}) = 'object')`)]);

export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  // Retained for existing databases; new records mirror id and routes use id only.
  slug: text("slug").notNull(),
  excerpt: text("excerpt").notNull().default(""),
  content: text("content").notNull().default(""),
  category: text("category", { enum: POST_CATEGORIES }).notNull().default(DEFAULT_POST_CATEGORY),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
  cityIds: text("city_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  coverImage: text("cover_image").notNull().default(""),
  viewCount: integer("view_count").notNull().default(0),
  publishedAt: text("published_at").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  check("posts_category_check", sql`${table.category} IN ('Daily Life', 'Technical')`),
  check("posts_city_ids_array", sql`json_valid(${table.cityIds}) AND json_type(${table.cityIds}) = 'array'`),
  uniqueIndex("posts_slug_unique").on(table.slug),
  index("posts_status_published_idx").on(table.status, table.publishedAt),
  index("posts_category_navigation_idx").on(table.category, table.status, table.publishedAt, table.id),
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
  educationEntries: text("education_entries", { mode: "json" }).$type<ResumeEntry[]>().notNull().default([]),
  experienceEntries: text("experience_entries", { mode: "json" }).$type<ResumeEntry[]>().notNull().default([]),
  startedAt: text("started_at").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  check("site_settings_education_entries_array", sql`json_valid(${table.educationEntries}) AND json_type(${table.educationEntries}) = 'array'`),
  check("site_settings_experience_entries_array", sql`json_valid(${table.experienceEntries}) AND json_type(${table.experienceEntries}) = 'array'`),
]);

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

export const commentAccounts = sqliteTable("comment_accounts", {
  id: text("id").primaryKey(),
  provider: text("provider", { enum: ["qq", "github"] }).notNull(),
  clientId: text("client_id").notNull(),
  subject: text("subject").notNull(),
  nickname: text("nickname").notNull(),
  avatar: text("avatar").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  uniqueIndex("comment_accounts_provider_subject_unique").on(table.provider, table.clientId, table.subject),
  check("comment_accounts_provider_check", sql`${table.provider} IN ('qq', 'github')`),
]);
export const commentSessions = sqliteTable("comment_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: text("account_id").notNull().references(() => commentAccounts.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, table => [index("comment_sessions_expiry_idx").on(table.expiresAt)]);
export const commentOauthAttempts = sqliteTable("comment_oauth_attempts", {
  stateHash: text("state_hash").primaryKey(),
  browserHash: text("browser_hash").notNull(),
  provider: text("provider", { enum: ["qq", "github"] }).notNull(),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  verifier: text("verifier").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, table => [index("comment_oauth_expiry_idx").on(table.expiresAt), check("comment_oauth_provider_check", sql`${table.provider} IN ('qq', 'github')`)]);

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  nickname: text("nickname").notNull(),
  authorId: text("author_id").references(() => commentAccounts.id, { onDelete: "set null" }),
  provider: text("provider", { enum: ["", "qq", "github"] }).notNull().default(""),
  avatar: text("avatar").notNull().default(""),
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
  index("comments_author_idx").on(table.authorId),
  check("comments_provider_check", sql`${table.provider} IN ('', 'qq', 'github')`),
]);

export const postLikes = sqliteTable("post_likes", {
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  visitorHash: text("visitor_hash").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [primaryKey({ columns: [table.postId, table.visitorHash] })]);

export const postReaders = sqliteTable("post_readers", {
  postId: text("post_id").notNull().references(() => posts.id, {onDelete:"cascade"}),
  visitorHash: text("visitor_hash").notNull(),
  createdAt: integer("created_at").notNull(),
}, table => [primaryKey({columns:[table.postId,table.visitorHash]})]);

export const siteTraffic = sqliteTable("site_traffic", {
  id: text("id").primaryKey(),
  pageViews: integer("page_views").notNull().default(0),
}, table => [check("site_traffic_id",sql`${table.id} = 'site'`),check("site_traffic_nonnegative",sql`${table.pageViews} >= 0`)]);

export const pageVisitWindows = sqliteTable("page_visit_windows", {
  visitorHash: text("visitor_hash").notNull(),
  path: text("path").notNull(),
  countedAt: integer("counted_at").notNull(),
}, table => [primaryKey({columns:[table.visitorHash,table.path]}),index("page_visit_windows_counted_idx").on(table.countedAt)]);

export const interactionRateLimits = sqliteTable("interaction_rate_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull(),
  windowStart: integer("window_start").notNull(),
}, table => [index("interaction_rate_window_idx").on(table.windowStart)]);

export const writingDrafts = sqliteTable("writing_drafts", {
  ownerId: text("owner_id").notNull().references(() => adminAccounts.id, {onDelete:"cascade"}),
  documentKey: text("document_key").notNull(),
  postId: text("post_id").references(() => posts.id, {onDelete:"cascade"}),
  editor: text("editor", {mode:"json"}).$type<EditorValue>().notNull(),
  baseUpdatedAt: text("base_updated_at").notNull().default(""),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
}, table => [
  primaryKey({columns:[table.ownerId,table.documentKey]}),
  index("writing_drafts_owner_updated_idx").on(table.ownerId,table.updatedAt),
  check("writing_drafts_editor_object",sql`json_valid(${table.editor}) AND json_type(${table.editor}) = 'object'`),
  check("writing_drafts_revision_positive",sql`${table.revision} > 0`),
  check("writing_drafts_document_match",sql`(${table.documentKey} = 'new' AND ${table.postId} IS NULL) OR (${table.documentKey} = ${table.postId} AND ${table.postId} IS NOT NULL)`),
]);

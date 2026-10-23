import type { PostCategory } from "./post-categories";

export type PostKind = "article" | "note";
export type PostStatus = "draft" | "published";

export interface Post {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  category: PostCategory;
  tags: string[];
  kind: PostKind;
  status: PostStatus;
  coverImage: string;
  collectionId: string | null;
  collectionOrder: number;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PostStatistics {
  articles: number;
  notes: number;
  words: number;
  total: number;
  published: number;
  drafts: number;
}

export interface PostCollection {
  posts: Post[];
  pagination: Pagination;
  stats: PostStatistics;
  categories: string[];
}

export interface ResumeEntry {
  id: string;
  organization: string;
  title: string;
  period: string;
  description: string;
  url: string;
}

export interface SiteSettings {
  name: string;
  bio: string;
  description: string;
  avatar: string;
  github: string;
  email: string;
  location: string;
  education: string;
  educationEntries: ResumeEntry[];
  experienceEntries: ResumeEntry[];
  startedAt: string;
}

/** Omitted resume groups preserve existing entries; an explicit [] clears one. */
export type SettingsInput = Omit<SiteSettings, "educationEntries" | "experienceEntries"> &
  Partial<Pick<SiteSettings, "educationEntries" | "experienceEntries">>;

export interface HomeOverview {
  today: string;
  firstPublishedAt: string | null;
  lastUpdatedAt: string | null;
  activity: { date: string; count: number }[];
  notes: Pick<Post, "id" | "title" | "excerpt" | "publishedAt">[];
}

export type PostInput = Pick<Post, "title" | "excerpt" | "content" | "category" | "tags" | "kind" | "status" | "coverImage" | "collectionId" | "collectionOrder">;

export interface TagSummary {
  tag: string;
  postCount: number;
}

export interface Collection {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionSummary extends Collection {
  postCount: number;
}

export interface CollectionList {
  collections: CollectionSummary[];
  pagination: Pagination;
}

export type CollectionInput = Pick<Collection, "title" | "description">;
export type PostLink = Pick<Post, "id" | "title">;

export interface ArticleNavigation {
  previous: PostLink | null;
  next: PostLink | null;
  collection: { id: string; title: string; position: number; total: number } | null;
}

export interface AdminSession {
  authenticated: boolean;
  isAdmin: boolean;
  username: string | null;
  setupRequired: boolean;
}

import type { PostCategory } from "./post-categories";
import type { TrafficTotals } from './analytics-types';

export type PostStatus = "draft" | "published";

export interface Post {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  category: PostCategory;
  tags: string[];
  cityIds: string[];
  status: PostStatus;
  coverImage: string;
  viewCount: number;
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
  coverImage?: string;
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
  sponsorWechat: string;
  sponsorAlipay: string;
  startedAt: string;
}

/** Omitted optional settings preserve saved values; explicit empty values clear them. */
export type SettingsInput = Omit<SiteSettings, "educationEntries" | "experienceEntries" | "sponsorWechat" | "sponsorAlipay"> &
  Partial<Pick<SiteSettings, "educationEntries" | "experienceEntries" | "sponsorWechat" | "sponsorAlipay">>;

export interface HomeOverview {
  today: string;
  traffic?: TrafficTotals;
  github?: { username: string | null; configured: boolean };
  firstPublishedAt: string | null;
  lastUpdatedAt: string | null;
  activity: { date: string; count: number }[];
}

/** An omitted cityIds preserves saved assignments; an explicit [] clears them. */
export type PostInput = Pick<Post, "title" | "excerpt" | "content" | "category" | "tags" | "status" | "coverImage"> &
  Partial<Pick<Post, "cityIds">>;

export type MapPost = Pick<Post, "id" | "title" | "excerpt" | "tags" | "cityIds" | "publishedAt" | "coverImage">;

export interface TagSummary {
  tag: string;
  postCount: number;
}

export type PostLink = Pick<Post, "id" | "title">;

export interface ArticleNavigation {
  previous: PostLink | null;
  next: PostLink | null;
}

export interface AdminSession {
  authenticated: boolean;
  isAdmin: boolean;
  username: string | null;
  setupRequired: boolean;
}

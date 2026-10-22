export type PostKind = "article" | "note";
export type PostStatus = "draft" | "published";

export interface Post {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  tags: string[];
  kind: PostKind;
  status: PostStatus;
  coverImage: string;
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

export interface SiteSettings {
  name: string;
  bio: string;
  description: string;
  avatar: string;
  github: string;
  email: string;
  location: string;
  education: string;
  startedAt: string;
}

export interface HomeOverview {
  today: string;
  firstPublishedAt: string | null;
  lastUpdatedAt: string | null;
  activity: { date: string; count: number }[];
  notes: Pick<Post, "id" | "title" | "excerpt" | "publishedAt">[];
}

export type PostInput = Pick<Post, "title" | "excerpt" | "content" | "category" | "tags" | "kind" | "status" | "coverImage">;

export interface AdminSession {
  authenticated: boolean;
  isAdmin: boolean;
  username: string | null;
  setupRequired: boolean;
}

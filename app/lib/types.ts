export type PostKind = "article" | "note";
export type PostStatus = "draft" | "published";

export interface Post {
  id: string;
  title: string;
  slug: string;
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

export interface SiteSettings {
  name: string;
  bio: string;
  description: string;
  avatar: string;
  github: string;
  email: string;
  location: string;
}

export type PostInput = Pick<Post, "title" | "slug" | "excerpt" | "content" | "category" | "tags" | "kind" | "status" | "coverImage">;

export interface AdminSession {
  authenticated: boolean;
  isAdmin: boolean;
  username: string | null;
  setupRequired: boolean;
}

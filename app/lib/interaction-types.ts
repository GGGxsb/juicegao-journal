export type CommentStatus = "pending" | "approved" | "rejected";

export interface PublicComment {
  id: string;
  postId: string;
  nickname: string;
  content: string;
  parentId: string | null;
  replyTo: string | null;
  isAdmin: boolean;
  createdAt: string;
}

export interface AdminComment extends PublicComment {
  status: CommentStatus;
  postTitle: string;
  postSlug: string;
}

export interface InteractionPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CommentListResult {
  comments: PublicComment[];
  pagination: InteractionPagination;
}

export interface CommentCounts {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

export interface AdminCommentListResult {
  comments: AdminComment[];
  pagination: InteractionPagination;
  counts: CommentCounts;
}

export interface LikeState {
  count: number;
  liked: boolean;
}

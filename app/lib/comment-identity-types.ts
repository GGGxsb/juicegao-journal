export const COMMENT_PROVIDERS = ['qq', 'github'] as const;
export type CommentProvider = typeof COMMENT_PROVIDERS[number];
export const COMMENT_PROVIDER_NAMES: Record<CommentProvider, string> = { qq: 'QQ', github: 'GitHub' };
export interface CommentIdentity { nickname: string; avatar: string; provider: CommentProvider }
export interface CommentSession {
  user: CommentIdentity | null;
  providers: { id: CommentProvider; name: string }[];
}

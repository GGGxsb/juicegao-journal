export const COMMENT_PROVIDERS = ['qq'] as const;
export type CommentLoginProvider = typeof COMMENT_PROVIDERS[number];
// Keep historical comment snapshots readable without enabling their login provider.
export type CommentProvider = 'qq' | 'github';
export const COMMENT_PROVIDER_NAMES: Record<CommentProvider, string> = { qq: 'QQ', github: 'GitHub' };
export interface CommentIdentity { nickname: string; avatar: string; provider: CommentLoginProvider }
export interface CommentSession {
  user: CommentIdentity | null;
  providers: { id: CommentLoginProvider; name: string }[];
}

import { env } from './platform';
import type { CommentOwnerIdentity } from './comment-identity-types';

/** Public site profile used only after the caller verifies an administrator session. */
export async function ownerCommentProfile(): Promise<CommentOwnerIdentity> {
  const profile = await env.DB.prepare("SELECT name,avatar FROM site_settings WHERE id='site'").first<{ name: string; avatar: string }>();
  return { nickname: profile?.name.trim().slice(0, 60) || 'JuiceGao', avatar: profile?.avatar || '' };
}

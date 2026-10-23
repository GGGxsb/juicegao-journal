export const POST_CATEGORIES = ['Daily Life', 'Technical'] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number];
export const DEFAULT_POST_CATEGORY: PostCategory = 'Daily Life';

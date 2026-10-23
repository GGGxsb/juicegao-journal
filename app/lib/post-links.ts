/** Use the SQL primary key so editing a title cannot change the article URL. */
export function postHref(post: { id: string }): string {
  return `/posts/${encodeURIComponent(post.id)}`;
}

export function tagHref(tag: string): string {
  // Browsers normalize dot-only path segments before the request reaches Next.
  if (tag === '.' || tag === '..') return `/archive?${new URLSearchParams({ tag })}`;
  return `/tags/${encodeURIComponent(tag)}`;
}

export function collectionHref(collection: { id: string }): string {
  return `/collections/${encodeURIComponent(collection.id)}`;
}

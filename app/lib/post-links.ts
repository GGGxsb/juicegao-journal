/** Use the SQL primary key so editing a title cannot change the article URL. */
export function postHref(post: { id: string }): string {
  return `/posts/${encodeURIComponent(post.id)}`;
}

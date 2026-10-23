-- Native ALTER operations preserve the posts table and its foreign keys while
-- giving both upgraded and empty databases a real SQL default and CHECK.
ALTER TABLE `posts` RENAME COLUMN `category` TO `legacy_category`;
--> statement-breakpoint
ALTER TABLE `posts` ADD `category` text DEFAULT 'Daily Life' NOT NULL
  CONSTRAINT `posts_category_check` CHECK (`category` IN ('Daily Life', 'Technical'));
--> statement-breakpoint
WITH normalized AS (
  SELECT id, lower(
    replace(replace(replace(replace(replace(replace(
      legacy_category, ' ', ''), char(9), ''), char(10), ''), char(13), ''), char(160), ''), char(12288), '')
  ) AS name FROM posts
)
UPDATE posts
SET category = CASE
      WHEN normalized.name IN ('technical', 'technology', 'tech', '技术', '技术文章', '技术分享', '技术笔记', '编程', '开发')
      THEN 'Technical' ELSE 'Daily Life' END,
    tags = CASE
      WHEN normalized.name IN ('dailylife', 'technical') OR normalized.name = '' THEN posts.tags
      WHEN EXISTS (SELECT 1 FROM json_each(posts.tags) t WHERE t.type = 'text' AND t.value = posts.legacy_category) THEN posts.tags
      ELSE json_insert(posts.tags, '$[#]', posts.legacy_category) END
FROM normalized
WHERE posts.id = normalized.id;
--> statement-breakpoint
-- SQLite updates an index's column reference on RENAME COLUMN; point this
-- index at the new constrained category before removing the temporary column.
DROP INDEX `posts_category_navigation_idx`;
--> statement-breakpoint
CREATE INDEX `posts_category_navigation_idx` ON `posts` (`kind`, `category`, `status`, `published_at`, `id`);
--> statement-breakpoint
ALTER TABLE `posts` DROP COLUMN `legacy_category`;

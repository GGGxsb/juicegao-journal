-- All existing rows, including former notes, remain ordinary articles.
-- Native column removal preserves article IDs and dependent foreign keys.
DROP INDEX `posts_category_navigation_idx`;
--> statement-breakpoint
ALTER TABLE `posts` DROP COLUMN `kind`;
--> statement-breakpoint
CREATE INDEX `posts_category_navigation_idx` ON `posts` (`category`, `status`, `published_at`, `id`);
--> statement-breakpoint
-- Preserve pending writing and its CAS revision while removing obsolete settings.
UPDATE `writing_drafts`
SET `editor` = json_remove(`editor`, '$.kind')
WHERE json_type(`editor`, '$.kind') IS NOT NULL;

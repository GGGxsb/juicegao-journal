-- Retire collection metadata without rebuilding posts or their dependent tables.
DROP INDEX `posts_collection_order_idx`;
--> statement-breakpoint
ALTER TABLE `posts` DROP COLUMN `collection_id`;
--> statement-breakpoint
ALTER TABLE `posts` DROP COLUMN `collection_order`;
--> statement-breakpoint
DROP TABLE `collections`;
--> statement-breakpoint
-- Keep unsaved writing, base timestamps and CAS revisions intact.
UPDATE `writing_drafts`
SET `editor` = json_remove(`editor`, '$.collectionId', '$.collectionOrder')
WHERE json_type(`editor`, '$.collectionId') IS NOT NULL
   OR json_type(`editor`, '$.collectionOrder') IS NOT NULL;

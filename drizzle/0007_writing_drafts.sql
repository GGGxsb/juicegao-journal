CREATE TABLE `writing_drafts` (
  `owner_id` text NOT NULL REFERENCES `admin_accounts` (`id`) ON DELETE CASCADE,
  `document_key` text NOT NULL,
  `post_id` text REFERENCES `posts` (`id`) ON DELETE CASCADE,
  `editor` text NOT NULL CHECK (json_valid(`editor`) AND json_type(`editor`) = 'object'),
  `base_updated_at` text NOT NULL DEFAULT '',
  `revision` integer NOT NULL DEFAULT 1 CHECK (`revision` > 0),
  `updated_at` text NOT NULL,
  PRIMARY KEY (`owner_id`, `document_key`),
  CHECK ((`document_key` = 'new' AND `post_id` IS NULL) OR (`document_key` = `post_id` AND `post_id` IS NOT NULL))
);
CREATE INDEX `writing_drafts_owner_updated_idx` ON `writing_drafts` (`owner_id`, `updated_at`);

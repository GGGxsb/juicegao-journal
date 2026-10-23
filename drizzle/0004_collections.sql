CREATE TABLE `collections` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `posts` ADD `collection_id` text REFERENCES `collections`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `posts` ADD `collection_order` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `posts_collection_order_idx` ON `posts` (`collection_id`, `status`, `collection_order`, `published_at`, `id`);
--> statement-breakpoint
CREATE INDEX `posts_category_navigation_idx` ON `posts` (`kind`, `category`, `status`, `published_at`, `id`);

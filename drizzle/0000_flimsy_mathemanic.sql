CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`original_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_key_unique` ON `media` (`key`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '随笔' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`kind` text DEFAULT 'article' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`cover_image` text DEFAULT '' NOT NULL,
	`published_at` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_slug_unique` ON `posts` (`slug`);--> statement-breakpoint
CREATE INDEX `posts_status_published_idx` ON `posts` (`status`,`published_at`);--> statement-breakpoint
CREATE TABLE `site_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT 'JuiceGao' NOT NULL,
	`bio` text DEFAULT '记录、探索，保持好奇。' NOT NULL,
	`description` text DEFAULT '一个记录技术、生活与灵感的个人空间。' NOT NULL,
	`avatar` text DEFAULT '' NOT NULL,
	`github` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);

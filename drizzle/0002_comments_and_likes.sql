CREATE TABLE `comments` (
  `id` text PRIMARY KEY NOT NULL,
  `post_id` text NOT NULL REFERENCES `posts` (`id`) ON DELETE CASCADE,
  `nickname` text NOT NULL,
  `content` text NOT NULL,
  `parent_id` text REFERENCES `comments` (`id`) ON DELETE SET NULL,
  `is_admin` integer DEFAULT 0 NOT NULL CHECK (`is_admin` IN (0, 1)),
  `status` text DEFAULT 'pending' NOT NULL CHECK (`status` IN ('pending', 'approved', 'rejected')),
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `comments_post_status_created_idx` ON `comments` (`post_id`, `status`, `created_at`, `id`);
--> statement-breakpoint
CREATE INDEX `comments_status_created_idx` ON `comments` (`status`, `created_at`, `id`);
--> statement-breakpoint
CREATE INDEX `comments_created_idx` ON `comments` (`created_at`, `id`);
--> statement-breakpoint
CREATE INDEX `comments_parent_idx` ON `comments` (`parent_id`);
--> statement-breakpoint
CREATE TABLE `post_likes` (
  `post_id` text NOT NULL REFERENCES `posts` (`id`) ON DELETE CASCADE,
  `visitor_hash` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY (`post_id`, `visitor_hash`)
);
--> statement-breakpoint
CREATE TABLE `interaction_rate_limits` (
  `key` text PRIMARY KEY NOT NULL,
  `attempts` integer NOT NULL,
  `window_start` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `interaction_rate_window_idx` ON `interaction_rate_limits` (`window_start`);

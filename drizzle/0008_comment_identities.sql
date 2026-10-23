CREATE TABLE `comment_accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL CHECK (`provider` IN ('qq', 'github')),
  `client_id` text NOT NULL,
  `subject` text NOT NULL,
  `nickname` text NOT NULL,
  `avatar` text NOT NULL DEFAULT '',
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  UNIQUE (`provider`, `client_id`, `subject`)
);
CREATE TABLE `comment_sessions` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL REFERENCES `comment_accounts` (`id`) ON DELETE CASCADE,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
CREATE INDEX `comment_sessions_expiry_idx` ON `comment_sessions` (`expires_at`);
CREATE TABLE `comment_oauth_attempts` (
  `state_hash` text PRIMARY KEY NOT NULL,
  `browser_hash` text NOT NULL,
  `provider` text NOT NULL CHECK (`provider` IN ('qq', 'github')),
  `post_id` text NOT NULL REFERENCES `posts` (`id`) ON DELETE CASCADE,
  `verifier` text NOT NULL,
  `expires_at` integer NOT NULL
);
CREATE INDEX `comment_oauth_expiry_idx` ON `comment_oauth_attempts` (`expires_at`);
ALTER TABLE `comments` ADD COLUMN `author_id` text REFERENCES `comment_accounts` (`id`) ON DELETE SET NULL;
ALTER TABLE `comments` ADD COLUMN `provider` text NOT NULL DEFAULT '' CHECK (`provider` IN ('', 'qq', 'github'));
ALTER TABLE `comments` ADD COLUMN `avatar` text NOT NULL DEFAULT '';
CREATE INDEX `comments_author_idx` ON `comments` (`author_id`);

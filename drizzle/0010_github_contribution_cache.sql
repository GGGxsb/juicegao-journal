-- Only daily contribution counts and a credential fingerprint are persisted.
-- The GitHub token remains exclusively in the server environment.
CREATE TABLE `github_contribution_cache` (
  `username` text PRIMARY KEY NOT NULL,
  `credential_hash` text NOT NULL,
  `calendar` text CHECK (`calendar` IS NULL OR (json_valid(`calendar`) AND json_type(`calendar`) = 'object')),
  `fetched_at` integer DEFAULT 0 NOT NULL,
  `retry_after` integer DEFAULT 0 NOT NULL
);

ALTER TABLE `site_settings` ADD `education_entries` text DEFAULT '[]' NOT NULL
  CONSTRAINT `site_settings_education_entries_array`
  CHECK (json_valid(`education_entries`) AND json_type(`education_entries`) = 'array');
--> statement-breakpoint
ALTER TABLE `site_settings` ADD `experience_entries` text DEFAULT '[]' NOT NULL
  CONSTRAINT `site_settings_experience_entries_array`
  CHECK (json_valid(`experience_entries`) AND json_type(`experience_entries`) = 'array');

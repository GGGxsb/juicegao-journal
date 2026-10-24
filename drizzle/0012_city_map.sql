-- Append the map field without rebuilding posts or changing dependent records.
ALTER TABLE `posts` ADD COLUMN `city_ids` text NOT NULL DEFAULT '[]'
  CONSTRAINT `posts_city_ids_array` CHECK (json_valid(`city_ids`) AND json_type(`city_ids`) = 'array');

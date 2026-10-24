ALTER TABLE posts ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0);

CREATE TABLE post_readers (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  visitor_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, visitor_hash)
);
CREATE TRIGGER post_readers_increment AFTER INSERT ON post_readers BEGIN
  UPDATE posts SET view_count = view_count + 1 WHERE id = NEW.post_id;
END;

CREATE TABLE site_traffic (
  id TEXT PRIMARY KEY NOT NULL CHECK (id = 'site'),
  page_views INTEGER NOT NULL DEFAULT 0 CHECK (page_views >= 0)
);
INSERT INTO site_traffic (id, page_views) VALUES ('site', 0);

CREATE TABLE page_visit_windows (
  visitor_hash TEXT NOT NULL,
  path TEXT NOT NULL,
  counted_at INTEGER NOT NULL,
  PRIMARY KEY (visitor_hash, path)
);
CREATE INDEX page_visit_windows_counted_idx ON page_visit_windows(counted_at);
CREATE TRIGGER page_visit_insert AFTER INSERT ON page_visit_windows BEGIN
  UPDATE site_traffic SET page_views = page_views + 1 WHERE id = 'site';
END;
CREATE TRIGGER page_visit_update AFTER UPDATE OF counted_at ON page_visit_windows BEGIN
  UPDATE site_traffic SET page_views = page_views + 1 WHERE id = 'site';
END;

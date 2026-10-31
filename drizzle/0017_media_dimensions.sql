-- NULL means an older upload whose header has not been inspected yet.
-- Zero records an unreadable header, so it does not get parsed on every visit.
ALTER TABLE media ADD COLUMN width INTEGER CHECK (width IS NULL OR width >= 0);
--> statement-breakpoint
ALTER TABLE media ADD COLUMN height INTEGER CHECK (height IS NULL OR height >= 0);

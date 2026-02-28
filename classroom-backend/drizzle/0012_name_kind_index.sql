-- Add B-tree index on LOWER(name) + kind for fast pre-filter lookups
-- Used by tryAutoReuse() to find existing items by name before calling AI
CREATE INDEX IF NOT EXISTS "items_name_kind_idx" ON "items" (LOWER("name"), "kind");

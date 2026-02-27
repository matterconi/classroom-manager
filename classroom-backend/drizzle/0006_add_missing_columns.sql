-- Migration 0006: Add columns that exist in Drizzle schema but not yet in the database

-- categories
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "resource" varchar(50);

-- components
ALTER TABLE "components" ADD COLUMN IF NOT EXISTS "type" varchar(50);
ALTER TABLE "components" ADD COLUMN IF NOT EXISTS "domain" varchar(50);

-- collections
ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "domain" varchar(50);

-- snippets
ALTER TABLE "snippets" ADD COLUMN IF NOT EXISTS "type" varchar(50);
ALTER TABLE "snippets" ADD COLUMN IF NOT EXISTS "libraries" jsonb;

-- theory
ALTER TABLE "theory" ADD COLUMN IF NOT EXISTS "domain" varchar(50);

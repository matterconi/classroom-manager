-- 1) Enable pgvector extension (already available on Neon, just needs activation)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2) GIN indexes for full-text search (tsvector)
--    These pre-compute text tokens so Postgres can search without scanning every row.

CREATE INDEX "components_search_idx" ON "components"
  USING gin(to_tsvector('english', coalesce("name", '') || ' ' || coalesce("description", '') || ' ' || coalesce("use_cases", '')));

CREATE INDEX "collections_search_idx" ON "collections"
  USING gin(to_tsvector('english', coalesce("name", '') || ' ' || coalesce("description", '')));

CREATE INDEX "snippets_search_idx" ON "snippets"
  USING gin(to_tsvector('english', coalesce("name", '') || ' ' || coalesce("description", '') || ' ' || coalesce("use_cases", '')));

CREATE INDEX "theory_search_idx" ON "theory"
  USING gin(to_tsvector('english', coalesce("name", '') || ' ' || coalesce("description", '') || ' ' || coalesce("use_cases", '')));

-- 3) Embedding columns for vector search (1536 dimensions = text-embedding-3-small)

ALTER TABLE "components" ADD COLUMN "embedding" vector(1536);
ALTER TABLE "collections" ADD COLUMN "embedding" vector(1536);
ALTER TABLE "snippets" ADD COLUMN "embedding" vector(1536);
ALTER TABLE "theory" ADD COLUMN "embedding" vector(1536);

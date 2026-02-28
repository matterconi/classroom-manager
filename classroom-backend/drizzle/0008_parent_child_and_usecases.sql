-- Migration 0008: Edge table + centroid tracking + useCases restructure
-- Self-Organizing Knowledge Base — Adaptive Information Architecture

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Edge table — all relationships (variant, expansion) live here
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "edges" (
  "id" serial PRIMARY KEY,
  "source_id" integer NOT NULL,
  "target_id" integer NOT NULL,
  "resource" text NOT NULL,
  "type" text NOT NULL,
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamptz DEFAULT now(),
  UNIQUE("source_id", "target_id", "type", "resource")
);

-- A snippet/theory can have AT MOST 1 parent (variant edge where target = child)
CREATE UNIQUE INDEX "idx_one_parent" ON "edges" ("target_id", "resource") WHERE "type" = 'variant';

-- Lookup indexes
CREATE INDEX "idx_edges_source" ON "edges" ("source_id");
CREATE INDEX "idx_edges_target" ON "edges" ("target_id");
CREATE INDEX "idx_edges_resource_type" ON "edges" ("resource", "type");

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. New columns on snippets — centroid tracking + abstract flag
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE "snippets" ADD COLUMN "centroid_embedding" vector(1536);
ALTER TABLE "snippets" ADD COLUMN "is_abstract" boolean DEFAULT false;
ALTER TABLE "snippets" ADD COLUMN "last_coherence_check" timestamptz;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. New columns on theory — same centroid tracking
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE "theory" ADD COLUMN "centroid_embedding" vector(1536);
ALTER TABLE "theory" ADD COLUMN "is_abstract" boolean DEFAULT false;
ALTER TABLE "theory" ADD COLUMN "last_coherence_check" timestamptz;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Convert snippets.use_cases from text to jsonb
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE "snippets" RENAME COLUMN "use_cases" TO "use_cases_old";
ALTER TABLE "snippets" ADD COLUMN "use_cases" jsonb;
UPDATE "snippets" SET "use_cases" = (
  SELECT jsonb_agg(jsonb_build_object('title', trim(line), 'use', ''))
  FROM unnest(string_to_array("use_cases_old", E'\n')) AS line
  WHERE trim(line) != ''
) WHERE "use_cases_old" IS NOT NULL AND trim("use_cases_old") != '';
ALTER TABLE "snippets" DROP COLUMN "use_cases_old";

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. Convert theory.use_cases from text to jsonb
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE "theory" RENAME COLUMN "use_cases" TO "use_cases_old";
ALTER TABLE "theory" ADD COLUMN "use_cases" jsonb;
UPDATE "theory" SET "use_cases" = (
  SELECT jsonb_agg(jsonb_build_object('title', trim(line), 'use', ''))
  FROM unnest(string_to_array("use_cases_old", E'\n')) AS line
  WHERE trim(line) != ''
) WHERE "use_cases_old" IS NOT NULL AND trim("use_cases_old") != '';
ALTER TABLE "theory" DROP COLUMN "use_cases_old";

-- ══════════════════════════════════════════════════════════════════════════════
-- NOTE: No parentId, linkType, expansions, or link_type enum.
-- All relationships are stored in the edges table.
-- ══════════════════════════════════════════════════════════════════════════════

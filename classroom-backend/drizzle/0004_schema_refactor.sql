-- ============================================================================
-- Migration 0004: Schema Refactor — La Bottega UI final architecture
-- Components (UI), Snippets (code logic), Collections (features), Theory (CS)
-- ============================================================================

-- ── New enums ────────────────────────────────────────────────────────────────

CREATE TYPE "theory_type" AS ENUM ('algorithm', 'data-structure', 'design-pattern');

-- ── Components: remove old fields, add new ones ─────────────────────────────

ALTER TABLE "components" DROP COLUMN IF EXISTS "language";
ALTER TABLE "components" DROP COLUMN IF EXISTS "stack";
ALTER TABLE "components" DROP COLUMN IF EXISTS "documentation";

ALTER TABLE "components" ADD COLUMN IF NOT EXISTS "element" varchar(50);
ALTER TABLE "components" ADD COLUMN IF NOT EXISTS "use_cases" text;
ALTER TABLE "components" ADD COLUMN IF NOT EXISTS "variants" jsonb;
ALTER TABLE "components" ADD COLUMN IF NOT EXISTS "entry_file" varchar(255);

-- ── Component Files (multi-file components) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS "component_files" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "component_id" integer NOT NULL REFERENCES "components"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "code" text NOT NULL,
  "order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "component_files_component_id_idx" ON "component_files" ("component_id");

-- ── Snippets: remove old fields, add new ones ───────────────────────────────

ALTER TABLE "snippets" DROP COLUMN IF EXISTS "type";
ALTER TABLE "snippets" DROP COLUMN IF EXISTS "complexity";

ALTER TABLE "snippets" ADD COLUMN IF NOT EXISTS "domain" varchar(50);
ALTER TABLE "snippets" ADD COLUMN IF NOT EXISTS "stack" varchar(50);
ALTER TABLE "snippets" ADD COLUMN IF NOT EXISTS "language" varchar(50);

-- ── Collections: remove documentation ────────────────────────────────────────

ALTER TABLE "collections" DROP COLUMN IF EXISTS "documentation";

-- ── Theory (new table) ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "theory" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "category_id" integer REFERENCES "categories"("id") ON DELETE SET NULL,
  "name" varchar(255) NOT NULL,
  "slug" varchar(255) NOT NULL UNIQUE,
  "description" text,
  "code" text NOT NULL,
  "type" "theory_type",
  "complexity" varchar(50),
  "use_cases" text,
  "tags" jsonb,
  "status" "component_status" DEFAULT 'draft' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "theory_category_id_idx" ON "theory" ("category_id");

-- ── Cleanup: drop unused enums ──────────────────────────────────────────────
-- snippet_type is no longer referenced by any column
-- stack (2-value) is no longer referenced by any column

DROP TYPE IF EXISTS "snippet_type";
DROP TYPE IF EXISTS "stack";

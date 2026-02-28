-- Migration 0010: Unified items table
-- Merges snippets, theory, components, collections into a single `items` table
-- Merges component_files, collection_files into `item_files`
-- Renames edge type 'variant' → 'parent', sets resource='item'

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Create unified items table
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "items" (
  "id" serial PRIMARY KEY,
  "kind" text NOT NULL,
  "category_id" integer REFERENCES "categories"("id") ON DELETE SET NULL,
  "name" varchar(255) NOT NULL,
  "slug" varchar(255) NOT NULL UNIQUE,
  "description" text,
  "code" text,
  "type" varchar(50),
  "domain" varchar(50),
  "stack" varchar(50),
  "language" varchar(50),
  "use_cases" jsonb,
  "libraries" jsonb,
  "tags" jsonb,
  "variants" jsonb,
  "entry_file" varchar(255),
  "is_abstract" boolean DEFAULT false,
  "centroid_embedding" vector(1536),
  "last_coherence_check" timestamptz,
  "embedding" vector(1536),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Create unified item_files table
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "item_files" (
  "id" serial PRIMARY KEY,
  "item_id" integer NOT NULL REFERENCES "items"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "code" text NOT NULL,
  "language" varchar(50),
  "order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Temp mapping table for ID remapping
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "_id_map" (
  "old_table" text NOT NULL,
  "old_id" integer NOT NULL,
  "new_id" integer NOT NULL
);

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Migrate snippets → items (kind='snippet')
-- ══════════════════════════════════════════════════════════════════════════════

WITH inserted AS (
  INSERT INTO "items" ("kind", "category_id", "name", "slug", "description", "code",
    "type", "domain", "stack", "language", "use_cases", "libraries", "tags",
    "is_abstract", "centroid_embedding", "last_coherence_check", "embedding",
    "created_at", "updated_at")
  SELECT 'snippet', "category_id", "name", "slug", "description", "code",
    "type", "domain", "stack", "language", "use_cases", "libraries", "tags",
    "is_abstract", "centroid_embedding", "last_coherence_check", "embedding",
    "created_at", "updated_at"
  FROM "snippets"
  ORDER BY "id"
  RETURNING "id", "slug"
)
INSERT INTO "_id_map" ("old_table", "old_id", "new_id")
SELECT 'snippets', s."id", i."id"
FROM "snippets" s
JOIN inserted i ON i."slug" = s."slug";

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. Migrate theory → items (kind='snippet', cast enum to text)
-- ══════════════════════════════════════════════════════════════════════════════

WITH inserted AS (
  INSERT INTO "items" ("kind", "category_id", "name", "slug", "description", "code",
    "type", "domain", "use_cases", "tags",
    "is_abstract", "centroid_embedding", "last_coherence_check", "embedding",
    "created_at", "updated_at")
  SELECT 'snippet', "category_id", "name", "slug", "description", "code",
    "type"::text, "domain", "use_cases", "tags",
    "is_abstract", "centroid_embedding", "last_coherence_check", "embedding",
    "created_at", "updated_at"
  FROM "theory"
  ORDER BY "id"
  RETURNING "id", "slug"
)
INSERT INTO "_id_map" ("old_table", "old_id", "new_id")
SELECT 'theory', t."id", i."id"
FROM "theory" t
JOIN inserted i ON i."slug" = t."slug";

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. Migrate components → items (kind='component')
--    Convert useCases from text to jsonb (single-element array if non-null)
-- ══════════════════════════════════════════════════════════════════════════════

WITH inserted AS (
  INSERT INTO "items" ("kind", "category_id", "name", "slug", "description",
    "type", "domain", "use_cases", "libraries", "tags", "variants", "entry_file",
    "embedding", "created_at", "updated_at")
  SELECT 'component', "category_id", "name", "slug", "description",
    "type", "domain",
    CASE
      WHEN "use_cases" IS NOT NULL AND trim("use_cases") != ''
      THEN jsonb_build_array(jsonb_build_object('title', "use_cases", 'use', ''))
      ELSE NULL
    END,
    "libraries", "tags", "variants", "entry_file",
    "embedding", "created_at", "updated_at"
  FROM "components"
  ORDER BY "id"
  RETURNING "id", "slug"
)
INSERT INTO "_id_map" ("old_table", "old_id", "new_id")
SELECT 'components', c."id", i."id"
FROM "components" c
JOIN inserted i ON i."slug" = c."slug";

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. Migrate collections → items (kind='collection', cast enum to text)
-- ══════════════════════════════════════════════════════════════════════════════

WITH inserted AS (
  INSERT INTO "items" ("kind", "category_id", "name", "slug", "description",
    "domain", "stack", "libraries", "tags", "entry_file",
    "embedding", "created_at", "updated_at")
  SELECT 'collection', "category_id", "name", "slug", "description",
    "domain", "stack"::text, "libraries", "tags", "entry_file",
    "embedding", "created_at", "updated_at"
  FROM "collections"
  ORDER BY "id"
  RETURNING "id", "slug"
)
INSERT INTO "_id_map" ("old_table", "old_id", "new_id")
SELECT 'collections', c."id", i."id"
FROM "collections" c
JOIN inserted i ON i."slug" = c."slug";

-- ══════════════════════════════════════════════════════════════════════════════
-- 8. Migrate component_files + collection_files → item_files
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO "item_files" ("item_id", "name", "code", "order", "created_at", "updated_at")
SELECT m."new_id", cf."name", cf."code", cf."order", cf."created_at", cf."updated_at"
FROM "component_files" cf
JOIN "_id_map" m ON m."old_table" = 'components' AND m."old_id" = cf."component_id";

INSERT INTO "item_files" ("item_id", "name", "code", "language", "order", "created_at", "updated_at")
SELECT m."new_id", cf."name", cf."code", cf."language", cf."order", cf."created_at", cf."updated_at"
FROM "collection_files" cf
JOIN "_id_map" m ON m."old_table" = 'collections' AND m."old_id" = cf."collection_id";

-- ══════════════════════════════════════════════════════════════════════════════
-- 9. Remap edges: update IDs, rename variant→parent, set resource='item'
-- ══════════════════════════════════════════════════════════════════════════════

-- Map source_id
UPDATE "edges" e
SET "source_id" = m."new_id"
FROM "_id_map" m
WHERE m."old_table" = (CASE WHEN e."resource" = 'snippet' THEN 'snippets' ELSE 'theory' END)
  AND m."old_id" = e."source_id";

-- Map target_id
UPDATE "edges" e
SET "target_id" = m."new_id"
FROM "_id_map" m
WHERE m."old_table" = (CASE WHEN e."resource" = 'snippet' THEN 'snippets' ELSE 'theory' END)
  AND m."old_id" = e."target_id";

-- Rename variant → parent
UPDATE "edges" SET "type" = 'parent' WHERE "type" = 'variant';

-- Set resource to 'item' for all
UPDATE "edges" SET "resource" = 'item';

-- ══════════════════════════════════════════════════════════════════════════════
-- 10. Recreate unique index for one-parent constraint with new type name
-- ══════════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS "idx_one_parent";
CREATE UNIQUE INDEX "idx_one_parent" ON "edges" ("target_id") WHERE "type" = 'parent';

-- ══════════════════════════════════════════════════════════════════════════════
-- 11. Drop old tables
-- ══════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS "component_files" CASCADE;
DROP TABLE IF EXISTS "collection_files" CASCADE;
DROP TABLE IF EXISTS "snippets" CASCADE;
DROP TABLE IF EXISTS "theory" CASCADE;
DROP TABLE IF EXISTS "components" CASCADE;
DROP TABLE IF EXISTS "collections" CASCADE;

-- ══════════════════════════════════════════════════════════════════════════════
-- 12. Cleanup
-- ══════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS "_id_map";
DROP TYPE IF EXISTS "theory_type";
DROP TYPE IF EXISTS "collection_stack";

-- ══════════════════════════════════════════════════════════════════════════════
-- 13. Create indexes on items
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX "items_kind_idx" ON "items" ("kind");
CREATE INDEX "items_category_id_idx" ON "items" ("category_id");
CREATE INDEX "items_embedding_hnsw_idx" ON "items" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "item_files_item_id_idx" ON "item_files" ("item_id");

-- Add entry_file column to collections
ALTER TABLE "collections" ADD COLUMN "entry_file" varchar(255);

-- Create snippet_type enum
CREATE TYPE "snippet_type" AS ENUM ('algorithm', 'data-structure', 'technique');

-- Create snippets table
CREATE TABLE "snippets" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "category_id" integer REFERENCES "categories"("id") ON DELETE SET NULL,
  "name" varchar(255) NOT NULL,
  "slug" varchar(255) NOT NULL UNIQUE,
  "description" text,
  "code" text NOT NULL,
  "type" "snippet_type",
  "complexity" varchar(50),
  "use_cases" text,
  "tags" jsonb,
  "status" "component_status" DEFAULT 'draft' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "snippets_category_id_idx" ON "snippets" ("category_id");

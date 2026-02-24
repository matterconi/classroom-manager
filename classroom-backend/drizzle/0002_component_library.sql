-- Drop old tables
DROP TABLE IF EXISTS "enrollments" CASCADE;
DROP TABLE IF EXISTS "classes" CASCADE;
DROP TABLE IF EXISTS "subjects" CASCADE;
DROP TABLE IF EXISTS "departments" CASCADE;

-- Drop old and new enums (idempotent)
DROP TYPE IF EXISTS "public"."class_status";
DROP TYPE IF EXISTS "public"."component_status";
DROP TYPE IF EXISTS "public"."stack";
DROP TYPE IF EXISTS "public"."collection_stack";

-- Recreate enums
CREATE TYPE "public"."component_status" AS ENUM('draft', 'published', 'archived');
CREATE TYPE "public"."stack" AS ENUM('frontend', 'backend');
CREATE TYPE "public"."collection_stack" AS ENUM('frontend', 'backend', 'fullstack');

-- Drop new tables if they exist (for re-runnability)
DROP TABLE IF EXISTS "collection_files" CASCADE;
DROP TABLE IF EXISTS "components" CASCADE;
DROP TABLE IF EXISTS "collections" CASCADE;
DROP TABLE IF EXISTS "categories" CASCADE;

-- Create categories table
CREATE TABLE "categories" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "name" varchar(255) NOT NULL UNIQUE,
  "slug" varchar(255) NOT NULL UNIQUE,
  "description" text,
  "icon" varchar(100),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create components table
CREATE TABLE "components" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "category_id" integer REFERENCES "categories"("id") ON DELETE SET NULL,
  "name" varchar(255) NOT NULL,
  "slug" varchar(255) NOT NULL UNIQUE,
  "description" text,
  "code" text NOT NULL,
  "language" varchar(50),
  "stack" "stack",
  "libraries" jsonb,
  "tags" jsonb,
  "documentation" text,
  "demo_url" text,
  "status" "component_status" DEFAULT 'draft' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "components_category_id_idx" ON "components" ("category_id");

-- Create collections table
CREATE TABLE "collections" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "category_id" integer REFERENCES "categories"("id") ON DELETE SET NULL,
  "name" varchar(255) NOT NULL,
  "slug" varchar(255) NOT NULL UNIQUE,
  "description" text,
  "stack" "collection_stack",
  "libraries" jsonb,
  "tags" jsonb,
  "documentation" text,
  "status" "component_status" DEFAULT 'draft' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "collections_category_id_idx" ON "collections" ("category_id");

-- Create collection_files table
CREATE TABLE "collection_files" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "collection_id" integer NOT NULL REFERENCES "collections"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "code" text NOT NULL,
  "language" varchar(50),
  "order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "collection_files_collection_id_idx" ON "collection_files" ("collection_id");

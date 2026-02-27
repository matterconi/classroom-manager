ALTER TABLE "components" DROP COLUMN IF EXISTS "status";
ALTER TABLE "collections" DROP COLUMN IF EXISTS "status";
ALTER TABLE "snippets" DROP COLUMN IF EXISTS "status";
ALTER TABLE "theory" DROP COLUMN IF EXISTS "status";
DROP TYPE IF EXISTS "component_status";

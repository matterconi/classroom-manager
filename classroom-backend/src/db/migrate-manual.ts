import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { resolve } from "path";

if (!process.env["DATABASE_URL"]) {
  throw new Error("DATABASE_URL is not defined");
}

const sql = neon(process.env["DATABASE_URL"]);

const migrationFiles = process.argv.slice(2);

if (migrationFiles.length === 0) {
  console.error("Usage: npx tsx src/db/migrate-manual.ts <migration1.sql> [migration2.sql] ...");
  console.error("Example: npx tsx src/db/migrate-manual.ts 0008_parent_child_and_usecases.sql 0009_hnsw_embedding_indexes.sql");
  process.exit(1);
}

for (const file of migrationFiles) {
  const migrationPath = resolve(import.meta.dirname, "../../drizzle", file);
  const migration = readFileSync(migrationPath, "utf-8");

  console.log(`\n── Running migration: ${file} ──`);

  const cleaned = migration
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  const statements = cleaned
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    const preview = stmt.replace(/\s+/g, " ").substring(0, 70);
    console.log(`  Executing: ${preview}...`);
    await sql.query(stmt);
  }

  console.log(`  ✓ ${file} completed`);
}

console.log("\nAll migrations completed!");

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { resolve } from "path";

if (!process.env["DATABASE_URL"]) {
  throw new Error("DATABASE_URL is not defined");
}

const sql = neon(process.env["DATABASE_URL"]);

const migrationPath = resolve(
  import.meta.dirname,
  "../../drizzle/0003_snippets_and_entry_file.sql",
);
const migration = readFileSync(migrationPath, "utf-8");

console.log("Running migration...");

// Strip comment lines, then split by semicolons
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

console.log("Migration completed!");

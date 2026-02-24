import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { categories } from "./schema/index.js";

if (!process.env["DATABASE_URL"]) {
  throw new Error("DATABASE_URL is not defined");
}

const sql = neon(process.env["DATABASE_URL"]);
const db = drizzle(sql);

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
}

async function seed() {
  console.log("Seeding categories...");

  await db.insert(categories).values([
    { name: "Animations", slug: slugify("Animations"), description: "Animation components and effects" },
    { name: "3D", slug: slugify("3D"), description: "Three.js and 3D rendering components" },
    { name: "Routes", slug: slugify("Routes"), description: "Routing and navigation patterns" },
    { name: "Forms", slug: slugify("Forms"), description: "Form components and validation" },
    { name: "Layout", slug: slugify("Layout"), description: "Layout and structural components" },
    { name: "Auth", slug: slugify("Auth"), description: "Authentication and authorization" },
    { name: "Data Fetching", slug: slugify("Data Fetching"), description: "Data fetching and API patterns" },
    { name: "UI", slug: slugify("UI"), description: "General UI components" },
  ]);

  console.log("Seed completed!");
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});

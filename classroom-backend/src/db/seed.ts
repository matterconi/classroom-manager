import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { departments, subjects } from "./schema/index.js";

if (!process.env["DATABASE_URL"]) {
  throw new Error("DATABASE_URL is not defined");
}

const sql = neon(process.env["DATABASE_URL"]);
const db = drizzle(sql);

async function seed() {
  console.log("Seeding departments...");

  const [science, math, humanities, cs] = await db
    .insert(departments)
    .values([
      { code: "SCI", name: "Scienze", description: "Dipartimento di Scienze" },
      { code: "MAT", name: "Matematica", description: "Dipartimento di Matematica" },
      { code: "LET", name: "Lettere", description: "Dipartimento di Lettere" },
      { code: "INF", name: "Informatica", description: "Dipartimento di Informatica" },
    ])
    .returning({ id: departments.id });

  console.log("Seeding subjects...");

  await db.insert(subjects).values([
    { departmentId: science!.id, code: "BIO101", name: "Biologia", description: "Introduzione alla Biologia" },
    { departmentId: science!.id, code: "CHI101", name: "Chimica", description: "Introduzione alla Chimica" },
    { departmentId: science!.id, code: "FIS101", name: "Fisica", description: "Introduzione alla Fisica" },
    { departmentId: math!.id, code: "MAT101", name: "Analisi Matematica", description: "Analisi Matematica I" },
    { departmentId: math!.id, code: "MAT102", name: "Algebra Lineare", description: "Algebra Lineare e Geometria" },
    { departmentId: humanities!.id, code: "LET101", name: "Letteratura Italiana", description: "Letteratura Italiana Moderna" },
    { departmentId: humanities!.id, code: "STO101", name: "Storia", description: "Storia Contemporanea" },
    { departmentId: cs!.id, code: "INF101", name: "Programmazione", description: "Fondamenti di Programmazione" },
    { departmentId: cs!.id, code: "INF102", name: "Basi di Dati", description: "Progettazione di Basi di Dati" },
  ]);

  console.log("Seed completed!");
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});

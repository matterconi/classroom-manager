import express from "express";
import { sql } from "drizzle-orm";
import { db } from "../index.js";
import {
  components,
  collections,
  snippets,
  theory,
} from "../schema/index.js";
import { generateEmbedding } from "../../lib/embeddings.js";

const SEARCH_MAX_LENGTH = 200;

const router = express.Router();

// GET /api/search?q=effetto button
router.get("/", async (req: express.Request, res: express.Response) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || typeof q !== "string" || q.length > SEARCH_MAX_LENGTH) {
      res.status(400).json({ error: "Invalid query" });
      return;
    }

    const trimmedQuery = q.trim();
    if (!trimmedQuery) {
      res.status(400).json({ error: "Query is empty" });
      return;
    }

    const resultLimit = Math.min(20, Math.max(1, parseInt(limit as string, 10)));

    const queryEmbedding = await generateEmbedding(trimmedQuery);
    const vectorStr = `[${queryEmbedding?.join(",")}]`;

    const [componentResults, collectionResults, snippetResults, theoryResults] =
      await Promise.all([
        db
          .select({
            id: components.id,
            name: components.name,
            description: components.description,
            type: components.type,
            domain: components.domain,
            tags: components.tags,
            libraries: components.libraries,
            similarity: sql<number>`1 - (${components.embedding} <=> ${vectorStr}::vector)`,
          })
          .from(components)
          .where(sql`${components.embedding} IS NOT NULL`)
          .orderBy(sql`${components.embedding} <=> ${vectorStr}::vector`)
          .limit(resultLimit),

        db
          .select({
            id: collections.id,
            name: collections.name,
            description: collections.description,
            domain: collections.domain,
            stack: collections.stack,
            tags: collections.tags,
            libraries: collections.libraries,
            similarity: sql<number>`1 - (${collections.embedding} <=> ${vectorStr}::vector)`,
          })
          .from(collections)
          .where(sql`${collections.embedding} IS NOT NULL`)
          .orderBy(sql`${collections.embedding} <=> ${vectorStr}::vector`)
          .limit(resultLimit),

        db
          .select({
            id: snippets.id,
            name: snippets.name,
            description: snippets.description,
            domain: snippets.domain,
            stack: snippets.stack,
            language: snippets.language,
            tags: snippets.tags,
            libraries: snippets.libraries,
            similarity: sql<number>`1 - (${snippets.embedding} <=> ${vectorStr}::vector)`,
          })
          .from(snippets)
          .where(sql`${snippets.embedding} IS NOT NULL`)
          .orderBy(sql`${snippets.embedding} <=> ${vectorStr}::vector`)
          .limit(resultLimit),

        db
          .select({
            id: theory.id,
            name: theory.name,
            description: theory.description,
            type: theory.type,
            domain: theory.domain,
            complexity: theory.complexity,
            tags: theory.tags,
            similarity: sql<number>`1 - (${theory.embedding} <=> ${vectorStr}::vector)`,
          })
          .from(theory)
          .where(sql`${theory.embedding} IS NOT NULL`)
          .orderBy(sql`${theory.embedding} <=> ${vectorStr}::vector`)
          .limit(resultLimit),
      ]);

    // 3) Merge, tag with resource type, sort by similarity, cut to limit
    const results = [
      ...componentResults.map((r) => ({ ...r, resource: "component" as const })),
      ...collectionResults.map((r) => ({ ...r, resource: "collection" as const })),
      ...snippetResults.map((r) => ({ ...r, resource: "snippet" as const })),
      ...theoryResults.map((r) => ({ ...r, resource: "theory" as const })),
    ]
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, resultLimit);

    res.status(200).json({ data: results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

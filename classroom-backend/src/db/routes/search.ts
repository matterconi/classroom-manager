import express from "express";
import { sql, and } from "drizzle-orm";
import { db } from "../index.js";
import { items } from "../schema/index.js";
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
    if (!queryEmbedding) {
      res.status(200).json({ data: [] });
      return;
    }

    const vectorStr = `[${queryEmbedding.join(",")}]`;

    // Single query on unified items table
    const results = await db
      .select({
        id: items.id,
        kind: items.kind,
        name: items.name,
        description: items.description,
        type: items.type,
        domain: items.domain,
        stack: items.stack,
        language: items.language,
        tags: items.tags,
        libraries: items.libraries,
        similarity: sql<number>`1 - (${items.embedding} <=> ${vectorStr}::vector)`,
      })
      .from(items)
      .where(
        and(
          sql`${items.embedding} IS NOT NULL`,
          // For snippets, exclude children
          sql`NOT (${items.kind} = 'snippet' AND EXISTS (
            SELECT 1 FROM edges WHERE edges.target_id = ${items.id} AND edges.type = 'parent'
          ))`,
        ),
      )
      .orderBy(sql`${items.embedding} <=> ${vectorStr}::vector`)
      .limit(resultLimit);

    res.status(200).json({ data: results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

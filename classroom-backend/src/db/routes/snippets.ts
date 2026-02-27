import express from "express";
import {
  ilike,
  eq,
  or,
  and,
  sql,
  desc,
  getTableColumns,
} from "drizzle-orm";
import { db } from "../index.js";
import { snippets, categories } from "../schema/index.js";
import { generateEmbedding } from "../../lib/embeddings.js";

const LIMIT_MAX = 100;
const SEARCH_MAX_LENGTH = 100;
const SEARCH_PATTERN = /^[\p{L}\p{N}\s\-.,]+$/u;

const router = express.Router();

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
}

router.get("/", async (req: express.Request, res: express.Response) => {
  try {
    const {
      search,
      type,
      domain,
      stack,
      language,
      categoryId,
      page = 1,
      limit = 10,
    } = req.query;

    const currentPage = Math.max(1, parseInt(page as string, 10));
    const limitPerPage = Math.min(
      LIMIT_MAX,
      Math.max(1, parseInt(limit as string, 10)),
    );
    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];

    if (search) {
      if (typeof search !== "string" || search.length > SEARCH_MAX_LENGTH) {
        res.status(400).json({ error: "Invalid search" });
        return;
      }
      const trimmedSearch = search.trim();
      if (trimmedSearch && !SEARCH_PATTERN.test(trimmedSearch)) {
        res.status(400).json({ error: "Invalid characters" });
        return;
      }
      filterConditions.push(
        or(
          sql`to_tsvector('english', coalesce(${snippets.name}, '') || ' ' || coalesce(${snippets.description}, '') || ' ' || coalesce(${snippets.useCases}, ''))
            @@ websearch_to_tsquery('english', ${trimmedSearch})`,
          ilike(snippets.name, `%${trimmedSearch}%`),
          ilike(snippets.description, `%${trimmedSearch}%`),
        ),
      );
    }

    if (type) {
      if (typeof type !== "string") {
        res.status(400).json({ error: "Invalid type" });
        return;
      }
      filterConditions.push(eq(snippets.type, type));
    }

    if (domain) {
      if (typeof domain !== "string") {
        res.status(400).json({ error: "Invalid domain" });
        return;
      }
      filterConditions.push(eq(snippets.domain, domain));
    }

    if (stack) {
      if (typeof stack !== "string") {
        res.status(400).json({ error: "Invalid stack" });
        return;
      }
      filterConditions.push(eq(snippets.stack, stack));
    }

    if (language) {
      if (typeof language !== "string") {
        res.status(400).json({ error: "Invalid language" });
        return;
      }
      filterConditions.push(eq(snippets.language, language));
    }

    if (categoryId) {
      const catId = parseInt(categoryId as string, 10);
      if (isNaN(catId) || catId < 1) {
        res.status(400).json({ error: "Invalid categoryId" });
        return;
      }
      filterConditions.push(eq(snippets.categoryId, catId));
    }

    const where =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(snippets)
      .leftJoin(categories, eq(snippets.categoryId, categories.id))
      .where(where);

    const totalCount = Number(countResult[0]?.count ?? 0);

    const snippetList = await db
      .select({
        ...getTableColumns(snippets),
        category: { ...getTableColumns(categories) },
      })
      .from(snippets)
      .leftJoin(categories, eq(snippets.categoryId, categories.id))
      .where(where)
      .orderBy(desc(snippets.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: snippetList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req: express.Request, res: express.Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id) || id < 1) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const result = await db
      .select({
        ...getTableColumns(snippets),
        category: { ...getTableColumns(categories) },
      })
      .from(snippets)
      .leftJoin(categories, eq(categories.id, snippets.categoryId))
      .where(eq(snippets.id, id));

    const record = result[0];
    if (!record) {
      res.status(404).json({ error: "Snippet not found" });
      return;
    }

    res.status(200).json({ data: record });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req: express.Request, res: express.Response) => {
  try {
    const {
      name,
      code,
      description,
      categoryId,
      type,
      domain,
      stack,
      language,
      useCases,
      libraries,
      tags,
    } = req.body;

    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    if (!code || typeof code !== "string") {
      res.status(400).json({ error: "Code is required" });
      return;
    }

    const slug = slugify(name) + "-" + Date.now();

    const [created] = await db
      .insert(snippets)
      .values({
        name,
        slug,
        code,
        description: description || null,
        categoryId: categoryId || null,
        type: type || null,
        domain: domain || null,
        stack: stack || null,
        language: language || null,
        useCases: useCases || null,
        tags: tags || null,
      })
      .returning();

    // Generate embedding (non-blocking)
    const embeddingText = [name, description, useCases, domain, stack, language, tags?.join(" "), libraries?.join(" ")].filter(Boolean).join(" ");
    generateEmbedding(embeddingText)
      .then((embedding) =>
        db.update(snippets).set({ embedding }).where(eq(snippets.id, created!.id)),
      )
      .catch((err) => console.error("Embedding generation failed:", err));

    res.status(201).json({ data: created });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

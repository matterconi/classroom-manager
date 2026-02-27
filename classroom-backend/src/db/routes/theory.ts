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
import { theory, categories } from "../schema/index.js";
import { generateEmbedding } from "../../lib/embeddings.js";

const LIMIT_MAX = 100;
const SEARCH_MAX_LENGTH = 100;
const SEARCH_PATTERN = /^[\p{L}\p{N}\s\-.,]+$/u;

const TYPE_VALUES = ["algorithm", "data-structure", "design-pattern"] as const;

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
      complexity,
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
          sql`to_tsvector('english', coalesce(${theory.name}, '') || ' ' || coalesce(${theory.description}, '') || ' ' || coalesce(${theory.useCases}, ''))
            @@ websearch_to_tsquery('english', ${trimmedSearch})`,
          ilike(theory.name, `%${trimmedSearch}%`),
          ilike(theory.description, `%${trimmedSearch}%`),
        ),
      );
    }

    if (type) {
      if (!TYPE_VALUES.includes(type as (typeof TYPE_VALUES)[number])) {
        res.status(400).json({ error: "Invalid type" });
        return;
      }
      filterConditions.push(
        eq(theory.type, type as (typeof TYPE_VALUES)[number]),
      );
    }

    if (domain) {
      if (typeof domain !== "string") {
        res.status(400).json({ error: "Invalid domain" });
        return;
      }
      filterConditions.push(eq(theory.domain, domain));
    }

    if (complexity) {
      if (typeof complexity !== "string" || complexity.length > 20) {
        res.status(400).json({ error: "Invalid complexity" });
        return;
      }
      filterConditions.push(eq(theory.complexity, complexity));
    }

    if (categoryId) {
      const catId = parseInt(categoryId as string, 10);
      if (isNaN(catId) || catId < 1) {
        res.status(400).json({ error: "Invalid categoryId" });
        return;
      }
      filterConditions.push(eq(theory.categoryId, catId));
    }

    const where =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(theory)
      .leftJoin(categories, eq(theory.categoryId, categories.id))
      .where(where);

    const totalCount = Number(countResult[0]?.count ?? 0);

    const theoryList = await db
      .select({
        ...getTableColumns(theory),
        category: { ...getTableColumns(categories) },
      })
      .from(theory)
      .leftJoin(categories, eq(theory.categoryId, categories.id))
      .where(where)
      .orderBy(desc(theory.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: theoryList,
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
        ...getTableColumns(theory),
        category: { ...getTableColumns(categories) },
      })
      .from(theory)
      .leftJoin(categories, eq(categories.id, theory.categoryId))
      .where(eq(theory.id, id));

    const record = result[0];
    if (!record) {
      res.status(404).json({ error: "Theory not found" });
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
      complexity,
      useCases,
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
      .insert(theory)
      .values({
        name,
        slug,
        code,
        description: description || null,
        categoryId: categoryId || null,
        type: type || null,
        domain: domain || null,
        complexity: complexity || null,
        useCases: useCases || null,
        tags: tags || null,
      })
      .returning();

    // Generate embedding (non-blocking)
    const embeddingText = [name, description, useCases, type, domain, complexity, tags?.join(" ")].filter(Boolean).join(" ");
    generateEmbedding(embeddingText)
      .then((embedding) =>
        db.update(theory).set({ embedding }).where(eq(theory.id, created!.id)),
      )
      .catch((err) => console.error("Embedding generation failed:", err));

    res.status(201).json({ data: created });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

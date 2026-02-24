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
import { components, categories } from "../schema/index.js";

const LIMIT_MAX = 100;
const SEARCH_MAX_LENGTH = 100;
const SEARCH_PATTERN = /^[\p{L}\p{N}\s\-.,]+$/u;

const STATUS_VALUES = ["draft", "published", "archived"] as const;
const STACK_VALUES = ["frontend", "backend"] as const;

const router = express.Router();

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
}

router.get("/", async (req: express.Request, res: express.Response) => {
  try {
    const {
      search,
      status,
      stack,
      categoryId,
      library,
      language,
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
          ilike(components.name, `%${trimmedSearch}%`),
          ilike(components.description, `%${trimmedSearch}%`),
        ),
      );
    }

    if (status) {
      if (!STATUS_VALUES.includes(status as (typeof STATUS_VALUES)[number])) {
        res.status(400).json({ error: "Invalid status" });
        return;
      }
      filterConditions.push(
        eq(components.status, status as (typeof STATUS_VALUES)[number]),
      );
    }

    if (stack) {
      if (!STACK_VALUES.includes(stack as (typeof STACK_VALUES)[number])) {
        res.status(400).json({ error: "Invalid stack" });
        return;
      }
      filterConditions.push(
        eq(components.stack, stack as (typeof STACK_VALUES)[number]),
      );
    }

    if (categoryId) {
      const catId = parseInt(categoryId as string, 10);
      if (isNaN(catId) || catId < 1) {
        res.status(400).json({ error: "Invalid categoryId" });
        return;
      }
      filterConditions.push(eq(components.categoryId, catId));
    }

    if (language) {
      if (typeof language !== "string") {
        res.status(400).json({ error: "Invalid language" });
        return;
      }
      filterConditions.push(eq(components.language, language));
    }

    if (library) {
      const lib = String(library);
      filterConditions.push(
        sql`${components.libraries} @> ${JSON.stringify([lib])}::jsonb`,
      );
    }

    const where =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(components)
      .leftJoin(categories, eq(components.categoryId, categories.id))
      .where(where);

    const totalCount = Number(countResult[0]?.count ?? 0);

    const componentList = await db
      .select({
        ...getTableColumns(components),
        category: { ...getTableColumns(categories) },
      })
      .from(components)
      .leftJoin(categories, eq(components.categoryId, categories.id))
      .where(where)
      .orderBy(desc(components.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: componentList,
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
        ...getTableColumns(components),
        category: { ...getTableColumns(categories) },
      })
      .from(components)
      .leftJoin(categories, eq(categories.id, components.categoryId))
      .where(eq(components.id, id));

    const record = result[0];
    if (!record) {
      res.status(404).json({ error: "Component not found" });
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
      language,
      stack,
      libraries,
      tags,
      documentation,
      demoUrl,
      status,
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
      .insert(components)
      .values({
        name,
        slug,
        code,
        description: description || null,
        categoryId: categoryId || null,
        language: language || null,
        stack: stack || null,
        libraries: libraries || null,
        tags: tags || null,
        documentation: documentation || null,
        demoUrl: demoUrl || null,
        status: status || "draft",
      })
      .returning({ id: components.id });

    if (!created) {
      res.status(500).json({ error: "Failed to create component" });
      return;
    }

    res.status(201).json({ data: created });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

import { ilike, or, and, eq, sql, desc } from "drizzle-orm";
import express from "express";
import { db } from "../index.js";
import { categories } from "../schema/index.js";

const LIMIT_MAX = 100;
const SEARCH_MAX_LENGTH = 100;
const SEARCH_PATTERN = /^[\p{L}\p{N}\s\-.,]+$/u;

const router = express.Router();

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
}

router.get("/", async (req: express.Request, res: express.Response) => {
  try {
    const { search, resource, page = 1, limit = 10 } = req.query;

    const currentPage = Math.max(1, parseInt(page as string, 10));
    const limitPerPage = Math.min(
      LIMIT_MAX,
      Math.max(1, parseInt(limit as string, 10)),
    );
    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];

    if (resource && typeof resource === "string") {
      filterConditions.push(eq(categories.resource, resource));
    }

    if (search) {
      if (typeof search !== "string" || search.length > SEARCH_MAX_LENGTH) {
        res.status(400).json({ error: "Invalid search parameter" });
        return;
      }
      const trimmedSearch = search.trim();
      if (trimmedSearch && !SEARCH_PATTERN.test(trimmedSearch)) {
        res.status(400).json({ error: "Search contains invalid characters" });
        return;
      }
      filterConditions.push(
        or(
          ilike(categories.name, `%${trimmedSearch}%`),
          ilike(categories.slug, `%${trimmedSearch}%`),
        ),
      );
    }

    const where =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(categories)
      .where(where);

    const totalCount = Number(countResult[0]?.count ?? 0);

    const categoryList = await db
      .select()
      .from(categories)
      .where(where)
      .orderBy(desc(categories.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: categoryList,
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

router.post("/", async (req: express.Request, res: express.Response) => {
  try {
    const { name, description, icon, resource } = req.body;

    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    const slug = slugify(name);

    const [created] = await db
      .insert(categories)
      .values({ name, slug, description, icon, resource: resource || null })
      .returning({ id: categories.id });

    if (!created) {
      res.status(500).json({ error: "Failed to create category" });
      return;
    }

    res.status(201).json({ data: created });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

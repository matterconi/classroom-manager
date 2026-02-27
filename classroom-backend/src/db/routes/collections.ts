import express from "express";
import {
  ilike,
  eq,
  or,
  and,
  sql,
  desc,
  getTableColumns,
  asc,
} from "drizzle-orm";
import { db } from "../index.js";
import {
  collections,
  collectionFiles,
  categories,
} from "../schema/index.js";
import { generateEmbedding } from "../../lib/embeddings.js";

const LIMIT_MAX = 100;
const SEARCH_MAX_LENGTH = 100;
const SEARCH_PATTERN = /^[\p{L}\p{N}\s\-.,]+$/u;

const STACK_VALUES = ["frontend", "backend", "fullstack"] as const;

const router = express.Router();

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
}

router.get("/", async (req: express.Request, res: express.Response) => {
  try {
    const {
      search,
      domain,
      stack,
      categoryId,
      library,
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
          sql`to_tsvector('english', coalesce(${collections.name}, '') || ' ' || coalesce(${collections.description}, ''))
            @@ websearch_to_tsquery('english', ${trimmedSearch})`,
          ilike(collections.name, `%${trimmedSearch}%`),
          ilike(collections.description, `%${trimmedSearch}%`),
        ),
      );
    }

    if (domain) {
      if (typeof domain !== "string") {
        res.status(400).json({ error: "Invalid domain" });
        return;
      }
      filterConditions.push(eq(collections.domain, domain));
    }

    if (stack) {
      if (!STACK_VALUES.includes(stack as (typeof STACK_VALUES)[number])) {
        res.status(400).json({ error: "Invalid stack" });
        return;
      }
      filterConditions.push(
        eq(collections.stack, stack as (typeof STACK_VALUES)[number]),
      );
    }

    if (categoryId) {
      const catId = parseInt(categoryId as string, 10);
      if (isNaN(catId) || catId < 1) {
        res.status(400).json({ error: "Invalid categoryId" });
        return;
      }
      filterConditions.push(eq(collections.categoryId, catId));
    }

    if (library) {
      const lib = String(library);
      filterConditions.push(
        sql`${collections.libraries} @> ${JSON.stringify([lib])}::jsonb`,
      );
    }

    const where =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(collections)
      .leftJoin(categories, eq(collections.categoryId, categories.id))
      .where(where);

    const totalCount = Number(countResult[0]?.count ?? 0);

    // Get collections with file count
    const collectionList = await db
      .select({
        ...getTableColumns(collections),
        category: { ...getTableColumns(categories) },
        filesCount: sql<number>`(
          SELECT count(*) FROM collection_files
          WHERE collection_files.collection_id = ${collections.id}
        )`,
      })
      .from(collections)
      .leftJoin(categories, eq(collections.categoryId, categories.id))
      .where(where)
      .orderBy(desc(collections.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: collectionList,
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
        ...getTableColumns(collections),
        category: { ...getTableColumns(categories) },
      })
      .from(collections)
      .leftJoin(categories, eq(categories.id, collections.categoryId))
      .where(eq(collections.id, id));

    const record = result[0];
    if (!record) {
      res.status(404).json({ error: "Collection not found" });
      return;
    }

    // Get files for this collection
    const files = await db
      .select()
      .from(collectionFiles)
      .where(eq(collectionFiles.collectionId, id))
      .orderBy(asc(collectionFiles.order));

    res.status(200).json({ data: { ...record, files } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req: express.Request, res: express.Response) => {
  try {
    const {
      name,
      description,
      categoryId,
      domain,
      stack,
      libraries,
      tags,
      entryFile,
      files,
    } = req.body;

    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: "At least one file is required" });
      return;
    }

    for (const file of files) {
      if (!file.name || typeof file.name !== "string") {
        res.status(400).json({ error: "Each file must have a name" });
        return;
      }
      if (!file.code || typeof file.code !== "string") {
        res.status(400).json({ error: "Each file must have code" });
        return;
      }
    }

    const slug = slugify(name) + "-" + Date.now();

    const [created] = await db
      .insert(collections)
      .values({
        name,
        slug,
        description: description || null,
        categoryId: categoryId || null,
        domain: domain || null,
        stack: stack || null,
        libraries: libraries || null,
        tags: tags || null,
        entryFile: entryFile || null,
      })
      .returning({ id: collections.id });

    if (!created) {
      res.status(500).json({ error: "Failed to create collection" });
      return;
    }

    // Insert files
    const fileValues = files.map(
      (file: { name: string; code: string; language?: string }, i: number) => ({
        collectionId: created.id,
        name: file.name,
        code: file.code,
        language: file.language || null,
        order: i,
      }),
    );

    await db.insert(collectionFiles).values(fileValues);

    // Generate embedding (non-blocking)
    const embeddingText = [name, description, domain, stack, tags?.join(" "), libraries?.join(" ")].filter(Boolean).join(" ");
    generateEmbedding(embeddingText)
      .then((embedding) =>
        db.update(collections).set({ embedding }).where(eq(collections.id, created.id)),
      )
      .catch((err) => console.error("Embedding generation failed:", err));

    res.status(201).json({ data: created });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

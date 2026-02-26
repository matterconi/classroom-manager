import express from "express";
import {
  ilike,
  eq,
  or,
  and,
  sql,
  desc,
  asc,
  getTableColumns,
} from "drizzle-orm";
import { db } from "../index.js";
import {
  components,
  componentFiles,
  categories,
} from "../schema/index.js";
import { generateEmbedding } from "../../lib/embeddings.js";

const LIMIT_MAX = 100;
const SEARCH_MAX_LENGTH = 100;
const SEARCH_PATTERN = /^[\p{L}\p{N}\s\-.,]+$/u;

const STATUS_VALUES = ["draft", "published", "archived"] as const;

const router = express.Router();

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
}

router.get("/", async (req: express.Request, res: express.Response) => {
  try {
    const {
      search,
      status,
      type,
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
          sql`to_tsvector('english', coalesce(${components.name}, '') || ' ' || coalesce(${components.description}, '') || ' ' || coalesce(${components.useCases}, ''))
            @@ websearch_to_tsquery('english', ${trimmedSearch})`,
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

    if (type) {
      if (typeof type !== "string") {
        res.status(400).json({ error: "Invalid type" });
        return;
      }
      filterConditions.push(eq(components.type, type));
    }

    if (categoryId) {
      const catId = parseInt(categoryId as string, 10);
      if (isNaN(catId) || catId < 1) {
        res.status(400).json({ error: "Invalid categoryId" });
        return;
      }
      filterConditions.push(eq(components.categoryId, catId));
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
        filesCount: sql<number>`(
          SELECT count(*) FROM component_files
          WHERE component_files.component_id = ${components.id}
        )`,
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

router.get("/meta", async (_req: express.Request, res: express.Response) => {
  try {
    const queryTypes = db.selectDistinct({ value: components.type })
    .from(components)
    .where(sql`${components.type} IS NOT NULL`);

    const queryDomains = db.selectDistinct({ value: components.domain })
    .from(components)
    .where(sql`${components.domain} IS NOT NULL`);

    const queryTags = db.execute(
      sql`SELECT DISTINCT t.value FROM components, jsonb_array_elements_text(tags) AS t(value) WHERE tags IS NOT NULL ORDER BY t.value`
    )

    const [typesRow, domainsRow, tagsRow] = await Promise.all([
      queryTypes,
      queryDomains,
      queryTags,
    ])

    return res.status(200).json({
      types: typesRow.map((r) => r.value),
      domains: domainsRow.map((r) => r.value),
      tags: tagsRow.rows.map((r) => r.value),
    })

  }

  catch (e) {
    console.error(e);
    return res.status(500).json({message: "something went wrong"});
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

    // Get files for multi-file components
    const files = await db
      .select()
      .from(componentFiles)
      .where(eq(componentFiles.componentId, id))
      .orderBy(asc(componentFiles.order));

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
      type,
      domain,
      description,
      categoryId,
      useCases,
      libraries,
      tags,
      variants,
      entryFile,
      status,
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
      .insert(components)
      .values({
        name,
        slug,
        type: type || null,
        domain: domain || null,
        description: description || null,
        categoryId: categoryId || null,
        useCases: useCases || null,
        libraries: libraries || null,
        tags: tags || null,
        variants: variants || null,
        entryFile: entryFile || null,
        status: status || "draft",
      })
      .returning({ id: components.id });

    if (!created) {
      res.status(500).json({ error: "Failed to create component" });
      return;
    }

    // Insert files if provided (multi-file component)
    if (files && Array.isArray(files) && files.length > 0) {
      const fileValues = files.map(
        (file: { name: string; code: string }, i: number) => ({
          componentId: created.id,
          name: file.name,
          code: file.code,
          order: i,
        }),
      );
      await db.insert(componentFiles).values(fileValues);
    }
    const embeddingText = [name, description, useCases, type, domain, tags?.join(" "), libraries?.join(" ")].filter(Boolean).join(" ");
    generateEmbedding(embeddingText)
      .then((embedding) => 
        db.update(components).set({ embedding }).where(eq(components.id, created.id)),
      ).catch((err) => console.error("Embedding generation failed:", err));

      res.status(201).json({ data: created });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
});

export default router;

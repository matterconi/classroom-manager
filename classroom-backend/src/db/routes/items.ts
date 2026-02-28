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
import { items, itemFiles, categories, edges } from "../schema/index.js";
import { generateEmbedding } from "../../lib/embeddings.js";
import { rerankCandidates, type ScoringFields } from "../../lib/scoring.js";
import type { JudgeCandidateInput } from "../../lib/prompts.js";
import type { ItemKind } from "../schema/app.js";
import { runHierarchyPipeline } from "../../lib/hierarchy-pipeline.js";

const LIMIT_MAX = 100;
const SEARCH_MAX_LENGTH = 100;
const SEARCH_PATTERN = /^[\p{L}\p{N}\s\-.,]+$/u;
const VALID_KINDS: ItemKind[] = ["snippet", "component", "collection"];

const router = express.Router();

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
}

// ── GET / — List items by kind ────────────────────────────────────────────────

router.get("/", async (req: express.Request, res: express.Response) => {
  try {
    const {
      kind,
      search,
      type,
      domain,
      stack,
      language,
      categoryId,
      library,
      page = 1,
      limit = 10,
    } = req.query;

    if (!kind || !VALID_KINDS.includes(kind as ItemKind)) {
      res.status(400).json({ error: "kind is required (snippet | component | collection)" });
      return;
    }

    const itemKind = kind as ItemKind;
    const currentPage = Math.max(1, parseInt(page as string, 10));
    const limitPerPage = Math.min(
      LIMIT_MAX,
      Math.max(1, parseInt(limit as string, 10)),
    );
    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [eq(items.kind, itemKind)];

    // For snippets: exclude children (no incoming parent edge)
    if (itemKind === "snippet") {
      filterConditions.push(
        sql`NOT EXISTS (
          SELECT 1 FROM edges
          WHERE edges.target_id = ${items.id}
            AND edges.type = 'parent'
        )`,
      );
    }

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
          sql`to_tsvector('english', coalesce(${items.name}, '') || ' ' || coalesce(${items.description}, '') || ' ' || coalesce(${items.useCases}::text, ''))
            @@ websearch_to_tsquery('english', ${trimmedSearch})`,
          ilike(items.name, `%${trimmedSearch}%`),
          ilike(items.description, `%${trimmedSearch}%`),
        )!,
      );
    }

    if (type && typeof type === "string") {
      filterConditions.push(eq(items.type, type));
    }

    if (domain && typeof domain === "string") {
      filterConditions.push(eq(items.domain, domain));
    }

    if (stack && typeof stack === "string") {
      filterConditions.push(eq(items.stack, stack));
    }

    if (language && typeof language === "string") {
      filterConditions.push(eq(items.language, language));
    }

    if (categoryId) {
      const catId = parseInt(categoryId as string, 10);
      if (isNaN(catId) || catId < 1) {
        res.status(400).json({ error: "Invalid categoryId" });
        return;
      }
      filterConditions.push(eq(items.categoryId, catId));
    }

    if (library) {
      const lib = String(library);
      filterConditions.push(
        sql`${items.libraries} @> ${JSON.stringify([lib])}::jsonb`,
      );
    }

    const where = and(...filterConditions);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(items)
      .leftJoin(categories, eq(items.categoryId, categories.id))
      .where(where);

    const totalCount = Number(countResult[0]?.count ?? 0);

    // For components/collections, include filesCount
    const hasFiles = itemKind === "component" || itemKind === "collection";

    const selectFields: Record<string, any> = {
      ...getTableColumns(items),
      category: { ...getTableColumns(categories) },
    };

    if (hasFiles) {
      selectFields.filesCount = sql<number>`(
        SELECT count(*) FROM item_files
        WHERE item_files.item_id = ${items.id}
      )`;
    }

    const itemList = await db
      .select(selectFields)
      .from(items)
      .leftJoin(categories, eq(items.categoryId, categories.id))
      .where(where)
      .orderBy(desc(items.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: itemList,
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

// ── GET /meta — Distinct filter values ────────────────────────────────────────

router.get("/meta", async (req: express.Request, res: express.Response) => {
  try {
    const { kind } = req.query;
    const kindFilter = kind && VALID_KINDS.includes(kind as ItemKind)
      ? eq(items.kind, kind as ItemKind)
      : undefined;

    const [typesRow, domainsRow, stacksRow, languagesRow, tagsRow] = await Promise.all([
      db.selectDistinct({ value: items.type })
        .from(items)
        .where(and(sql`${items.type} IS NOT NULL`, kindFilter)),
      db.selectDistinct({ value: items.domain })
        .from(items)
        .where(and(sql`${items.domain} IS NOT NULL`, kindFilter)),
      db.selectDistinct({ value: items.stack })
        .from(items)
        .where(and(sql`${items.stack} IS NOT NULL`, kindFilter)),
      db.selectDistinct({ value: items.language })
        .from(items)
        .where(and(sql`${items.language} IS NOT NULL`, kindFilter)),
      db.execute(
        kind
          ? sql`SELECT DISTINCT t.value FROM items, jsonb_array_elements_text(tags) AS t(value) WHERE tags IS NOT NULL AND kind = ${kind} ORDER BY t.value`
          : sql`SELECT DISTINCT t.value FROM items, jsonb_array_elements_text(tags) AS t(value) WHERE tags IS NOT NULL ORDER BY t.value`,
      ),
    ]);

    res.status(200).json({
      types: typesRow.map((r) => r.value),
      domains: domainsRow.map((r) => r.value),
      stacks: stacksRow.map((r) => r.value),
      languages: languagesRow.map((r) => r.value),
      tags: tagsRow.rows.map((r) => r.value),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── CORE 3: Check similarity with structural reranking + family enrichment ──

router.post("/check-similarity", async (req: express.Request, res: express.Response) => {
  try {
    const { name, code, description, categoryId, type, domain, stack, language, useCases, tags, libraries } = req.body;

    if (!name || !code) {
      res.status(400).json({ error: "name and code are required" });
      return;
    }

    const useCasesText = Array.isArray(useCases)
      ? useCases.map((uc: { title: string; use: string }) => `${uc.title} ${uc.use}`).join(" ")
      : "";
    const embeddingText = [name, description, useCasesText, domain, stack, language, tags?.join(" "), libraries?.join(" ")].filter(Boolean).join(" ");

    const embedding = await generateEmbedding(embeddingText);
    if (!embedding) {
      res.status(200).json({ data: [] });
      return;
    }

    const FAMILY_THRESHOLD = 0.70;
    const SIMILARITY_LIMIT = 15;
    const vectorStr = `[${embedding.join(",")}]`;

    const similarRaw = await db
      .select({
        id: items.id,
        categoryId: items.categoryId,
        name: items.name,
        description: items.description,
        code: items.code,
        type: items.type,
        domain: items.domain,
        stack: items.stack,
        language: items.language,
        libraries: items.libraries,
        tags: items.tags,
        similarity: sql<number>`1 - (${items.embedding} <=> ${vectorStr}::vector)`,
      })
      .from(items)
      .where(
        and(
          sql`${items.embedding} IS NOT NULL`,
          sql`1 - (${items.embedding} <=> ${vectorStr}::vector) > ${FAMILY_THRESHOLD}`,
        ),
      )
      .orderBy(sql`${items.embedding} <=> ${vectorStr}::vector`)
      .limit(SIMILARITY_LIMIT);

    if (similarRaw.length === 0) {
      res.status(200).json({ data: [] });
      return;
    }

    const newItemScoring: ScoringFields = { categoryId, type, domain, stack, language, libraries, tags };
    const top5 = rerankCandidates(newItemScoring, similarRaw, 5);

    const candidateIds = top5.map((c) => c.id);

    const familyEdges = await db
      .select({
        sourceId: edges.sourceId,
        targetId: edges.targetId,
      })
      .from(edges)
      .where(
        and(
          eq(edges.type, "parent"),
          or(
            sql`${edges.sourceId} IN (${sql.join(candidateIds.map(id => sql`${id}`), sql`, `)})`,
            sql`${edges.targetId} IN (${sql.join(candidateIds.map(id => sql`${id}`), sql`, `)})`,
          ),
        ),
      );

    const relatedIds = new Set<number>();
    for (const edge of familyEdges) {
      relatedIds.add(edge.sourceId);
      relatedIds.add(edge.targetId);
    }
    for (const id of candidateIds) relatedIds.delete(id);

    let relatedItems: { id: number; name: string }[] = [];
    if (relatedIds.size > 0) {
      const relatedIdArray = Array.from(relatedIds);
      relatedItems = await db
        .select({ id: items.id, name: items.name })
        .from(items)
        .where(sql`${items.id} IN (${sql.join(relatedIdArray.map(id => sql`${id}`), sql`, `)})`);
    }

    const nameMap = new Map<number, string>();
    for (const item of relatedItems) nameMap.set(item.id, item.name);
    for (const c of top5) nameMap.set(c.id, c.name);

    const enriched: JudgeCandidateInput[] = top5.map((c) => {
      const parentEdge = familyEdges.find((e) => e.targetId === c.id);
      const childrenEdges = familyEdges.filter((e) => e.sourceId === c.id);

      let role: "PARENT" | "CHILD" | "STANDALONE" = "STANDALONE";
      let parent: { id: number; name: string } | null = null;
      let siblings: { id: number; name: string }[] = [];
      let children: { id: number; name: string }[] = [];

      if (childrenEdges.length > 0) {
        role = "PARENT";
        children = childrenEdges.map((e) => ({
          id: e.targetId,
          name: nameMap.get(e.targetId) || `#${e.targetId}`,
        }));
      }

      if (parentEdge) {
        role = "CHILD";
        parent = {
          id: parentEdge.sourceId,
          name: nameMap.get(parentEdge.sourceId) || `#${parentEdge.sourceId}`,
        };
        siblings = familyEdges
          .filter((e) => e.sourceId === parentEdge.sourceId && e.targetId !== c.id)
          .map((e) => ({
            id: e.targetId,
            name: nameMap.get(e.targetId) || `#${e.targetId}`,
          }));
      }

      return {
        id: c.id,
        name: c.name,
        code: c.code ?? "",
        description: c.description ?? undefined,
        combinedScore: c.combinedScore,
        role,
        parent,
        siblings,
        children,
      };
    });

    res.status(200).json({ data: enriched });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /:id — Single item with children + expansions + files ─────────────────

router.get("/:id", async (req: express.Request, res: express.Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id) || id < 1) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const result = await db
      .select({
        ...getTableColumns(items),
        category: { ...getTableColumns(categories) },
      })
      .from(items)
      .leftJoin(categories, eq(categories.id, items.categoryId))
      .where(eq(items.id, id));

    const record = result[0];
    if (!record) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    // Fetch children via parent edges (where this item is source)
    const childEdges = await db
      .select({ targetId: edges.targetId })
      .from(edges)
      .where(
        and(
          eq(edges.sourceId, id),
          eq(edges.type, "parent"),
        ),
      );

    let children: any[] = [];
    if (childEdges.length > 0) {
      const childIds = childEdges.map((e) => e.targetId);
      children = await db
        .select({
          ...getTableColumns(items),
          category: { ...getTableColumns(categories) },
        })
        .from(items)
        .leftJoin(categories, eq(categories.id, items.categoryId))
        .where(sql`${items.id} IN (${sql.join(childIds.map(cid => sql`${cid}`), sql`, `)})`)
        .orderBy(items.name);
    }

    // Fetch expansions via expansion edges (where this item is target)
    const expansionEdges = await db
      .select()
      .from(edges)
      .where(
        and(
          eq(edges.targetId, id),
          eq(edges.type, "expansion"),
        ),
      );

    // Fetch files for component/collection
    let files: any[] = [];
    if (record.kind === "component" || record.kind === "collection") {
      files = await db
        .select()
        .from(itemFiles)
        .where(eq(itemFiles.itemId, id))
        .orderBy(asc(itemFiles.order));
    }

    res.status(200).json({
      data: { ...record, children, expansions: expansionEdges, files },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST / — Create item ──────────────────────────────────────────────────────

router.post("/", async (req: express.Request, res: express.Response) => {
  try {
    const {
      kind,
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
      variants,
      entryFile,
      files,
    } = req.body;

    if (!kind || !VALID_KINDS.includes(kind)) {
      res.status(400).json({ error: "kind is required (snippet | component | collection)" });
      return;
    }

    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    // Snippets require code
    if (kind === "snippet" && (!code || typeof code !== "string")) {
      res.status(400).json({ error: "Code is required for snippets" });
      return;
    }

    // Components/collections require files
    if ((kind === "component" || kind === "collection") && (!files || !Array.isArray(files) || files.length === 0)) {
      res.status(400).json({ error: "At least one file is required for components/collections" });
      return;
    }

    if (files && Array.isArray(files)) {
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
    }

    const slug = slugify(name) + "-" + Date.now();

    const [created] = await db
      .insert(items)
      .values({
        kind,
        name,
        slug,
        code: code || null,
        description: description || null,
        categoryId: categoryId || null,
        type: type || null,
        domain: domain || null,
        stack: stack || null,
        language: language || null,
        useCases: useCases || null,
        libraries: libraries || null,
        tags: tags || null,
        variants: variants || null,
        entryFile: entryFile || null,
      })
      .returning();

    if (!created) {
      res.status(500).json({ error: "Failed to create item" });
      return;
    }

    // Insert files for component/collection
    if (files && Array.isArray(files) && files.length > 0) {
      const fileValues = files.map(
        (file: { name: string; code: string; language?: string }, i: number) => ({
          itemId: created.id,
          name: file.name,
          code: file.code,
          language: file.language || null,
          order: i,
        }),
      );
      await db.insert(itemFiles).values(fileValues);
    }

    // Generate embedding
    const useCasesText = Array.isArray(useCases)
      ? useCases.map((uc: { title: string; use: string }) => `${uc.title} ${uc.use}`).join(" ")
      : "";
    const embeddingText = [name, description, useCasesText, domain, stack, language, tags?.join(" "), libraries?.join(" ")].filter(Boolean).join(" ");

    try {
      const embedding = await generateEmbedding(embeddingText);
      if (embedding) {
        await db.update(items).set({ embedding }).where(eq(items.id, created.id));
      }
    } catch (err) {
      console.error("Embedding generation failed:", err);
    }

    res.status(201).json({ data: created });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /:id/link — Create a parent edge (parent → child) ───────────────────

router.post("/:id/link", async (req: express.Request, res: express.Response) => {
  try {
    const childId = parseInt(req.params.id as string, 10);
    if (isNaN(childId) || childId < 1) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const { parentId } = req.body;

    if (!parentId || typeof parentId !== "number" || parentId < 1) {
      res.status(400).json({ error: "Valid parentId is required" });
      return;
    }
    if (childId === parentId) {
      res.status(400).json({ error: "Cannot link to self" });
      return;
    }

    const [parent] = await db
      .select({ id: items.id })
      .from(items)
      .where(eq(items.id, parentId));

    if (!parent) {
      res.status(404).json({ error: "Parent not found" });
      return;
    }

    const [edge] = await db
      .insert(edges)
      .values({
        sourceId: parentId,
        targetId: childId,
        resource: "item",
        type: "parent",
      })
      .returning();

    res.status(200).json({ data: edge });
  } catch (e: any) {
    if (e?.code === "23505") {
      res.status(409).json({ error: "This item already has a parent" });
      return;
    }
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /:id/decompose — Run hierarchy pipeline ────────────────────────────

router.post("/:id/decompose", async (req: express.Request, res: express.Response) => {
  try {
    const itemId = parseInt(req.params.id as string, 10);
    if (isNaN(itemId) || itemId < 1) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [item] = await db
      .select()
      .from(items)
      .where(eq(items.id, itemId));

    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    // Build source files
    let sourceFiles: { name: string; code: string; language?: string | undefined }[] = [];

    if (item.kind === "component" || item.kind === "collection") {
      const files = await db
        .select()
        .from(itemFiles)
        .where(eq(itemFiles.itemId, itemId))
        .orderBy(asc(itemFiles.order));
      sourceFiles = files.map((f) => ({
        name: f.name,
        code: f.code,
        language: f.language || undefined,
      }));
    } else if (item.code) {
      sourceFiles = [{
        name: `${item.name}.tsx`,
        code: item.code,
        language: item.language || "typescript",
      }];
    }

    if (sourceFiles.length === 0) {
      res.status(400).json({ error: "Item has no source files for decomposition" });
      return;
    }

    const result = await runHierarchyPipeline(itemId, sourceFiles);

    res.status(201).json({ data: result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /:id/unlink — Remove parent edge ──────────────────────────────────

router.delete("/:id/unlink", async (req: express.Request, res: express.Response) => {
  try {
    const childId = parseInt(req.params.id as string, 10);
    if (isNaN(childId) || childId < 1) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const deleted = await db
      .delete(edges)
      .where(
        and(
          eq(edges.targetId, childId),
          eq(edges.type, "parent"),
        ),
      )
      .returning();

    if (deleted.length === 0) {
      res.status(404).json({ error: "No parent link found" });
      return;
    }

    res.status(200).json({ data: deleted[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

import express from "express";
import { eq, sql, asc, isNull } from "drizzle-orm";
import { db } from "../index.js";
import { treeNodes, items } from "../schema/index.js";

const router = express.Router();

// ── GET / — List all root tree nodes (no parent) ─────────────────────────────

router.get("/", async (_req: express.Request, res: express.Response) => {
  try {
    const roots = await db
      .select()
      .from(treeNodes)
      .where(isNull(treeNodes.parentNodeId))
      .orderBy(asc(treeNodes.name));

    res.status(200).json({ data: roots });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /:id — Single tree node with children + member items ─────────────────

router.get("/:id", async (req: express.Request, res: express.Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id) || id < 1) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [node] = await db
      .select()
      .from(treeNodes)
      .where(eq(treeNodes.id, id));

    if (!node) {
      res.status(404).json({ error: "Tree node not found" });
      return;
    }

    // Fetch child nodes
    const childNodes = await db
      .select()
      .from(treeNodes)
      .where(eq(treeNodes.parentNodeId, id))
      .orderBy(asc(treeNodes.name));

    // Fetch member items (items linked to this family)
    const memberItems = await db
      .select({
        id: items.id,
        name: items.name,
        kind: items.kind,
        slug: items.slug,
        description: items.description,
        code: items.code,
        tags: items.tags,
        libraries: items.libraries,
      })
      .from(items)
      .where(eq(items.semanticNodeId, id))
      .orderBy(asc(items.name));

    // Fetch parent node (if any)
    let parentNode = null;
    if (node.parentNodeId) {
      const [p] = await db
        .select({ id: treeNodes.id, name: treeNodes.name })
        .from(treeNodes)
        .where(eq(treeNodes.id, node.parentNodeId));
      parentNode = p || null;
    }

    res.status(200).json({
      data: { ...node, childNodes, memberItems, parentNode },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /:id/tree — Full subtree from a node ─────────────────────────────────

router.get("/:id/tree", async (req: express.Request, res: express.Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id) || id < 1) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    // Fetch all descendants using recursive CTE
    const allNodes = await db.execute(sql`
      WITH RECURSIVE tree AS (
        SELECT * FROM tree_nodes WHERE id = ${id}
        UNION ALL
        SELECT tn.* FROM tree_nodes tn
        JOIN tree t ON tn.parent_node_id = t.id
      )
      SELECT * FROM tree ORDER BY id
    `);

    if (allNodes.rows.length === 0) {
      res.status(404).json({ error: "Tree node not found" });
      return;
    }

    // Collect all node IDs to fetch member items
    const nodeIds = allNodes.rows.map((n: any) => n.id as number);

    let memberItems: any[] = [];
    if (nodeIds.length > 0) {
      memberItems = await db
        .select({
          id: items.id,
          name: items.name,
          kind: items.kind,
          slug: items.slug,
          semanticNodeId: items.semanticNodeId,
        })
        .from(items)
        .where(sql`${items.semanticNodeId} IN (${sql.join(nodeIds.map(nid => sql`${nid}`), sql`, `)})`);
    }

    // Build tree structure
    const nodeMap = new Map<number, any>();
    for (const row of allNodes.rows) {
      nodeMap.set(row.id as number, {
        ...row,
        children: [] as any[],
        items: memberItems.filter((i: any) => i.semanticNodeId === row.id),
      });
    }

    const roots: any[] = [];
    for (const row of allNodes.rows) {
      const node = nodeMap.get(row.id as number)!;
      if (row.parent_node_id && nodeMap.has(row.parent_node_id as number)) {
        nodeMap.get(row.parent_node_id as number)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    res.status(200).json({ data: roots });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

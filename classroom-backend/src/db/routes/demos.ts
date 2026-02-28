import express from "express";
import { eq, and, sql, asc } from "drizzle-orm";
import { db } from "../index.js";
import { demos, demoFiles, items, itemFiles } from "../schema/index.js";
import { runRenderPipeline } from "../../lib/render-pipeline.js";

const router = express.Router();

// ── GET /api/demos/item/:itemId — Get all demos for an item ─────────────────

router.get(
	"/item/:itemId",
	async (req: express.Request, res: express.Response) => {
		try {
			const itemId = parseInt(req.params.itemId as string, 10);
			if (isNaN(itemId) || itemId < 1) {
				res.status(400).json({ error: "Invalid itemId" });
				return;
			}

			const itemDemos = await db
				.select()
				.from(demos)
				.where(eq(demos.itemId, itemId))
				.orderBy(asc(demos.createdAt));

			// Fetch files for each demo (or source demo files for prop-scaled ones)
			const result = await Promise.all(
				itemDemos.map(async (demo) => {
					let files;
					if (demo.sourceDemoId) {
						// Prop-scaled: fetch files from source demo
						files = await db
							.select()
							.from(demoFiles)
							.where(eq(demoFiles.demoId, demo.sourceDemoId))
							.orderBy(asc(demoFiles.order));
					} else {
						files = await db
							.select()
							.from(demoFiles)
							.where(eq(demoFiles.demoId, demo.id))
							.orderBy(asc(demoFiles.order));
					}
					return { ...demo, files };
				}),
			);

			res.status(200).json({ data: result });
		} catch (e) {
			console.error(e);
			res.status(500).json({ error: "Internal server error" });
		}
	},
);

// ── GET /api/demos/:id — Get a single demo with files ───────────────────────

router.get("/:id", async (req: express.Request, res: express.Response) => {
	try {
		const id = parseInt(req.params.id as string, 10);
		if (isNaN(id) || id < 1) {
			res.status(400).json({ error: "Invalid id" });
			return;
		}

		const [demo] = await db
			.select()
			.from(demos)
			.where(eq(demos.id, id));

		if (!demo) {
			res.status(404).json({ error: "Demo not found" });
			return;
		}

		// Get files (from source demo if prop-scaled)
		const filesSourceId = demo.sourceDemoId || demo.id;
		const files = await db
			.select()
			.from(demoFiles)
			.where(eq(demoFiles.demoId, filesSourceId))
			.orderBy(asc(demoFiles.order));

		res.status(200).json({ data: { ...demo, files } });
	} catch (e) {
		console.error(e);
		res.status(500).json({ error: "Internal server error" });
	}
});

// ── POST /api/demos/generate/:itemId — Run render pipeline for an item ──────

router.post(
	"/generate/:itemId",
	async (req: express.Request, res: express.Response) => {
		try {
			const itemId = parseInt(req.params.itemId as string, 10);
			if (isNaN(itemId) || itemId < 1) {
				res.status(400).json({ error: "Invalid itemId" });
				return;
			}

			// Fetch item
			const [item] = await db
				.select()
				.from(items)
				.where(eq(items.id, itemId));

			if (!item) {
				res.status(404).json({ error: "Item not found" });
				return;
			}

			// Build source files from item_files or code
			let sourceFiles: { name: string; code: string; language?: string | undefined }[] =
				[];

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
				// Single snippet — treat as one file
				sourceFiles = [
					{
						name: `${item.name}.tsx`,
						code: item.code,
						language: item.language || "typescript",
					},
				];
			}

			if (sourceFiles.length === 0) {
				res
					.status(400)
					.json({ error: "Item has no source files for demo generation" });
				return;
			}

			// Optional: childItemMap from request body (if hierarchy pipeline ran)
			const childItemMap = req.body.childItemMap
				? new Map<string, number>(Object.entries(req.body.childItemMap))
				: undefined;

			const result = await runRenderPipeline(
				itemId,
				sourceFiles,
				childItemMap,
			);

			res.status(201).json({ data: result });
		} catch (e) {
			console.error(e);
			res.status(500).json({ error: "Internal server error" });
		}
	},
);

// ── DELETE /api/demos/:id — Delete a demo ───────────────────────────────────

router.delete("/:id", async (req: express.Request, res: express.Response) => {
	try {
		const id = parseInt(req.params.id as string, 10);
		if (isNaN(id) || id < 1) {
			res.status(400).json({ error: "Invalid id" });
			return;
		}

		const deleted = await db
			.delete(demos)
			.where(eq(demos.id, id))
			.returning();

		if (deleted.length === 0) {
			res.status(404).json({ error: "Demo not found" });
			return;
		}

		res.status(200).json({ data: deleted[0] });
	} catch (e) {
		console.error(e);
		res.status(500).json({ error: "Internal server error" });
	}
});

export default router;

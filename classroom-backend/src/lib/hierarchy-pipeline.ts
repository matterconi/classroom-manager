/**
 * Hierarchy Pipeline — Decomposes a multi-file organism into structural pieces.
 *
 * Pipeline 1 of 2 (before Render). Takes an organism item and its files,
 * decomposes into sub_organisms/molecules/atoms, then for each piece:
 * - Checks similarity against existing items
 * - If match: judge decides (variant/expansion → reuse existing, or new)
 * - Creates belongs_to edges linking pieces to the organism
 *
 * The pipeline interleaves Hierarchy (structural) and AIA (semantic) decisions:
 * for each piece, the judge decides inline whether to reuse an existing item
 * or create a new one. This avoids duplicates.
 */

import { eq, and, sql, asc } from "drizzle-orm";
import { db } from "../db/index.js";
import { items, edges } from "../db/schema/index.js";
import type { ItemKind } from "../db/schema/app.js";
import { decompose } from "./render-pipeline.js";
import { generateJSON } from "./deepseek.js";
import { generateEmbedding } from "./embeddings.js";
import { rerankCandidates, type ScoringFields } from "./scoring.js";
import {
	JUDGE_SYSTEM_PROMPT,
	buildJudgeUserPrompt,
	type JudgeCandidateInput,
} from "./prompts.js";

// ── Types ────────────────────────────────────────────────────────────────────

type FileInput = { name: string; code: string; language?: string | undefined };

type DecomposePiece = {
	name: string;
	description: string;
	is_demoable: boolean;
	files: string[];
	parent?: string | undefined;
};

type DecomposeResult = {
	organism: DecomposePiece;
	sub_organisms: DecomposePiece[];
	molecules: DecomposePiece[];
	atoms: DecomposePiece[];
};

type JudgeMatch = {
	candidateId: number;
	verdict: "variant" | "parent_of" | "expansion";
	confidence: number;
	reasoning: string;
};

type JudgeResponse = {
	matches: JudgeMatch[];
};

type PieceRecord = {
	name: string;
	itemId: number;
	level: string;
	action: "created" | "reused";
	makeDemo: boolean;
};

type EdgeRecord = {
	sourceId: number;
	targetId: number;
	type: string;
};

export type HierarchyResult = {
	decomposition: DecomposeResult;
	items: PieceRecord[];
	edges: EdgeRecord[];
};

// ── Constants ────────────────────────────────────────────────────────────────

const EMBEDDING_THRESHOLD = 0.70;
const SIMILARITY_LIMIT = 15;
const RERANK_TOP = 5;

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(text: string): string {
	return text.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
}

function levelToKind(level: string): ItemKind {
	switch (level) {
		case "sub_organism":
			return "collection";
		case "molecule":
			return "component";
		case "atom":
			return "snippet";
		default:
			return "component";
	}
}

/**
 * Find similar items via embedding + structural reranking + family enrichment.
 * Returns enriched candidates ready for the judge, or empty array if no match.
 */
async function findSimilarCandidates(
	name: string,
	description: string,
): Promise<JudgeCandidateInput[]> {
	const embeddingText = [name, description].filter(Boolean).join(" ");
	const embedding = await generateEmbedding(embeddingText);
	if (!embedding) return [];

	const vectorStr = `[${embedding.join(",")}]`;

	// Step 1: Vector search
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
				sql`1 - (${items.embedding} <=> ${vectorStr}::vector) > ${EMBEDDING_THRESHOLD}`,
			),
		)
		.orderBy(sql`${items.embedding} <=> ${vectorStr}::vector`)
		.limit(SIMILARITY_LIMIT);

	if (similarRaw.length === 0) return [];

	// Step 2: Structural reranking
	const newItemScoring: ScoringFields = {};
	const top = rerankCandidates(newItemScoring, similarRaw, RERANK_TOP);

	// Step 3: Family enrichment
	const candidateIds = top.map((c) => c.id);

	const familyEdges = await db
		.select({
			sourceId: edges.sourceId,
			targetId: edges.targetId,
		})
		.from(edges)
		.where(
			and(
				eq(edges.type, "parent"),
				sql`(${edges.sourceId} IN (${sql.join(candidateIds.map((id) => sql`${id}`), sql`, `)}) OR ${edges.targetId} IN (${sql.join(candidateIds.map((id) => sql`${id}`), sql`, `)}))`,
			),
		);

	// Fetch related item names
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
			.where(
				sql`${items.id} IN (${sql.join(relatedIdArray.map((id) => sql`${id}`), sql`, `)})`,
			);
	}

	const nameMap = new Map<number, string>();
	for (const item of relatedItems) nameMap.set(item.id, item.name);
	for (const c of top) nameMap.set(c.id, c.name);

	// Build enriched candidates
	return top.map((c) => {
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
				.filter(
					(e) => e.sourceId === parentEdge.sourceId && e.targetId !== c.id,
				)
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
}

/**
 * Resolve an item: check similarity, ask judge, return existing ID or create new.
 * Also creates semantic edges (parent/expansion) if the judge says so.
 */
async function resolveItem(
	piece: DecomposePiece,
	level: string,
	context: string,
): Promise<{ itemId: number; action: "created" | "reused" }> {
	const kind = levelToKind(level);

	// Build description with context for better matching
	const richDescription = context
		? `${piece.description}. Context: ${context}`
		: piece.description;

	// Find candidates
	const candidates = await findSimilarCandidates(piece.name, richDescription);

	if (candidates.length > 0) {
		// Ask judge
		const judgeResult = await generateJSON<JudgeResponse>(
			JUDGE_SYSTEM_PROMPT,
			buildJudgeUserPrompt(
				{
					name: piece.name,
					code: piece.description, // No code for composites — use description
					description: richDescription,
				},
				candidates,
			),
		);

		if (judgeResult.matches.length > 0) {
			const bestMatch = judgeResult.matches[0]!;

			// Create semantic edge based on verdict
			if (bestMatch.verdict === "variant" || bestMatch.verdict === "parent_of") {
				// Reuse existing item — the piece is a variant or parent of existing
				console.log(
					`[hierarchy] Reusing item ${bestMatch.candidateId} for "${piece.name}" (${bestMatch.verdict}, confidence: ${bestMatch.confidence})`,
				);
				return { itemId: bestMatch.candidateId, action: "reused" };
			}

			if (bestMatch.verdict === "expansion") {
				// Expansion: create new item but also create expansion edge
				const itemId = await createItem(piece, kind);
				await db.insert(edges).values({
					sourceId: itemId,
					targetId: bestMatch.candidateId,
					resource: "item",
					type: "expansion",
					metadata: {
						title: piece.name,
						description: piece.description,
						sourceName: piece.name,
						createdAt: new Date().toISOString(),
					},
				});
				console.log(
					`[hierarchy] Created item ${itemId} as expansion of ${bestMatch.candidateId} for "${piece.name}"`,
				);
				return { itemId, action: "created" };
			}
		}
	}

	// No match or no candidates — create new item
	const itemId = await createItem(piece, kind);
	console.log(`[hierarchy] Created new item ${itemId} for "${piece.name}"`);
	return { itemId, action: "created" };
}

/**
 * Create a new item in the DB with embedding.
 */
async function createItem(
	piece: DecomposePiece,
	kind: ItemKind,
): Promise<number> {
	const slug = slugify(piece.name) + "-" + Date.now();

	const [created] = await db
		.insert(items)
		.values({
			kind,
			name: piece.name,
			slug,
			code: null, // Composites have no code — their code IS their constituents
			description: piece.description,
		})
		.returning();

	if (!created) throw new Error(`Failed to create item for "${piece.name}"`);

	// Generate embedding
	try {
		const embeddingText = `${piece.name} ${piece.description}`;
		const embedding = await generateEmbedding(embeddingText);
		if (embedding) {
			await db
				.update(items)
				.set({ embedding })
				.where(eq(items.id, created.id));
		}
	} catch (err) {
		console.error(`[hierarchy] Embedding failed for "${piece.name}":`, err);
	}

	return created.id;
}

/**
 * Create a belongs_to edge: source (child) belongs to target (parent group).
 */
async function createBelongsToEdge(
	childId: number,
	parentId: number,
	metadata?: Record<string, unknown>,
): Promise<void> {
	await db.insert(edges).values({
		sourceId: childId,
		targetId: parentId,
		resource: "item",
		type: "belongs_to",
		metadata: metadata || {},
	});
}

// ── Main Pipeline ────────────────────────────────────────────────────────────

/**
 * Run the hierarchy pipeline for an organism item.
 *
 * Decomposes the organism's source files, then for each piece:
 * 1. Checks similarity + asks judge (reuse existing or create new)
 * 2. Creates belongs_to edges linking pieces to the organism
 *
 * Processing order: sub_organisms → molecules → atoms (top-down).
 * Each level provides context to the judge for better classification.
 */
export async function runHierarchyPipeline(
	organismItemId: number,
	sourceFiles: FileInput[],
): Promise<HierarchyResult> {
	// Step 1: Decompose
	const decomposition = await decompose(sourceFiles);
	const records: PieceRecord[] = [];
	const edgeRecords: EdgeRecord[] = [];

	// Map piece names → resolved item IDs (for parent lookup)
	const resolvedItems = new Map<string, number>();
	resolvedItems.set(decomposition.organism.name, organismItemId);

	// Step 2: Process sub_organisms → belong to organism
	const moleculeContext = decomposition.molecules
		.slice(0, 3)
		.map((m) => `${m.name}: ${m.description}`)
		.join("; ");

	for (const subOrg of decomposition.sub_organisms) {
		try {
			const context = `Sub-organism of "${decomposition.organism.name}". Contains molecules: ${moleculeContext}`;
			const { itemId, action } = await resolveItem(
				subOrg,
				"sub_organism",
				context,
			);

			resolvedItems.set(subOrg.name, itemId);

			const parentId = resolvedItems.get(subOrg.parent || "") || organismItemId;
			await createBelongsToEdge(itemId, parentId, {
				level: "sub_organism",
			});
			edgeRecords.push({
				sourceId: itemId,
				targetId: parentId,
				type: "belongs_to",
			});

			records.push({
				name: subOrg.name,
				itemId,
				level: "sub_organism",
				action,
				makeDemo: subOrg.is_demoable,
			});
		} catch (err) {
			console.error(
				`[hierarchy] Failed to process sub_organism "${subOrg.name}":`,
				err,
			);
		}
	}

	// Step 3: Process molecules → belong to organism or sub_organism (via parent field)
	for (const molecule of decomposition.molecules) {
		try {
			const fileContext = molecule.files.slice(0, 5).join(", ");
			const context = `Molecule of "${decomposition.organism.name}". Files: ${fileContext}`;
			const { itemId, action } = await resolveItem(
				molecule,
				"molecule",
				context,
			);

			resolvedItems.set(molecule.name, itemId);

			const parentId = resolvedItems.get(molecule.parent || "") || organismItemId;
			await createBelongsToEdge(itemId, parentId, {
				level: "molecule",
			});
			edgeRecords.push({
				sourceId: itemId,
				targetId: parentId,
				type: "belongs_to",
			});

			records.push({
				name: molecule.name,
				itemId,
				level: "molecule",
				action,
				makeDemo: molecule.is_demoable,
			});
		} catch (err) {
			console.error(
				`[hierarchy] Failed to process molecule "${molecule.name}":`,
				err,
			);
		}
	}

	// Step 4: Process atoms → belong to their molecule or sub_organism (via parent field)
	for (const atom of decomposition.atoms) {
		try {
			const context = `Atom of "${decomposition.organism.name}". File: ${atom.files[0] || atom.name}`;
			const { itemId, action } = await resolveItem(atom, "atom", context);

			resolvedItems.set(atom.name, itemId);

			const parentId = resolvedItems.get(atom.parent || "") || organismItemId;
			await createBelongsToEdge(itemId, parentId, { level: "atom" });
			edgeRecords.push({
				sourceId: itemId,
				targetId: parentId,
				type: "belongs_to",
			});

			records.push({
				name: atom.name,
				itemId,
				level: "atom",
				action,
				makeDemo: atom.is_demoable,
			});
		} catch (err) {
			console.error(
				`[hierarchy] Failed to process atom "${atom.name}":`,
				err,
			);
		}
	}

	return {
		decomposition,
		items: records,
		edges: edgeRecords,
	};
}

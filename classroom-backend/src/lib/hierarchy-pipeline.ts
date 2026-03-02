/**
 * Hierarchy Pipeline v3 — Recursive decompose + resolve fused.
 *
 * Each recursive step:
 *   1. RESOLVE the current piece (auto-reuse → search → judge → create)
 *   2. If created: DECOMPOSE into children (1 LLM call)
 *   3. RECURSE on children
 *   4. If reused: skip decompose (children already exist)
 *
 * Flow:
 *   outline(files) → organism + direct children (sub_organisms/molecules)
 *   for each sub_organism: resolve → decomposeChildren → recurse
 *   for each molecule: resolve → extractAtoms → resolve each atom
 *   orphan files → decomposeChildren → same recursive treatment
 */

import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { items, edges } from "../db/schema/index.js";
import type { ItemKind } from "../db/schema/app.js";
import { generateJSON } from "./deepseek.js";
import { generateEmbedding } from "./embeddings.js";
import { rerankCandidates, type ScoringFields } from "./scoring.js";
import {
	JUDGE_SYSTEM_PROMPT,
	buildJudgeUserPrompt,
	DECOMPOSE_OUTLINE_SYSTEM_PROMPT,
	buildOutlineUserPrompt,
	DECOMPOSE_CHILDREN_SYSTEM_PROMPT,
	buildDecomposeChildrenUserPrompt,
	DECOMPOSE_DETAIL_SYSTEM_PROMPT,
	buildDetailUserPrompt,
	type JudgeCandidateInput,
} from "./prompts.js";

// ── Types ────────────────────────────────────────────────────────────────────

type FileInput = { name: string; code: string; language?: string | undefined };

export type OutlineOrganism = {
	name: string;
	description: string;
	kind: string;
	type: string | null;
	domain: string | null;
	stack: string | null;
	language: string | null;
	category: string | null;
	libraries: string[] | null;
	tags: string[] | null;
	useCases: { title: string; use: string }[] | null;
	entryFile: string | null;
	is_demoable: boolean;
	files: string[];
};

type OutlinePiece = {
	name: string;
	description: string;
	is_demoable: boolean;
	files: string[];
	parent?: string | undefined;
};

export type OutlineResult = {
	organism: OutlineOrganism;
	sub_organisms: OutlinePiece[];
	molecules: OutlinePiece[];
};

type DecomposeChildrenResult = {
	sub_organisms: OutlinePiece[];
	molecules: OutlinePiece[];
};

type DetailAtom = {
	name: string;
	description: string;
	code: string;
	is_demoable: boolean;
};

type PieceToResolve = {
	name: string;
	description: string;
	code?: string | undefined;
	is_demoable: boolean;
	files: string[];
	parent?: string | undefined;
};

type JudgeResponse = {
	matches: {
		candidateId: number;
		verdict: "variant" | "parent_of" | "expansion";
		confidence: number;
		reasoning: string;
	}[];
};

type ResolveResult = {
	itemId: number;
	action: "created" | "reused";
	verdict: "clone" | "variant" | "parent_of" | "expansion" | null;
	matchedItemId: number | null;
};

export type PieceRecord = {
	name: string;
	itemId: number;
	level: string;
	action: "created" | "reused";
	makeDemo: boolean;
	verdict: "clone" | "variant" | "parent_of" | "expansion" | null;
	matchedItemId: number | null;
	code?: string | undefined;
	files: string[];
};

type EdgeRecord = {
	sourceId: number;
	targetId: number;
	type: string;
};

export type LogEntry = {
	ts: string;
	step: string;
	level?: string;
	item?: string;
	detail: string;
	data?: unknown;
};

export type HierarchyResult = {
	items: PieceRecord[];
	edges: EdgeRecord[];
	logs: LogEntry[];
};

// ── Logger ───────────────────────────────────────────────────────────────────

function plog(
	logs: LogEntry[],
	step: string,
	detail: string,
	extra?: { level?: string; item?: string; data?: unknown },
): void {
	const entry: LogEntry = {
		ts: new Date().toISOString(),
		step,
		detail,
		...extra,
	};
	logs.push(entry);
	console.log(`[hierarchy][${step}]${extra?.item ? ` ${extra.item}:` : ""} ${detail}`);
}

// ── Constants ────────────────────────────────────────────────────────────────

const EMBEDDING_THRESHOLD = 0.7;
const AUTO_REUSE_THRESHOLD = 0.875;
const SIMILARITY_LIMIT = 15;
const RERANK_TOP = 5;
const SIGNATURE_LINES = 30;

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

// ── Phase 1a: Outline + Classify ─────────────────────────────────────────────

/**
 * Decompose files into an outline: organism classification + direct children.
 * Only sends file signatures (~30 lines each), not full code.
 * Returns sub_organisms and molecules — NO atoms (extracted later per molecule).
 */
export async function decomposeOutline(
	files: FileInput[],
	meta?: {
		types?: string[];
		domains?: string[];
		tags?: string[];
		categories?: string[];
	},
): Promise<OutlineResult> {
	const signatures = files.map((f) => ({
		name: f.name,
		signature: f.code.split("\n").slice(0, SIGNATURE_LINES).join("\n"),
	}));
	const userPrompt = buildOutlineUserPrompt(signatures, meta);
	return generateJSON<OutlineResult>(
		DECOMPOSE_OUTLINE_SYSTEM_PROMPT,
		userPrompt,
	);
}

// ── Phase 1b: Decompose Children (sub_organism → sub_organisms/molecules) ───

/**
 * Decompose a sub_organism into its direct children.
 * Sends FULL code (not signatures) for accurate decomposition.
 * Can return sub_organisms (recursive) and/or molecules.
 */
async function decomposeChildren(
	parentName: string,
	parentDescription: string,
	files: FileInput[],
	logs: LogEntry[],
): Promise<DecomposeChildrenResult> {
	plog(logs, "decompose-children", `Decomposing "${parentName}" (${files.length} files)`, { item: parentName });
	const result = await generateJSON<DecomposeChildrenResult>(
		DECOMPOSE_CHILDREN_SYSTEM_PROMPT,
		buildDecomposeChildrenUserPrompt(parentName, parentDescription, files),
	);
	plog(logs, "decompose-children", `Result: ${result.sub_organisms.length} sub_organisms, ${result.molecules.length} molecules`, {
		item: parentName,
		data: {
			sub_organisms: result.sub_organisms.map((s) => s.name),
			molecules: result.molecules.map((m) => m.name),
		},
	});
	return result;
}

// ── Phase 1c: Atom Extraction ────────────────────────────────────────────────

/**
 * Extract atoms from a molecule's full source files.
 * Called only for NEW molecules (reused ones already have atoms).
 */
async function extractAtoms(
	moleculeName: string,
	moleculeFiles: FileInput[],
	logs: LogEntry[],
): Promise<DetailAtom[]> {
	plog(logs, "extract-atoms", `Extracting atoms from "${moleculeName}" (${moleculeFiles.length} files)`, { item: moleculeName });
	const result = await generateJSON<{ atoms: DetailAtom[] }>(
		DECOMPOSE_DETAIL_SYSTEM_PROMPT,
		buildDetailUserPrompt(moleculeName, moleculeFiles),
	);
	plog(logs, "extract-atoms", `Found ${result.atoms.length} atoms: ${result.atoms.map((a) => a.name).join(", ")}`, {
		item: moleculeName,
		data: result.atoms.map((a) => ({ name: a.name, is_demoable: a.is_demoable })),
	});
	return result.atoms;
}

// ── Phase 2: Auto-reuse ──────────────────────────────────────────────────────

type AutoReuseResult = {
	reused: boolean;
	itemId?: number;
	embedding: number[] | undefined;
};

/**
 * Try to auto-reuse an existing item by name + kind + vector similarity.
 *
 * Always generates 1 OAI embedding (reused downstream).
 * If name+kind matches AND cosine ≥ 0.875 → auto-reuse (skip judge).
 * Otherwise returns the embedding for the caller to reuse in search/create.
 */
async function tryAutoReuse(
	name: string,
	kind: ItemKind,
	description: string,
	logs: LogEntry[],
): Promise<AutoReuseResult> {
	plog(logs, "auto-reuse", `Trying auto-reuse for "${name}" (kind: ${kind})`, { item: name });

	const embeddingText = [name, description].filter(Boolean).join(" ");
	const embedding = await generateEmbedding(embeddingText);
	if (!embedding) {
		plog(logs, "auto-reuse", `Embedding generation failed — skipping`, { item: name });
		return { reused: false, embedding: undefined };
	}

	plog(logs, "auto-reuse", `Embedding generated (${embedding.length} dims)`, { item: name });

	const vectorStr = `[${embedding.join(",")}]`;

	// Name + kind + cosine check in a single SQL query (btree + vector)
	const [match] = await db
		.select({
			id: items.id,
			name: items.name,
			similarity:
				sql<number>`1 - (${items.embedding} <=> ${vectorStr}::vector)`,
		})
		.from(items)
		.where(
			and(
				sql`LOWER(${items.name}) = LOWER(${name})`,
				sql`${items.kind} = ${kind}`,
				sql`${items.embedding} IS NOT NULL`,
			),
		)
		.orderBy(sql`${items.embedding} <=> ${vectorStr}::vector`)
		.limit(1);

	if (match && match.similarity >= AUTO_REUSE_THRESHOLD) {
		plog(logs, "auto-reuse", `AUTO-REUSE HIT: "${name}" → item #${match.id} "${match.name}" (cosine: ${match.similarity.toFixed(3)})`, {
			item: name,
			data: { matchedId: match.id, matchedName: match.name, similarity: match.similarity },
		});
		return { reused: true, itemId: match.id, embedding };
	}

	if (match) {
		plog(logs, "auto-reuse", `Name match found but below threshold: item #${match.id} "${match.name}" (cosine: ${match.similarity.toFixed(3)}, threshold: ${AUTO_REUSE_THRESHOLD})`, { item: name });
	} else {
		plog(logs, "auto-reuse", `No name+kind match found in DB`, { item: name });
	}

	return { reused: false, embedding };
}

// ── Similarity Search + Family Enrichment ────────────────────────────────────

/** Enrich candidate items with parent/child/sibling family context from edges. */
async function enrichWithFamilyContext(
	candidateIds: number[],
	topCandidates: {
		id: number;
		name: string;
		code: string | null;
		description: string | null;
		combinedScore: number;
	}[],
): Promise<JudgeCandidateInput[]> {
	if (candidateIds.length === 0) return [];

	const familyEdges = await db
		.select({ sourceId: edges.sourceId, targetId: edges.targetId })
		.from(edges)
		.where(
			and(
				eq(edges.type, "parent"),
				sql`(${edges.sourceId} IN (${sql.join(candidateIds.map((id) => sql`${id}`), sql`, `)}) OR ${edges.targetId} IN (${sql.join(candidateIds.map((id) => sql`${id}`), sql`, `)}))`,
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
			.where(
				sql`${items.id} IN (${sql.join(relatedIdArray.map((id) => sql`${id}`), sql`, `)})`,
			);
	}

	const nameMap = new Map<number, string>();
	for (const item of relatedItems) nameMap.set(item.id, item.name);
	for (const c of topCandidates) nameMap.set(c.id, c.name);

	return topCandidates.map((c) => {
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
				name:
					nameMap.get(parentEdge.sourceId) || `#${parentEdge.sourceId}`,
			};
			siblings = familyEdges
				.filter(
					(e) =>
						e.sourceId === parentEdge.sourceId &&
						e.targetId !== c.id,
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
 * Full embedding search + structural reranking + family enrichment.
 * Accepts precomputed embedding to avoid regenerating it.
 */
async function findSimilarCandidates(
	name: string,
	description: string,
	logs: LogEntry[],
	precomputedEmbedding?: number[],
): Promise<{ candidates: JudgeCandidateInput[]; embedding: number[] | undefined }> {
	const embedding =
		precomputedEmbedding ||
		(await generateEmbedding(
			[name, description].filter(Boolean).join(" "),
		));
	if (!embedding) return { candidates: [], embedding: undefined };

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
			similarity:
				sql<number>`1 - (${items.embedding} <=> ${vectorStr}::vector)`,
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

	plog(logs, "search", `Embedding search for "${name}": ${similarRaw.length} results above threshold ${EMBEDDING_THRESHOLD}`, {
		item: name,
		data: similarRaw.map((r) => ({ id: r.id, name: r.name, similarity: Number(r.similarity.toFixed(3)) })),
	});

	if (similarRaw.length === 0) return { candidates: [], embedding };

	const newItemScoring: ScoringFields = {};
	const top = rerankCandidates(newItemScoring, similarRaw, RERANK_TOP);

	plog(logs, "rerank", `Top ${top.length} after reranking: ${top.map((c) => `#${c.id} "${c.name}" (${c.combinedScore.toFixed(3)})`).join(", ")}`, { item: name });

	const candidateIds = top.map((c) => c.id);
	const enriched = await enrichWithFamilyContext(candidateIds, top);

	return { candidates: enriched, embedding };
}

// ── Resolution ───────────────────────────────────────────────────────────────

/**
 * Resolve a piece: cascade through auto-reuse → search → judge → create.
 * Always generates exactly 1 OAI embedding, reused across all steps.
 */
async function resolveItem(
	piece: PieceToResolve,
	level: string,
	context: string,
	logs: LogEntry[],
): Promise<ResolveResult> {
	const kind = levelToKind(level);

	plog(logs, "resolve", `── Resolving "${piece.name}" (level: ${level}, kind: ${kind}) ──`, { level, item: piece.name });

	// Cascade 1: Auto-reuse by name + kind + vector ≥ 0.875
	const autoReuse = await tryAutoReuse(piece.name, kind, piece.description, logs);

	if (autoReuse.reused && autoReuse.itemId) {
		plog(logs, "resolve", `RESULT: REUSED (clone) → item #${autoReuse.itemId}`, { level, item: piece.name });
		return {
			itemId: autoReuse.itemId,
			action: "reused",
			verdict: "clone",
			matchedItemId: autoReuse.itemId,
		};
	}

	// Cascade 2: Full embedding search (reuse embedding from auto-reuse)
	const richDescription = context
		? `${piece.description}. Context: ${context}`
		: piece.description;
	const { candidates, embedding } = await findSimilarCandidates(
		piece.name,
		richDescription,
		logs,
		autoReuse.embedding, // reuse — no extra OAI call
	);

	if (candidates.length > 0) {
		plog(logs, "judge", `Sending ${candidates.length} candidates to judge for "${piece.name}"`, {
			item: piece.name,
			data: candidates.map((c) => ({ id: c.id, name: c.name, role: c.role, score: c.combinedScore })),
		});

		// Ask judge (1 DS call)
		const judgeResult = await generateJSON<JudgeResponse>(
			JUDGE_SYSTEM_PROMPT,
			buildJudgeUserPrompt(
				{
					name: piece.name,
					code: piece.code || piece.description,
					description: richDescription,
				},
				candidates,
			),
		);

		plog(logs, "judge", `Judge response: ${judgeResult.matches.length} matches`, {
			item: piece.name,
			data: judgeResult.matches.map((m) => ({
				candidateId: m.candidateId,
				verdict: m.verdict,
				confidence: m.confidence,
				reasoning: m.reasoning,
			})),
		});

		if (judgeResult.matches.length > 0) {
			const best = judgeResult.matches[0]!;

			if (best.verdict === "parent_of") {
				plog(logs, "resolve", `RESULT: REUSED (parent_of) → item #${best.candidateId} (confidence: ${best.confidence})`, { level, item: piece.name });
				return {
					itemId: best.candidateId,
					action: "reused",
					verdict: "parent_of",
					matchedItemId: best.candidateId,
				};
			}

			if (best.verdict === "variant") {
				const itemId = await createItem(piece, kind, logs, autoReuse.embedding || embedding);
				await db.insert(edges).values({
					sourceId: itemId,
					targetId: best.candidateId,
					resource: "item",
					type: "expansion",
					metadata: {
						title: piece.name,
						description: piece.description,
						sourceName: piece.name,
						createdAt: new Date().toISOString(),
						relationship: "variant",
					},
				});
				plog(logs, "edge", `Created expansion edge: item #${itemId} → #${best.candidateId} (variant)`, {
					item: piece.name,
					data: { sourceId: itemId, targetId: best.candidateId, type: "expansion" },
				});
				plog(logs, "resolve", `RESULT: CREATED (variant of #${best.candidateId}) → item #${itemId}`, { level, item: piece.name });
				return {
					itemId,
					action: "created",
					verdict: "variant",
					matchedItemId: best.candidateId,
				};
			}

			if (best.verdict === "expansion") {
				const itemId = await createItem(piece, kind, logs, autoReuse.embedding || embedding);
				await db.insert(edges).values({
					sourceId: itemId,
					targetId: best.candidateId,
					resource: "item",
					type: "expansion",
					metadata: {
						title: piece.name,
						description: piece.description,
						sourceName: piece.name,
						createdAt: new Date().toISOString(),
					},
				});
				plog(logs, "edge", `Created expansion edge: item #${itemId} → #${best.candidateId} (expansion)`, {
					item: piece.name,
					data: { sourceId: itemId, targetId: best.candidateId, type: "expansion" },
				});
				plog(logs, "resolve", `RESULT: CREATED (expansion of #${best.candidateId}) → item #${itemId}`, { level, item: piece.name });
				return {
					itemId,
					action: "created",
					verdict: "expansion",
					matchedItemId: best.candidateId,
				};
			}
		}
	} else {
		plog(logs, "search", `No candidates found — skipping judge`, { item: piece.name });
	}

	// Cascade 3: No match — create new (reuse embedding)
	const itemId = await createItem(piece, kind, logs, autoReuse.embedding || embedding);
	plog(logs, "resolve", `RESULT: CREATED (new, no match) → item #${itemId}`, { level, item: piece.name });
	return { itemId, action: "created", verdict: null, matchedItemId: null };
}

// ── Create Item ──────────────────────────────────────────────────────────────

async function createItem(
	piece: PieceToResolve,
	kind: ItemKind,
	logs: LogEntry[],
	precomputedEmbedding?: number[],
): Promise<number> {
	const slug = slugify(piece.name) + "-" + Date.now();

	const [created] = await db
		.insert(items)
		.values({
			kind,
			name: piece.name,
			slug,
			code: piece.code || null,
			description: piece.description,
		})
		.returning();

	if (!created) throw new Error(`Failed to create item for "${piece.name}"`);

	plog(logs, "create-item", `Inserted item #${created.id} "${piece.name}" (kind: ${kind}, code: ${piece.code ? "yes" : "no"})`, {
		item: piece.name,
		data: { id: created.id, kind, hasCode: !!piece.code },
	});

	// Use precomputed embedding if available, otherwise generate (fallback)
	try {
		const embedding =
			precomputedEmbedding ||
			(await generateEmbedding(`${piece.name} ${piece.description}`));
		if (embedding) {
			await db
				.update(items)
				.set({ embedding })
				.where(eq(items.id, created.id));
			plog(logs, "create-item", `Embedding saved for item #${created.id}`, { item: piece.name });
		}
	} catch (err) {
		plog(logs, "create-item", `Embedding FAILED for item #${created.id}: ${err}`, { item: piece.name });
	}

	return created.id;
}

// ── Belongs-to Edge ──────────────────────────────────────────────────────────

async function createBelongsToEdge(
	childId: number,
	parentId: number,
	logs: LogEntry[],
	metadata?: Record<string, unknown>,
): Promise<void> {
	await db.insert(edges).values({
		sourceId: childId,
		targetId: parentId,
		resource: "item",
		type: "belongs_to",
		metadata: metadata || {},
	});
	plog(logs, "edge", `Created belongs_to edge: item #${childId} → #${parentId} (${JSON.stringify(metadata || {})})`, {
		data: { sourceId: childId, targetId: parentId, type: "belongs_to", metadata },
	});
}

// ── Recursive Process Children ───────────────────────────────────────────────

/**
 * Process a list of children: resolve each, then recurse.
 *
 * For each sub_organism (SEQUENTIAL):
 *   1. Resolve (auto-reuse → judge → create)
 *   2. If created → decomposeChildren → recurse
 *   3. If reused → skip (children already exist in DB)
 *
 * For each molecule (SEQUENTIAL):
 *   1. Resolve
 *   2. If created → extractAtoms → resolve each atom
 *   3. If reused → skip
 */
async function processChildren(
	subOrganisms: OutlinePiece[],
	molecules: OutlinePiece[],
	parentName: string,
	parentItemId: number,
	sourceFiles: FileInput[],
	records: PieceRecord[],
	edgeRecords: EdgeRecord[],
	resolvedItems: Map<string, number>,
	logs: LogEntry[],
): Promise<void> {
	plog(logs, "process", `Processing children of "${parentName}" (item #${parentItemId}): ${subOrganisms.length} sub_organisms, ${molecules.length} molecules`, {
		item: parentName,
		data: {
			sub_organisms: subOrganisms.map((s) => s.name),
			molecules: molecules.map((m) => m.name),
		},
	});

	// ── Sub-organisms — sequential, 1 at a time ─────────────────────────

	for (const subOrg of subOrganisms) {
		const piece: PieceToResolve = { ...subOrg, parent: parentName };
		const context = `Sub-organism of "${parentName}"`;

		try {
			const result = await resolveItem(piece, "sub_organism", context, logs);
			resolvedItems.set(subOrg.name, result.itemId);

			await createBelongsToEdge(result.itemId, parentItemId, logs, {
				level: "sub_organism",
			});
			edgeRecords.push({
				sourceId: result.itemId,
				targetId: parentItemId,
				type: "belongs_to",
			});
			records.push({
				name: subOrg.name,
				itemId: result.itemId,
				level: "sub_organism",
				action: result.action,
				makeDemo: subOrg.is_demoable,
				verdict: result.verdict,
				matchedItemId: result.matchedItemId,
				files: subOrg.files,
			});

			// If created → decompose children recursively
			if (result.action === "created") {
				const subFiles = sourceFiles.filter((f) =>
					subOrg.files.includes(f.name),
				);
				if (subFiles.length > 0) {
					const children = await decomposeChildren(
						subOrg.name,
						subOrg.description,
						subFiles,
						logs,
					);

					// Recurse
					await processChildren(
						children.sub_organisms,
						children.molecules,
						subOrg.name,
						result.itemId,
						subFiles,
						records,
						edgeRecords,
						resolvedItems,
						logs,
					);
				} else {
					plog(logs, "process", `No source files for sub_organism "${subOrg.name}" — skipping decompose`, { item: subOrg.name });
				}
			} else {
				plog(logs, "process", `Sub_organism "${subOrg.name}" was reused — skipping decompose`, { item: subOrg.name });
			}
		} catch (err) {
			plog(logs, "error", `Failed sub_organism "${subOrg.name}": ${err}`, { item: subOrg.name });
		}
	}

	// ── Molecules — sequential ──────────────────────────────────────────

	for (const molecule of molecules) {
		const piece: PieceToResolve = { ...molecule, parent: parentName };
		const context = `Molecule of "${parentName}"`;

		try {
			const result = await resolveItem(piece, "molecule", context, logs);
			resolvedItems.set(molecule.name, result.itemId);

			await createBelongsToEdge(result.itemId, parentItemId, logs, {
				level: "molecule",
			});
			edgeRecords.push({
				sourceId: result.itemId,
				targetId: parentItemId,
				type: "belongs_to",
			});
			records.push({
				name: molecule.name,
				itemId: result.itemId,
				level: "molecule",
				action: result.action,
				makeDemo: molecule.is_demoable,
				verdict: result.verdict,
				matchedItemId: result.matchedItemId,
				files: molecule.files,
			});

			// If created → extract atoms
			if (result.action === "created") {
				const molFiles = sourceFiles.filter((f) =>
					molecule.files.includes(f.name),
				);
				if (molFiles.length > 0) {
					try {
						const atoms = await extractAtoms(
							molecule.name,
							molFiles,
							logs,
						);

						// Resolve each atom
						for (const atom of atoms) {
							const atomPiece: PieceToResolve = {
								name: atom.name,
								description: atom.description,
								code: atom.code,
								is_demoable: atom.is_demoable,
								files: [],
								parent: molecule.name,
							};
							const atomContext = `Atom of "${molecule.name}"`;

							try {
								const atomResult = await resolveItem(
									atomPiece,
									"atom",
									atomContext,
									logs,
								);
								resolvedItems.set(atom.name, atomResult.itemId);

								await createBelongsToEdge(
									atomResult.itemId,
									result.itemId,
									logs,
									{ level: "atom" },
								);
								edgeRecords.push({
									sourceId: atomResult.itemId,
									targetId: result.itemId,
									type: "belongs_to",
								});
								records.push({
									name: atom.name,
									itemId: atomResult.itemId,
									level: "atom",
									action: atomResult.action,
									makeDemo: atom.is_demoable,
									verdict: atomResult.verdict,
									matchedItemId: atomResult.matchedItemId,
									code: atom.code,
									files: [],
								});
							} catch (err) {
								plog(logs, "error", `Failed atom "${atom.name}": ${err}`, { item: atom.name });
							}
						}
					} catch (err) {
						plog(logs, "error", `Atom extraction failed for "${molecule.name}": ${err}`, { item: molecule.name });
					}
				} else {
					plog(logs, "process", `No source files for molecule "${molecule.name}" — skipping atom extraction`, { item: molecule.name });
				}
			} else {
				plog(logs, "process", `Molecule "${molecule.name}" was reused — skipping atom extraction`, { item: molecule.name });
			}
		} catch (err) {
			plog(logs, "error", `Failed molecule "${molecule.name}": ${err}`, { item: molecule.name });
		}
	}
}

// ── Main Pipeline ────────────────────────────────────────────────────────────

/**
 * Run the hierarchy pipeline for an organism item.
 *
 * Fused decompose + resolve: each step resolves the current piece,
 * then decomposes it to find children, then recurses.
 * Reused pieces skip decomposition (children already exist).
 *
 * Flow:
 *   1. Process outline children (sub_organisms + molecules) recursively
 *   2. Handle orphan files (not assigned by outline)
 */
export async function runHierarchyPipeline(
	organismItemId: number,
	outline: OutlineResult,
	sourceFiles: FileInput[],
): Promise<HierarchyResult> {
	const records: PieceRecord[] = [];
	const edgeRecords: EdgeRecord[] = [];
	const resolvedItems = new Map<string, number>();
	const logs: LogEntry[] = [];

	resolvedItems.set(outline.organism.name, organismItemId);

	plog(logs, "pipeline", `Starting hierarchy pipeline for organism #${organismItemId} "${outline.organism.name}"`, {
		data: {
			organismItemId,
			organismName: outline.organism.name,
			organismKind: outline.organism.kind,
			totalFiles: sourceFiles.length,
			fileNames: sourceFiles.map((f) => f.name),
			outlineSubOrganisms: outline.sub_organisms.map((s) => ({ name: s.name, files: s.files })),
			outlineMolecules: outline.molecules.map((m) => ({ name: m.name, files: m.files })),
		},
	});

	// ── Process outline children recursively ─────────────────────────────

	await processChildren(
		outline.sub_organisms,
		outline.molecules,
		outline.organism.name,
		organismItemId,
		sourceFiles,
		records,
		edgeRecords,
		resolvedItems,
		logs,
	);

	// ── Handle orphan files ──────────────────────────────────────────────

	const assignedFiles = new Set<string>();
	for (const p of outline.sub_organisms) {
		for (const f of p.files) assignedFiles.add(f);
	}
	for (const p of outline.molecules) {
		for (const f of p.files) assignedFiles.add(f);
	}

	const orphanFiles = sourceFiles.filter(
		(f) => !assignedFiles.has(f.name),
	);
	if (orphanFiles.length > 0) {
		plog(logs, "orphans", `${orphanFiles.length} orphan file(s): ${orphanFiles.map((f) => f.name).join(", ")}`, {
			data: { orphanFileNames: orphanFiles.map((f) => f.name) },
		});
		try {
			const orphanResult = await decomposeChildren(
				outline.organism.name,
				"Unassigned files from the organism",
				orphanFiles,
				logs,
			);

			await processChildren(
				orphanResult.sub_organisms,
				orphanResult.molecules,
				outline.organism.name,
				organismItemId,
				orphanFiles,
				records,
				edgeRecords,
				resolvedItems,
				logs,
			);
		} catch (err) {
			plog(logs, "error", `Orphan classification failed: ${err}`);
		}
	} else {
		plog(logs, "orphans", `No orphan files — all assigned by outline`);
	}

	plog(logs, "pipeline", `Pipeline complete: ${records.length} pieces resolved, ${edgeRecords.length} edges created`, {
		data: {
			totalPieces: records.length,
			totalEdges: edgeRecords.length,
			created: records.filter((r) => r.action === "created").length,
			reused: records.filter((r) => r.action === "reused").length,
		},
	});

	return { items: records, edges: edgeRecords, logs };
}

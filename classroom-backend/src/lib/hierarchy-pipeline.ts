/**
 * Hierarchy Pipeline v4 — Unified children + file-partitioned dedup.
 *
 * Changes from v3:
 *   - Unified children array (no more sub_organisms/molecules split)
 *   - Each piece has a `kind` assigned by the LLM
 *   - File-partitioned dedup: Jaccard horizontal (siblings) + vertical (child vs parent)
 *   - Consumed-files tracking: files claimed by a sibling are removed from later siblings
 *   - File link tracking: item_file_links junction table for frontend file display
 *   - Composites (component/structure/collection) → recursively decompose
 *   - Leaves (element/snippet) → extract atoms
 *
 * Each recursive step:
 *   1. RESOLVE the current piece (auto-reuse → search → judge → create)
 *   2. If created + composite: DECOMPOSE into children (1 LLM call) → RECURSE
 *   3. If created + leaf-parent: EXTRACT atoms → resolve each
 *   4. If reused: skip decompose (children already exist)
 */

import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { items, edges, treeNodes, itemFiles, itemFileLinks } from "../db/schema/index.js";
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

type PieceMetadata = {
	type?: string | null;
	domain?: string | null;
	stack?: string | null;
	language?: string | null;
	libraries?: string[] | null;
	tags?: string[] | null;
};

type OrganismFile = {
	name: string;
	is_significant: boolean;
};

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
	files: OrganismFile[];
};

type ChildPiece = {
	name: string;
	kind: ItemKind;
	description: string;
	is_demoable: boolean;
	files: string[];
	parent?: string | undefined;
	metadata?: PieceMetadata;
	// Legacy flat fields (backward compat with outline prompt)
	type?: string | null;
	domain?: string | null;
	stack?: string | null;
	language?: string | null;
	libraries?: string[] | null;
	tags?: string[] | null;
};

export type OutlineResult = {
	organism: OutlineOrganism;
	children: ChildPiece[];
};

type DecomposeChildrenResult = {
	children: ChildPiece[];
};

type DetailAtom = {
	name: string;
	kind?: ItemKind;
	description: string;
	code: string;
	is_demoable: boolean;
	quality_rationale?: string;
	metadata?: PieceMetadata;
	// Legacy flat fields (backward compat)
	type?: string | null;
	domain?: string | null;
	stack?: string | null;
	language?: string | null;
	libraries?: string[] | null;
	tags?: string[] | null;
};

type SkippedAtom = {
	name: string;
	reason: string;
};

type ExtractAtomsResult = {
	atoms: DetailAtom[];
	skipped: SkippedAtom[];
};

type PieceToResolve = {
	name: string;
	description: string;
	code?: string | undefined;
	is_demoable: boolean;
	files: string[];
	parent?: string | undefined;
	metadata?: PieceMetadata | undefined;
	type?: string | null | undefined;
	domain?: string | null | undefined;
	stack?: string | null | undefined;
	language?: string | null | undefined;
	libraries?: string[] | null | undefined;
	tags?: string[] | null | undefined;
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
	kind: ItemKind;
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
const JACCARD_HORIZONTAL_THRESHOLD = 0.7;
const JACCARD_VERTICAL_THRESHOLD = 0.8;

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(text: string): string {
	return text.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
}

/** Is this kind a composite that should be recursively decomposed? */
function isComposite(kind: ItemKind): boolean {
	return kind === "component" || kind === "structure" || kind === "collection";
}

/** Jaccard similarity between two sets of strings. */
function jaccardSimilarity(a: string[], b: string[]): number {
	const setA = new Set(a);
	const setB = new Set(b);
	let intersection = 0;
	for (const item of setA) {
		if (setB.has(item)) intersection++;
	}
	const union = setA.size + setB.size - intersection;
	return union === 0 ? 0 : intersection / union;
}

// ── File Deduplication ───────────────────────────────────────────────────────

/**
 * Deduplicate children pieces based on file overlap.
 *
 * Horizontal: merge siblings with Jaccard ≥ 0.7 on file sets.
 * Vertical: skip children whose file set is ≥ 0.8 similar to parent's.
 * Strip: remove duplicate file assignments (winner = piece with most files).
 */
function deduplicatePieces(
	pieces: ChildPiece[],
	parentFiles: string[],
	logs: LogEntry[],
): ChildPiece[] {
	if (pieces.length === 0) return pieces;

	let result = [...pieces];

	// ── Vertical dedup: skip children too similar to parent ──────────
	result = result.filter((p) => {
		const j = jaccardSimilarity(p.files, parentFiles);
		if (j >= JACCARD_VERTICAL_THRESHOLD) {
			plog(logs, "dedup", `SKIP vertical: "${p.name}" file set too similar to parent (Jaccard: ${j.toFixed(3)})`, { item: p.name });
			return false;
		}
		return true;
	});

	// ── Horizontal dedup: merge siblings with high overlap ──────────
	let merged = true;
	while (merged) {
		merged = false;
		for (let i = 0; i < result.length; i++) {
			for (let j = i + 1; j < result.length; j++) {
				const jac = jaccardSimilarity(result[i]!.files, result[j]!.files);
				if (jac >= JACCARD_HORIZONTAL_THRESHOLD) {
					const bigger = result[i]!.files.length >= result[j]!.files.length ? i : j;
					const smaller = bigger === i ? j : i;
					const mergedFiles = [...new Set([...result[bigger]!.files, ...result[smaller]!.files])];
					plog(logs, "dedup", `MERGE horizontal: "${result[smaller]!.name}" → "${result[bigger]!.name}" (Jaccard: ${jac.toFixed(3)})`, {
						item: result[bigger]!.name,
						data: { absorbed: result[smaller]!.name, jaccard: jac, mergedFiles },
					});
					result[bigger]!.files = mergedFiles;
					result[bigger]!.description = `${result[bigger]!.description}. Also: ${result[smaller]!.description}`;
					result.splice(smaller, 1);
					merged = true;
					break;
				}
			}
			if (merged) break;
		}
	}

	// ── Strip duplicate files across remaining pieces ────────────────
	// Sort by file count descending — bigger pieces claim files first
	result.sort((a, b) => b.files.length - a.files.length);
	const claimed = new Set<string>();
	for (const piece of result) {
		const uniqueFiles = piece.files.filter((f) => !claimed.has(f));
		if (uniqueFiles.length < piece.files.length) {
			plog(logs, "dedup", `STRIP: "${piece.name}" lost ${piece.files.length - uniqueFiles.length} files already claimed by siblings`, { item: piece.name });
		}
		piece.files = uniqueFiles;
		for (const f of uniqueFiles) claimed.add(f);
	}

	// Remove pieces with no files left
	result = result.filter((p) => {
		if (p.files.length === 0) {
			plog(logs, "dedup", `REMOVE: "${p.name}" has no files left after dedup`, { item: p.name });
			return false;
		}
		return true;
	});

	return result;
}

// ── Phase 1a: Outline + Classify ─────────────────────────────────────────────

/**
 * Decompose files into an outline: organism classification + direct children.
 * Only sends file signatures (~30 lines each), not full code.
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
	const raw = await generateJSON<any>(
		DECOMPOSE_OUTLINE_SYSTEM_PROMPT,
		userPrompt,
	);
	// Normalize: support both old format (sub_organisms/molecules) and new (children)
	const children: ChildPiece[] = raw.children || [
		...(raw.sub_organisms || []).map((s: any) => ({ ...s, kind: s.kind || "structure" })),
		...(raw.molecules || []).map((m: any) => ({ ...m, kind: m.kind || "component" })),
	];
	return { organism: raw.organism, children };
}

// ── Phase 1b: Decompose Children ─────────────────────────────────────────────

/**
 * Decompose a composite into its direct children.
 * Sends FULL code (not signatures) for accurate decomposition.
 */
async function decomposeChildren(
	parentName: string,
	parentDescription: string,
	files: FileInput[],
	logs: LogEntry[],
	meta?: { types?: string[]; domains?: string[]; tags?: string[] },
): Promise<DecomposeChildrenResult> {
	plog(logs, "decompose-children", `Decomposing "${parentName}" (${files.length} files)`, { item: parentName });
	const raw = await generateJSON<any>(
		DECOMPOSE_CHILDREN_SYSTEM_PROMPT,
		buildDecomposeChildrenUserPrompt(parentName, parentDescription, files, meta),
	);
	// Normalize: support both old format and new
	const children: ChildPiece[] = raw.children || [
		...(raw.sub_organisms || []).map((s: any) => ({ ...s, kind: s.kind || "structure" })),
		...(raw.molecules || []).map((m: any) => ({ ...m, kind: m.kind || "component" })),
	];
	plog(logs, "decompose-children", `Result: ${children.length} children`, {
		item: parentName,
		data: { children: children.map((c) => ({ name: c.name, kind: c.kind, files: c.files })) },
	});
	return { children };
}

// ── Phase 1c: Atom Extraction ────────────────────────────────────────────────

/**
 * Extract atoms (elements/snippets) from a composite's full source files.
 * Called only for NEW composites (reused ones already have atoms).
 */
async function extractAtoms(
	compositeName: string,
	compositeFiles: FileInput[],
	logs: LogEntry[],
	meta?: { types?: string[]; domains?: string[]; tags?: string[] },
): Promise<ExtractAtomsResult> {
	plog(logs, "extract-atoms", `Extracting atoms from "${compositeName}" (${compositeFiles.length} files)`, { item: compositeName });
	const result = await generateJSON<ExtractAtomsResult>(
		DECOMPOSE_DETAIL_SYSTEM_PROMPT,
		buildDetailUserPrompt(compositeName, compositeFiles, meta),
	);
	// Normalize: ensure skipped array exists
	if (!result.skipped) result.skipped = [];
	plog(logs, "extract-atoms", `Found ${result.atoms.length} atoms, skipped ${result.skipped.length}: ${result.atoms.map((a) => a.name).join(", ")}`, {
		item: compositeName,
		data: {
			kept: result.atoms.map((a) => ({ name: a.name, kind: a.kind, is_demoable: a.is_demoable, rationale: a.quality_rationale })),
			skipped: result.skipped,
		},
	});
	return result;
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
	kind: ItemKind,
	context: string,
	logs: LogEntry[],
	categoryId?: number | null,
): Promise<ResolveResult> {
	plog(logs, "resolve", `── Resolving "${piece.name}" (kind: ${kind}) ──`, { item: piece.name });

	// Cascade 1: Auto-reuse by name + kind + vector ≥ 0.875
	const autoReuse = await tryAutoReuse(piece.name, kind, piece.description, logs);

	if (autoReuse.reused && autoReuse.itemId) {
		plog(logs, "resolve", `RESULT: REUSED (clone) → item #${autoReuse.itemId}`, { item: piece.name });
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
				// The new piece is more abstract — create a tree_node as semantic parent
				const embeddingText = [piece.name, piece.description].filter(Boolean).join(" ");
				const nodeEmbedding = autoReuse.embedding || embedding || await generateEmbedding(embeddingText);
				const nodeMeta: Record<string, unknown> = {};
				const metaType = piece.metadata?.type || piece.type;
				const metaDomain = piece.metadata?.domain || piece.domain;
				const metaStack = piece.metadata?.stack || piece.stack;
				const metaLang = piece.metadata?.language || piece.language;
				if (metaType) nodeMeta.type = metaType;
				if (metaDomain) nodeMeta.domain = metaDomain;
				if (metaStack) nodeMeta.stack = metaStack;
				if (metaLang) nodeMeta.language = metaLang;
				const [newNode] = await db.insert(treeNodes).values({
					name: piece.name,
					description: piece.description,
					code: piece.code || null,
					embedding: nodeEmbedding,
					metadata: nodeMeta,
				}).returning();
				// Link the candidate to this new semantic family
				await db.update(items)
					.set({ semanticNodeId: newNode!.id })
					.where(eq(items.id, best.candidateId));
				plog(logs, "semantic", `Created semantic node #${newNode!.id} "${piece.name}" as parent of item #${best.candidateId}`, { item: piece.name });
				plog(logs, "resolve", `RESULT: REUSED (parent_of) → item #${best.candidateId} (confidence: ${best.confidence})`, { item: piece.name });
				return {
					itemId: best.candidateId,
					action: "reused",
					verdict: "parent_of",
					matchedItemId: best.candidateId,
				};
			}

			if (best.verdict === "variant") {
				const itemId = await createItem(piece, kind, logs, autoReuse.embedding || embedding, categoryId);
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
				// If matched item belongs to a semantic family, join it
				const [matched] = await db
					.select({ semanticNodeId: items.semanticNodeId })
					.from(items)
					.where(eq(items.id, best.candidateId));
				if (matched?.semanticNodeId) {
					await db.update(items)
						.set({ semanticNodeId: matched.semanticNodeId })
						.where(eq(items.id, itemId));
					plog(logs, "semantic", `Joined semantic family node #${matched.semanticNodeId} (variant of #${best.candidateId})`, { item: piece.name });
				}
				plog(logs, "edge", `Created expansion edge: item #${itemId} → #${best.candidateId} (variant)`, {
					item: piece.name,
					data: { sourceId: itemId, targetId: best.candidateId, type: "expansion" },
				});
				plog(logs, "resolve", `RESULT: CREATED (variant of #${best.candidateId}) → item #${itemId}`, { item: piece.name });
				return {
					itemId,
					action: "created",
					verdict: "variant",
					matchedItemId: best.candidateId,
				};
			}

			if (best.verdict === "expansion") {
				const itemId = await createItem(piece, kind, logs, autoReuse.embedding || embedding, categoryId);
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
				plog(logs, "resolve", `RESULT: CREATED (expansion of #${best.candidateId}) → item #${itemId}`, { item: piece.name });
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
	const itemId = await createItem(piece, kind, logs, autoReuse.embedding || embedding, categoryId);
	plog(logs, "resolve", `RESULT: CREATED (new, no match) → item #${itemId}`, { item: piece.name });
	return { itemId, action: "created", verdict: null, matchedItemId: null };
}

// ── Create Item ──────────────────────────────────────────────────────────────

async function createItem(
	piece: PieceToResolve,
	kind: ItemKind,
	logs: LogEntry[],
	precomputedEmbedding?: number[],
	categoryId?: number | null,
): Promise<number> {
	const slug = slugify(piece.name) + "-" + Date.now();

	// Resolve libraries/tags from metadata or flat fields (backward compat)
	const libs = piece.libraries || piece.metadata?.libraries || null;
	const tags = piece.tags || piece.metadata?.tags || null;

	const [created] = await db
		.insert(items)
		.values({
			kind,
			name: piece.name,
			slug,
			code: piece.code || null,
			description: piece.description,
			libraries: libs,
			tags,
			categoryId: categoryId || null,
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

// ── File Link Creation ───────────────────────────────────────────────────────

/**
 * Create item_file_links for a child item, linking it to the organism's item_files.
 * Resolves file names → item_file IDs via the organism's item_files rows.
 */
async function createFileLinks(
	childItemId: number,
	fileNames: string[],
	organismItemId: number,
	logs: LogEntry[],
): Promise<void> {
	if (fileNames.length === 0) return;

	// Find matching item_files from the organism
	const matchingFiles = await db
		.select({ id: itemFiles.id, name: itemFiles.name })
		.from(itemFiles)
		.where(
			and(
				eq(itemFiles.itemId, organismItemId),
				sql`${itemFiles.name} IN (${sql.join(fileNames.map((n) => sql`${n}`), sql`, `)})`,
			),
		);

	if (matchingFiles.length === 0) {
		plog(logs, "file-links", `No matching item_files found for item #${childItemId} (files: ${fileNames.join(", ")})`, {
			data: { childItemId, fileNames, organismItemId },
		});
		return;
	}

	const linkValues = matchingFiles.map((f) => ({
		itemId: childItemId,
		itemFileId: f.id,
	}));

	await db.insert(itemFileLinks).values(linkValues).onConflictDoNothing();

	plog(logs, "file-links", `Created ${matchingFiles.length} file link(s) for item #${childItemId}`, {
		data: { childItemId, linkedFiles: matchingFiles.map((f) => f.name) },
	});
}

// ── Belongs-to Edge ──────────────────────────────────────────────────────────

async function createBelongsToEdge(
	childId: number,
	parentId: number,
	logs: LogEntry[],
	metadata?: Record<string, unknown>,
): Promise<void> {
	// Invariant: no self-loops
	if (childId === parentId) {
		plog(logs, "edge", `SKIP self-loop belongs_to: item #${childId} → #${parentId}`, {
			data: { sourceId: childId, targetId: parentId, reason: "self-loop" },
		});
		return;
	}

	// Invariant: no duplicate belongs_to edges
	const [existing] = await db
		.select({ id: edges.id })
		.from(edges)
		.where(
			and(
				eq(edges.sourceId, childId),
				eq(edges.targetId, parentId),
				eq(edges.type, "belongs_to"),
			),
		)
		.limit(1);

	if (existing) {
		plog(logs, "edge", `SKIP duplicate belongs_to: item #${childId} → #${parentId} (edge #${existing.id} exists)`, {
			data: { sourceId: childId, targetId: parentId, existingEdgeId: existing.id },
		});
		return;
	}

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
 * Process a unified list of children: resolve each, then recurse or extract atoms.
 *
 * For each child (SEQUENTIAL, sorted by files.length desc):
 *   1. Check consumed files — skip if all files already claimed by a sibling
 *   2. Resolve (auto-reuse → judge → create)
 *   3. Create file links (item_file_links)
 *   4. If created + composite kind → decomposeChildren → recurse
 *   5. If created + leaf kind → extractAtoms → resolve each atom
 *   6. If reused → skip (children already exist in DB)
 */
async function processChildren(
	children: ChildPiece[],
	parentName: string,
	parentItemId: number,
	organismItemId: number,
	sourceFiles: FileInput[],
	significantFiles: Set<string>,
	records: PieceRecord[],
	edgeRecords: EdgeRecord[],
	resolvedItems: Map<string, number>,
	logs: LogEntry[],
	meta?: { types?: string[]; domains?: string[]; tags?: string[] },
	categoryId?: number | null,
): Promise<void> {
	plog(logs, "process", `Processing ${children.length} children of "${parentName}" (item #${parentItemId})`, {
		item: parentName,
		data: { children: children.map((c) => ({ name: c.name, kind: c.kind, files: c.files })) },
	});

	// Sort by files.length descending — bigger pieces get priority
	const sorted = [...children].sort((a, b) => b.files.length - a.files.length);

	// Track consumed files within this sibling group
	const consumedFiles = new Set<string>();

	for (const child of sorted) {
		// ── Consumed-files check ─────────────────────────────────────
		const remainingFiles = child.files.filter((f) => !consumedFiles.has(f));
		if (remainingFiles.length === 0) {
			plog(logs, "process", `SKIP "${child.name}": all ${child.files.length} files already consumed by siblings`, { item: child.name });
			continue;
		}
		if (remainingFiles.length < child.files.length) {
			plog(logs, "process", `"${child.name}": removed ${child.files.length - remainingFiles.length} files already consumed by siblings`, { item: child.name });
			child.files = remainingFiles;
		}

		const kind = child.kind;
		const piece: PieceToResolve = { ...child, parent: parentName };
		const context = `Child of "${parentName}" (kind: ${kind})`;

		try {
			const result = await resolveItem(piece, kind, context, logs, categoryId);
			resolvedItems.set(child.name, result.itemId);

			// Mark files as consumed
			for (const f of child.files) consumedFiles.add(f);

			if (result.itemId !== parentItemId) {
				await createBelongsToEdge(result.itemId, parentItemId, logs, { kind });
				edgeRecords.push({
					sourceId: result.itemId,
					targetId: parentItemId,
					type: "belongs_to",
				});
			} else {
				plog(logs, "edge", `Skipped belongs_to: "${child.name}" resolved to parent #${parentItemId} itself`, { item: child.name });
			}

			// Create file links
			if (result.action === "created" && child.files.length > 0) {
				await createFileLinks(result.itemId, child.files, organismItemId, logs);
			}

			records.push({
				name: child.name,
				itemId: result.itemId,
				kind,
				action: result.action,
				makeDemo: child.is_demoable,
				verdict: result.verdict,
				matchedItemId: result.matchedItemId,
				files: child.files,
			});

			// If created → decompose further based on kind
			if (result.action === "created") {
				if (isComposite(kind)) {
					// Composite: recursively decompose into children
					const childFiles = sourceFiles.filter((f) =>
						child.files.includes(f.name),
					);
					if (childFiles.length > 0) {
						const decomposed = await decomposeChildren(
							child.name,
							child.description,
							childFiles,
							logs,
							meta,
						);

						// Deduplicate before recursing
						const parentFileNames = child.files;
						const deduped = deduplicatePieces(decomposed.children, parentFileNames, logs);

						if (deduped.length > 0) {
							// Recurse
							await processChildren(
								deduped,
								child.name,
								result.itemId,
								organismItemId,
								childFiles,
								significantFiles,
								records,
								edgeRecords,
								resolvedItems,
								logs,
								meta,
								categoryId,
							);
						} else {
							// No meaningful children → extract atoms directly
							const sigFiles = childFiles.filter((f) => significantFiles.has(f.name));
							if (sigFiles.length > 0) {
								await processAtomExtraction(
									child.name,
									result.itemId,
									organismItemId,
									sigFiles,
									records,
									edgeRecords,
									resolvedItems,
									logs,
									meta,
									categoryId,
								);
							}
						}
					} else {
						plog(logs, "process", `No source files for "${child.name}" — skipping decompose`, { item: child.name });
					}
				} else {
					// Leaf kind (element/snippet) at an intermediate level with files:
					// extract atoms from the files
					const childFiles = sourceFiles.filter((f) =>
						child.files.includes(f.name) && significantFiles.has(f.name),
					);
					if (childFiles.length > 0) {
						await processAtomExtraction(
							child.name,
							result.itemId,
							organismItemId,
							childFiles,
							records,
							edgeRecords,
							resolvedItems,
							logs,
							meta,
							categoryId,
						);
					}
				}
			} else {
				plog(logs, "process", `"${child.name}" was reused — skipping decompose`, { item: child.name });
			}
		} catch (err) {
			plog(logs, "error", `Failed child "${child.name}": ${err}`, { item: child.name });
		}
	}
}

// ── Atom Extraction Helper ───────────────────────────────────────────────────

/**
 * Extract atoms from a composite's files and resolve each one.
 */
async function processAtomExtraction(
	parentName: string,
	parentItemId: number,
	_organismItemId: number,
	files: FileInput[],
	records: PieceRecord[],
	edgeRecords: EdgeRecord[],
	resolvedItems: Map<string, number>,
	logs: LogEntry[],
	meta?: { types?: string[]; domains?: string[]; tags?: string[] },
	categoryId?: number | null,
): Promise<void> {
	try {
		const extractResult = await extractAtoms(parentName, files, logs, meta);

		// Log skipped atoms
		for (const skipped of extractResult.skipped) {
			plog(logs, "filter", `Skipped atom "${skipped.name}": ${skipped.reason}`, { item: skipped.name });
		}

		// Resolve each kept atom
		for (const atom of extractResult.atoms) {
			const atomKind: ItemKind = atom.kind || "snippet";
			const atomPiece: PieceToResolve = {
				name: atom.name,
				description: atom.description,
				code: atom.code,
				is_demoable: atom.is_demoable,
				files: [],
				parent: parentName,
				metadata: atom.metadata,
				libraries: atom.libraries || atom.metadata?.libraries,
				tags: atom.tags || atom.metadata?.tags,
			};
			const atomContext = `Atom of "${parentName}"`;

			try {
				const atomResult = await resolveItem(
					atomPiece,
					atomKind,
					atomContext,
					logs,
					categoryId,
				);
				resolvedItems.set(atom.name, atomResult.itemId);

				if (atomResult.itemId !== parentItemId) {
					await createBelongsToEdge(
						atomResult.itemId,
						parentItemId,
						logs,
						{ kind: atomKind },
					);
					edgeRecords.push({
						sourceId: atomResult.itemId,
						targetId: parentItemId,
						type: "belongs_to",
					});
				} else {
					plog(logs, "edge", `Skipped belongs_to: "${atom.name}" resolved to parent #${parentItemId} itself`, { item: atom.name });
				}
				records.push({
					name: atom.name,
					itemId: atomResult.itemId,
					kind: atomKind,
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
		plog(logs, "error", `Atom extraction failed for "${parentName}": ${err}`, { item: parentName });
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
 *   1. Deduplicate outline children (horizontal + vertical)
 *   2. Process children recursively (with consumed-files tracking)
 *   3. Handle orphan files
 */
export async function runHierarchyPipeline(
	organismItemId: number,
	outline: OutlineResult,
	sourceFiles: FileInput[],
	meta?: { types?: string[]; domains?: string[]; tags?: string[] },
	categoryId?: number | null,
): Promise<HierarchyResult> {
	const records: PieceRecord[] = [];
	const edgeRecords: EdgeRecord[] = [];
	const resolvedItems = new Map<string, number>();
	const logs: LogEntry[] = [];

	resolvedItems.set(outline.organism.name, organismItemId);

	// Build set of significant file names from outline
	const significantFiles = new Set<string>();
	for (const f of outline.organism.files) {
		if (typeof f === "string") {
			significantFiles.add(f); // Legacy format: all files significant
		} else if (f.is_significant) {
			significantFiles.add(f.name);
		}
	}
	if (significantFiles.size === 0) {
		// Fallback: treat all files as significant
		for (const f of sourceFiles) significantFiles.add(f.name);
	}

	const allFileNames = sourceFiles.map((f) => f.name);

	plog(logs, "pipeline", `Starting hierarchy pipeline for organism #${organismItemId} "${outline.organism.name}"`, {
		data: {
			organismItemId,
			organismName: outline.organism.name,
			organismKind: outline.organism.kind,
			totalFiles: sourceFiles.length,
			fileNames: allFileNames,
			children: outline.children.map((c) => ({ name: c.name, kind: c.kind, files: c.files })),
		},
	});

	// ── Deduplicate outline children ─────────────────────────────────

	const dedupedChildren = deduplicatePieces(outline.children, allFileNames, logs);

	// ── Process outline children recursively ─────────────────────────

	await processChildren(
		dedupedChildren,
		outline.organism.name,
		organismItemId,
		organismItemId,
		sourceFiles,
		significantFiles,
		records,
		edgeRecords,
		resolvedItems,
		logs,
		meta,
		categoryId,
	);

	// ── Handle orphan files ──────────────────────────────────────────

	const assignedFiles = new Set<string>();
	for (const p of dedupedChildren) {
		for (const f of p.files) assignedFiles.add(f);
	}

	const entryFile = outline.organism.entryFile;
	const orphanFiles = sourceFiles.filter(
		(f) => !assignedFiles.has(f.name) && f.name !== entryFile,
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
				meta,
			);

			const orphanFileNames = orphanFiles.map((f) => f.name);
			const dedupedOrphans = deduplicatePieces(orphanResult.children, orphanFileNames, logs);

			await processChildren(
				dedupedOrphans,
				outline.organism.name,
				organismItemId,
				organismItemId,
				orphanFiles,
				significantFiles,
				records,
				edgeRecords,
				resolvedItems,
				logs,
				meta,
				categoryId,
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

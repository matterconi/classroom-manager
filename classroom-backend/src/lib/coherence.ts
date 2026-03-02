// ── Coherence engine — Self-Organizing Knowledge Base ────────────────────────
// Runs async after each insertion. Checks family health and triggers
// split/merge/absorb with a bounded budget to prevent cascade.
//
// Semantic families live in tree_nodes. Items link to their family via
// items.semantic_node_id. Parent edges are NOT used for families.

import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { items, treeNodes } from "../db/schema/index.js";
import {
	averagePairwiseSimilarity,
	cosineSimilarity,
	computeCentroid,
	kMeansBisect,
	THRESHOLDS,
} from "./clustering.js";
import { generateJSON } from "./deepseek.js";
import {
	PARENT_CREATOR_SYSTEM_PROMPT,
	buildParentCreatorUserPrompt,
} from "./prompts.js";
import { generateEmbedding } from "./embeddings.js";

// ── Types ────────────────────────────────────────────────────────────────────

type FamilyMember = {
	id: number;
	name: string;
	code: string;
	description: string | null;
	embedding: number[];
};

type Family = {
	node: {
		id: number;
		name: string;
		code: string | null;
		description: string | null;
		lastCoherenceCheck: Date | null;
	};
	children: FamilyMember[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Fetch a complete family: tree_node + all items linked via semantic_node_id. */
async function getFamily(nodeId: number): Promise<Family | null> {
	const [node] = await db
		.select({
			id: treeNodes.id,
			name: treeNodes.name,
			code: treeNodes.code,
			description: treeNodes.description,
			lastCoherenceCheck: treeNodes.lastCoherenceCheck,
		})
		.from(treeNodes)
		.where(eq(treeNodes.id, nodeId));

	if (!node) return null;

	const childRows = await db
		.select({
			id: items.id,
			name: items.name,
			code: items.code,
			description: items.description,
			embedding: items.embedding,
		})
		.from(items)
		.where(eq(items.semanticNodeId, nodeId));

	const children = childRows.filter((c) => c.embedding != null && c.code != null) as FamilyMember[];

	if (children.length === 0) return null;

	return { node, children };
}

// ── COHERENCE CHECK (main entry point) ───────────────────────────────────────

/**
 * Async coherence check for a family. Called fire-and-forget after insertions.
 * Budget-limited to prevent cascade.
 */
export async function coherenceCheck(nodeId: number): Promise<void> {
	try {
		let budget = THRESHOLDS.COHERENCE_BUDGET;

		const family = await getFamily(nodeId);
		if (!family) return;

		// Guard: cooldown (skip if checked recently — within last 5 minutes)
		if (family.node.lastCoherenceCheck) {
			const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
			if (family.node.lastCoherenceCheck > fiveMinAgo) return;
		}

		// Step 0: Recompute centroid from scratch (prevents drift)
		const allEmbeddings = family.children.map((c) => c.embedding);
		const trueCentroid = computeCentroid(allEmbeddings);
		await db.update(treeNodes)
			.set({ centroidEmbedding: trueCentroid })
			.where(eq(treeNodes.id, nodeId));

		// Step 1: Check intra-family health
		const avgSim = averagePairwiseSimilarity(allEmbeddings);

		// Step 2: SPLIT if family is too diverse
		if (avgSim < THRESHOLDS.SPLIT && family.children.length >= THRESHOLDS.MIN_SPLIT_SIZE && budget > 0) {
			const didSplit = await splitFamily(family);
			if (didSplit) budget--;
		}

		// Step 3: Check for MERGE with nearby families
		if (budget > 0 && trueCentroid.length > 0) {
			const didMerge = await checkMerge(nodeId, trueCentroid);
			if (didMerge) budget--;
		}

		// Step 4: Check for nearby STANDALONES to absorb
		if (budget > 0 && trueCentroid.length > 0) {
			const didAbsorb = await checkAbsorb(nodeId, trueCentroid, family);
			if (didAbsorb) budget--;
		}

		// Step 5: PRUNE — if node has 0 children, delete it
		await prune(nodeId);

		// Update cooldown
		await db.update(treeNodes)
			.set({ lastCoherenceCheck: new Date() })
			.where(eq(treeNodes.id, nodeId));

	} catch (err) {
		console.error(`[coherence] Error checking family node ${nodeId}:`, err);
	}
}

// ── SPLIT ────────────────────────────────────────────────────────────────────

async function splitFamily(family: Family): Promise<boolean> {
	const familyItems = family.children.map((c) => ({ ...c, embedding: c.embedding }));
	const { groupA, groupB } = kMeansBisect(familyItems);

	if (groupA.length < 2 || groupB.length < 2) return false;

	// Validate: both halves must be cohesive
	const simA = averagePairwiseSimilarity(groupA.map((i) => i.embedding));
	const simB = averagePairwiseSimilarity(groupB.map((i) => i.embedding));

	if (simA < THRESHOLDS.SPLIT_MIN_COHESION || simB < THRESHOLDS.SPLIT_MIN_COHESION) {
		return false; // Not a clean split
	}

	try {
		// Generate abstract parent for group_b
		const parentData = await generateJSON<{
			name: string;
			description: string;
			code: string;
			useCases: { title: string; use: string }[];
			type: string;
			domain: string;
			stack?: string;
			language?: string;
			libraries?: string[];
			tags?: string[];
		}>(
			PARENT_CREATOR_SYSTEM_PROMPT,
			buildParentCreatorUserPrompt(
				{ name: groupB[0]!.name, code: groupB[0]!.code, description: groupB[0]!.description ?? undefined },
				{ name: groupB[1]!.name, code: groupB[1]!.code, description: groupB[1]!.description ?? undefined },
			),
		);

		// Create a new tree_node for the sub-family
		const embeddingText = [parentData.name, parentData.description, parentData.type, parentData.domain].filter(Boolean).join(" ");
		const embedding = await generateEmbedding(embeddingText);
		const centroid = computeCentroid(groupB.map((i) => i.embedding));

		const nodeMeta: Record<string, unknown> = {};
		if (parentData.type) nodeMeta.type = parentData.type;
		if (parentData.domain) nodeMeta.domain = parentData.domain;
		if (parentData.stack) nodeMeta.stack = parentData.stack;
		if (parentData.language) nodeMeta.language = parentData.language;
		if (parentData.libraries?.length) nodeMeta.libraries = parentData.libraries;
		if (parentData.tags?.length) nodeMeta.tags = parentData.tags;
		if (parentData.useCases?.length) nodeMeta.useCases = parentData.useCases;

		const [newNode] = await db.insert(treeNodes).values({
			parentNodeId: family.node.id,
			name: parentData.name,
			code: parentData.code,
			description: parentData.description,
			embedding,
			centroidEmbedding: centroid,
			metadata: nodeMeta,
		}).returning();

		// Move group_b children to the new node
		for (const child of groupB) {
			await db.update(items)
				.set({ semanticNodeId: newNode!.id })
				.where(eq(items.id, child.id));
		}

		// Update original node's centroid (now only has group_a)
		const remainingEmbeddings = groupA.map((i) => i.embedding);
		if (remainingEmbeddings.length > 0) {
			const newCentroid = computeCentroid(remainingEmbeddings);
			await db.update(treeNodes)
				.set({ centroidEmbedding: newCentroid })
				.where(eq(treeNodes.id, family.node.id));
		}

		console.log(`[coherence] Split family node ${family.node.id}: created sub-node ${newNode!.id} with ${groupB.length} children`);
		return true;

	} catch (err) {
		console.error(`[coherence] Split failed for family node ${family.node.id}:`, err);
		return false;
	}
}

// ── MERGE ────────────────────────────────────────────────────────────────────

async function checkMerge(
	nodeId: number,
	centroid: number[],
): Promise<boolean> {
	const vectorStr = `[${centroid.join(",")}]`;

	// Find nearby tree_nodes by centroid similarity
	const nearbyNodes = await db
		.select({
			id: treeNodes.id,
			centroidEmbedding: treeNodes.centroidEmbedding,
		})
		.from(treeNodes)
		.where(
			and(
				sql`${treeNodes.centroidEmbedding} IS NOT NULL`,
				sql`${treeNodes.id} != ${nodeId}`,
				sql`1 - (${treeNodes.centroidEmbedding} <=> ${vectorStr}::vector) > ${THRESHOLDS.MERGE}`,
			),
		)
		.limit(3);

	for (const neighbor of nearbyNodes) {
		if (!neighbor.centroidEmbedding) continue;

		const myFamily = await getFamily(nodeId);
		const theirFamily = await getFamily(neighbor.id);
		if (!myFamily || !theirFamily) continue;

		// Cross-similarity
		let crossSum = 0;
		let crossCount = 0;
		for (const a of myFamily.children) {
			for (const b of theirFamily.children) {
				crossSum += cosineSimilarity(a.embedding, b.embedding);
				crossCount++;
			}
		}
		const crossSim = crossCount > 0 ? crossSum / crossCount : 0;

		if (crossSim > THRESHOLDS.MERGE) {
			await mergeInto(nodeId, neighbor.id);
			return true;
		}
	}

	return false;
}

/** Merge family B into family A (larger absorbs smaller). */
async function mergeInto(
	nodeAId: number,
	nodeBId: number,
): Promise<void> {
	const familyA = await getFamily(nodeAId);
	const familyB = await getFamily(nodeBId);
	if (!familyA || !familyB) return;

	const [keeper, absorbed] = familyA.children.length >= familyB.children.length
		? [familyA, familyB]
		: [familyB, familyA];

	// Move all children of absorbed to keeper
	for (const child of absorbed.children) {
		await db.update(items)
			.set({ semanticNodeId: keeper.node.id })
			.where(eq(items.id, child.id));
	}

	// Delete absorbed node (it has no more children)
	await db.delete(treeNodes).where(eq(treeNodes.id, absorbed.node.id));

	// Update keeper centroid
	const allEmbeddings = [
		...keeper.children.map((c) => c.embedding),
		...absorbed.children.map((c) => c.embedding),
	];
	const newCentroid = computeCentroid(allEmbeddings);
	await db.update(treeNodes)
		.set({ centroidEmbedding: newCentroid })
		.where(eq(treeNodes.id, keeper.node.id));

	console.log(`[coherence] Merged family node ${absorbed.node.id} into ${keeper.node.id}`);
}

// ── ABSORB ───────────────────────────────────────────────────────────────────

async function checkAbsorb(
	nodeId: number,
	centroid: number[],
	family: Family,
): Promise<boolean> {
	const vectorStr = `[${centroid.join(",")}]`;

	// Find nearby standalone items (no semantic_node_id)
	const nearbyStandalones = await db
		.select({
			id: items.id,
			embedding: items.embedding,
		})
		.from(items)
		.where(
			and(
				sql`${items.embedding} IS NOT NULL`,
				sql`${items.semanticNodeId} IS NULL`,
				sql`1 - (${items.embedding} <=> ${vectorStr}::vector) > ${THRESHOLDS.VARIANT}`,
			),
		)
		.limit(5);

	let absorbed = false;
	for (const standalone of nearbyStandalones) {
		if (!standalone.embedding) continue;

		const sims = family.children.map((c) => cosineSimilarity(c.embedding, standalone.embedding as number[]));
		const avgToFamily = sims.reduce((a, b) => a + b, 0) / sims.length;

		if (avgToFamily >= THRESHOLDS.VARIANT) {
			await db.update(items)
				.set({ semanticNodeId: nodeId })
				.where(eq(items.id, standalone.id));

			const allEmbeddings = [...family.children.map((c) => c.embedding), standalone.embedding as number[]];
			const newCentroid = computeCentroid(allEmbeddings);
			await db.update(treeNodes)
				.set({ centroidEmbedding: newCentroid })
				.where(eq(treeNodes.id, nodeId));

			console.log(`[coherence] Absorbed standalone ${standalone.id} into family node ${nodeId}`);
			absorbed = true;
		}
	}

	return absorbed;
}

// ── PRUNE ────────────────────────────────────────────────────────────────────

/** Remove tree_nodes that have 0-1 children. */
async function prune(nodeId: number): Promise<void> {
	const countResult = await db
		.select({ count: sql<number>`count(*)` })
		.from(items)
		.where(eq(items.semanticNodeId, nodeId));

	const childCount = Number(countResult[0]?.count ?? 0);

	if (childCount <= 1) {
		// Unlink remaining child (if any)
		if (childCount === 1) {
			await db.update(items)
				.set({ semanticNodeId: null })
				.where(eq(items.semanticNodeId, nodeId));
		}

		// Delete the tree_node
		await db.delete(treeNodes).where(eq(treeNodes.id, nodeId));
		console.log(`[coherence] Pruned tree_node ${nodeId} (had ${childCount} children)`);
	}
}

// ── Fire-and-forget wrapper ──────────────────────────────────────────────────

/** Schedule a coherence check (non-blocking, fire-and-forget). */
export function scheduleCoherenceCheck(nodeId: number): void {
	setImmediate(() => {
		coherenceCheck(nodeId).catch((err) => {
			console.error(`[coherence] Async check failed for node ${nodeId}:`, err);
		});
	});
}

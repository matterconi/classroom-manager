// ── Coherence engine — Self-Organizing Knowledge Base ────────────────────────
// Runs async after each insertion. Checks family health and triggers
// split/merge/absorb with a bounded budget to prevent cascade.

import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { items, edges } from "../db/schema/index.js";
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
	parent: FamilyMember & { isAbstract: boolean | null; lastCoherenceCheck: Date | null };
	children: FamilyMember[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Fetch a complete family: parent + all children via edges. */
async function getFamily(parentId: number): Promise<Family | null> {
	// Fetch parent
	const [parentRow] = await db
		.select({
			id: items.id,
			name: items.name,
			code: items.code,
			description: items.description,
			embedding: items.embedding,
			isAbstract: items.isAbstract,
			lastCoherenceCheck: items.lastCoherenceCheck,
		})
		.from(items)
		.where(eq(items.id, parentId));

	if (!parentRow || !parentRow.embedding) return null;

	// Fetch children via parent edges
	const childEdges = await db
		.select({ targetId: edges.targetId })
		.from(edges)
		.where(
			and(
				eq(edges.sourceId, parentId),
				eq(edges.type, "parent"),
			),
		);

	if (childEdges.length === 0) return null; // Not a parent

	const childIds = childEdges.map((e) => e.targetId);
	const childRows = await db
		.select({
			id: items.id,
			name: items.name,
			code: items.code,
			description: items.description,
			embedding: items.embedding,
		})
		.from(items)
		.where(sql`${items.id} IN (${sql.join(childIds.map(id => sql`${id}`), sql`, `)})`);

	const children = childRows.filter((c) => c.embedding != null) as FamilyMember[];

	return {
		parent: parentRow as Family["parent"],
		children,
	};
}

// ── COHERENCE CHECK (main entry point) ───────────────────────────────────────

/**
 * Async coherence check for a family. Called fire-and-forget after insertions.
 * Budget-limited to prevent cascade.
 */
export async function coherenceCheck(parentId: number): Promise<void> {
	try {
		let budget = THRESHOLDS.COHERENCE_BUDGET;

		const family = await getFamily(parentId);
		if (!family) return;

		// Guard: cooldown (skip if checked recently — within last 5 minutes as proxy)
		if (family.parent.lastCoherenceCheck) {
			const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
			if (family.parent.lastCoherenceCheck > fiveMinAgo) return;
		}

		// Step 0: Recompute centroid from scratch (prevents drift)
		const allEmbeddings = family.children.map((c) => c.embedding);
		const trueCentroid = computeCentroid(allEmbeddings);
		await db.update(items)
			.set({ centroidEmbedding: trueCentroid })
			.where(eq(items.id, parentId));

		// Step 1: Check intra-family health
		const avgSim = averagePairwiseSimilarity(allEmbeddings);

		// Step 2: SPLIT if family is too diverse
		if (avgSim < THRESHOLDS.SPLIT && family.children.length >= THRESHOLDS.MIN_SPLIT_SIZE && budget > 0) {
			const didSplit = await splitFamily(family);
			if (didSplit) budget--;
		}

		// Step 3: Check for MERGE with nearby families
		if (budget > 0 && trueCentroid.length > 0) {
			const didMerge = await checkMerge(parentId, trueCentroid);
			if (didMerge) budget--;
		}

		// Step 4: Check for nearby STANDALONES to absorb
		if (budget > 0 && trueCentroid.length > 0) {
			const didAbsorb = await checkAbsorb(parentId, trueCentroid, family);
			if (didAbsorb) budget--;
		}

		// Step 5: PRUNE — if parent is abstract and has 0 children, delete it
		await prune(parentId);

		// Update cooldown
		await db.update(items)
			.set({ lastCoherenceCheck: new Date() })
			.where(eq(items.id, parentId));

	} catch (err) {
		console.error(`[coherence] Error checking family ${parentId}:`, err);
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

		// Create the sub-parent item
		const slug = parentData.name.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "") + "-" + Date.now();
		const embeddingText = [parentData.name, parentData.description, parentData.type, parentData.domain].filter(Boolean).join(" ");
		const embedding = await generateEmbedding(embeddingText);
		const centroid = computeCentroid(groupB.map((i) => i.embedding));

		const [newParent] = await db.insert(items).values({
			kind: "snippet",
			name: parentData.name,
			slug,
			code: parentData.code,
			description: parentData.description,
			isAbstract: true,
			embedding,
			centroidEmbedding: centroid,
			useCases: parentData.useCases || null,
			type: parentData.type || null,
			domain: parentData.domain || null,
			stack: parentData.stack || null,
			language: parentData.language || null,
			libraries: parentData.libraries || null,
			tags: parentData.tags || null,
		}).returning();

		// Make sub-parent a child of the original parent
		await db.insert(edges).values({
			sourceId: family.parent.id,
			targetId: newParent!.id,
			resource: "item",
			type: "parent",
		});

		// Move group_b children from original parent to sub-parent
		for (const child of groupB) {
			await db.delete(edges).where(
				and(
					eq(edges.sourceId, family.parent.id),
					eq(edges.targetId, child.id),
					eq(edges.type, "parent"),
				),
			);
			await db.insert(edges).values({
				sourceId: newParent!.id,
				targetId: child.id,
				resource: "item",
				type: "parent",
			});
		}

		// Update original parent's centroid (now only has group_a + sub-parent)
		const remainingEmbeddings = [
			...groupA.map((i) => i.embedding),
			...(embedding ? [embedding] : []),
		];
		if (remainingEmbeddings.length > 0) {
			const newCentroid = computeCentroid(remainingEmbeddings);
			await db.update(items)
				.set({ centroidEmbedding: newCentroid })
				.where(eq(items.id, family.parent.id));
		}

		console.log(`[coherence] Split family ${family.parent.id}: created sub-parent ${newParent!.id} with ${groupB.length} children`);
		return true;

	} catch (err) {
		console.error(`[coherence] Split failed for family ${family.parent.id}:`, err);
		return false;
	}
}

// ── MERGE ────────────────────────────────────────────────────────────────────

async function checkMerge(
	parentId: number,
	centroid: number[],
): Promise<boolean> {
	const vectorStr = `[${centroid.join(",")}]`;

	// Find nearby parents by centroid similarity
	const nearbyParents = await db
		.select({
			id: items.id,
			centroidEmbedding: items.centroidEmbedding,
		})
		.from(items)
		.where(
			and(
				sql`${items.centroidEmbedding} IS NOT NULL`,
				sql`${items.id} != ${parentId}`,
				sql`1 - (${items.centroidEmbedding} <=> ${vectorStr}::vector) > ${THRESHOLDS.MERGE}`,
				// Must be a parent (has outgoing parent edges)
				sql`EXISTS (SELECT 1 FROM edges WHERE edges.source_id = ${items.id} AND edges.type = 'parent')`,
			),
		)
		.limit(3);

	for (const neighbor of nearbyParents) {
		if (!neighbor.centroidEmbedding) continue;

		const myFamily = await getFamily(parentId);
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
			await mergeInto(parentId, neighbor.id);
			return true;
		}
	}

	return false;
}

/** Merge family B into family A (larger absorbs smaller). */
async function mergeInto(
	familyAId: number,
	familyBId: number,
): Promise<void> {
	const familyA = await getFamily(familyAId);
	const familyB = await getFamily(familyBId);
	if (!familyA || !familyB) return;

	const [keeper, absorbed] = familyA.children.length >= familyB.children.length
		? [familyA, familyB]
		: [familyB, familyA];

	// Move all children of absorbed to keeper
	for (const child of absorbed.children) {
		await db.delete(edges).where(
			and(
				eq(edges.sourceId, absorbed.parent.id),
				eq(edges.targetId, child.id),
				eq(edges.type, "parent"),
			),
		);
		await db.insert(edges).values({
			sourceId: keeper.parent.id,
			targetId: child.id,
			resource: "item",
			type: "parent",
		});
	}

	// Handle absorbed parent
	if (absorbed.parent.isAbstract) {
		await db.delete(edges).where(
			and(
				eq(edges.targetId, absorbed.parent.id),
				eq(edges.type, "parent"),
			),
		);
		await db.delete(items).where(eq(items.id, absorbed.parent.id));
	} else {
		await db.insert(edges).values({
			sourceId: keeper.parent.id,
			targetId: absorbed.parent.id,
			resource: "item",
			type: "parent",
		}).onConflictDoNothing();
	}

	// Update keeper centroid
	const allEmbeddings = [
		...keeper.children.map((c) => c.embedding),
		...absorbed.children.map((c) => c.embedding),
	];
	const newCentroid = computeCentroid(allEmbeddings);
	await db.update(items)
		.set({ centroidEmbedding: newCentroid })
		.where(eq(items.id, keeper.parent.id));

	console.log(`[coherence] Merged family ${absorbed.parent.id} into ${keeper.parent.id}`);
}

// ── ABSORB ───────────────────────────────────────────────────────────────────

async function checkAbsorb(
	parentId: number,
	centroid: number[],
	family: Family,
): Promise<boolean> {
	const vectorStr = `[${centroid.join(",")}]`;

	// Find nearby standalone items
	const nearbyStandalones = await db
		.select({
			id: items.id,
			embedding: items.embedding,
		})
		.from(items)
		.where(
			and(
				sql`${items.embedding} IS NOT NULL`,
				sql`${items.id} != ${parentId}`,
				sql`1 - (${items.embedding} <=> ${vectorStr}::vector) > ${THRESHOLDS.VARIANT}`,
				// Must be standalone (no incoming parent edge)
				sql`NOT EXISTS (SELECT 1 FROM edges WHERE edges.target_id = ${items.id} AND edges.type = 'parent')`,
				// Must not be a parent (no outgoing parent edges)
				sql`NOT EXISTS (SELECT 1 FROM edges WHERE edges.source_id = ${items.id} AND edges.type = 'parent')`,
			),
		)
		.limit(5);

	let absorbed = false;
	for (const standalone of nearbyStandalones) {
		if (!standalone.embedding) continue;

		const sims = family.children.map((c) => cosineSimilarity(c.embedding, standalone.embedding as number[]));
		const avgToFamily = sims.reduce((a, b) => a + b, 0) / sims.length;

		if (avgToFamily >= THRESHOLDS.VARIANT) {
			await db.insert(edges).values({
				sourceId: parentId,
				targetId: standalone.id,
				resource: "item",
				type: "parent",
			}).onConflictDoNothing();

			const allEmbeddings = [...family.children.map((c) => c.embedding), standalone.embedding as number[]];
			const newCentroid = computeCentroid(allEmbeddings);
			await db.update(items)
				.set({ centroidEmbedding: newCentroid })
				.where(eq(items.id, parentId));

			console.log(`[coherence] Absorbed standalone ${standalone.id} into family ${parentId}`);
			absorbed = true;
		}
	}

	return absorbed;
}

// ── PRUNE ────────────────────────────────────────────────────────────────────

/** Remove abstract parents that have 0-1 children. */
async function prune(parentId: number): Promise<void> {
	const countResult = await db
		.select({ count: sql<number>`count(*)` })
		.from(edges)
		.where(
			and(
				eq(edges.sourceId, parentId),
				eq(edges.type, "parent"),
			),
		);

	const childCount = Number(countResult[0]?.count ?? 0);

	if (childCount <= 1) {
		const [parent] = await db
			.select({ isAbstract: items.isAbstract })
			.from(items)
			.where(eq(items.id, parentId));

		if (parent?.isAbstract) {
			if (childCount === 1) {
				// Dissolve: make the lone child standalone
				await db.delete(edges).where(
					and(
						eq(edges.sourceId, parentId),
						eq(edges.type, "parent"),
					),
				);
			}

			// If parent itself is a child of another parent, remove that edge too
			await db.delete(edges).where(
				and(
					eq(edges.targetId, parentId),
					eq(edges.type, "parent"),
				),
			);

			// Delete the abstract parent
			await db.delete(items).where(eq(items.id, parentId));
			console.log(`[coherence] Pruned abstract parent ${parentId} (had ${childCount} children)`);
		}
	}
}

// ── Fire-and-forget wrapper ──────────────────────────────────────────────────

/** Schedule a coherence check (non-blocking, fire-and-forget). */
export function scheduleCoherenceCheck(parentId: number): void {
	setImmediate(() => {
		coherenceCheck(parentId).catch((err) => {
			console.error(`[coherence] Async check failed for item ${parentId}:`, err);
		});
	});
}

// ── Clustering utilities for the Self-Organizing Knowledge Base ──────────────
// Pure math functions: cosine similarity, centroid, pairwise similarity, k-means bisection.
// No DB access — these are building blocks used by the coherence check.

// ── Cosine similarity ────────────────────────────────────────────────────────

/** Cosine similarity between two vectors. Returns 0–1 for normalized vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i]! * b[i]!;
		normA += a[i]! * a[i]!;
		normB += b[i]! * b[i]!;
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom === 0 ? 0 : dot / denom;
}

// ── Centroid operations ──────────────────────────────────────────────────────

/** Compute the normalized centroid (average) of multiple vectors. */
export function computeCentroid(vectors: number[][]): number[] {
	if (vectors.length === 0) return [];
	const dim = vectors[0]!.length;
	const sum = new Array<number>(dim).fill(0);
	for (const v of vectors) {
		for (let i = 0; i < dim; i++) {
			sum[i]! += v[i]!;
		}
	}
	return normalize(sum.map((s) => s / vectors.length));
}

/** Update a centroid incrementally when adding a new member. */
export function updateCentroid(
	currentCentroid: number[],
	currentCount: number,
	newVector: number[],
): number[] {
	const dim = currentCentroid.length;
	const result = new Array<number>(dim);
	for (let i = 0; i < dim; i++) {
		result[i] = (currentCount * currentCentroid[i]! + newVector[i]!) / (currentCount + 1);
	}
	return normalize(result);
}

/** L2-normalize a vector. */
function normalize(v: number[]): number[] {
	let norm = 0;
	for (const x of v) norm += x * x;
	norm = Math.sqrt(norm);
	if (norm === 0) return v;
	return v.map((x) => x / norm);
}

// ── Pairwise similarity ─────────────────────────────────────────────────────

/** Average pairwise cosine similarity across all member pairs. */
export function averagePairwiseSimilarity(embeddings: number[][]): number {
	const n = embeddings.length;
	if (n < 2) return 1; // single item = perfect cohesion

	let sum = 0;
	let pairs = 0;
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			sum += cosineSimilarity(embeddings[i]!, embeddings[j]!);
			pairs++;
		}
	}
	return sum / pairs;
}

// ── K-means bisection ───────────────────────────────────────────────────────

export type BisectResult<T> = {
	groupA: T[];
	groupB: T[];
};

/**
 * K-means bisection: split items into 2 groups based on embedding similarity.
 * Items must have an `embedding` field (number[]).
 * Returns the two groups. Runs 10 iterations.
 */
export function kMeansBisect<T extends { embedding: number[] }>(
	items: T[],
): BisectResult<T> {
	if (items.length < 2) {
		return { groupA: items, groupB: [] };
	}

	// Initialize: pick the two most distant items
	let maxDist = -1;
	let seedA = 0;
	let seedB = 1;
	for (let i = 0; i < items.length; i++) {
		for (let j = i + 1; j < items.length; j++) {
			const dist = 1 - cosineSimilarity(items[i]!.embedding, items[j]!.embedding);
			if (dist > maxDist) {
				maxDist = dist;
				seedA = i;
				seedB = j;
			}
		}
	}

	let centroidA = [...items[seedA]!.embedding];
	let centroidB = [...items[seedB]!.embedding];

	let assignmentA: T[] = [];
	let assignmentB: T[] = [];

	// 10 iterations of k-means
	for (let iter = 0; iter < 10; iter++) {
		assignmentA = [];
		assignmentB = [];

		for (const item of items) {
			const simA = cosineSimilarity(item.embedding, centroidA);
			const simB = cosineSimilarity(item.embedding, centroidB);
			if (simA > simB) {
				assignmentA.push(item);
			} else {
				assignmentB.push(item);
			}
		}

		// Recompute centroids
		if (assignmentA.length > 0) {
			centroidA = computeCentroid(assignmentA.map((i) => i.embedding));
		}
		if (assignmentB.length > 0) {
			centroidB = computeCentroid(assignmentB.map((i) => i.embedding));
		}
	}

	return { groupA: assignmentA, groupB: assignmentB };
}

// ── Thresholds ──────────────────────────────────────────────────────────────

export const THRESHOLDS = {
	/** Minimum similarity to be considered a variant candidate */
	VARIANT: 0.82,
	/** Minimum similarity to be in the same broad family */
	FAMILY: 0.70,
	/** Split family when avg intra-similarity drops below this */
	SPLIT: 0.72,
	/** Merge families when centroid similarity exceeds this */
	MERGE: 0.85,
	/** Minimum avg_sim for each half after split (reject if below) */
	SPLIT_MIN_COHESION: 0.78,
	/** Max restructuring operations per coherence check */
	COHERENCE_BUDGET: 2,
	/** Minimum children to allow split */
	MIN_SPLIT_SIZE: 3,
} as const;

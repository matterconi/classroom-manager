// ── Structural scoring for similarity reranking ──────────────────────────────
// Weights: generic fields > specific fields.
// Category defines the family, type the kind, domain the area.
// Tags and libraries are minor refinements.

// ── Types ────────────────────────────────────────────────────────────────────

export type ScoringFields = {
	categoryId?: number | null;
	type?: string | null;
	domain?: string | null;
	stack?: string | null;
	language?: string | null;
	libraries?: string[] | null;
	tags?: string[] | null;
};

export type ScoredCandidate<T> = T & {
	structuralScore: number;
	combinedScore: number;
};

// ── Weights (sum = 1.0) ──────────────────────────────────────────────────────

const WEIGHTS = {
	category: 0.30,
	type: 0.25,
	domain: 0.20,
	stack: 0.10,
	language: 0.05,
	libraries: 0.05,
	tags: 0.05,
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function overlapRatio(
	a: string[] | null | undefined,
	b: string[] | null | undefined,
): number {
	if (!a?.length || !b?.length) return 0;
	const setA = new Set(a.map((s) => s.toLowerCase()));
	const setB = new Set(b.map((s) => s.toLowerCase()));
	const common = Array.from(setA).filter((x) => setB.has(x)).length;
	return common / Math.max(setA.size, setB.size);
}

// ── Core functions ───────────────────────────────────────────────────────────

/** Structural score (0–1) based on weighted field matching. */
export function computeStructuralScore(
	newItem: ScoringFields,
	candidate: ScoringFields,
): number {
	let score = 0;

	if (newItem.categoryId != null && candidate.categoryId != null
		&& newItem.categoryId === candidate.categoryId)
		score += WEIGHTS.category;

	if (newItem.type && candidate.type
		&& newItem.type.toLowerCase() === candidate.type.toLowerCase())
		score += WEIGHTS.type;

	if (newItem.domain && candidate.domain
		&& newItem.domain.toLowerCase() === candidate.domain.toLowerCase())
		score += WEIGHTS.domain;

	if (newItem.stack && candidate.stack
		&& newItem.stack.toLowerCase() === candidate.stack.toLowerCase())
		score += WEIGHTS.stack;

	if (newItem.language && candidate.language
		&& newItem.language.toLowerCase() === candidate.language.toLowerCase())
		score += WEIGHTS.language;

	score += WEIGHTS.libraries * overlapRatio(newItem.libraries, candidate.libraries);
	score += WEIGHTS.tags * overlapRatio(newItem.tags, candidate.tags);

	return score;
}

/** Combined score: embedding similarity (semantic) + structural (metadata). */
export function computeCombinedScore(
	embeddingSimilarity: number,
	structuralScore: number,
): number {
	return embeddingSimilarity * 0.7 + structuralScore * 0.3;
}

/**
 * Rerank candidates by combined score and return top N.
 * Each candidate must have a `similarity` field (from the embedding query).
 */
export function rerankCandidates<T extends ScoringFields & { similarity: number }>(
	newItem: ScoringFields,
	candidates: T[],
	topN: number = 5,
): ScoredCandidate<T>[] {
	return candidates
		.map((candidate) => {
			const structuralScore = computeStructuralScore(newItem, candidate);
			const combinedScore = computeCombinedScore(candidate.similarity, structuralScore);
			return { ...candidate, structuralScore, combinedScore };
		})
		.sort((a, b) => b.combinedScore - a.combinedScore)
		.slice(0, topN);
}

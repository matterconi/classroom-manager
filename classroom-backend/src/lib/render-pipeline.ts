/**
 * Render Pipeline — Demo generation for interactive UI components.
 *
 * Pipeline 3 of 3 (alongside AIA families and hierarchy decomposition).
 * Takes an item and its files, asks the judge to decompose into
 * organism/molecule/atom, then creates standalone demos for demoable pieces.
 *
 * Flow:
 *   1. DECOMPOSE — judge breaks files into organism/molecules/atoms
 *   2. For each demoable piece (top-down):
 *      a. CHECK SIMILARITY — is there an existing similar item with a demo?
 *      b. If similar exists → CHECK REUSE (reuse / scale with props / new)
 *      c. If no match or verdict=new → CREATE DEMO (judge writes sandbox code)
 *      d. If verdict=scale → create prop-scaled demo (link to source demo)
 *      e. If verdict=reuse → no new demo, just link via edge
 *   3. Return all created demos
 */

import { eq, and, sql, asc } from "drizzle-orm";
import { db } from "../db/index.js";
import { items, demos, demoFiles } from "../db/schema/index.js";
import { generateJSON } from "./deepseek.js";
import { generateEmbedding } from "./embeddings.js";
import {
	DECOMPOSE_SYSTEM_PROMPT,
	buildDecomposeUserPrompt,
	CREATE_DEMO_SYSTEM_PROMPT,
	buildCreateDemoUserPrompt,
	CHECK_DEMO_REUSE_SYSTEM_PROMPT,
	buildCheckDemoReuseUserPrompt,
	SCALE_PROPS_SYSTEM_PROMPT,
	buildScalePropsUserPrompt,
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

type CreateDemoResult = {
	files: { name: string; code: string; language: string }[];
	entry_file: string;
	dependencies: string[];
	missing: { name: string; reason: string }[];
	notes: string | null;
};

type CheckReuseResult = {
	verdict: "reuse" | "scale" | "new";
	props: Record<string, unknown> | null;
	reason: string;
};

type ScalePropsResult = {
	can_scale: boolean;
	props: Record<string, unknown> | null;
	reason: string;
	new_demo: CreateDemoResult | null;
};

export type RenderPipelineResult = {
	decomposition: DecomposeResult;
	demos_created: {
		itemId: number;
		demoId: number;
		level: "organism" | "molecule" | "atom";
		name: string;
		action: "created" | "scaled" | "reused";
	}[];
};

// ── Step 1: Decompose ────────────────────────────────────────────────────────

export async function decompose(
	files: FileInput[],
): Promise<DecomposeResult> {
	const userPrompt = buildDecomposeUserPrompt(files);
	return generateJSON<DecomposeResult>(DECOMPOSE_SYSTEM_PROMPT, userPrompt);
}

// ── Step 2: Create Demo ──────────────────────────────────────────────────────

export async function createDemoForComponent(
	componentName: string,
	sourceFiles: FileInput[],
): Promise<CreateDemoResult> {
	const userPrompt = buildCreateDemoUserPrompt(componentName, sourceFiles);
	return generateJSON<CreateDemoResult>(
		CREATE_DEMO_SYSTEM_PROMPT,
		userPrompt,
	);
}

// ── Step 3: Check Demo Reuse ─────────────────────────────────────────────────

async function checkDemoReuse(
	existingComponent: { name: string; code: string },
	existingDemoFiles: { name: string; code: string }[],
	newComponent: { name: string; code: string; description?: string },
): Promise<CheckReuseResult> {
	const userPrompt = buildCheckDemoReuseUserPrompt(
		existingComponent,
		existingDemoFiles,
		newComponent,
	);
	return generateJSON<CheckReuseResult>(
		CHECK_DEMO_REUSE_SYSTEM_PROMPT,
		userPrompt,
	);
}

// ── Step 4: Scale with Props ─────────────────────────────────────────────────

async function scaleWithProps(
	existingDemo: {
		files: { name: string; code: string }[];
		props: Record<string, unknown>;
	},
	newVariant: { name: string; code: string; description?: string },
): Promise<ScalePropsResult> {
	const userPrompt = buildScalePropsUserPrompt(existingDemo, newVariant);
	return generateJSON<ScalePropsResult>(
		SCALE_PROPS_SYSTEM_PROMPT,
		userPrompt,
	);
}

// ── Save Demo to DB ──────────────────────────────────────────────────────────

export async function saveDemoToDB(
	itemId: number,
	demoResult: CreateDemoResult,
	label?: string | undefined,
	sourceDemoId?: number | undefined,
	props?: Record<string, unknown> | undefined,
): Promise<number> {
	const [demo] = await db
		.insert(demos)
		.values({
			itemId,
			label: label || null,
			props: props || {},
			sourceDemoId: sourceDemoId || null,
			entryFile: demoResult.entry_file,
			dependencies: demoResult.dependencies,
			missing: demoResult.missing,
			notes: demoResult.notes,
		})
		.returning();

	if (!demo) throw new Error("Failed to create demo");

	// Only save files if this is NOT a prop-scaled demo
	if (!sourceDemoId && demoResult.files.length > 0) {
		const fileValues = demoResult.files.map((f, i) => ({
			demoId: demo.id,
			name: f.name,
			code: f.code,
			language: f.language || null,
			order: i,
		}));
		await db.insert(demoFiles).values(fileValues);
	}

	return demo.id;
}

// ── Find Similar Item with Demo ──────────────────────────────────────────────

async function findSimilarWithDemo(
	piece: DecomposePiece,
	sourceFiles: FileInput[],
): Promise<{
	item: { id: number; name: string; code: string };
	demo: { id: number; files: { name: string; code: string }[]; props: Record<string, unknown> };
} | null> {
	// Build text for embedding from the piece
	const pieceCode = sourceFiles
		.filter((f) => piece.files.includes(f.name))
		.map((f) => f.code)
		.join("\n");

	const embeddingText = `${piece.name} ${piece.description} ${pieceCode.slice(0, 500)}`;
	const embedding = await generateEmbedding(embeddingText);
	if (!embedding) return null;

	const vectorStr = `[${embedding.join(",")}]`;
	const THRESHOLD = 0.75;

	// Find similar items that have demos
	const similar = await db
		.select({
			id: items.id,
			name: items.name,
			code: items.code,
			similarity: sql<number>`1 - (${items.embedding} <=> ${vectorStr}::vector)`,
		})
		.from(items)
		.where(
			and(
				sql`${items.embedding} IS NOT NULL`,
				sql`1 - (${items.embedding} <=> ${vectorStr}::vector) > ${THRESHOLD}`,
				sql`EXISTS (SELECT 1 FROM demos WHERE demos.item_id = ${items.id})`,
			),
		)
		.orderBy(sql`${items.embedding} <=> ${vectorStr}::vector`)
		.limit(1);

	if (similar.length === 0) return null;

	const match = similar[0]!;

	// Fetch the match's default demo + files
	const [matchDemo] = await db
		.select()
		.from(demos)
		.where(and(eq(demos.itemId, match.id), sql`${demos.label} IS NULL`))
		.limit(1);

	if (!matchDemo) return null;

	const matchDemoFiles = await db
		.select({ name: demoFiles.name, code: demoFiles.code })
		.from(demoFiles)
		.where(eq(demoFiles.demoId, matchDemo.id))
		.orderBy(asc(demoFiles.order));

	return {
		item: { id: match.id, name: match.name, code: match.code || "" },
		demo: {
			id: matchDemo.id,
			files: matchDemoFiles,
			props: (matchDemo.props as Record<string, unknown>) || {},
		},
	};
}

// ── Process Single Piece ─────────────────────────────────────────────────────

async function processPiece(
	piece: DecomposePiece,
	_level: "organism" | "molecule" | "atom",
	itemId: number,
	sourceFiles: FileInput[],
): Promise<{
	demoId: number;
	action: "created" | "scaled" | "reused";
} | null> {
	if (!piece.is_demoable) return null;

	// Check if similar item already has a demo
	const existing = await findSimilarWithDemo(piece, sourceFiles);

	if (existing) {
		// Ask judge: reuse, scale, or new?
		const pieceCode = sourceFiles
			.filter((f) => piece.files.includes(f.name))
			.map((f) => f.code)
			.join("\n");

		const reuseResult = await checkDemoReuse(
			existing.item,
			existing.demo.files,
			{ name: piece.name, code: pieceCode, description: piece.description },
		);

		if (reuseResult.verdict === "reuse") {
			// No new demo needed — the existing demo serves this item too
			// Create a prop-scaled demo that points to the existing one (same props)
			const demoId = await saveDemoToDB(
				itemId,
				{
					files: [],
					entry_file: "",
					dependencies: [],
					missing: [],
					notes: `Reuses demo from "${existing.item.name}"`,
				},
				undefined,
				existing.demo.id,
				existing.demo.props,
			);
			return { demoId, action: "reused" };
		}

		if (reuseResult.verdict === "scale" && reuseResult.props) {
			// Same demo, different props
			const demoId = await saveDemoToDB(
				itemId,
				{
					files: [],
					entry_file: "",
					dependencies: [],
					missing: [],
					notes: `Prop-scaled from "${existing.item.name}"`,
				},
				undefined,
				existing.demo.id,
				reuseResult.props,
			);
			return { demoId, action: "scaled" };
		}

		// verdict === "new" — fall through to create new demo
	}

	// Create a brand new demo
	const pieceFiles = sourceFiles.filter((f) => piece.files.includes(f.name));
	const demoResult = await createDemoForComponent(piece.name, pieceFiles);
	const demoId = await saveDemoToDB(itemId, demoResult);
	return { demoId, action: "created" };
}

// ── Main Pipeline Entry Point ────────────────────────────────────────────────

/**
 * Run the full render pipeline for an item.
 *
 * @param itemId - The organism item ID (already created in DB)
 * @param sourceFiles - All source files of the organism
 * @param childItemMap - Optional map of molecule/atom names → their item IDs
 *                       (if hierarchy pipeline already created them)
 */
export async function runRenderPipeline(
	itemId: number,
	sourceFiles: FileInput[],
	childItemMap?: Map<string, number>,
): Promise<RenderPipelineResult> {
	// Step 1: Decompose
	const decomposition = await decompose(sourceFiles);
	const demosCreated: RenderPipelineResult["demos_created"] = [];

	// Step 2: Process organism (always uses the main itemId)
	const orgResult = await processPiece(
		decomposition.organism,
		"organism",
		itemId,
		sourceFiles,
	);
	if (orgResult) {
		demosCreated.push({
			itemId,
			demoId: orgResult.demoId,
			level: "organism",
			name: decomposition.organism.name,
			action: orgResult.action,
		});
	}

	// Step 3: Process sub-organisms
	for (const subOrg of decomposition.sub_organisms) {
		const subOrgItemId = childItemMap?.get(subOrg.name) || itemId;
		const result = await processPiece(
			subOrg,
			"organism",
			subOrgItemId,
			sourceFiles,
		);
		if (result) {
			demosCreated.push({
				itemId: subOrgItemId,
				demoId: result.demoId,
				level: "organism",
				name: subOrg.name,
				action: result.action,
			});
		}
	}

	// Step 4: Process molecules
	for (const molecule of decomposition.molecules) {
		const moleculeItemId = childItemMap?.get(molecule.name) || itemId;
		const result = await processPiece(
			molecule,
			"molecule",
			moleculeItemId,
			sourceFiles,
		);
		if (result) {
			demosCreated.push({
				itemId: moleculeItemId,
				demoId: result.demoId,
				level: "molecule",
				name: molecule.name,
				action: result.action,
			});
		}
	}

	// Step 5: Process atoms
	for (const atom of decomposition.atoms) {
		const atomItemId = childItemMap?.get(atom.name) || itemId;
		const result = await processPiece(
			atom,
			"atom",
			atomItemId,
			sourceFiles,
		);
		if (result) {
			demosCreated.push({
				itemId: atomItemId,
				demoId: result.demoId,
				level: "atom",
				name: atom.name,
				action: result.action,
			});
		}
	}

	return { decomposition, demos_created: demosCreated };
}

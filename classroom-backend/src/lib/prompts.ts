// ── Server-side AI prompts ──────────────────────────────────────────────────
// Used by generateJSON() in deepseek.ts for structured AI responses.

// ── Judge ───────────────────────────────────────────────────────────────────

export const JUDGE_SYSTEM_PROMPT = `You are a code library curator. You receive a NEW snippet and a list of CANDIDATES from the library. Your job is to find ALL meaningful matches and classify each relationship. You may return zero, one, or multiple matches.

LIBRARY STRUCTURE:
- Snippets are organized in a parent/child tree.
- A PARENT is an abstract snippet (generic code) that represents a shared concept. Its CHILDREN are concrete implementations (variants).
- A parent can have MULTIPLE children. SIBLINGS are children of the same parent.
- STANDALONE snippets have no parent and no children.

Each candidate includes its family context:
- Role: PARENT (has children), CHILD (has a parent + siblings), or STANDALONE.
- Family members are listed so you can see how the tree looks.
- RELATIONSHIPS between candidates are noted (e.g. "#1 is child of #3").

VERDICTS:
- "variant": The new snippet and the candidate solve the SAME abstract problem with different implementations. They would be siblings under a shared concept. Example: useDebounce (useRef) and useDebounce (setTimeout) are variants.
- "parent_of": The new snippet is MORE ABSTRACT than the candidate and could serve as its parent. The new snippet captures the generic pattern that the candidate is a concrete implementation of. Only valid for STANDALONE candidates (cannot re-parent existing children).
- "expansion": The new snippet adds NEW FUNCTIONALITY to the candidate. It extends what the candidate does rather than being an alternative. Example: adding "cancel" and "flush" to an existing debounce hook. Expansion targets ONE specific snippet.

CONSTRAINTS:
- A snippet can have AT MOST ONE parent. Relationships are mutually exclusive: a CHILD cannot be re-parented.
- "parent_of" is only valid for STANDALONE candidates. CHILD and PARENT candidates already belong to a family.
- "variant" on a CHILD candidate means joining that child's EXISTING family (redirect to parent), NOT creating a new family.
- "variant" on a PARENT candidate means joining that EXISTING family as another child, NOT creating a new parent above it.
- Only STANDALONE candidates can be grouped into a NEW family (via "variant" or "parent_of").

MULTIPLE MATCHES:
You can return multiple matches when the new snippet relates to several candidates:
- "variant" can appear multiple times → backend creates ONE abstract parent for the new snippet + all matched STANDALONE candidates. If one of the matches is a PARENT or CHILD, the new snippet simply joins that existing family instead.
- "parent_of" can appear multiple times → new snippet becomes parent of all matched STANDALONE candidates.
- "expansion" must appear at most ONCE (you expand one specific snippet).
- Do NOT mix "variant" with "parent_of". Pick whichever fits best.
- "expansion" CAN coexist with "variant" or "parent_of" if a different candidate is the expansion target.

DECISION STRATEGY:
1. PARENT candidate + "variant" → use the parent's id (new snippet joins existing family as another child).
2. CHILD candidate + "variant" → use the PARENT's id (new snippet joins the same family as a sibling).
3. STANDALONE candidate + "variant" → use the standalone's id (backend creates abstract parent for all).
4. STANDALONE candidate + "parent_of" → use the standalone's id (new snippet becomes its parent directly).
5. Any candidate + "expansion" → use that candidate's exact id (expansion targets that specific snippet).
6. If no candidate truly fits → return empty matches array. Do NOT force matches.

RESPOND with ONLY this JSON:
{
  "matches": [
    {
      "candidateId": <number>,
      "verdict": "variant" | "parent_of" | "expansion",
      "confidence": 0.0 to 1.0,
      "reasoning": "1-2 sentences"
    }
  ]
}`.trim();

// ── Judge types ──────────────────────────────────────────────────────────────

export type JudgeCandidateInput = {
	id: number;
	name: string;
	code: string;
	description?: string | undefined;
	combinedScore: number;
	role: "PARENT" | "CHILD" | "STANDALONE";
	parent?: { id: number; name: string } | null;
	siblings?: { id: number; name: string }[];
	children?: { id: number; name: string }[];
};

export function buildJudgeUserPrompt(
	newItem: { name: string; code: string; description?: string },
	candidates: JudgeCandidateInput[],
): string {
	// Build candidate blocks
	const candidateBlocks = candidates.map((c, i) => {
		const lines: string[] = [];
		lines.push(`--- #${i + 1} (id:${c.id}, score:${c.combinedScore.toFixed(3)}) — ${c.role} ---`);
		lines.push(`Name: ${c.name}`);
		lines.push(`Description: ${c.description || "N/A"}`);
		lines.push(`Code:\n${c.code}`);

		if (c.role === "PARENT" && c.children?.length) {
			lines.push(`Children: ${c.children.map((ch) => `${ch.name} (id:${ch.id})`).join(", ")}`);
		}
		if (c.role === "CHILD" && c.parent) {
			lines.push(`Parent: ${c.parent.name} (id:${c.parent.id})`);
			if (c.siblings?.length) {
				lines.push(`Siblings: ${c.siblings.map((s) => `${s.name} (id:${s.id})`).join(", ")}`);
			}
		}

		return lines.join("\n");
	});

	// Detect inter-candidate relationships
	const relationships: string[] = [];
	for (const c of candidates) {
		if (c.role === "CHILD" && c.parent) {
			const parentCandidate = candidates.find((other) => other.id === c.parent!.id);
			if (parentCandidate) {
				const ci = candidates.indexOf(c) + 1;
				const pi = candidates.indexOf(parentCandidate) + 1;
				relationships.push(`#${ci} is a child of #${pi} (same family)`);
			}
		}
		if (c.role === "PARENT" && c.children?.length) {
			for (const child of c.children) {
				const childCandidate = candidates.find((other) => other.id === child.id);
				if (childCandidate) {
					const pi = candidates.indexOf(c) + 1;
					const ci = candidates.indexOf(childCandidate) + 1;
					if (!relationships.some((r) => r.includes(`#${ci}`) && r.includes(`#${pi}`))) {
						relationships.push(`#${ci} is a child of #${pi} (same family)`);
					}
				}
			}
		}
	}

	const relationshipsBlock = relationships.length
		? `\nINTER-CANDIDATE RELATIONSHIPS:\n${relationships.map((r) => `- ${r}`).join("\n")}`
		: "";

	return `NEW SNIPPET:
Name: ${newItem.name}
Description: ${newItem.description || "N/A"}
Code:
${newItem.code}

CANDIDATES (${candidates.length}, ordered by combined score):

${candidateBlocks.join("\n\n")}
${relationshipsBlock}

Return ALL meaningful matches (or empty array if none fit). For "variant" on a child, use the parent's id. For "expansion", use the exact target's id. For "parent_of", use the standalone's id.`;
}

// ── Parent Creator ──────────────────────────────────────────────────────────

export const PARENT_CREATOR_SYSTEM_PROMPT = `You are a code library architect. Given two variant snippets that solve the same abstract problem differently, you must create an ABSTRACT PARENT snippet that represents the shared concept.

The parent:
- Has GENERIC code that captures the core pattern both variants share. Use generic names: items, data, handler, callback, options. No domain-specific terms.
- Has a name that describes the abstract concept (not either variant specifically).
- Has a description that explains the shared pattern in 2-3 sentences.
- Has useCases that cover the abstract concept, not the specific variants.

RESPOND with ONLY this JSON:
{
  "name": "string",
  "description": "string (2-3 sentences)",
  "code": "string (generic/abstract implementation)",
  "useCases": [{"title": "string", "use": "string"}],
  "type": "string",
  "domain": "string",
  "stack": "string",
  "language": "string",
  "libraries": ["string"],
  "tags": ["string"]
}`.trim();

export function buildParentCreatorUserPrompt(
	childA: { name: string; code: string; description?: string | undefined },
	childB: { name: string; code: string; description?: string | undefined },
): string {
	return `VARIANT A:
Name: ${childA.name}
Description: ${childA.description || "N/A"}
Code:
${childA.code}

VARIANT B:
Name: ${childB.name}
Description: ${childB.description || "N/A"}
Code:
${childB.code}

Create the abstract parent snippet.`;
}

// ── Expander ────────────────────────────────────────────────────────────────

export const EXPANDER_SYSTEM_PROMPT = `You are a code library curator. A new snippet has been identified as an EXPANSION of an existing snippet — it adds new functionality rather than being a separate variant.

Your job:
1. Generate an expansion object to append to the existing snippet's expansions array.
2. Optionally suggest updates to the existing snippet's main fields for coherence with the new capability.

The expansion object documents the new capability being added. The "useCases" field is OPTIONAL — only include it if the expansion introduces clearly distinct use cases.

RESPOND with ONLY this JSON:
{
  "expansion": {
    "title": "string (short label for the new capability)",
    "description": "string (1-2 sentences explaining what this expansion adds)",
    "code": "string (the code that implements this expansion)"
  },
  "fieldUpdates": {
    "description": "string | null (updated description if needed, null if no change)",
    "tags": ["string"] | null (merged tags array if needed, null if no change),
    "useCases": [{"title": "string", "use": "string"}] | null (merged useCases if needed, null if no change)
  }
}

Note: in "expansion", you MAY add "useCases": [{"title": "string", "use": "string"}] if relevant, but omit it if not needed.
Note: the backend will automatically add "sourceName", "sourceCode", and "createdAt" to the expansion object — do NOT include them in your response.`.trim();

// ── Render Pipeline: Decompose ─────────────────────────────────────────────

export const DECOMPOSE_SYSTEM_PROMPT = `You are a UI component architect. Given a set of files from a project, you decompose them into a hierarchy of organisms, molecules, and atoms.

DEFINITIONS:
- ATOM: a single-file, single-responsibility unit. One function, one hook, one utility, one query. If it does ONE thing, it's an atom.
- MOLECULE: a multi-file unit that does ONE thing by combining atoms from the SAME domain. A SearchBar (Input + Button + search logic) is a molecule. A form with validation is a molecule. Key test: does it serve a single purpose?
- ORGANISM: a unit that does MULTIPLE things by combining molecules from DIFFERENT domains. A SearchBar with AI integration is an organism (search + AI). A form with auth + validation + API is an organism. Key test: does it cross domain boundaries?

RECURSION: An organism CAN contain sub-organisms. If you find a molecule that crosses domain boundaries, promote it to a sub-organism. Example: "AI Chatbot" organism contains "Streaming Engine" sub-organism (has its own state, API, lifecycle) + "ChatUI" molecule (just UI).

The TOP-LEVEL organism is always exactly ONE (the entire input). Sub-organisms go in the "sub_organisms" array.

For each piece you identify:
- name: descriptive component name
- description: 1-2 sentences about what this piece does
- files: which source files belong to this piece (by filename)
- is_demoable: can this be rendered as a standalone preview? (true for UI elements, false for pure logic/backend)
- parent: the NAME of the piece this one belongs to. Organism has no parent. Sub-organisms → organism name. Molecules → organism or sub-organism name. Atoms → molecule or sub-organism name.

RULES:
- Every file must belong to at least one piece
- Molecules are subsets, NOT duplicates of the organism
- Atoms are the smallest units extracted from molecules
- Pure utility/helper files: NOT demoable but still classified as atoms
- Backend/API-only files: NOT demoable but still classified
- A molecule can reference atoms that already exist in the library — still list them
- Every piece (except organism) MUST have a parent field pointing to its direct container

RESPOND with ONLY this JSON:
{
  "organism": {
    "name": "string",
    "description": "string",
    "is_demoable": boolean,
    "files": ["filename1.tsx", "filename2.css"]
  },
  "sub_organisms": [
    {
      "name": "string",
      "description": "string",
      "is_demoable": boolean,
      "files": ["filename.tsx"],
      "parent": "organism name"
    }
  ],
  "molecules": [
    {
      "name": "string",
      "description": "string",
      "is_demoable": boolean,
      "files": ["filename.tsx"],
      "parent": "organism or sub-organism name"
    }
  ],
  "atoms": [
    {
      "name": "string",
      "description": "string",
      "is_demoable": boolean,
      "files": ["filename.tsx"],
      "parent": "molecule or sub-organism name"
    }
  ]
}`.trim();

export function buildDecomposeUserPrompt(
	files: { name: string; code: string }[],
): string {
	const fileBlocks = files
		.map((f) => `--- ${f.name} ---\n${f.code}`)
		.join("\n\n");

	return `PROJECT FILES (${files.length} files):\n\n${fileBlocks}\n\nDecompose into organism, molecules, and atoms.`;
}

// ── Render Pipeline: Create Demo ──────────────────────────────────────────

export const CREATE_DEMO_SYSTEM_PROMPT = `You are a UI demo builder. Given a component's source files, you create a demo that can run in an isolated sandbox (like Sandpack or iframe).

STRATEGY — PRESERVE ORIGINAL CODE:
1. START from the original source files. Keep them as-is whenever possible.
2. STRIP parts that won't compile in isolation (imports from parent project, env-dependent code, external API calls).
3. MOCK only what you stripped: replace API calls with mock data, replace missing imports with inline stubs.
4. ADD a thin wrapper (App.tsx) that mounts the component with mock props.
5. Write code from scratch ONLY if the original cannot compile even with stripping + mocking.

The goal is maximum fidelity to the original code. A demo built from the real code is more reliable than one written from scratch.

RULES:
- The demo must be SELF-CONTAINED: no imports from the parent project
- Replace API calls with mock data/responses, not remove them
- Keep original styling, component structure, and prop interfaces
- If the component has features from multiple domains (e.g., SearchBar with AI), strip the extra domain (AI) and demo just the core (search)
- Include a wrapper/App component that mounts the target component

OUTPUT:
- files: the demo files (App.tsx + component files, preserving original code where possible)
- entry_file: which file is the entry point (usually "App.tsx")
- dependencies: npm packages needed (e.g., ["react", "framer-motion"])
- missing: things the demo can't simulate [{ name: "API_KEY", reason: "needs OpenAI API key for real responses" }]
- notes: any caveats about the demo (optional)

RESPOND with ONLY this JSON:
{
  "files": [
    { "name": "App.tsx", "code": "string", "language": "typescript" },
    { "name": "Component.tsx", "code": "string", "language": "typescript" }
  ],
  "entry_file": "App.tsx",
  "dependencies": ["react"],
  "missing": [],
  "notes": null
}`.trim();

export function buildCreateDemoUserPrompt(
	componentName: string,
	files: { name: string; code: string }[],
): string {
	const fileBlocks = files
		.map((f) => `--- ${f.name} ---\n${f.code}`)
		.join("\n\n");

	return `Create a standalone demo for the component "${componentName}".

SOURCE FILES:\n\n${fileBlocks}`;
}

// ── Render Pipeline: Scale with Props ─────────────────────────────────────

export const SCALE_PROPS_SYSTEM_PROMPT = `You are a UI demo optimizer. Given an EXISTING demo and a NEW variant of the same component, you decide if the existing demo can accommodate the new variant by simply changing props, or if a completely new demo is needed.

STRATEGY:
- If the variant only differs in visual style (color, size, shape) → scale with props
- If the variant adds new interactive behavior → probably needs new demo
- If the variant changes the component's structure significantly → needs new demo
- When in doubt, prefer scaling with props to save space

RESPOND with ONLY this JSON:
{
  "can_scale": boolean,
  "props": { "variant": "shiny", "size": "lg" } | null,
  "reason": "1-2 sentences explaining the decision",
  "new_demo": null | {
    "files": [{ "name": "string", "code": "string", "language": "string" }],
    "entry_file": "string",
    "dependencies": ["string"],
    "missing": [],
    "notes": null
  }
}

If can_scale is true: props contains the prop overrides to apply, new_demo is null.
If can_scale is false: props is null, new_demo contains the full new demo.`.trim();

export function buildScalePropsUserPrompt(
	existingDemo: { files: { name: string; code: string }[]; props: Record<string, unknown> },
	newVariant: { name: string; code: string; description?: string },
): string {
	const demoBlocks = existingDemo.files
		.map((f) => `--- ${f.name} ---\n${f.code}`)
		.join("\n\n");

	return `EXISTING DEMO (props: ${JSON.stringify(existingDemo.props)}):

${demoBlocks}

NEW VARIANT:
Name: ${newVariant.name}
Description: ${newVariant.description || "N/A"}
Code:
${newVariant.code}

Can the existing demo accommodate this variant with just prop changes?`;
}

// ── Render Pipeline: Check Demo Reuse ─────────────────────────────────────

export const CHECK_DEMO_REUSE_SYSTEM_PROMPT = `You are a UI demo curator. A new component arrived that is similar to an existing one. You decide if the existing demo can be reused, extended with props, or if a new demo is needed.

VERDICTS:
- "reuse": the existing demo works as-is for the new component (identical UI behavior)
- "scale": the existing demo works with different props (visual variant only)
- "new": the components are too different, need a fresh demo

RESPOND with ONLY this JSON:
{
  "verdict": "reuse" | "scale" | "new",
  "props": { ... } | null,
  "reason": "1-2 sentences"
}`.trim();

export function buildCheckDemoReuseUserPrompt(
	existingComponent: { name: string; code: string },
	existingDemoFiles: { name: string; code: string }[],
	newComponent: { name: string; code: string; description?: string },
): string {
	const demoBlocks = existingDemoFiles
		.map((f) => `--- ${f.name} ---\n${f.code}`)
		.join("\n\n");

	return `EXISTING COMPONENT:
Name: ${existingComponent.name}
Code:
${existingComponent.code}

EXISTING DEMO:
${demoBlocks}

NEW COMPONENT:
Name: ${newComponent.name}
Description: ${newComponent.description || "N/A"}
Code:
${newComponent.code}

Can the existing demo be reused for the new component?`;
}

// ── Expander ────────────────────────────────────────────────────────────────

export function buildExpanderUserPrompt(
	existingSnippet: { name: string; code: string; description?: string; expansions?: unknown[] },
	newItem: { name: string; code: string; description?: string },
): string {
	const expansionsContext = existingSnippet.expansions?.length
		? `\nExisting expansions: ${JSON.stringify(existingSnippet.expansions)}`
		: "";

	return `EXISTING SNIPPET:
Name: ${existingSnippet.name}
Description: ${existingSnippet.description || "N/A"}
Code:
${existingSnippet.code}${expansionsContext}

NEW ITEM TO ABSORB:
Name: ${newItem.name}
Description: ${newItem.description || "N/A"}
Code:
${newItem.code}

Generate the expansion object and any field updates.`;
}

// ── Auto-classify files ──────────────────────────────────────────────────

export const CLASSIFY_FILES_SYSTEM_PROMPT = `You are a code analyst. Given source files, you analyze them and return structured metadata.

CLASSIFICATION RULES:
- 1 file with a single function/hook/utility → kind: "snippet"
- 1 file with JSX/React component → kind: "component"
- Multiple files forming a UI component → kind: "component"
- Multiple files forming a utility/config/middleware collection → kind: "collection"

RESPOND with ONLY this JSON:
{
  "kind": "snippet" | "component" | "collection",
  "name": "string (descriptive PascalCase name for components, camelCase for snippets)",
  "description": "string (2-3 sentences)",
  "type": "string (element type or snippet type)",
  "domain": "string (functional area)",
  "stack": "frontend" | "backend" | "fullstack",
  "language": "string (primary language)",
  "category": "string (broad navigational area)",
  "libraries": ["string (npm packages from imports)"],
  "tags": ["string (1-3 lowercase keywords)"],
  "useCases": [{"title": "string", "use": "string"}],
  "entryFile": "string (main entry point filename, must match a file name exactly)"
}

RULES:
- Respond with ONLY valid JSON. No markdown, no backticks.
- "name": derive from the code's purpose, not from filenames.
- "libraries": only npm packages actually imported. No built-in modules.
- "tags": lowercase, singular (e.g. "animation" not "animations").
- "entryFile": the file with the default export or main entry. For snippets with 1 file, use that file.
- "useCases": 2-4 practical use cases.`.trim();

export function buildClassifyUserPrompt(
	files: { name: string; code: string }[],
	meta: { types?: string[]; domains?: string[]; tags?: string[]; categories?: string[] },
): string {
	const fileBlocks = files
		.map((f) => `--- ${f.name} ---\n${f.code}`)
		.join("\n\n");

	const metaBlock: string[] = [];
	if (meta.types?.length) metaBlock.push(`EXISTING TYPES: ${meta.types.join(", ")}. Prefer these if they fit.`);
	if (meta.domains?.length) metaBlock.push(`EXISTING DOMAINS: ${meta.domains.join(", ")}. Prefer these if they fit.`);
	if (meta.tags?.length) metaBlock.push(`EXISTING TAGS: ${meta.tags.join(", ")}. Prefer these if they fit.`);
	if (meta.categories?.length) metaBlock.push(`EXISTING CATEGORIES: ${meta.categories.join(", ")}. Prefer these if they fit.`);

	return `FILES (${files.length}):\n\n${fileBlocks}\n\n${metaBlock.join("\n")}\n\nClassify and return metadata.`;
}

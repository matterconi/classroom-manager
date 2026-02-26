const EXAMPLE_COMPONENT_TYPES = [
  "button", "card", "input", "form", "modal", "navbar", "sidebar", "hero",
  "layout", "carousel", "tabs", "accordion", "toast", "tooltip", "dropdown",
  "badge", "loader", "background", "scene", "text", "table", "avatar",
];

const EXAMPLE_SNIPPET_TYPES = [
  "hook", "utility", "route", "middleware", "helper", "config", "handler", "validator",
];

const EXAMPLE_DOMAINS = [
  "hooks", "api", "database", "auth", "validation", "utility", "middleware",
  "state-management", "file-handling", "real-time", "testing", "security",
];

const EXAMPLE_THEORY_TYPES = ["algorithm", "data-structure", "design-pattern"];

const EXAMPLE_COMPLEXITIES = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)", "O(2^n)", "O(n!)"];

// ── Meta type (from /api/components/meta) ────────────────────────────────────

export type ResourceMeta = {
  types?: string[];
  domains?: string[];
  tags?: string[];
  categories: string[];
};

// ── Helper blocks ────────────────────────────────────────────────────────────

function buildCategoryBlock(categories: string[]): string {
  if (categories.length === 0) return "";
  return `
EXISTING CATEGORIES: ${categories.join(", ")}
- For "category": strongly prefer an existing category if it fits. Categories represent broad frontend areas (e.g. "Animations", "3D", "Layout"). Only suggest a NEW one if none of the existing ones work. Keep it short and general.`;
}

function buildExistingValuesBlock(label: string, field: string, dbValues: string[], fallbackExamples: string[]): string {
  if (dbValues.length === 0) {
    return `Prefer one of these if it fits: ${fallbackExamples.join(", ")}. You may suggest a new one if nothing matches.`;
  }
  return `EXISTING ${label}: ${dbValues.join(", ")}
- For "${field}": strongly prefer an existing value. Only suggest a new one if none fit. Additional examples: ${fallbackExamples.filter((e) => !dbValues.includes(e)).join(", ")}.`;
}

function buildTagsBlock(existingTags: string[]): string {
  if (existingTags.length === 0) return "";
  return `
EXISTING TAGS: ${existingTags.join(", ")}
- For "tags": strongly prefer existing tags if they fit. Only create a new tag if none of the existing ones describe this resource. Keep tags lowercase, singular (e.g. "animation" not "animations").`;
}

const JSON_RULES = `
RULES:
- Respond with ONLY valid JSON. No markdown, no backticks, no explanation.
- "description": 1-2 concise sentences in English.
- "useCases": 2-4 practical use cases, separated by newlines.
- "libraries": array of npm package names actually used in the code (from imports). Do NOT include native/built-in modules.
- "tags": 1-3 lowercase descriptive keywords about the component's behavior, style, or technique.
`.trim();

// ── Components ──────────────────────────────────────────────────────────────

type FileInput = { name: string; code: string };

export function buildComponentPrompt(
  name: string,
  files: FileInput[],
  meta: ResourceMeta,
): string {
  const filesBlock = files
    .map((f) => `--- File: ${f.name} ---\n${f.code}`)
    .join("\n\n");

  return `You are a UI component analyst. Analyze this React component and return structured metadata as JSON.

Component name: "${name}"

${filesBlock}

Return JSON with exactly these fields:
{
  "description": "string",
  "useCases": "string",
  "type": "string",
  "domain": "string",
  "category": "string",
  "libraries": ["string"],
  "tags": ["string"],
  "entryFile": "string"
}

${JSON_RULES}
- "type": WHAT type of UI element this is (e.g. button, card, modal). ${buildExistingValuesBlock("TYPES", "type", meta.types || [], EXAMPLE_COMPONENT_TYPES)}
- "domain": the functional area this component belongs to, bridging element and category (e.g. "navigation", "data-entry", "feedback", "visualization"). ${buildExistingValuesBlock("DOMAINS", "domain", meta.domains || [], EXAMPLE_DOMAINS)}
- "category": WHICH broad frontend area this belongs to (e.g. Animations, 3D, Layout). This is NOT the element type or domain.
- "entryFile": the filename (from the provided files) that serves as the main entry point — typically the one with the default export. Must match one of the file names exactly.
${buildCategoryBlock(meta.categories)}
${buildTagsBlock(meta.tags || [])}`;
}

// ── Snippets ────────────────────────────────────────────────────────────────

export function buildSnippetPrompt(
  name: string,
  code: string,
  meta: ResourceMeta,
): string {
  return `You are a code analyst. Analyze this code snippet and return structured metadata as JSON.

Snippet name: "${name}"

--- Code ---
${code}

Return JSON with exactly these fields:
{
  "description": "string",
  "useCases": "string",
  "type": "string",
  "domain": "string",
  "stack": "string",
  "language": "string",
  "category": "string",
  "libraries": ["string"],
  "tags": ["string"]
}

${JSON_RULES}
- "type": WHAT kind of snippet this is (e.g. hook, utility, middleware). Prefer one of these if it fits: ${EXAMPLE_SNIPPET_TYPES.join(", ")}. You may suggest a new one if nothing matches.
- "domain": the functional area of this snippet. ${buildExistingValuesBlock("DOMAINS", "domain", meta.domains || [], EXAMPLE_DOMAINS)}
- "stack": "frontend" or "backend".
- "language": detect from the code. Common values: typescript, javascript, python, sql, css, html, shell.
- "category": WHICH broad area this belongs to. This is NOT the domain.
${buildCategoryBlock(meta.categories)}
${buildTagsBlock(meta.tags || [])}`;
}

// ── Theory ──────────────────────────────────────────────────────────────────

export function buildTheoryPrompt(
  name: string,
  code: string,
  meta: ResourceMeta,
): string {
  return `You are a computer science educator. Analyze this code example and return structured metadata as JSON.

Theory entry name: "${name}"

--- Code ---
${code}

Return JSON with exactly these fields:
{
  "description": "string",
  "useCases": "string",
  "type": "string",
  "domain": "string",
  "complexity": "string",
  "category": "string",
  "tags": ["string"]
}

${JSON_RULES}
- "description": explain what this algorithm/pattern/data structure is and how it works.
- "useCases": when and why you would use this in real-world applications.
- "type": prefer one of these if it fits: ${EXAMPLE_THEORY_TYPES.join(", ")}. You may suggest a new one if nothing matches.
- "domain": the specific CS sub-area (e.g. "sorting", "graph-traversal", "creational-patterns"). ${buildExistingValuesBlock("DOMAINS", "domain", meta.domains || [], EXAMPLE_DOMAINS)}
- "complexity": prefer one of these if it fits: ${EXAMPLE_COMPLEXITIES.join(", ")}. If not applicable, use "O(n)".
- "category": WHICH broad CS area this belongs to. This is NOT the type.
${buildCategoryBlock(meta.categories)}
${buildTagsBlock(meta.tags || [])}`;
}

// ── Collections ─────────────────────────────────────────────────────────────

export function buildCollectionPrompt(
  name: string,
  files: FileInput[],
  meta: ResourceMeta,
): string {
  const filesBlock = files
    .map((f) => `--- File: ${f.name} ---\n${f.code}`)
    .join("\n\n");

  return `You are a software architect. Analyze this collection of files and return structured metadata as JSON.

Collection name: "${name}"

${filesBlock}

Return JSON with exactly these fields:
{
  "description": "string",
  "domain": "string",
  "stack": "string",
  "category": "string",
  "libraries": ["string"],
  "tags": ["string"],
  "entryFile": "string"
}

${JSON_RULES}
- "domain": the functional area of this collection. ${buildExistingValuesBlock("DOMAINS", "domain", meta.domains || [], EXAMPLE_DOMAINS)}
- "stack": "frontend", "backend", or "fullstack". Determine from the code context.
- "category": WHICH broad area this belongs to.
- "entryFile": the filename (from the provided files) that serves as the main entry point — typically the one with the default export. Must match one of the file names exactly.
${buildCategoryBlock(meta.categories)}
${buildTagsBlock(meta.tags || [])}`;
}

export const STACK_OPTIONS = [
  { value: "frontend", label: "Frontend" },
  { value: "backend", label: "Backend" },
] as const;

export const COLLECTION_STACK_OPTIONS = [
  { value: "frontend", label: "Frontend" },
  { value: "backend", label: "Backend" },
  { value: "fullstack", label: "Fullstack" },
] as const;

export const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
] as const;

export const SNIPPET_TYPE_OPTIONS = [
  { value: "algorithm", label: "Algorithm" },
  { value: "data-structure", label: "Data Structure" },
  { value: "technique", label: "Technique" },
] as const;

export const COMPLEXITY_OPTIONS = [
  { value: "O(1)", label: "O(1)" },
  { value: "O(log n)", label: "O(log n)" },
  { value: "O(n)", label: "O(n)" },
  { value: "O(n log n)", label: "O(n log n)" },
  { value: "O(n^2)", label: "O(n²)" },
  { value: "O(2^n)", label: "O(2^n)" },
  { value: "O(n!)", label: "O(n!)" },
] as const;

export const LANGUAGE_OPTIONS = [
  { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" },
  { value: "css", label: "CSS" },
  { value: "html", label: "HTML" },
  { value: "sql", label: "SQL" },
  { value: "shell", label: "Shell" },
] as const;

const getEnvVar = (key: string): string => {
  const value = (import.meta.env as Record<string, string>)[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

const getEnvUrl = (key: string): string => {
  const value = getEnvVar(key);
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error();
    }
  } catch {
    throw new Error(
      `Environment variable ${key} must be a valid HTTP/HTTPS URL, got: "${value}"`,
    );
  }
  return value;
};

export const BACKEND_BASE_URL = getEnvUrl("VITE_BACKEND_BASE_URL");

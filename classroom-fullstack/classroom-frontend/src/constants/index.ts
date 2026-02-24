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

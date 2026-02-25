export const ELEMENT_OPTIONS = [
  { value: "button", label: "Button" },
  { value: "card", label: "Card" },
  { value: "input", label: "Input" },
  { value: "form", label: "Form" },
  { value: "modal", label: "Modal" },
  { value: "navbar", label: "Navbar" },
  { value: "sidebar", label: "Sidebar" },
  { value: "hero", label: "Hero" },
  { value: "layout", label: "Layout" },
  { value: "carousel", label: "Carousel" },
  { value: "tabs", label: "Tabs" },
  { value: "accordion", label: "Accordion" },
  { value: "toast", label: "Toast" },
  { value: "tooltip", label: "Tooltip" },
  { value: "dropdown", label: "Dropdown" },
  { value: "badge", label: "Badge" },
  { value: "loader", label: "Loader" },
  { value: "background", label: "Background" },
  { value: "scene", label: "Scene" },
  { value: "text", label: "Text" },
  { value: "table", label: "Table" },
  { value: "avatar", label: "Avatar" },
  { value: "other", label: "Other" },
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

export const DOMAIN_OPTIONS = [
  { value: "hooks", label: "Hooks" },
  { value: "api", label: "API" },
  { value: "database", label: "Database" },
  { value: "auth", label: "Auth" },
  { value: "validation", label: "Validation" },
  { value: "utility", label: "Utility" },
  { value: "middleware", label: "Middleware" },
  { value: "state-management", label: "State Management" },
  { value: "file-handling", label: "File Handling" },
  { value: "real-time", label: "Real-time" },
  { value: "testing", label: "Testing" },
  { value: "security", label: "Security" },
] as const;

export const SNIPPET_STACK_OPTIONS = [
  { value: "frontend", label: "Frontend" },
  { value: "backend", label: "Backend" },
] as const;

export const THEORY_TYPE_OPTIONS = [
  { value: "algorithm", label: "Algorithm" },
  { value: "data-structure", label: "Data Structure" },
  { value: "design-pattern", label: "Design Pattern" },
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
  { value: "python", label: "Python" },
  { value: "sql", label: "SQL" },
  { value: "css", label: "CSS" },
  { value: "html", label: "HTML" },
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

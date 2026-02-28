export type Category = {
  id: number;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  resource?: string;
  createdAt?: string;
};

export type UseCase = {
  title: string;
  use: string;
};

// ── Edge-based relationships ─────────────────────────────────────────────────

export type EdgeType = "parent" | "expansion" | "belongs_to";

export type Edge = {
  id: number;
  sourceId: number;
  targetId: number;
  resource: "item";
  type: EdgeType;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export type ExpansionMetadata = {
  title: string;
  description: string;
  code: string;
  useCases?: UseCase[];
  sourceName: string;
  sourceCode: string;
  createdAt: string;
};

export type SimilarItem = {
  id: number;
  name: string;
  description?: string;
  code: string;
  similarity: number;
  hasChildren: boolean;
};

export type JudgeMatch = {
  candidateId: number;
  verdict: "variant" | "parent_of" | "expansion";
  confidence: number;
  reasoning: string;
};

export type JudgeVerdict = {
  matches: JudgeMatch[];
};

export type ComponentVariant = {
  prop: string;
  options: string[];
};

// ── Unified Item ─────────────────────────────────────────────────────────────

export type ItemKind = "snippet" | "component" | "collection";

export type ItemFile = {
  id: number;
  itemId: number;
  name: string;
  code: string;
  language?: string;
  order: number;
  createdAt?: string;
  updatedAt?: string;
};

export type Item = {
  id: number;
  kind: ItemKind;
  categoryId?: number;
  name: string;
  slug: string;
  description?: string;
  code?: string;
  type?: string;
  domain?: string;
  stack?: string;
  language?: string;
  useCases?: UseCase[];
  libraries?: string[];
  tags?: string[];
  variants?: ComponentVariant[];
  entryFile?: string;
  isAbstract?: boolean;
  category?: Category;
  children?: Item[];
  expansions?: Edge[];
  files?: ItemFile[];
  filesCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

// Backward-compatible aliases
export type Snippet = Item;
export type Theory = Item;
export type Component = Item;
export type Collection = Item;
export type ComponentFile = ItemFile;
export type CollectionFile = ItemFile;

// ── API Response types ───────────────────────────────────────────────────────

export type ListResponse<T = unknown> = {
  data?: T[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type CreateResponse<T = unknown> = {
  data?: T;
  similarItems?: SimilarItem[];
};

export type GetOneResponse<T = unknown> = {
  data?: T;
};

export enum UserRole {
  STUDENT = "student",
  TEACHER = "teacher",
  ADMIN = "admin",
}

export type User = {
  id: string;
  createdAt: string;
  updatedAt: string;
  email: string;
  name: string;
  role: UserRole;
  image?: string;
  imageCldPubId?: string;
};

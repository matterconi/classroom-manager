export type Category = {
  id: number;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  resource?: string;
  createdAt?: string;
};

export type ComponentVariant = {
  prop: string;
  options: string[];
};

export type ComponentFile = {
  id: number;
  componentId: number;
  name: string;
  code: string;
  order: number;
  createdAt?: string;
  updatedAt?: string;
};

export type Component = {
  id: number;
  categoryId?: number;
  name: string;
  slug: string;
  type?: string;
  domain?: string;
  description?: string;
  useCases?: string;
  libraries?: string[];
  tags?: string[];
  variants?: ComponentVariant[];
  entryFile?: string;
  status: "draft" | "published" | "archived";
  category?: Category;
  filesCount?: number;
  files?: ComponentFile[];
  createdAt?: string;
  updatedAt?: string;
};

export type Collection = {
  id: number;
  categoryId?: number;
  name: string;
  slug: string;
  description?: string;
  domain?: string;
  stack?: "frontend" | "backend" | "fullstack";
  libraries?: string[];
  tags?: string[];
  entryFile?: string;
  status: "draft" | "published" | "archived";
  category?: Category;
  filesCount?: number;
  files?: CollectionFile[];
  createdAt?: string;
  updatedAt?: string;
};

export type CollectionFile = {
  id: number;
  collectionId: number;
  name: string;
  code: string;
  language?: string;
  order: number;
  createdAt?: string;
  updatedAt?: string;
};

export type Snippet = {
  id: number;
  categoryId?: number;
  name: string;
  slug: string;
  description?: string;
  code: string;
  type?: string;
  domain?: string;
  stack?: string;
  language?: string;
  useCases?: string;
  libraries?: string[];
  tags?: string[];
  status: "draft" | "published" | "archived";
  category?: Category;
  createdAt?: string;
  updatedAt?: string;
};

export type Theory = {
  id: number;
  categoryId?: number;
  name: string;
  slug: string;
  description?: string;
  code: string;
  type?: "algorithm" | "data-structure" | "design-pattern";
  domain?: string;
  complexity?: string;
  useCases?: string;
  tags?: string[];
  status: "draft" | "published" | "archived";
  category?: Category;
  createdAt?: string;
  updatedAt?: string;
};

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

export type Category = {
  id: number;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  createdAt?: string;
};

export type Component = {
  id: number;
  categoryId?: number;
  name: string;
  slug: string;
  description?: string;
  code: string;
  language?: string;
  stack?: "frontend" | "backend";
  libraries?: string[];
  tags?: string[];
  documentation?: string;
  demoUrl?: string;
  status: "draft" | "published" | "archived";
  category?: Category;
  createdAt?: string;
  updatedAt?: string;
};

export type Collection = {
  id: number;
  categoryId?: number;
  name: string;
  slug: string;
  description?: string;
  stack?: "frontend" | "backend" | "fullstack";
  libraries?: string[];
  tags?: string[];
  documentation?: string;
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

import * as z from "zod";

export const categorySchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
  icon: z.string().optional(),
});

const componentFileSchema = z.object({
  name: z.string().min(1, "File name is required"),
  code: z.string().min(1, "Code is required"),
});

const variantSchema = z.object({
  prop: z.string().min(1, "Prop name is required"),
  options: z.array(z.string().min(1)).min(1, "At least one option is required"),
});

export const componentSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  element: z.string().optional(),
  domain: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.coerce.number().optional(),
  useCases: z.string().optional(),
  libraries: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  variants: z.array(variantSchema).optional(),
  entryFile: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  files: z.array(componentFileSchema).min(1, "At least one file is required"),
});

export const collectionFileSchema = z.object({
  name: z.string().min(1, "File name is required"),
  code: z.string().min(1, "Code is required"),
  language: z.string().optional(),
});

export const collectionSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
  categoryId: z.coerce.number().optional(),
  stack: z.enum(["frontend", "backend", "fullstack"]).optional(),
  libraries: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  entryFile: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  files: z
    .array(collectionFileSchema)
    .min(1, "At least one file is required"),
});

export const snippetSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  code: z.string().min(1, "Code is required"),
  description: z.string().optional(),
  categoryId: z.coerce.number().optional(),
  domain: z.string().optional(),
  stack: z.string().optional(),
  language: z.string().optional(),
  useCases: z.string().optional(),
  libraries: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

export const theorySchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  code: z.string().min(1, "Code is required"),
  description: z.string().optional(),
  categoryId: z.coerce.number().optional(),
  type: z.enum(["algorithm", "data-structure", "design-pattern"]).optional(),
  complexity: z.string().optional(),
  useCases: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

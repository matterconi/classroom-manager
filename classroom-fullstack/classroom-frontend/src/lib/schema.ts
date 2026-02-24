import * as z from "zod";

export const categorySchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
  icon: z.string().optional(),
});

export const componentSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  code: z.string().min(1, "Code is required"),
  description: z.string().optional(),
  categoryId: z.coerce.number().optional(),
  language: z.string().optional(),
  stack: z.enum(["frontend", "backend"]).optional(),
  libraries: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  documentation: z.string().optional(),
  demoUrl: z.string().url().optional().or(z.literal("")),
  status: z.enum(["draft", "published", "archived"]).optional(),
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
  documentation: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  files: z
    .array(collectionFileSchema)
    .min(1, "At least one file is required"),
});

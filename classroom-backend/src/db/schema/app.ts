import { relations } from "drizzle-orm";
import {
  integer,
  varchar,
  text,
  jsonb,
  pgTable,
  pgEnum,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

// ── Shared timestamps ──────────────────────────────────────────────────────────

const timestamps = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

// ── Enums ──────────────────────────────────────────────────────────────────────

export const componentStatusEnum = pgEnum("component_status", [
  "draft",
  "published",
  "archived",
]);

export const stackEnum = pgEnum("stack", ["frontend", "backend"]);

export const collectionStackEnum = pgEnum("collection_stack", [
  "frontend",
  "backend",
  "fullstack",
]);

export const snippetTypeEnum = pgEnum("snippet_type", [
  "algorithm",
  "data-structure",
  "technique",
]);

// ── Categories ────────────────────────────────────────────────────────────────

export const categories = pgTable("categories", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  description: text("description"),
  icon: varchar("icon", { length: 100 }),
  ...timestamps,
});

// ── Components ────────────────────────────────────────────────────────────────

export const components = pgTable(
  "components",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    description: text("description"),
    code: text("code").notNull(),
    language: varchar("language", { length: 50 }),
    stack: stackEnum("stack"),
    libraries: jsonb("libraries").$type<string[]>(),
    tags: jsonb("tags").$type<string[]>(),
    documentation: text("documentation"),
    demoUrl: text("demo_url"),
    status: componentStatusEnum("status").default("draft").notNull(),
    ...timestamps,
  },
  (table) => [index("components_category_id_idx").on(table.categoryId)],
);

// ── Collections ───────────────────────────────────────────────────────────────

export const collections = pgTable(
  "collections",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    description: text("description"),
    stack: collectionStackEnum("stack"),
    libraries: jsonb("libraries").$type<string[]>(),
    tags: jsonb("tags").$type<string[]>(),
    documentation: text("documentation"),
    entryFile: varchar("entry_file", { length: 255 }),
    status: componentStatusEnum("status").default("draft").notNull(),
    ...timestamps,
  },
  (table) => [index("collections_category_id_idx").on(table.categoryId)],
);

// ── Collection Files ──────────────────────────────────────────────────────────

export const collectionFiles = pgTable(
  "collection_files",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    collectionId: integer("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    code: text("code").notNull(),
    language: varchar("language", { length: 50 }),
    order: integer("order").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    index("collection_files_collection_id_idx").on(table.collectionId),
  ],
);

// ── Snippets ─────────────────────────────────────────────────────────────────

export const snippets = pgTable(
  "snippets",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    description: text("description"),
    code: text("code").notNull(),
    type: snippetTypeEnum("type"),
    complexity: varchar("complexity", { length: 50 }),
    useCases: text("use_cases"),
    tags: jsonb("tags").$type<string[]>(),
    status: componentStatusEnum("status").default("draft").notNull(),
    ...timestamps,
  },
  (table) => [index("snippets_category_id_idx").on(table.categoryId)],
);

// ── Relations ──────────────────────────────────────────────────────────────────

export const categoryRelations = relations(categories, ({ many }) => ({
  components: many(components),
  collections: many(collections),
  snippets: many(snippets),
}));

export const componentRelations = relations(components, ({ one }) => ({
  category: one(categories, {
    fields: [components.categoryId],
    references: [categories.id],
  }),
}));

export const collectionRelations = relations(collections, ({ one, many }) => ({
  category: one(categories, {
    fields: [collections.categoryId],
    references: [categories.id],
  }),
  files: many(collectionFiles),
}));

export const collectionFileRelations = relations(
  collectionFiles,
  ({ one }) => ({
    collection: one(collections, {
      fields: [collectionFiles.collectionId],
      references: [collections.id],
    }),
  }),
);

export const snippetRelations = relations(snippets, ({ one }) => ({
  category: one(categories, {
    fields: [snippets.categoryId],
    references: [categories.id],
  }),
}));

// ── Type exports ───────────────────────────────────────────────────────────────

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type Component = typeof components.$inferSelect;
export type NewComponent = typeof components.$inferInsert;

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;

export type CollectionFile = typeof collectionFiles.$inferSelect;
export type NewCollectionFile = typeof collectionFiles.$inferInsert;

export type Snippet = typeof snippets.$inferSelect;
export type NewSnippet = typeof snippets.$inferInsert;

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

export const statusEnum = pgEnum("component_status", [
  "draft",
  "published",
  "archived",
]);

export const stackEnum = pgEnum("collection_stack", [
  "frontend",
  "backend",
  "fullstack",
]);

export const theoryTypeEnum = pgEnum("theory_type", [
  "algorithm",
  "data-structure",
  "design-pattern",
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
    element: varchar("element", { length: 50 }),
    description: text("description"),
    code: text("code").notNull(),
    useCases: text("use_cases"),
    libraries: jsonb("libraries").$type<string[]>(),
    tags: jsonb("tags").$type<string[]>(),
    variants:
      jsonb("variants").$type<{ prop: string; options: string[] }[]>(),
    entryFile: varchar("entry_file", { length: 255 }),
    status: statusEnum("status").default("draft").notNull(),
    ...timestamps,
  },
  (table) => [index("components_category_id_idx").on(table.categoryId)],
);

// ── Component Files ─────────────────────────────────────────────────────────

export const componentFiles = pgTable(
  "component_files",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    componentId: integer("component_id")
      .notNull()
      .references(() => components.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    code: text("code").notNull(),
    order: integer("order").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    index("component_files_component_id_idx").on(table.componentId),
  ],
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
    stack: stackEnum("stack"),
    libraries: jsonb("libraries").$type<string[]>(),
    tags: jsonb("tags").$type<string[]>(),
    entryFile: varchar("entry_file", { length: 255 }),
    status: statusEnum("status").default("draft").notNull(),
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
    domain: varchar("domain", { length: 50 }),
    stack: varchar("stack", { length: 50 }),
    language: varchar("language", { length: 50 }),
    useCases: text("use_cases"),
    tags: jsonb("tags").$type<string[]>(),
    status: statusEnum("status").default("draft").notNull(),
    ...timestamps,
  },
  (table) => [index("snippets_category_id_idx").on(table.categoryId)],
);

// ── Theory ───────────────────────────────────────────────────────────────────

export const theory = pgTable(
  "theory",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    description: text("description"),
    code: text("code").notNull(),
    type: theoryTypeEnum("type"),
    complexity: varchar("complexity", { length: 50 }),
    useCases: text("use_cases"),
    tags: jsonb("tags").$type<string[]>(),
    status: statusEnum("status").default("draft").notNull(),
    ...timestamps,
  },
  (table) => [index("theory_category_id_idx").on(table.categoryId)],
);

// ── Relations ──────────────────────────────────────────────────────────────────

export const categoryRelations = relations(categories, ({ many }) => ({
  components: many(components),
  collections: many(collections),
  snippets: many(snippets),
  theory: many(theory),
}));

export const componentRelations = relations(components, ({ one, many }) => ({
  category: one(categories, {
    fields: [components.categoryId],
    references: [categories.id],
  }),
  files: many(componentFiles),
}));

export const componentFileRelations = relations(
  componentFiles,
  ({ one }) => ({
    component: one(components, {
      fields: [componentFiles.componentId],
      references: [components.id],
    }),
  }),
);

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

export const theoryRelations = relations(theory, ({ one }) => ({
  category: one(categories, {
    fields: [theory.categoryId],
    references: [categories.id],
  }),
}));

// ── Type exports ───────────────────────────────────────────────────────────────

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type Component = typeof components.$inferSelect;
export type NewComponent = typeof components.$inferInsert;

export type ComponentFile = typeof componentFiles.$inferSelect;
export type NewComponentFile = typeof componentFiles.$inferInsert;

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;

export type CollectionFile = typeof collectionFiles.$inferSelect;
export type NewCollectionFile = typeof collectionFiles.$inferInsert;

export type Snippet = typeof snippets.$inferSelect;
export type NewSnippet = typeof snippets.$inferInsert;

export type Theory = typeof theory.$inferSelect;
export type NewTheory = typeof theory.$inferInsert;

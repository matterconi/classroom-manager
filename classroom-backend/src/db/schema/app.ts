import { relations } from "drizzle-orm";
import {
  integer,
  varchar,
  text,
  jsonb,
  boolean,
  pgTable,
  timestamp,
  index,
  vector,
} from "drizzle-orm/pg-core";

// ── Shared timestamps ──────────────────────────────────────────────────────────

const timestamps = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

// ── Shared types ──────────────────────────────────────────────────────────────

export type UseCase = { title: string; use: string };
export type ItemKind = "snippet" | "component" | "collection";

// ── Categories ────────────────────────────────────────────────────────────────

export const categories = pgTable("categories", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  description: text("description"),
  icon: varchar("icon", { length: 100 }),
  resource: varchar("resource", { length: 50 }),
  ...timestamps,
});

// ── Edges (all relationships) ────────────────────────────────────────────────

export const edges = pgTable(
  "edges",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    sourceId: integer("source_id").notNull(),
    targetId: integer("target_id").notNull(),
    resource: text("resource").notNull(), // 'item'
    type: text("type").notNull(), // 'parent' | 'expansion' | 'belongs_to'
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_edges_source").on(table.sourceId),
    index("idx_edges_target").on(table.targetId),
    index("idx_edges_resource_type").on(table.resource, table.type),
  ],
);

// ── Items (unified: snippet | component | collection) ────────────────────────

export const items = pgTable(
  "items",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    kind: text("kind").$type<ItemKind>().notNull(),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    description: text("description"),
    code: text("code"),
    type: varchar("type", { length: 50 }),
    domain: varchar("domain", { length: 50 }),
    stack: varchar("stack", { length: 50 }),
    language: varchar("language", { length: 50 }),
    useCases: jsonb("use_cases").$type<UseCase[]>(),
    libraries: jsonb("libraries").$type<string[]>(),
    tags: jsonb("tags").$type<string[]>(),
    variants: jsonb("variants").$type<{ prop: string; options: string[] }[]>(),
    entryFile: varchar("entry_file", { length: 255 }),
    isAbstract: boolean("is_abstract").default(false),
    centroidEmbedding: vector("centroid_embedding", { dimensions: 1536 }),
    lastCoherenceCheck: timestamp("last_coherence_check"),
    embedding: vector("embedding", { dimensions: 1536 }),
    ...timestamps,
  },
  (table) => [
    index("items_kind_idx").on(table.kind),
    index("items_category_id_idx").on(table.categoryId),
  ],
);

// ── Item Files ──────────────────────────────────────────────────────────────

export const itemFiles = pgTable(
  "item_files",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    code: text("code").notNull(),
    language: varchar("language", { length: 50 }),
    order: integer("order").default(0).notNull(),
    ...timestamps,
  },
  (table) => [index("item_files_item_id_idx").on(table.itemId)],
);

// ── Demos ────────────────────────────────────────────────────────────────────

export const demos = pgTable(
  "demos",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 255 }), // null = default, "shiny" = variant
    props: jsonb("props").$type<Record<string, unknown>>().default({}),
    sourceDemoId: integer("source_demo_id").references((): any => demos.id, {
      onDelete: "set null",
    }),
    entryFile: varchar("entry_file", { length: 255 }),
    dependencies: jsonb("dependencies").$type<string[]>().default([]),
    missing: jsonb("missing")
      .$type<{ name: string; reason: string }[]>()
      .default([]),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    index("idx_demos_item_id").on(table.itemId),
    index("idx_demos_source_demo_id").on(table.sourceDemoId),
  ],
);

export const demoFiles = pgTable(
  "demo_files",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    demoId: integer("demo_id")
      .notNull()
      .references(() => demos.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    code: text("code").notNull(),
    language: varchar("language", { length: 50 }),
    order: integer("order").default(0).notNull(),
    ...timestamps,
  },
  (table) => [index("idx_demo_files_demo_id").on(table.demoId)],
);

// ── Relations ──────────────────────────────────────────────────────────────────

export const categoryRelations = relations(categories, ({ many }) => ({
  items: many(items),
}));

export const itemRelations = relations(items, ({ one, many }) => ({
  category: one(categories, {
    fields: [items.categoryId],
    references: [categories.id],
  }),
  files: many(itemFiles),
}));

export const itemFileRelations = relations(itemFiles, ({ one }) => ({
  item: one(items, {
    fields: [itemFiles.itemId],
    references: [items.id],
  }),
}));

export const demoRelations = relations(demos, ({ one, many }) => ({
  item: one(items, {
    fields: [demos.itemId],
    references: [items.id],
  }),
  sourceDemo: one(demos, {
    fields: [demos.sourceDemoId],
    references: [demos.id],
    relationName: "propScaled",
  }),
  files: many(demoFiles),
}));

export const demoFileRelations = relations(demoFiles, ({ one }) => ({
  demo: one(demos, {
    fields: [demoFiles.demoId],
    references: [demos.id],
  }),
}));

// ── Type exports ───────────────────────────────────────────────────────────────

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;

export type ItemFile = typeof itemFiles.$inferSelect;
export type NewItemFile = typeof itemFiles.$inferInsert;

export type Edge = typeof edges.$inferSelect;
export type NewEdge = typeof edges.$inferInsert;

export type Demo = typeof demos.$inferSelect;
export type NewDemo = typeof demos.$inferInsert;

export type DemoFile = typeof demoFiles.$inferSelect;
export type NewDemoFile = typeof demoFiles.$inferInsert;

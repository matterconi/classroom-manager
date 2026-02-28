-- 0011: Demo tables for render pipeline
-- demos: stores demo metadata per item (standalone sandbox previews)
-- demo_files: stores the actual code files for each demo

CREATE TABLE demos (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  label VARCHAR(255),                     -- null = default demo, "shiny" = variant demo
  props JSONB DEFAULT '{}',               -- props configuration for this demo
  source_demo_id INTEGER REFERENCES demos(id) ON DELETE SET NULL,  -- if prop-scaled from another demo
  entry_file VARCHAR(255),                -- which file to render/mount
  dependencies JSONB DEFAULT '[]',        -- ["react", "framer-motion", ...]
  missing JSONB DEFAULT '[]',             -- [{ "name": "API_KEY", "reason": "needs OpenAI key" }, ...]
  notes TEXT,                             -- freeform notes (e.g. "manca API key")
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE demo_files (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  demo_id INTEGER NOT NULL REFERENCES demos(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,             -- filename (e.g. "ChatInput.tsx")
  code TEXT NOT NULL,                     -- file contents
  language VARCHAR(50),                   -- "typescript", "css", etc.
  "order" INTEGER NOT NULL DEFAULT 0,     -- display/load order
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_demos_item_id ON demos(item_id);
CREATE INDEX idx_demos_source_demo_id ON demos(source_demo_id);
CREATE INDEX idx_demo_files_demo_id ON demo_files(demo_id);

-- Unique: one default demo per item (label IS NULL)
CREATE UNIQUE INDEX idx_demos_item_default ON demos(item_id) WHERE label IS NULL;

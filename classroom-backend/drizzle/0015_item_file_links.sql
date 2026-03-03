-- Item file links: junction table to track which source files belong to each child item
-- Files are stored once in item_files (on the organism), child items reference them via this table.

CREATE TABLE item_file_links (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  item_file_id INTEGER NOT NULL REFERENCES item_files(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_item_file_links_item_id ON item_file_links(item_id);
CREATE INDEX idx_item_file_links_file_id ON item_file_links(item_file_id);
CREATE UNIQUE INDEX idx_item_file_links_unique ON item_file_links(item_id, item_file_id);

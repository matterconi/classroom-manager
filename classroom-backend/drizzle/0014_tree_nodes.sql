-- Tree nodes for AIA semantic families.
-- Abstract parents live here instead of in the items table.

CREATE TABLE tree_nodes (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  parent_node_id INTEGER REFERENCES tree_nodes(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  code TEXT,
  metadata JSONB DEFAULT '{}',
  embedding VECTOR(1536),
  centroid_embedding VECTOR(1536),
  last_coherence_check TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tree_nodes_parent ON tree_nodes(parent_node_id);

-- Link items to their semantic family node
ALTER TABLE items ADD COLUMN semantic_node_id INTEGER REFERENCES tree_nodes(id) ON DELETE SET NULL;
CREATE INDEX idx_items_semantic_node ON items(semantic_node_id);

-- HNSW indexes for vector similarity search
-- Speeds up cosine distance queries (<=> operator) from O(n) to O(log n)

CREATE INDEX IF NOT EXISTS "snippets_embedding_hnsw_idx"
  ON "snippets" USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "theory_embedding_hnsw_idx"
  ON "theory" USING hnsw ("embedding" vector_cosine_ops);

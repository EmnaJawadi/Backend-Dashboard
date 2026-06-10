CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "ai_runs"
  ADD COLUMN IF NOT EXISTS "response_mode" TEXT,
  ADD COLUMN IF NOT EXISTS "used_kb" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "source_article_ids" JSONB,
  ADD COLUMN IF NOT EXISTS "source_chunk_ids" JSONB,
  ADD COLUMN IF NOT EXISTS "retrieved_chunks_preview" JSONB;

CREATE INDEX IF NOT EXISTS "ai_runs_response_mode_idx"
  ON "ai_runs"("response_mode");

CREATE INDEX IF NOT EXISTS "ai_runs_used_kb_idx"
  ON "ai_runs"("used_kb");

CREATE INDEX IF NOT EXISTS "kb_chunks_article_id_idx"
  ON "kb_chunks"("article_id");

CREATE INDEX IF NOT EXISTS "kb_chunks_embedding_vector_ivfflat_idx"
  ON "kb_chunks"
  USING ivfflat ("embedding_vector" vector_cosine_ops)
  WITH (lists = 100)
  WHERE "embedding_vector" IS NOT NULL;

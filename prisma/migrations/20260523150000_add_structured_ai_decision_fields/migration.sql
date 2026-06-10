ALTER TABLE "ai_runs"
  ADD COLUMN IF NOT EXISTS "normalized_message" TEXT,
  ADD COLUMN IF NOT EXISTS "detected_language" TEXT,
  ADD COLUMN IF NOT EXISTS "needs_rag" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "rag_sources" JSONB,
  ADD COLUMN IF NOT EXISTS "can_answer" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "order_intent" BOOLEAN;

CREATE INDEX IF NOT EXISTS "ai_runs_needs_rag_idx"
  ON "ai_runs"("needs_rag");

CREATE INDEX IF NOT EXISTS "ai_runs_order_intent_idx"
  ON "ai_runs"("order_intent");

ALTER TABLE "ai_runs"
  ADD COLUMN IF NOT EXISTS "error_message" TEXT,
  ADD COLUMN IF NOT EXISTS "fallback_used" BOOLEAN;

CREATE INDEX IF NOT EXISTS "ai_runs_fallback_used_idx"
  ON "ai_runs"("fallback_used");

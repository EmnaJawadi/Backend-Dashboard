DELETE FROM "conversation_tags" older
USING "conversation_tags" newer
WHERE older."conversation_id" = newer."conversation_id"
  AND older."tag" = newer."tag"
  AND older."id" < newer."id";

CREATE UNIQUE INDEX IF NOT EXISTS "conversation_tags_conversation_id_tag_key"
  ON "conversation_tags"("conversation_id", "tag");

CREATE INDEX IF NOT EXISTS "ai_runs_response_mode_idx"
  ON "ai_runs"("response_mode");

CREATE INDEX IF NOT EXISTS "ai_runs_used_kb_idx"
  ON "ai_runs"("used_kb");

CREATE INDEX IF NOT EXISTS "ai_runs_needs_rag_idx"
  ON "ai_runs"("needs_rag");

CREATE INDEX IF NOT EXISTS "ai_runs_order_intent_idx"
  ON "ai_runs"("order_intent");

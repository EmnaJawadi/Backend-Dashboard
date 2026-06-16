-- Remove rows that can no longer be associated with an article.
DELETE FROM "kb_chunks" c
WHERE NOT EXISTS (
  SELECT 1 FROM "kb_articles" a WHERE a."id" = c."article_id"
);

-- The article owns the tenant scope. Repair old null or mismatched chunk scopes.
UPDATE "kb_chunks" c
SET "company_id" = a."company_id"
FROM "kb_articles" a
WHERE a."id" = c."article_id"
  AND a."company_id" IS NOT NULL
  AND c."company_id" IS DISTINCT FROM a."company_id";

-- Articles without a company cannot be exposed through tenant-scoped RAG.
DELETE FROM "kb_chunks" c
USING "kb_articles" a
WHERE a."id" = c."article_id"
  AND a."company_id" IS NULL;

ALTER TABLE "kb_chunks"
  ALTER COLUMN "company_id" SET NOT NULL;

ALTER TABLE "kb_chunks"
  DROP CONSTRAINT IF EXISTS "kb_chunks_article_id_fkey";

ALTER TABLE "kb_chunks"
  ADD CONSTRAINT "kb_chunks_article_id_fkey"
  FOREIGN KEY ("article_id") REFERENCES "kb_articles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "kb_chunks"
  DROP CONSTRAINT IF EXISTS "kb_chunks_company_id_fkey";

ALTER TABLE "kb_chunks"
  ADD CONSTRAINT "kb_chunks_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "kb_chunks_article_id_chunk_index_key"
  ON "kb_chunks"("article_id", "chunk_index");

CREATE INDEX IF NOT EXISTS "kb_chunks_company_id_article_id_idx"
  ON "kb_chunks"("company_id", "article_id");

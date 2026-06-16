-- A chunk must reference an article owned by the same company. Separate foreign
-- keys do not prevent a valid article id from being paired with another tenant.
CREATE UNIQUE INDEX IF NOT EXISTS "kb_articles_id_company_id_key"
  ON "kb_articles"("id", "company_id");

ALTER TABLE "kb_chunks"
  DROP CONSTRAINT IF EXISTS "kb_chunks_article_company_fkey";

ALTER TABLE "kb_chunks"
  ADD CONSTRAINT "kb_chunks_article_company_fkey"
  FOREIGN KEY ("article_id", "company_id")
  REFERENCES "kb_articles"("id", "company_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

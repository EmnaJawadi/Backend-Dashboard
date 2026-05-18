CREATE TABLE IF NOT EXISTS "products" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT,
  "price" DOUBLE PRECISION,
  "currency" TEXT NOT NULL DEFAULT 'TND',
  "is_available" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "variants" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "product_images" (
  "id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "image_url" TEXT NOT NULL,
  "alt_text" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_company_id_fkey'
  ) THEN
    ALTER TABLE "products"
      ADD CONSTRAINT "products_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_images_product_id_fkey'
  ) THEN
    ALTER TABLE "product_images"
      ADD CONSTRAINT "product_images_product_id_fkey"
      FOREIGN KEY ("product_id") REFERENCES "products"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "products_company_id_idx"
  ON "products"("company_id");

CREATE INDEX IF NOT EXISTS "products_company_id_status_idx"
  ON "products"("company_id", "status");

CREATE INDEX IF NOT EXISTS "product_images_product_id_idx"
  ON "product_images"("product_id");

ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "caption" TEXT,
  ADD COLUMN IF NOT EXISTS "media_id" TEXT;

ALTER TABLE "ai_runs"
  ADD COLUMN IF NOT EXISTS "input_type" TEXT,
  ADD COLUMN IF NOT EXISTS "reason" TEXT,
  ADD COLUMN IF NOT EXISTS "should_send_message" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "image_analysis_result" JSONB,
  ADD COLUMN IF NOT EXISTS "matched_product_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_runs_matched_product_id_fkey'
  ) THEN
    ALTER TABLE "ai_runs"
      ADD CONSTRAINT "ai_runs_matched_product_id_fkey"
      FOREIGN KEY ("matched_product_id") REFERENCES "products"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ai_runs_matched_product_id_idx"
  ON "ai_runs"("matched_product_id");

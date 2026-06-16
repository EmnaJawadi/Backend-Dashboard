-- CreateEnum
CREATE TYPE "PdfImportStatus" AS ENUM ('PENDING_REVIEW', 'PARTIALLY_DONE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "DraftArticleStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EDITED');

-- DropIndex
DROP INDEX "kb_chunks_article_id_idx";

-- CreateTable
CREATE TABLE "pdf_import_drafts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" "PdfImportStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pdf_import_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pdf_draft_articles" (
    "id" TEXT NOT NULL,
    "import_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT[],
    "status" "DraftArticleStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "kb_article_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pdf_draft_articles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pdf_import_drafts_company_id_idx" ON "pdf_import_drafts"("company_id");

-- CreateIndex
CREATE INDEX "pdf_import_drafts_uploaded_by_idx" ON "pdf_import_drafts"("uploaded_by");

-- CreateIndex
CREATE INDEX "pdf_import_drafts_status_idx" ON "pdf_import_drafts"("status");

-- CreateIndex
CREATE INDEX "pdf_draft_articles_import_id_idx" ON "pdf_draft_articles"("import_id");

-- CreateIndex
CREATE INDEX "pdf_draft_articles_status_idx" ON "pdf_draft_articles"("status");

-- AddForeignKey
ALTER TABLE "pdf_import_drafts" ADD CONSTRAINT "pdf_import_drafts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pdf_import_drafts" ADD CONSTRAINT "pdf_import_drafts_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pdf_draft_articles" ADD CONSTRAINT "pdf_draft_articles_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "pdf_import_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

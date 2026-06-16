import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  DraftArticleStatus,
  PdfImportStatus,
} from '../../generated/prisma/client';

@Injectable()
export class PdfImportRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createImport(params: {
    companyId: string;
    uploadedBy: string;
    fileName: string;
    articles: Array<{ title: string; category: string; body: string; tags: string[] }>;
  }) {
    return this.prisma.pdfImportDraft.create({
      data: {
        companyId: params.companyId,
        uploadedBy: params.uploadedBy,
        fileName: params.fileName,
        status: PdfImportStatus.PENDING_REVIEW,
        articles: {
          create: params.articles.map((a) => ({
            title: a.title,
            category: a.category,
            body: a.body,
            tags: a.tags,
            status: DraftArticleStatus.PENDING,
          })),
        },
      },
      include: {
        articles: true,
        uploader: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async findMany(companyId: string, status?: PdfImportStatus) {
    return this.prisma.pdfImportDraft.findMany({
      where: {
        companyId,
        ...(status ? { status } : {}),
      },
      include: {
        articles: true,
        uploader: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    return this.prisma.pdfImportDraft.findFirst({
      where: { id, companyId },
      include: {
        articles: { orderBy: { createdAt: 'asc' } },
        uploader: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async findArticle(articleId: string, importId: string, companyId: string) {
    return this.prisma.pdfDraftArticle.findFirst({
      where: {
        id: articleId,
        importId,
        import: { companyId },
      },
    });
  }

  async updateArticle(
    articleId: string,
    data: {
      status: DraftArticleStatus;
      title?: string;
      category?: string;
      body?: string;
      tags?: string[];
      reviewedBy?: string;
      reviewedAt?: Date;
      kbArticleId?: string;
    },
  ) {
    return this.prisma.pdfDraftArticle.update({
      where: { id: articleId },
      data,
    });
  }

  async claimPendingArticle(params: {
    articleId: string;
    importId: string;
    companyId: string;
    reviewedBy: string;
    claimedAt: Date;
  }) {
    const staleBefore = new Date(params.claimedAt.getTime() - 10 * 60 * 1000);
    return this.prisma.pdfDraftArticle.updateMany({
      where: {
        id: params.articleId,
        importId: params.importId,
        import: { companyId: params.companyId },
        status: DraftArticleStatus.PENDING,
        kbArticleId: null,
        OR: [{ reviewedAt: null }, { reviewedAt: { lt: staleBefore } }],
      },
      data: {
        reviewedBy: params.reviewedBy,
        reviewedAt: params.claimedAt,
      },
    });
  }

  async releaseClaim(params: {
    articleId: string;
    reviewedBy: string;
    claimedAt: Date;
  }) {
    return this.prisma.pdfDraftArticle.updateMany({
      where: {
        id: params.articleId,
        status: DraftArticleStatus.PENDING,
        kbArticleId: null,
        reviewedBy: params.reviewedBy,
        reviewedAt: params.claimedAt,
      },
      data: { reviewedBy: null, reviewedAt: null },
    });
  }

  async completeClaimedArticle(params: {
    articleId: string;
    importId: string;
    reviewedBy: string;
    claimedAt: Date;
    status: DraftArticleStatus;
    title?: string;
    category?: string;
    body?: string;
    tags?: string[];
    kbArticleId?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.pdfDraftArticle.updateMany({
        where: {
          id: params.articleId,
          importId: params.importId,
          status: DraftArticleStatus.PENDING,
          reviewedBy: params.reviewedBy,
          reviewedAt: params.claimedAt,
          kbArticleId: null,
        },
        data: {
          status: params.status,
          title: params.title,
          category: params.category,
          body: params.body,
          tags: params.tags,
          kbArticleId: params.kbArticleId,
        },
      });

      if (claimed.count !== 1) return null;
      await this.recalculateImportStatusWithClient(tx, params.importId);
      return tx.pdfDraftArticle.findUnique({ where: { id: params.articleId } });
    });
  }

  async recalculateImportStatus(importId: string) {
    return this.recalculateImportStatusWithClient(this.prisma, importId);
  }

  private async recalculateImportStatusWithClient(
    client: PrismaService | import('../../generated/prisma/client').Prisma.TransactionClient,
    importId: string,
  ) {
    const articles = await client.pdfDraftArticle.findMany({
      where: { importId },
      select: { status: true },
    });

    const pendingCount = articles.filter(
      (article) => article.status === DraftArticleStatus.PENDING,
    ).length;
    const doneCount = articles.length - pendingCount;
    const newStatus = pendingCount === 0
      ? PdfImportStatus.COMPLETED
      : doneCount > 0
        ? PdfImportStatus.PARTIALLY_DONE
        : PdfImportStatus.PENDING_REVIEW;

    return client.pdfImportDraft.update({
      where: { id: importId },
      data: { status: newStatus },
    });
  }
}

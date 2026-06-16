import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { resolveCompanyScope } from '../../common/utils/company-scope.util';
import { DraftArticleStatus, PdfImportStatus } from '../../generated/prisma/client';
import { PdfParser } from './ingestion/parsers/pdf.parser';
import { PdfStructureAnalyzerService } from './pdf-structure-analyzer.service';
import { PdfImportRepository } from './pdf-import.repository';
import { KbArticlesService } from './kb-articles.service';
import { ReviewPdfArticleDto } from './dto/review-pdf-article.dto';
import { QueryPdfImportsDto } from './dto/query-pdf-imports.dto';

@Injectable()
export class PdfImportService {
  private readonly logger = new Logger(PdfImportService.name);

  constructor(
    private readonly repository: PdfImportRepository,
    private readonly pdfParser: PdfParser,
    private readonly analyzer: PdfStructureAnalyzerService,
    private readonly kbArticlesService: KbArticlesService,
  ) {}

  async uploadAndAnalyze(
    file: { buffer: Buffer; originalname: string },
    actor: AuthenticatedUser,
  ) {
    const companyId = this.requireCompanyId(actor);

    this.logger.log(
      `PDF_IMPORT_START companyId=${companyId} file=${file.originalname} size=${file.buffer.length}`,
    );

    const rawText = await this.pdfParser.parse(file.buffer, file.originalname);

    if (!rawText.trim()) {
      throw new BadRequestException('Le PDF ne contient pas de texte extractible.');
    }

    const drafts = await this.analyzer.analyzeAndSplit(rawText, companyId);

    const importRecord = await this.repository.createImport({
      companyId,
      uploadedBy: actor.sub,
      fileName: file.originalname,
      articles: drafts,
    });

    this.logger.log(
      `PDF_IMPORT_CREATED companyId=${companyId} importId=${importRecord.id} articles=${importRecord.articles.length}`,
    );

    return {
      importId: importRecord.id,
      fileName: importRecord.fileName,
      articleCount: importRecord.articles.length,
      articles: importRecord.articles,
    };
  }

  async listImports(query: QueryPdfImportsDto, actor: AuthenticatedUser) {
    const companyId = this.requireCompanyId(actor);
    const status = query.status as PdfImportStatus | undefined;
    return this.repository.findMany(companyId, status);
  }

  async getImport(importId: string, actor: AuthenticatedUser) {
    const companyId = this.requireCompanyId(actor);
    const record = await this.repository.findOne(importId, companyId);

    if (!record) {
      throw new NotFoundException('Import PDF introuvable.');
    }

    return record;
  }

  async reviewArticle(
    importId: string,
    articleId: string,
    dto: ReviewPdfArticleDto,
    actor: AuthenticatedUser,
  ) {
    const companyId = this.requireCompanyId(actor);

    const article = await this.repository.findArticle(articleId, importId, companyId);
    if (!article) {
      throw new NotFoundException('Article draft introuvable.');
    }

    if (article.status !== DraftArticleStatus.PENDING) {
      return this.resolveIdempotentResult(article, dto.action);
    }

    const claimedAt = new Date();
    const claim = await this.repository.claimPendingArticle({
      articleId,
      importId,
      companyId,
      reviewedBy: actor.sub,
      claimedAt,
    });
    if (claim.count !== 1) {
      const current = await this.repository.findArticle(articleId, importId, companyId);
      if (current && current.status !== DraftArticleStatus.PENDING) {
        return this.resolveIdempotentResult(current, dto.action);
      }
      throw new ConflictException('Cet article PDF est deja en cours de traitement.');
    }

    if (dto.action === 'reject') {
      const rejected = await this.repository.completeClaimedArticle({
        articleId,
        importId,
        reviewedBy: actor.sub,
        claimedAt,
        status: DraftArticleStatus.REJECTED,
      });
      if (!rejected) throw new ConflictException('Le brouillon PDF a change pendant le traitement.');
      return rejected;
    }

    const title = (dto.action === 'edit' ? dto.title : undefined) ?? article.title;
    const category = (dto.action === 'edit' ? dto.category : undefined) ?? article.category;
    const body = (dto.action === 'edit' ? dto.body : undefined) ?? article.body;
    const tags = (dto.action === 'edit' ? dto.tags : undefined) ?? article.tags;

    if (!title?.trim() || !body?.trim()) {
      throw new BadRequestException('Le titre et le corps sont obligatoires pour valider un article.');
    }

    let kbArticle: { id: string } | null = null;
    try {
      kbArticle = await this.kbArticlesService.createFromPdfDraft({
        draftArticleId: articleId,
        companyId,
        title: title.trim(),
        content: body.trim(),
        category: category?.trim() || 'General',
        tags,
        actor,
      });

      const finalStatus =
        dto.action === 'edit' ? DraftArticleStatus.EDITED : DraftArticleStatus.APPROVED;
      const updated = await this.repository.completeClaimedArticle({
        articleId,
        importId,
        reviewedBy: actor.sub,
        claimedAt,
        status: finalStatus,
        title: title.trim(),
        category: category?.trim() || 'General',
        body: body.trim(),
        tags,
        kbArticleId: kbArticle.id,
      });
      if (!updated) throw new ConflictException('Le brouillon PDF a change pendant le traitement.');

      this.logger.log(
        `PDF_ARTICLE_APPROVED companyId=${companyId} importId=${importId} articleId=${articleId} kbArticleId=${kbArticle.id}`,
      );

      return updated;
    } catch (error) {
      try {
        await this.kbArticlesService.rollbackPdfDraftPublication(
          articleId,
          companyId,
        );
      } catch (rollbackError) {
        this.logger.error(
          `PDF_ARTICLE_ROLLBACK_FAILED companyId=${companyId} importId=${importId} articleId=${articleId} error=${rollbackError instanceof Error ? rollbackError.message : 'unknown'}`,
        );
      }
      await this.repository.releaseClaim({ articleId, reviewedBy: actor.sub, claimedAt });
      throw error;
    }
  }

  private resolveIdempotentResult(
    article: Awaited<ReturnType<PdfImportRepository['findArticle']>> & object,
    action: ReviewPdfArticleDto['action'],
  ) {
    const compatible =
      (action === 'reject' && article.status === DraftArticleStatus.REJECTED) ||
      (action === 'approve' && article.status === DraftArticleStatus.APPROVED) ||
      (action === 'edit' && article.status === DraftArticleStatus.EDITED);
    if (compatible) return article;
    throw new ConflictException(`Ce brouillon est deja traite avec le statut ${article.status}.`);
  }

  private requireCompanyId(actor: AuthenticatedUser): string {
    const companyId = resolveCompanyScope(actor);
    if (!companyId) {
      throw new BadRequestException('companyId requis pour cette operation.');
    }
    return companyId;
  }
}
